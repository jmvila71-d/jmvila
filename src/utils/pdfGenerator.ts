import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ConfiguracionInforme,
  EncabezadoPieInforme,
  ExpedienteTasacion,
  ResultadoValoracion,
  TipografiaPDF,
} from '../types/appraisal';
import { resolveConfiguracionInforme } from './reportBranding';
import {
  FINALIDAD_LABELS,
  METODO_LABELS,
  TIPO_ACTIVO_LABELS,
  formatEUR,
  formatEURDecimal,
  formatNumber,
  isTerreno,
} from './valuationEngine';

export type TipoInformePDF = 'normal' | 'testigos' | 'ampliado';

interface LoadedImage {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}

type RGB = [number, number, number];

function hexToRgb(hex: string, fallback: RGB): RGB {
  const clean = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

async function loadImageForPdf(
  src: string,
  preserveAlpha = false
): Promise<LoadedImage | null> {
  if (!src) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load error'));
      img.src = src;
    });

    const maxDim = preserveAlpha ? 900 : 1200;
    let w = loaded.naturalWidth || 800;
    let h = loaded.naturalHeight || 600;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (!preserveAlpha) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(loaded, 0, 0, w, h);
    const format: 'JPEG' | 'PNG' = preserveAlpha ? 'PNG' : 'JPEG';
    const dataUrl = canvas.toDataURL(
      preserveAlpha ? 'image/png' : 'image/jpeg',
      0.88
    );
    return { dataUrl, format, width: w, height: h };
  } catch {
    return null;
  }
}

function fitImageDims(
  img: LoadedImage,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  return {
    w: Math.max(1, img.width * ratio),
    h: Math.max(1, img.height * ratio),
  };
}

function getActiveHeaderFooter(
  cfg: ConfiguracionInforme,
  tipo: TipoInformePDF
): EncabezadoPieInforme {
  return cfg.personalizarPorTipoInforme ? cfg.porTipo[tipo] : cfg.general;
}

function getLayoutMargins(hf: EncabezadoPieInforme, cfg: ConfiguracionInforme) {
  const hasFooterImg =
    Boolean(cfg.imagenPiePagina) &&
    (hf.estiloPie === 'imagen_faldilla' || hf.mostrarImagenPie);
  const top =
    hf.estiloEncabezado === 'clasico_centrado' || hf.estiloEncabezado === 'banda_color'
      ? 24
      : 21;
  const bottom = hasFooterImg ? 26 : 19;
  return { top, bottom };
}

async function renderCoverPage(
  doc: jsPDF,
  tituloInforme: string,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  cfg: ConfiguracionInforme,
  logoImg: LoadedImage | null,
  footerImg: LoadedImage | null
): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const secondary = hexToRgb(cfg.colorSecundarioHex, [15, 23, 42]);
  const accent = hexToRgb(cfg.colorAcentoHex, [29, 78, 216]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  const inm = exp.inmueble;

  if (cfg.estiloPortada === 'ejecutiva_banda') {
    // Left vertical brand stripe + dark top header band
    doc.setFillColor(...primary);
    doc.rect(0, 0, 12, pageHeight, 'F');
    doc.setFillColor(...secondary);
    doc.rect(12, 0, pageWidth - 12, 54, 'F');

    if (logoImg) {
      const dims = fitImageDims(logoImg, 48, 20);
      doc.addImage(logoImg.dataUrl, logoImg.format, 24, 14, dims.w, dims.h);
    } else {
      doc.setFont(font, 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(inm.sociedadTasacion || 'Gabinete Técnico de Valoraciones', 24, 24);
    }

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(203, 213, 225);
    doc.text(`EXPEDIENTE ${inm.codigoExpediente}`, pageWidth - 16, 22, { align: 'right' });
    doc.text(inm.fechaTasacion, pageWidth - 16, 28, { align: 'right' });

    // Main title block
    doc.setFont(font, 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...secondary);
    const titleLines = doc.splitTextToSize(tituloInforme.toUpperCase(), pageWidth - 44);
    doc.text(titleLines, 24, 74);

    let cursorY = 74 + titleLines.length * 9 + 2;
    doc.setFont(font, 'normal');
    doc.setFontSize(11.5);
    doc.setTextColor(...primary);
    doc.text(
      cfg.subtituloPortada || TIPO_ACTIVO_LABELS[inm.tipoActivo],
      24,
      cursorY
    );
    cursorY += 6;
    doc.setDrawColor(...accent);
    doc.setLineWidth(1.0);
    doc.line(24, cursorY, 92, cursorY);
    cursorY += 10;

    // Property address & headline
    doc.setFont(font, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    const addrLines = doc.splitTextToSize(
      inm.tituloExpediente || inm.direccion || 'Activo Inmobiliario',
      pageWidth - 44
    );
    doc.text(addrLines, 24, cursorY);
    cursorY += addrLines.length * 6 + 2;

    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${inm.direccion || ''} · ${inm.codigoPostal || ''} ${inm.municipio || ''} (${inm.provincia || ''})`,
      24,
      cursorY
    );
    cursorY += 10;

    // Optional featured property photo
    if (cfg.incluirFotoPrincipalEnPortada && exp.fotos.length > 0) {
      const heroPhoto = await loadImageForPdf(exp.fotos[0].url, false);
      if (heroPhoto) {
        const boxW = pageWidth - 44;
        const boxH = 82;
        doc.setDrawColor(226, 232, 240);
        doc.rect(24, cursorY, boxW, boxH, 'D');
        doc.addImage(
          heroPhoto.dataUrl,
          heroPhoto.format,
          24.5,
          cursorY + 0.5,
          boxW - 1,
          boxH - 1
        );
        cursorY += boxH + 10;
      }
    }

    // Key summary card near bottom
    const boxY = Math.max(cursorY, 205);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(24, boxY, pageWidth - 44, 42, 'FD');

    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('VALOR TOTAL CERTIFICADO', 30, boxY + 9);
    doc.text('SOLICITANTE', 98, boxY + 9);

    doc.setFontSize(16);
    doc.setTextColor(...primary);
    doc.text(formatEUR(res.valorTotalTasacionEuros), 30, boxY + 18);

    doc.setFont(font, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const solLines = doc.splitTextToSize(inm.solicitante || 'Titular / Cliente', 88);
    doc.text(solLines.slice(0, 2), 98, boxY + 16);

    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Ref. Catastral: ${inm.referenciaCatastral || 'N/D'} · Metodología: ${METODO_LABELS[res.metodoAplicado].split(' (')[0]}`,
      30,
      boxY + 29
    );
    doc.text(
      `Técnico: ${inm.tasadorNombre || 'Perito Tasador'} (${inm.tasadorColegiado || 'Col. N/D'})`,
      30,
      boxY + 36
    );
  } else if (cfg.estiloPortada === 'clasica_enmarcada') {
    // Classic framed institutional cover
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.8);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24, 'D');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30, 'D');

    let y = 34;
    if (logoImg) {
      const dims = fitImageDims(logoImg, 54, 24);
      doc.addImage(
        logoImg.dataUrl,
        logoImg.format,
        (pageWidth - dims.w) / 2,
        y,
        dims.w,
        dims.h
      );
      y += dims.h + 10;
    } else {
      doc.setFont(font, 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...primary);
      doc.text(
        (inm.sociedadTasacion || 'GABINETE TÉCNICO DE VALORACIONES').toUpperCase(),
        pageWidth / 2,
        y,
        { align: 'center' }
      );
      y += 14;
    }

    doc.setFont(font, 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...secondary);
    const lines = doc.splitTextToSize(tituloInforme.toUpperCase(), pageWidth - 52);
    doc.text(lines, pageWidth / 2, y, { align: 'center' });
    y += lines.length * 8.5 + 4;

    doc.setFont(font, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...primary);
    doc.text(cfg.subtituloPortada || FINALIDAD_LABELS[inm.finalidad], pageWidth / 2, y, {
      align: 'center',
    });
    y += 10;

    doc.setDrawColor(...primary);
    doc.setLineWidth(0.6);
    doc.line(60, y, pageWidth - 60, y);
    y += 12;

    if (cfg.incluirFotoPrincipalEnPortada && exp.fotos.length > 0) {
      const heroPhoto = await loadImageForPdf(exp.fotos[0].url, false);
      if (heroPhoto) {
        const boxW = 136;
        const boxH = 78;
        const x = (pageWidth - boxW) / 2;
        doc.setDrawColor(203, 213, 225);
        doc.rect(x, y, boxW, boxH, 'D');
        doc.addImage(heroPhoto.dataUrl, heroPhoto.format, x + 0.5, y + 0.5, boxW - 1, boxH - 1);
        y += boxH + 12;
      }
    }

    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(inm.tituloExpediente || inm.direccion, pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFont(font, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${inm.direccion} · ${inm.municipio} (${inm.provincia})`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 14;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...primary);
    doc.rect(30, Math.max(y, 205), pageWidth - 60, 36, 'FD');
    const cY = Math.max(y, 205);
    doc.setFont(font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...primary);
    doc.text(
      `Valor de Tasación: ${formatEUR(res.valorTotalTasacionEuros)}`,
      pageWidth / 2,
      cY + 13,
      { align: 'center' }
    );
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `Expediente: ${inm.codigoExpediente} · Fecha: ${inm.fechaTasacion} · Solicitante: ${inm.solicitante || 'Cliente'}`,
      pageWidth / 2,
      cY + 23,
      { align: 'center' }
    );
    doc.text(
      `Tasador: ${inm.tasadorNombre || '—'} · ${inm.tasadorColegiado || ''}`,
      pageWidth / 2,
      cY + 30,
      { align: 'center' }
    );
  } else {
    // minimal_editorial
    let y = 26;
    if (logoImg) {
      const dims = fitImageDims(logoImg, 46, 18);
      doc.addImage(logoImg.dataUrl, logoImg.format, 20, y, dims.w, dims.h);
      y += dims.h + 14;
    } else {
      doc.setFont(font, 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primary);
      doc.text(inm.sociedadTasacion || 'ValoraECO Tasaciones', 20, y);
      y += 16;
    }

    doc.setFont(font, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `EXPEDIENTE ${inm.codigoExpediente}  /  ${inm.fechaTasacion}`,
      20,
      y
    );
    y += 10;

    doc.setFont(font, 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...secondary);
    const titleLines = doc.splitTextToSize(tituloInforme, pageWidth - 40);
    doc.text(titleLines, 20, y);
    y += titleLines.length * 10 + 4;

    doc.setFont(font, 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...primary);
    doc.text(cfg.subtituloPortada || TIPO_ACTIVO_LABELS[inm.tipoActivo], 20, y);
    y += 10;

    doc.setDrawColor(...accent);
    doc.setLineWidth(0.8);
    doc.line(20, y, pageWidth - 20, y);
    y += 12;

    if (cfg.incluirFotoPrincipalEnPortada && exp.fotos.length > 0) {
      const heroPhoto = await loadImageForPdf(exp.fotos[0].url, false);
      if (heroPhoto) {
        const boxW = pageWidth - 40;
        const boxH = 84;
        doc.addImage(heroPhoto.dataUrl, heroPhoto.format, 20, y, boxW, boxH);
        y += boxH + 12;
      }
    }

    const baseY = Math.max(y, 210);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(inm.tituloExpediente || inm.direccion, 20, baseY);
    doc.setFont(font, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${inm.direccion} · ${inm.municipio} (${inm.provincia}) · Ref. Catastral: ${inm.referenciaCatastral || 'N/D'}`,
      20,
      baseY + 7
    );
    doc.setFont(font, 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...primary);
    doc.text(
      `Valor Certificado: ${formatEUR(res.valorTotalTasacionEuros)}`,
      20,
      baseY + 18
    );
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Solicitante: ${inm.solicitante || '—'} · Técnico: ${inm.tasadorNombre || '—'}`,
      20,
      baseY + 26
    );
  }

  // Footer note / uploaded footer image on cover bottom
  if (footerImg && cfg.general.mostrarImagenPie) {
    const dims = fitImageDims(footerImg, pageWidth - 40, 12);
    doc.addImage(
      footerImg.dataUrl,
      footerImg.format,
      (pageWidth - dims.w) / 2,
      pageHeight - 28,
      dims.w,
      dims.h
    );
  }
  if (cfg.notaConfidencialPortada) {
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(cfg.notaConfidencialPortada, pageWidth / 2, pageHeight - 10, {
      align: 'center',
    });
  }

  doc.addPage();
}

function addHeaderAndFooter(
  doc: jsPDF,
  tituloInforme: string,
  exp: ExpedienteTasacion,
  cfg: ConfiguracionInforme,
  hf: EncabezadoPieInforme,
  logoImg: LoadedImage | null,
  footerImg: LoadedImage | null
) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const secondary = hexToRgb(cfg.colorSecundarioHex, [15, 23, 42]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';

  const startPage = cfg.incluirPortada ? 2 : 1;
  const totalContentPages = cfg.incluirPortada ? Math.max(1, pageCount - 1) : pageCount;

  const leftHeaderText =
    hf.textoEncabezadoIzq.trim() || tituloInforme.toUpperCase();
  const rightHeaderText =
    hf.textoEncabezadoDer.trim() ||
    `Exp: ${exp.inmueble.codigoExpediente} · Ref. Cat: ${exp.inmueble.referenciaCatastral || 'N/D'}`;

  const leftFooterText =
    hf.textoPieIzq.trim() ||
    `${exp.inmueble.sociedadTasacion || 'Gabinete Técnico de Valoraciones'} · Trazabilidad ID: ${exp.id}`;

  for (let i = startPage; i <= pageCount; i++) {
    doc.setPage(i);
    const displayPage = cfg.incluirPortada ? i - 1 : i;

    // --- HEADER ---
    if (hf.estiloEncabezado === 'banda_color') {
      doc.setFillColor(...primary);
      doc.rect(0, 0, pageWidth, 16, 'F');
      let textX = 14;
      if (hf.mostrarLogoEnEncabezado && logoImg) {
        const dims = fitImageDims(logoImg, 24, 10);
        doc.addImage(logoImg.dataUrl, logoImg.format, 14, 3, dims.w, dims.h);
        textX = 14 + dims.w + 4;
      }
      doc.setFont(font, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(leftHeaderText, textX, 10);

      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(226, 232, 240);
      doc.text(rightHeaderText, pageWidth - 14, 10, { align: 'right' });
    } else if (hf.estiloEncabezado === 'clasico_centrado') {
      if (hf.mostrarLogoEnEncabezado && logoImg) {
        const dims = fitImageDims(logoImg, 24, 9);
        doc.addImage(
          logoImg.dataUrl,
          logoImg.format,
          (pageWidth - dims.w) / 2,
          2.5,
          dims.w,
          dims.h
        );
      } else {
        doc.setFont(font, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...primary);
        doc.text(leftHeaderText, pageWidth / 2, 8.5, { align: 'center' });
      }
      doc.setFont(font, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(rightHeaderText, pageWidth / 2, 14.5, { align: 'center' });
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.4);
      doc.line(14, 17, pageWidth - 14, 17);
    } else if (hf.estiloEncabezado === 'minimalista') {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(14, 14, pageWidth - 14, 14);
      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(leftHeaderText, 14, 10.5);
      doc.text(rightHeaderText, pageWidth - 14, 10.5, { align: 'right' });
    } else {
      // corporativo_logo
      let textX = 14;
      if (hf.mostrarLogoEnEncabezado && logoImg) {
        const dims = fitImageDims(logoImg, 26, 10);
        doc.addImage(logoImg.dataUrl, logoImg.format, 14, 3, dims.w, dims.h);
        textX = 14 + dims.w + 4;
      }
      doc.setFont(font, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...primary);
      doc.text(leftHeaderText, textX, 10);

      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(rightHeaderText, pageWidth - 14, 10, { align: 'right' });

      doc.setDrawColor(...primary);
      doc.setLineWidth(0.45);
      doc.line(14, 15, pageWidth - 14, 15);
    }

    // --- FOOTER ---
    const hasFooterImg =
      Boolean(footerImg) &&
      (hf.estiloPie === 'imagen_faldilla' || hf.mostrarImagenPie);

    if (hf.estiloPie === 'banda_oscura') {
      const bandTop = hasFooterImg ? pageHeight - 23 : pageHeight - 13;
      if (hasFooterImg && footerImg) {
        const dims = fitImageDims(footerImg, pageWidth - 28, 9);
        doc.addImage(
          footerImg.dataUrl,
          footerImg.format,
          (pageWidth - dims.w) / 2,
          bandTop,
          dims.w,
          dims.h
        );
      }
      doc.setFillColor(...secondary);
      doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
      doc.setFont(font, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(226, 232, 240);
      doc.text(leftFooterText, 14, pageHeight - 5);
      if (hf.mostrarPaginacion) {
        doc.text(
          `Página ${displayPage} de ${totalContentPages}`,
          pageWidth - 14,
          pageHeight - 5,
          { align: 'right' }
        );
      }
    } else if (hf.estiloPie === 'imagen_faldilla' && footerImg) {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 23, pageWidth - 14, pageHeight - 23);
      const dims = fitImageDims(footerImg, pageWidth - 28, 12);
      doc.addImage(
        footerImg.dataUrl,
        footerImg.format,
        14,
        pageHeight - 21,
        dims.w,
        dims.h
      );
      doc.setFont(font, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(leftFooterText, 14, pageHeight - 5);
      if (hf.mostrarPaginacion) {
        doc.text(
          `Página ${displayPage} de ${totalContentPages}`,
          pageWidth - 14,
          pageHeight - 5,
          { align: 'right' }
        );
      }
    } else if (hf.estiloPie === 'dos_columnas_contacto') {
      const lineY = hasFooterImg ? pageHeight - 22 : pageHeight - 14;
      doc.setDrawColor(...primary);
      doc.setLineWidth(0.35);
      doc.line(14, lineY, pageWidth - 14, lineY);
      if (hasFooterImg && footerImg) {
        const dims = fitImageDims(footerImg, 55, 8);
        doc.addImage(footerImg.dataUrl, footerImg.format, 14, lineY + 1.5, dims.w, dims.h);
      }
      doc.setFont(font, 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(51, 65, 85);
      doc.text(leftFooterText, 14, pageHeight - 8.5);
      doc.setFont(font, 'normal');
      doc.setTextColor(100, 116, 139);
      if (hf.textoPieCentro) {
        doc.text(hf.textoPieCentro, 14, pageHeight - 4.5);
      }
      if (hf.mostrarPaginacion) {
        doc.text(
          `Página ${displayPage} de ${totalContentPages}`,
          pageWidth - 14,
          pageHeight - 6.5,
          { align: 'right' }
        );
      }
    } else {
      // estandar_texto
      const lineY = hasFooterImg ? pageHeight - 22 : pageHeight - 13;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(14, lineY, pageWidth - 14, lineY);
      if (hasFooterImg && footerImg) {
        const dims = fitImageDims(footerImg, pageWidth - 28, 8);
        doc.addImage(
          footerImg.dataUrl,
          footerImg.format,
          (pageWidth - dims.w) / 2,
          lineY + 1.5,
          dims.w,
          dims.h
        );
      }
      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(leftFooterText, 14, pageHeight - 6.5);
      if (hf.mostrarPaginacion) {
        doc.text(
          `Página ${displayPage} de ${totalContentPages}`,
          pageWidth - 14,
          pageHeight - 6.5,
          { align: 'right' }
        );
      }
    }
  }
}

function drawSectionTitle(
  doc: jsPDF,
  title: string,
  y: number,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const secondary = hexToRgb(cfg.colorSecundarioHex, [15, 23, 42]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';

  if (y > pageHeight - margins.bottom - 18) {
    doc.addPage();
    y = margins.top;
  }
  doc.setFont(font, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...secondary);
  doc.text(title, 14, y);
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.6);
  doc.line(14, y + 2, 196, y + 2);
  return y + 7;
}

function getLastAutoTableY(doc: jsPDF, fallbackY: number): number {
  const anyDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  return anyDoc.lastAutoTable ? anyDoc.lastAutoTable.finalY + 7 : fallbackY;
}

async function renderCoverBanner(
  doc: jsPDF,
  subtitulo: string,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  cfg: ConfiguracionInforme,
  startY: number
): Promise<number> {
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const secondary = hexToRgb(cfg.colorSecundarioHex, [15, 23, 42]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';

  doc.setFillColor(...secondary);
  doc.rect(14, startY, 182, 28, 'F');

  doc.setFont(font, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(subtitulo, 20, startY + 9.5);

  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `${TIPO_ACTIVO_LABELS[exp.inmueble.tipoActivo]} · ${exp.inmueble.direccion || 'Sin dirección especificada'}`,
    20,
    startY + 16.5
  );
  doc.text(
    `Expediente: ${exp.inmueble.codigoExpediente} · Fecha: ${exp.inmueble.fechaTasacion} · ID Activo: ${exp.id}`,
    20,
    startY + 23
  );

  // Value summary strip
  const stripY = startY + 31;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, stripY, 182, 19, 'FD');

  doc.setFont(font, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('VALOR TOTAL DE TASACIÓN', 20, stripY + 6.5);
  doc.text('MÉTODO PRINCIPAL', 82, stripY + 6.5);
  doc.text('VALOR UNITARIO', 152, stripY + 6.5);

  doc.setFontSize(12.5);
  doc.setTextColor(...primary);
  doc.text(formatEUR(res.valorTotalTasacionEuros), 20, stripY + 14.5);

  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(METODO_LABELS[res.metodoAplicado].split(' (')[0], 82, stripY + 14.5);
  doc.text(`${formatEUR(res.valorUnitarioM2)} / m²`, 152, stripY + 14.5);

  return stripY + 26;
}

function renderPropertySection(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  startY: number,
  includeExtendedUrban: boolean,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): number {
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  let y = drawSectionTitle(
    doc,
    '1. Identificación del Inmueble, Finalidad y Normativa',
    startY,
    cfg,
    margins
  );
  const inm = exp.inmueble;
  const supLabel = isTerreno(inm.tipoActivo)
    ? `${formatNumber(inm.superficieParcelaM2, 2)} m² (Parcela)`
    : `${formatNumber(inm.superficieConstruidaM2, 2)} m² const. / ${formatNumber(inm.superficieUtilM2, 2)} m² útiles`;

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
    theme: 'grid',
    styles: { font, fontSize: 8.5, cellPadding: 2.5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    body: [
      ['Solicitante', inm.solicitante || '—', 'Fecha Tasación', inm.fechaTasacion],
      ['Finalidad (ECO/805/2003)', FINALIDAD_LABELS[inm.finalidad] || inm.finalidad, 'Tipo de Activo', TIPO_ACTIVO_LABELS[inm.tipoActivo]],
      ['Dirección', `${inm.direccion}, ${inm.codigoPostal} ${inm.municipio} (${inm.provincia})`, 'Referencia Catastral', inm.referenciaCatastral || '—'],
      ['Datos Registrales', inm.datosRegistrales || '—', 'Superficie Principal', supLabel],
      ['Año / Estado', `${inm.anoConstruccion || '—'} · ${inm.estadoConservacion}`, 'Calif. Energética', inm.calificacionEnergetica || '—'],
      ['Técnico Tasador', `${inm.tasadorNombre || '—'} (${inm.tasadorColegiado || 'Col. N/D'})`, 'Ley 8/2007 Suelo', exp.aplicarLey8_2007 ? `Aplicada (${inm.situacionBasicaLey8.replace(/_/g, ' ')})` : 'Suelo Urbano Consolidado / No aplica'],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 34, fillColor: [248, 250, 252] },
      1: { cellWidth: 62 },
      2: { fontStyle: 'bold', cellWidth: 32, fillColor: [248, 250, 252] },
      3: { cellWidth: 54 },
    },
  });
  y = getLastAutoTableY(doc, y + 40);

  if (includeExtendedUrban && (inm.clasificacionUrbanistica || inm.observacionesTecnicas)) {
    doc.setFont(font, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const text = [
      inm.clasificacionUrbanistica ? `Planeamiento y Uso: ${inm.clasificacionUrbanistica} · ${inm.usoPermitido}` : '',
      inm.observacionesTecnicas ? `Descripción Técnica: ${inm.observacionesTecnicas}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const split = doc.splitTextToSize(text, 182);
    doc.text(split, 14, y);
    y += split.length * 4.2 + 4;
  }

  // Piezas Anexas
  if (exp.piezasAnexas.length > 0) {
    y = drawSectionTitle(doc, '2. Desglose de Piezas Anexas Vinculadas', y, cfg, margins);
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'striped',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      headStyles: { fillColor: primary, textColor: [255, 255, 255] },
      head: [['Tipo', 'Descripción', 'Sup. (m²)', 'Criterio', 'Coef. / Fijo', 'Valor (€)']],
      body: exp.piezasAnexas.map((ax) => {
        const valor =
          ax.modoValoracion === 'importe_fijo'
            ? ax.valorFijoEuros
            : ax.superficieM2 * res.mediaHomogeneizadaM2 * ax.coeficienteHomogeneizacion;
        return [
          ax.tipo.toUpperCase(),
          ax.descripcion,
          formatNumber(ax.superficieM2, 2),
          ax.modoValoracion === 'importe_fijo' ? 'Importe directo' : 'Repercusión s/ homog.',
          ax.modoValoracion === 'importe_fijo'
            ? formatEUR(ax.valorFijoEuros)
            : `× ${ax.coeficienteHomogeneizacion.toFixed(2)}`,
          formatEUR(valor),
        ];
      }),
      foot: [['', 'TOTAL PIEZAS ANEXAS', '', '', '', formatEUR(res.valorAnexosEuros)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    });
    y = getLastAutoTableY(doc, y + 25);
  }

  return y;
}

function renderMethodologySection(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  startY: number,
  detailed: boolean,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): number {
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  const secNum = exp.piezasAnexas.length > 0 ? '3' : '2';
  let y = drawSectionTitle(
    doc,
    `${secNum}. Metodología de Valoración: ${METODO_LABELS[res.metodoAplicado]}`,
    startY,
    cfg,
    margins
  );

  if (res.metodoAplicado === 'comparacion') {
    const rows = [
      ['Número de testigos utilizados', `${res.cantidadTestigosUsados} (Rango normal ECO/805/2003: 6–8)`],
      ['Media aritmética homogeneizada', `${formatEURDecimal(res.mediaHomogeneizadaM2)} / m²`],
      ['Mediana / Coeficiente de Variación', `${formatEURDecimal(res.medianaHomogeneizadaM2)} / m² · CV: ${res.coeficienteVariacionPct.toFixed(2)}%`],
      ['Valor elemento principal', formatEUR(res.valorPrincipalEuros)],
      ['Valor piezas anexas', formatEUR(res.valorAnexosEuros)],
      ['VALOR TOTAL DE TASACIÓN', formatEUR(res.valorTotalTasacionEuros)],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'grid',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90, fillColor: [248, 250, 252] } },
      body: rows,
    });
    y = getLastAutoTableY(doc, y + 30);
  } else if (res.metodoAplicado === 'reposicion') {
    const r = res.reposicion;
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'grid',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95, fillColor: [248, 250, 252] } },
      body: [
        ['Valor de repercusión del suelo (F)', formatEUR(r.valorSuelo)],
        ['Coste de construcción por contrata (Cc)', formatEUR(r.costeConstruccion)],
        ['Gastos necesarios (honorarios, licencias, tasas)', formatEUR(r.gastosNecesarios)],
        ['Valor de Reposición Bruto (VRB)', formatEUR(r.valorReposicionBruto)],
        [`Depreciación física (${r.antiguedadAnos} años / ${exp.paramsReposicion.vidaUtilAnos} vida útil)`, `- ${formatEUR(r.depreciacionFisicaEuros)}`],
        ['Depreciación funcional / obsolescencia', `- ${formatEUR(r.depreciacionFuncionalEuros)}`],
        ['Valor de Reposición Neto (VRN)', formatEUR(r.valorReposicionNeto)],
        ['Valor piezas anexas', formatEUR(res.valorAnexosEuros)],
        ['VALOR TOTAL DE TASACIÓN', formatEUR(res.valorTotalTasacionEuros)],
      ],
    });
    y = getLastAutoTableY(doc, y + 35);
  } else if (res.metodoAplicado === 'residual_estatico') {
    const re = res.residualEstatico;
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'grid',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95, fillColor: [248, 250, 252] } },
      body: [
        ['Techo edificable total / patrimonializable (Ley 8/2007)', `${formatNumber(re.techoEdificableTotalM2, 2)} m² / ${formatNumber(re.techoPatrimonializableM2, 2)} m²`],
        ['Valor en venta del producto inmobiliario terminado (Vm)', formatEUR(re.valorMercadoTerminado)],
        ['Margen de beneficio del promotor (b · Vm)', `- ${formatEUR(re.margenPromotorEuros)}`],
        ['Costes de construcción por contrata', `- ${formatEUR(re.costesConstruccionTotal)}`],
        ['Gastos necesarios de promoción y comercialización', `- ${formatEUR(re.gastosPromocionTotal)}`],
        ['Costes de urbanización y cargas pendientes', `- ${formatEUR(re.costesUrbanizacion)}`],
        ['VALOR RESIDUAL DEL SUELO (Vs)', formatEUR(re.valorResidualSueloEuros)],
        ['Valor unitario s/ parcela · Repercusión s/ techo', `${formatEURDecimal(re.valorUnitarioSueloM2)}/m² suelo · ${formatEURDecimal(re.valorRepercusionM2Techo)}/m² techo`],
      ],
    });
    y = getLastAutoTableY(doc, y + 35);
  } else if (res.metodoAplicado === 'residual_dinamico') {
    const rd = res.residualDinamico;
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'grid',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95, fillColor: [248, 250, 252] } },
      body: [
        ['Techo edificable patrimonializable (Ley 8/2007)', `${formatNumber(rd.techoPatrimonializableM2, 2)} m²t (Total: ${formatNumber(rd.techoEdificableTotalM2, 2)} m²t)`],
        ['Tasa de actualización anual (i = i0 + prima riesgo)', `${formatNumber(rd.tasaDescuentoPct, 2)} %`],
        ['VALOR ACTUAL NETO DEL SUELO (VAN / Vs)', formatEUR(rd.valorResidualSueloEuros)],
        ['Valor unitario suelo · Repercusión s/ techo', `${formatEURDecimal(rd.valorUnitarioSueloM2)}/m² suelo · ${formatEURDecimal(rd.valorRepercusionM2Techo)}/m² techo`],
      ],
    });
    y = getLastAutoTableY(doc, y + 25);

    if (detailed && rd.flujosDescontados.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
        theme: 'striped',
        styles: { font, fontSize: 7.8, cellPadding: 2 },
        headStyles: { fillColor: primary, textColor: [255, 255, 255] },
        head: [['Periodo', 't (años)', 'Cobros (€)', 'Pagos (€)', 'Flujo Neto (€)', 'Factor Desc.', 'VAN (€)']],
        body: rd.flujosDescontados.map((f) => [
          f.periodo,
          formatNumber(f.anioDescuento, 2),
          formatEUR(f.cobros),
          formatEUR(f.pagosTotales),
          formatEUR(f.flujoNeto),
          f.factorDescuento.toFixed(4),
          formatEUR(f.valorActualNeto),
        ]),
      });
      y = getLastAutoTableY(doc, y + 25);
    }
  } else if (res.metodoAplicado === 'capitalizacion_rustico') {
    const cr = res.capitalizacionRustico;
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
      theme: 'grid',
      styles: { font, fontSize: 8.5, cellPadding: 2.3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 95, fillColor: [248, 250, 252] } },
      body: [
        ['Superficie rústica / aprovechamiento', `${formatNumber(cr.superficieHa, 4)} Ha (${exp.paramsCapitalizacionRustico.tipoCultivoAprovechamiento})`],
        ['Renta anual neta total', formatEURDecimal(cr.rentaAnualTotal)],
        ['Tipo de capitalización aplicado', `${formatNumber(exp.paramsCapitalizacionRustico.tipoCapitalizacionPct, 2)} %`],
        ['Valor de capitalización base (V = R / r)', formatEUR(cr.valorCapitalizacionBase)],
        ['Factor de localización Ley 8/2007 Art. 23 (FL)', `× ${formatNumber(exp.paramsCapitalizacionRustico.factorLocalizacionFL, 2)} -> ${formatEUR(cr.valorConFactorLocalizacion)}`],
        ['Indemnización facultad participar (Art. 25) + Mejoras', formatEUR(cr.indemnizacionFacultadParticipar + cr.valorMejoras)],
        ['VALOR TOTAL SUELO RURAL / RÚSTICO', formatEUR(cr.valorTotalSueloRural)],
      ],
    });
    y = getLastAutoTableY(doc, y + 30);
  }

  return y;
}

function renderNormalComparablesTable(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  startY: number,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): number {
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const secondary = hexToRgb(cfg.colorSecundarioHex, [15, 23, 42]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  const secNum = exp.piezasAnexas.length > 0 ? '4' : '3';
  let y = drawSectionTitle(
    doc,
    `${secNum}. Tabla Resumen de Testigos y Factores Correctores Aplicados`,
    startY,
    cfg,
    margins
  );

  if (res.testigosUsados.length === 0) {
    doc.setFont(font, 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No se han vinculado testigos de mercado en este método.', 14, y);
    return y + 8;
  }

  if (res.requiereJustificacionEscasez) {
    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    const justif = doc.splitTextToSize(
      `Nota ECO/805/2003 (Muestra < 6 testigos): ${exp.justificacionEscasezMercado || 'Sin justificación registrada.'}`,
      182
    );
    doc.text(justif, 14, y);
    y += justif.length * 3.8 + 3;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, top: margins.top, bottom: margins.bottom },
    theme: 'striped',
    styles: { font, fontSize: 7.5, cellPadding: 2, halign: 'right' },
    headStyles: { fillColor: secondary, textColor: [255, 255, 255], halign: 'center' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 22 },
      1: { halign: 'left', cellWidth: 42 },
    },
    head: [
      [
        'Cód.',
        'Ubicación / Fuente',
        'Sup. m²',
        'Precio (€)',
        '€/m² Br.',
        'Neg.',
        'Loc.',
        'Sup.',
        'Est./Ant.',
        'Otros',
        'Global',
        '€/m² Hom.',
      ],
    ],
    body: res.testigosUsados.map((t) => {
      const f = t.factoresCorrectores;
      const otros = f.calidadAcabados * f.plantaOrientacion * f.equipamientoAnexos;
      return [
        t.codigoTrazabilidad.split('-').slice(-1)[0],
        `${t.direccion || t.zona}\n(${t.portalFuente})`,
        formatNumber(t.superficieM2, 1),
        formatEUR(t.precioTotal),
        formatEUR(t.precioM2Bruto),
        f.negociacion.toFixed(2),
        f.localizacion.toFixed(2),
        f.superficie.toFixed(2),
        f.antiguedadEstado.toFixed(2),
        otros.toFixed(2),
        t.coeficienteGlobal.toFixed(3),
        formatEUR(t.precioM2Homogeneizado),
      ];
    }),
    foot: [
      [
        'MEDIA',
        `${res.cantidadTestigosUsados} testigos homogeneizados`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        formatEURDecimal(res.mediaHomogeneizadaM2),
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: primary, fontStyle: 'bold' },
  });

  return getLastAutoTableY(doc, y + 35);
}

async function renderPropertyPhotosSection(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  startY: number,
  secNum: string,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): Promise<number> {
  if (exp.fotos.length === 0) return startY;
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  let y = drawSectionTitle(
    doc,
    `${secNum}. Reportaje Fotográfico del Bien Tasado`,
    startY,
    cfg,
    margins
  );

  const loadedPhotos = await Promise.all(
    exp.fotos.map(async (f) => ({
      foto: f,
      img: await loadImageForPdf(f.url, false),
    }))
  );

  const cardWidth = 86;
  const imgHeight = 56;
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 0; i < loadedPhotos.length; i += 2) {
    if (y + imgHeight + 18 > pageHeight - margins.bottom) {
      doc.addPage();
      y = margins.top;
    }

    for (let col = 0; col < 2; col++) {
      const item = loadedPhotos[i + col];
      if (!item) continue;
      const x = 14 + col * 96;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(x, y, cardWidth, imgHeight + 12, 'FD');

      if (item.img) {
        doc.addImage(item.img.dataUrl, item.img.format, x + 1, y + 1, cardWidth - 2, imgHeight - 2);
      }
      doc.setFont(font, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      const caption = doc.splitTextToSize(
        `[${item.foto.categoria.toUpperCase()}] ${item.foto.pieDeFoto}`,
        cardWidth - 4
      );
      doc.text(caption.slice(0, 2), x + 2, y + imgHeight + 4.5);
    }

    y += imgHeight + 17;
  }

  return y;
}

async function renderComparableTraceabilityCards(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  startY: number,
  sectionTitle: string,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
): Promise<number> {
  const primary = hexToRgb(cfg.colorPrimarioHex, [30, 58, 138]);
  const accent = hexToRgb(cfg.colorAcentoHex, [29, 78, 216]);
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  let y = drawSectionTitle(doc, sectionTitle, startY, cfg, margins);
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont(font, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Activo Vinculado: ${exp.inmueble.codigoExpediente} · ${exp.inmueble.direccion} · Ref. Catastral: ${exp.inmueble.referenciaCatastral || 'N/D'}`,
    14,
    y
  );
  y += 5;

  if (res.requiereJustificacionEscasez) {
    doc.setFont(font, 'bold');
    doc.setTextColor(180, 83, 9);
    const lines = doc.splitTextToSize(
      `Justificación muestra < 6 testigos (Art. 21 ECO/805/2003): ${exp.justificacionEscasezMercado || 'Pendiente de justificación.'}`,
      182
    );
    doc.text(lines, 14, y);
    y += lines.length * 4 + 3;
  }

  for (const t of res.testigosUsados) {
    if (y + 62 > pageHeight - margins.bottom) {
      doc.addPage();
      y = margins.top;
    }

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.rect(14, y, 182, 56, 'D');

    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 8, 'F');
    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${t.codigoTrazabilidad} — ${t.titulo}`, 17, y + 5.3);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Capturado: ${t.fechaCaptura.slice(0, 10)} · ${t.portalFuente}`, 193, y + 5.3, {
      align: 'right',
    });

    const imgBoxX = 17;
    const imgBoxY = y + 10;
    const imgW = 60;
    const imgH = 42;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(imgBoxX, imgBoxY, imgW, imgH, 'FD');

    if (t.pantallazo) {
      const loaded = await loadImageForPdf(t.pantallazo, false);
      if (loaded) {
        doc.addImage(loaded.dataUrl, loaded.format, imgBoxX + 0.5, imgBoxY + 0.5, imgW - 1, imgH - 1);
      } else {
        doc.setFontSize(7);
        doc.text('Pantallazo no disponible', imgBoxX + 12, imgBoxY + 21);
      }
    } else {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('Sin pantallazo adjunto', imgBoxX + 14, imgBoxY + 21);
    }

    const dataX = 81;
    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Precio: ${formatEUR(t.precioTotal)} · Sup: ${formatNumber(t.superficieM2, 1)} m² · Bruto: ${formatEUR(t.precioM2Bruto)}/m²`,
      dataX,
      y + 14
    );

    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Ubicación: ${t.direccion}, ${t.zona} (${t.municipio})`, dataX, y + 19.5);
    doc.text(
      `Atributos: ${t.caracteristicas.habitaciones ?? '-'} hab · ${t.caracteristicas.banos ?? '-'} baños · Planta: ${t.caracteristicas.planta ?? '-'} · Año: ${t.caracteristicas.anoConstruccion ?? '-'}`,
      dataX,
      y + 24.5
    );

    const f = t.factoresCorrectores;
    doc.text(
      `Factores: Neg(${f.negociacion.toFixed(2)}) · Loc(${f.localizacion.toFixed(2)}) · Sup(${f.superficie.toFixed(2)}) · Est(${f.antiguedadEstado.toFixed(2)})`,
      dataX,
      y + 30
    );
    doc.text(
      `Cal(${f.calidadAcabados.toFixed(2)}) · Pl/Or(${f.plantaOrientacion.toFixed(2)}) · Equip(${f.equipamientoAnexos.toFixed(2)}) -> Global: ${t.coeficienteGlobal.toFixed(3)}`,
      dataX,
      y + 34.8
    );

    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primary);
    doc.text(
      `Valor Unitario Homogeneizado: ${formatEURDecimal(t.precioM2Homogeneizado)} / m²`,
      dataX,
      y + 41
    );

    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    if (t.enlace) {
      doc.setTextColor(...accent);
      const displayUrl = t.enlace.length > 68 ? `${t.enlace.slice(0, 65)}...` : t.enlace;
      doc.textWithLink(`Enlace fuente: ${displayUrl}`, dataX, y + 48, { url: t.enlace });
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text('Enlace fuente: No especificado', dataX, y + 48);
    }

    y += 61;
  }

  return y;
}

function renderSignatureBlock(
  doc: jsPDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion,
  startY: number,
  cfg: ConfiguracionInforme,
  margins: { top: number; bottom: number }
) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const font: TipografiaPDF = cfg.tipografia || 'helvetica';
  let y = startY + 4;
  if (y + 38 > pageHeight - margins.bottom) {
    doc.addPage();
    y = margins.top;
  }

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, 182, 34, 'FD');

  doc.setFont(font, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('CERTIFICADO Y FIRMA TÉCNICA DE TASACIÓN', 18, y + 7);

  doc.setFont(font, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const certText = doc.splitTextToSize(
    `${exp.inmueble.condicionantesYAdvertencias} Valor total certificado a fecha ${exp.inmueble.fechaTasacion}: ${formatEUR(res.valorTotalTasacionEuros)}.`,
    174
  );
  doc.text(certText, 18, y + 13);

  doc.setFont(font, 'bold');
  doc.text(
    `Fdo.: ${exp.inmueble.tasadorNombre || 'Perito Tasador Inmobiliario'} · ${exp.inmueble.tasadorColegiado || ''}`,
    18,
    y + 28
  );
}

export async function generarInformePDF(
  tipo: TipoInformePDF,
  exp: ExpedienteTasacion,
  res: ResultadoValoracion
): Promise<{ blobUrl: string; fileName: string; download: () => void }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const cfg = resolveConfiguracionInforme(exp);
  const hf = getActiveHeaderFooter(cfg, tipo);
  const margins = getLayoutMargins(hf, cfg);

  const [logoImg, footerImg] = await Promise.all([
    cfg.logoPrincipal ? loadImageForPdf(cfg.logoPrincipal, true) : Promise.resolve(null),
    cfg.imagenPiePagina ? loadImageForPdf(cfg.imagenPiePagina, true) : Promise.resolve(null),
  ]);

  const code = exp.inmueble.codigoExpediente || 'TAS';

  if (tipo === 'normal') {
    const coverTitle = 'INFORME NORMAL DE VALORACIÓN INMOBILIARIA';
    if (cfg.incluirPortada) {
      await renderCoverPage(doc, coverTitle, exp, res, cfg, logoImg, footerImg);
    }
    let y = await renderCoverBanner(doc, coverTitle, exp, res, cfg, margins.top);
    y = renderPropertySection(doc, exp, res, y, false, cfg, margins);
    y = renderMethodologySection(doc, exp, res, y, false, cfg, margins);
    y = renderNormalComparablesTable(doc, exp, res, y, cfg, margins);
    const photoSec = exp.piezasAnexas.length > 0 ? '5' : '4';
    y = await renderPropertyPhotosSection(doc, exp, y, photoSec, cfg, margins);
    renderSignatureBlock(doc, exp, res, y, cfg, margins);
    addHeaderAndFooter(
      doc,
      'Informe Normal de Valoración · ECO/805/2003',
      exp,
      cfg,
      hf,
      logoImg,
      footerImg
    );

    const fileName = `${code}_Informe_Normal_Valoracion.pdf`;
    const blobUrl = doc.output('bloburl').toString();
    return { blobUrl, fileName, download: () => doc.save(fileName) };
  }

  if (tipo === 'testigos') {
    const coverTitle = 'INFORME DE TESTIGOS Y TRAZABILIDAD DE MERCADO';
    if (cfg.incluirPortada) {
      await renderCoverPage(doc, coverTitle, exp, res, cfg, logoImg, footerImg);
    }
    let y = await renderCoverBanner(doc, coverTitle, exp, res, cfg, margins.top);
    y = renderNormalComparablesTable(doc, exp, res, y, cfg, margins);
    y = await renderComparableTraceabilityCards(
      doc,
      exp,
      res,
      y,
      'Anexo de Trazabilidad Individual: Pantallazos y Enlaces Vinculados al Activo',
      cfg,
      margins
    );
    addHeaderAndFooter(
      doc,
      'Informe de Testigos y Trazabilidad',
      exp,
      cfg,
      hf,
      logoImg,
      footerImg
    );

    const fileName = `${code}_Informe_Testigos_Trazabilidad.pdf`;
    const blobUrl = doc.output('bloburl').toString();
    return { blobUrl, fileName, download: () => doc.save(fileName) };
  }

  const coverTitle = 'INFORME AMPLIADO DE TASACIÓN Y TRAZABILIDAD';
  if (cfg.incluirPortada) {
    await renderCoverPage(doc, coverTitle, exp, res, cfg, logoImg, footerImg);
  }
  let y = await renderCoverBanner(doc, coverTitle, exp, res, cfg, margins.top);
  y = renderPropertySection(doc, exp, res, y, true, cfg, margins);
  y = renderMethodologySection(doc, exp, res, y, true, cfg, margins);
  y = renderNormalComparablesTable(doc, exp, res, y, cfg, margins);
  const photoSec = exp.piezasAnexas.length > 0 ? '5' : '4';
  y = await renderPropertyPhotosSection(doc, exp, y, photoSec, cfg, margins);
  const traceSec = exp.fotos.length > 0 ? String(Number(photoSec) + 1) : photoSec;
  y = await renderComparableTraceabilityCards(
    doc,
    exp,
    res,
    y,
    `${traceSec}. Trazabilidad Completa de Testigos: Pantallazos y Enlaces Vinculados`,
    cfg,
    margins
  );
  renderSignatureBlock(doc, exp, res, y, cfg, margins);
  addHeaderAndFooter(
    doc,
    'Informe Ampliado de Valoración · ECO/805/2003 & Ley 8/2007',
    exp,
    cfg,
    hf,
    logoImg,
    footerImg
  );

  const fileName = `${code}_Informe_Ampliado_Valoracion.pdf`;
  const blobUrl = doc.output('bloburl').toString();
  return { blobUrl, fileName, download: () => doc.save(fileName) };
}
