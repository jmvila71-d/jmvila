import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  ImagePlus,
  Loader2,
  Palette,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  EncabezadoPieInforme,
  EstiloEncabezado,
  EstiloPiePagina,
  EstiloPortada,
  ExpedienteTasacion,
  ResultadoValoracion,
  TipografiaPDF,
} from '../types/appraisal';
import { generarInformePDF, type TipoInformePDF } from '../utils/pdfGenerator';
import { resolveConfiguracionInforme } from '../utils/reportBranding';
import { formatEUR } from '../utils/valuationEngine';

interface ReportsTabProps {
  expediente: ExpedienteTasacion;
  resultado: ResultadoValoracion;
  onChange: (updated: ExpedienteTasacion) => void;
}

const REPORT_DEFS: Array<{
  tipo: TipoInformePDF;
  titulo: string;
  subtitulo: string;
  contenido: string[];
}> = [
  {
    tipo: 'normal',
    titulo: 'Informe Normal de Valoración',
    subtitulo: 'Documento ejecutivo para el cliente con tabla resumida de testigos',
    contenido: [
      'Identificación del bien, finalidad ECO/805/2003 y piezas anexas.',
      'Desarrollo del método principal de valoración y valor final certificado.',
      'Únicamente tabla resumen con datos clave de testigos y factores correctores aplicados.',
      'Reportaje fotográfico completo del bien tasado.',
    ],
  },
  {
    tipo: 'testigos',
    titulo: 'Informe de Testigos y Trazabilidad',
    subtitulo: 'Dossier probatorio de mercado vinculado al activo analizado',
    contenido: [
      'Vinculación directa al código de expediente, referencia catastral e ID del activo.',
      'Auditoría de muestra (6–8 testigos o justificación de escasez en zona).',
      'Ficha individual por testigo con pantallazo guardado y enlace URL clicable.',
      'Desglose íntegro de los 7 coeficientes correctores y €/m² homogeneizado.',
    ],
  },
  {
    tipo: 'ampliado',
    titulo: 'Informe Ampliado de Valoración',
    subtitulo: 'Expediente técnico integral ECO/805/2003 + Ley 8/2007 + Trazabilidad',
    contenido: [
      'Memoria normativa completa (Orden ECO/805/2003 y Ley 8/2007 de Suelo).',
      'Tablas de cálculo detalladas (flujos VAN dinámico, depreciación reposición, anexos).',
      'Reportaje fotográfico completo del inmueble o terreno.',
      'Anexo completo de testigos con sus pantallazos, enlaces y trazabilidad certificada.',
    ],
  },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  expediente,
  resultado,
  onChange,
}) => {
  const cfg = resolveConfiguracionInforme(expediente);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const footerImgInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const [generating, setGenerating] = useState<TipoInformePDF | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [editingScope, setEditingScope] = useState<TipoInformePDF>('normal');
  const [analyzingBrand, setAnalyzingBrand] = useState<boolean>(false);
  const [brandFeedback, setBrandFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const updateCfg = (patch: Partial<typeof cfg>) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      configuracionInforme: {
        ...cfg,
        ...patch,
      },
    });
  };

  const activeHf: EncabezadoPieInforme = cfg.personalizarPorTipoInforme
    ? cfg.porTipo[editingScope]
    : cfg.general;

  const updateActiveHf = (patch: Partial<EncabezadoPieInforme>) => {
    if (cfg.personalizarPorTipoInforme) {
      updateCfg({
        porTipo: {
          ...cfg.porTipo,
          [editingScope]: { ...cfg.porTipo[editingScope], ...patch },
        },
      });
    } else {
      updateCfg({
        general: { ...cfg.general, ...patch },
      });
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateCfg({ logoPrincipal: dataUrl });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleUploadFooterImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateCfg({
      imagenPiePagina: dataUrl,
      general: { ...cfg.general, mostrarImagenPie: true },
      porTipo: {
        normal: { ...cfg.porTipo.normal, mostrarImagenPie: true },
        testigos: { ...cfg.porTipo.testigos, mostrarImagenPie: true },
        ampliado: { ...cfg.porTipo.ampliado, mostrarImagenPie: true },
      },
    });
    if (footerImgInputRef.current) footerImgInputRef.current.value = '';
  };

  const handleUploadManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateCfg({
      manualImagenNombre: file.name,
      manualImagenDataUrl: dataUrl,
    });
    if (manualInputRef.current) manualInputRef.current.value = '';
  };

  const handleApplyBrandInstructions = async () => {
    if (!cfg.instruccionesApariencia.trim() && !cfg.manualImagenDataUrl) {
      setBrandFeedback({
        type: 'error',
        text: 'Escriba instrucciones de apariencia o suba un manual de imagen antes de aplicar.',
      });
      return;
    }

    setAnalyzingBrand(true);
    setBrandFeedback(null);

    try {
      const resp = await fetch('/api/brand/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrucciones: cfg.instruccionesApariencia,
          manualDataUrl: cfg.manualImagenDataUrl,
          manualFileName: cfg.manualImagenNombre,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.error || 'No se pudo aplicar la configuración visual.');
      }

      const ext = json.config || {};
      const validFonts: TipografiaPDF[] = ['helvetica', 'times', 'courier'];
      const validCovers: EstiloPortada[] = [
        'ejecutiva_banda',
        'clasica_enmarcada',
        'minimal_editorial',
      ];
      const validHeaders: EstiloEncabezado[] = [
        'corporativo_logo',
        'clasico_centrado',
        'banda_color',
        'minimalista',
      ];
      const validFooters: EstiloPiePagina[] = [
        'estandar_texto',
        'imagen_faldilla',
        'dos_columnas_contacto',
        'banda_oscura',
      ];

      const nextHeader = validHeaders.includes(ext.estiloEncabezado)
        ? (ext.estiloEncabezado as EstiloEncabezado)
        : activeHf.estiloEncabezado;
      const nextFooter = validFooters.includes(ext.estiloPie)
        ? (ext.estiloPie as EstiloPiePagina)
        : activeHf.estiloPie;

      const hfPatch: Partial<EncabezadoPieInforme> = {
        estiloEncabezado: nextHeader,
        estiloPie: nextFooter,
        ...(ext.textoEncabezadoIzq ? { textoEncabezadoIzq: ext.textoEncabezadoIzq } : {}),
        ...(ext.textoPieIzq ? { textoPieIzq: ext.textoPieIzq } : {}),
      };

      updateCfg({
        colorPrimarioHex: /^#[0-9a-fA-F]{6}$/.test(ext.colorPrimarioHex || '')
          ? ext.colorPrimarioHex
          : cfg.colorPrimarioHex,
        colorSecundarioHex: /^#[0-9a-fA-F]{6}$/.test(ext.colorSecundarioHex || '')
          ? ext.colorSecundarioHex
          : cfg.colorSecundarioHex,
        colorAcentoHex: /^#[0-9a-fA-F]{6}$/.test(ext.colorAcentoHex || '')
          ? ext.colorAcentoHex
          : cfg.colorAcentoHex,
        tipografia: validFonts.includes(ext.tipografia)
          ? (ext.tipografia as TipografiaPDF)
          : cfg.tipografia,
        incluirPortada:
          typeof ext.incluirPortada === 'boolean'
            ? ext.incluirPortada
            : cfg.incluirPortada,
        estiloPortada: validCovers.includes(ext.estiloPortada)
          ? (ext.estiloPortada as EstiloPortada)
          : cfg.estiloPortada,
        subtituloPortada: ext.subtituloPortada || cfg.subtituloPortada,
        resumenEstiloAplicado:
          ext.resumenEstiloAplicado || 'Configuración aplicada al diseño del informe.',
        ...(cfg.personalizarPorTipoInforme
          ? {
              porTipo: {
                ...cfg.porTipo,
                [editingScope]: { ...cfg.porTipo[editingScope], ...hfPatch },
              },
            }
          : {
              general: { ...cfg.general, ...hfPatch },
            }),
      });

      setBrandFeedback({
        type: 'success',
        text:
          ext.resumenEstiloAplicado ||
          'Apariencia del informe actualizada según el manual e instrucciones.',
      });
    } catch (err: unknown) {
      setBrandFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Error al analizar las instrucciones de diseño.',
      });
    } finally {
      setAnalyzingBrand(false);
    }
  };

  const handleAction = async (tipo: TipoInformePDF, mode: 'preview' | 'download') => {
    setGenerating(tipo);
    try {
      const pdf = await generarInformePDF(tipo, expediente, resultado);
      if (mode === 'download') {
        pdf.download();
      }
      setPreviewUrl(pdf.blobUrl);
      setPreviewFileName(pdf.fileName);
      setPreviewTitle(
        REPORT_DEFS.find((r) => r.tipo === tipo)?.titulo ?? 'Vista previa PDF'
      );
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Traceability & Compliance Audit Bar */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Control de Trazabilidad y Generación Automática de Informes PDF
            </h2>
            <p className="text-xs text-slate-500">
              Expediente {expediente.inmueble.codigoExpediente} · ID Activo: {expediente.id} ·
              Valor Final:{' '}
              <span className="font-mono font-semibold text-blue-900 tabular-nums">
                {formatEUR(resultado.valorTotalTasacionEuros)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>{expediente.fotos.length} fotos del bien</span>
            <span aria-hidden="true">·</span>
            <span>{expediente.piezasAnexas.length} piezas anexas</span>
            <span aria-hidden="true">·</span>
            <span>{resultado.cantidadTestigosUsados} testigos vinculados</span>
          </div>
        </div>

        {resultado.advertenciasNormativas.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Expediente verificado: trazabilidad de testigos, capturas, enlaces y normativa
              completos para emisión de informes al cliente.
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Avisos de verificación antes de emitir PDF</span>
            </div>
            <ul className="list-disc pl-5 text-xs text-amber-800">
              {resultado.advertenciasNormativas.map((adv, idx) => (
                <li key={idx}>{adv}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Brand, Cover, Header & Footer Studio */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Configuración de Portada, Encabezados, Pies de Página e Imagen Corporativa
          </h2>
          <p className="text-xs text-slate-500">
            Suba logos, imágenes de pie de página o su manual de imagen, escriba instrucciones de
            diseño y defina encabezados y pies distintos para cada informe.
          </p>
        </div>

        {/* 1. Assets Upload + Appearance Instructions Box */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Logos, Footer Image & Brand Manual */}
          <div className="lg:col-span-5 space-y-4">
            {/* Logo upload */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Logo corporativo (Portada y Encabezados)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadLogo}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {cfg.logoPrincipal ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {cfg.logoPrincipal && (
                    <button
                      type="button"
                      onClick={() => updateCfg({ logoPrincipal: null })}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Quitar logo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {cfg.logoPrincipal ? (
                <div className="flex h-16 items-center justify-center rounded border border-slate-200 bg-white p-2">
                  <img
                    src={cfg.logoPrincipal}
                    alt="Logo corporativo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  Sin logo subido. Se mostrará el nombre del gabinete en texto.
                </div>
              )}
            </div>

            {/* Footer Image upload */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Imagen / Faldilla de Pie de Página
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={footerImgInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadFooterImg}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => footerImgInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {cfg.imagenPiePagina ? 'Cambiar imagen' : 'Subir pie'}
                  </button>
                  {cfg.imagenPiePagina && (
                    <button
                      type="button"
                      onClick={() => updateCfg({ imagenPiePagina: null })}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Quitar imagen de pie"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {cfg.imagenPiePagina ? (
                <div className="flex h-14 items-center justify-center rounded border border-slate-200 bg-white p-1.5">
                  <img
                    src={cfg.imagenPiePagina}
                    alt="Imagen pie de página"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  Opcional: suba un banner, sellos de certificación o faldilla gráfica para el
                  pie de página.
                </div>
              )}
            </div>

            {/* Brand Manual upload */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Manual de Imagen Corporativa (PDF / Imagen)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={manualInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleUploadManual}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => manualInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {cfg.manualImagenDataUrl ? 'Cambiar manual' : 'Subir manual'}
                  </button>
                  {cfg.manualImagenDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCfg({ manualImagenDataUrl: null, manualImagenNombre: '' })
                      }
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Quitar manual"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                {cfg.manualImagenDataUrl
                  ? `Archivo adjunto: ${cfg.manualImagenNombre}`
                  : 'Suba su guía de estilo o manual de marca para extraer colores y tipografía.'}
              </div>
            </div>
          </div>

          {/* Right: Appearance Instructions Box + Palette & Typography */}
          <div className="lg:col-span-7 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  Caja de instrucciones para configurar la apariencia del informe
                </label>
                <span className="text-[11px] text-slate-500">
                  Compatible con manual de imagen adjunto
                </span>
              </div>
              <textarea
                rows={4}
                value={cfg.instruccionesApariencia}
                onChange={(e) => updateCfg({ instruccionesApariencia: e.target.value })}
                placeholder="Ej. Configura el informe con estética sobria en verde bosque (#14532D) y gris pizarra (#1E293B), tipografía clásica con serifa (Times), portada clásica enmarcada con foto principal, encabezado con banda de color y pie de página confidencial con datos colegiales..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleApplyBrandInstructions}
                  disabled={analyzingBrand}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {analyzingBrand ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {analyzingBrand
                    ? 'Analizando manual e instrucciones...'
                    : 'Aplicar Manual e Instrucciones'}
                </button>
                {cfg.resumenEstiloAplicado && (
                  <span className="text-[11px] text-slate-600 flex-1">
                    {cfg.resumenEstiloAplicado}
                  </span>
                )}
              </div>

              {brandFeedback && (
                <div
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                    brandFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {brandFeedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{brandFeedback.text}</span>
                </div>
              )}
            </div>

            {/* Colors & Typography Manual Controls */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-700">
                  <Palette className="h-3 w-3" />
                  Color Primario
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cfg.colorPrimarioHex}
                    onChange={(e) => updateCfg({ colorPrimarioHex: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    value={cfg.colorPrimarioHex}
                    onChange={(e) => updateCfg({ colorPrimarioHex: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-700">
                  Color Secundario
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cfg.colorSecundarioHex}
                    onChange={(e) => updateCfg({ colorSecundarioHex: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    value={cfg.colorSecundarioHex}
                    onChange={(e) => updateCfg({ colorSecundarioHex: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-700">
                  Color Acento
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cfg.colorAcentoHex}
                    onChange={(e) => updateCfg({ colorAcentoHex: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    value={cfg.colorAcentoHex}
                    onChange={(e) => updateCfg({ colorAcentoHex: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-700">
                  Tipografía PDF
                </label>
                <select
                  value={cfg.tipografia}
                  onChange={(e) =>
                    updateCfg({ tipografia: e.target.value as TipografiaPDF })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="helvetica">Helvética (Moderna Sans)</option>
                  <option value="times">Times (Editorial Clásica)</option>
                  <option value="courier">Courier (Técnica Mono)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Cover Page Options */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.incluirPortada}
                onChange={(e) => updateCfg({ incluirPortada: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-blue-900"
              />
              Incluir Portada al inicio del informe PDF
            </label>

            {cfg.incluirPortada && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.incluirFotoPrincipalEnPortada}
                  onChange={(e) =>
                    updateCfg({ incluirFotoPrincipalEnPortada: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-900"
                />
                Mostrar fotografía principal del activo en portada
              </label>
            )}
          </div>

          {cfg.incluirPortada && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Diseño de Portada
                </label>
                <select
                  value={cfg.estiloPortada}
                  onChange={(e) =>
                    updateCfg({ estiloPortada: e.target.value as EstiloPortada })
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="ejecutiva_banda">Ejecutiva con banda lateral y cabecera</option>
                  <option value="clasica_enmarcada">Clásica institucional enmarcada</option>
                  <option value="minimal_editorial">Editorial minimalista</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Subtítulo de Portada
                </label>
                <input
                  type="text"
                  value={cfg.subtituloPortada}
                  onChange={(e) => updateCfg({ subtituloPortada: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Nota al pie de Portada
                </label>
                <input
                  type="text"
                  value={cfg.notaConfidencialPortada}
                  onChange={(e) => updateCfg({ notaConfidencialPortada: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. Distinct Headers & Footers per Report or Global */}
        <div className="border-t border-slate-200 pt-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Encabezados y Pies de Página
              </h3>
              <p className="text-xs text-slate-500">
                Puede utilizar un diseño unificado o definir encabezados y pies distintos para
                cada tipo de informe.
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.personalizarPorTipoInforme}
                onChange={(e) =>
                  updateCfg({ personalizarPorTipoInforme: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-900"
              />
              Encabezados y pies distintos por tipo de informe
            </label>
          </div>

          {cfg.personalizarPorTipoInforme && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 w-fit">
              {(
                [
                  { id: 'normal', label: 'Informe Normal' },
                  { id: 'testigos', label: 'Informe de Testigos' },
                  { id: 'ampliado', label: 'Informe Ampliado' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditingScope(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    editingScope === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Header configuration */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-900">
                Encabezado ({cfg.personalizarPorTipoInforme ? editingScope.toUpperCase() : 'TODOS LOS INFORMES'})
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  Diseño de encabezado
                </label>
                <select
                  value={activeHf.estiloEncabezado}
                  onChange={(e) =>
                    updateActiveHf({
                      estiloEncabezado: e.target.value as EstiloEncabezado,
                    })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="corporativo_logo">Corporativo con logo y línea inferior</option>
                  <option value="banda_color">Banda superior a color corporativo</option>
                  <option value="clasico_centrado">Clásico centrado</option>
                  <option value="minimalista">Minimalista discreto</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Texto izquierdo (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Por defecto: Título informe"
                    value={activeHf.textoEncabezadoIzq}
                    onChange={(e) =>
                      updateActiveHf({ textoEncabezadoIzq: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Texto derecho (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Por defecto: Exp. y Ref. Cat."
                    value={activeHf.textoEncabezadoDer}
                    onChange={(e) =>
                      updateActiveHf({ textoEncabezadoDer: e.target.value })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeHf.mostrarLogoEnEncabezado}
                  onChange={(e) =>
                    updateActiveHf({ mostrarLogoEnEncabezado: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-900"
                />
                Incluir logo subido en el encabezado
              </label>
            </div>

            {/* Footer configuration */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-900">
                Pie de Página ({cfg.personalizarPorTipoInforme ? editingScope.toUpperCase() : 'TODOS LOS INFORMES'})
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">
                  Diseño de pie de página
                </label>
                <select
                  value={activeHf.estiloPie}
                  onChange={(e) =>
                    updateActiveHf({ estiloPie: e.target.value as EstiloPiePagina })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="estandar_texto">Estándar con texto legal y paginación</option>
                  <option value="imagen_faldilla">Con faldilla / imagen de pie subida</option>
                  <option value="dos_columnas_contacto">Dos líneas (sociedad + nota legal)</option>
                  <option value="banda_oscura">Banda inferior oscura corporativa</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Texto izquierdo (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Por defecto: Sociedad + ID"
                    value={activeHf.textoPieIzq}
                    onChange={(e) => updateActiveHf({ textoPieIzq: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Nota secundaria / legal
                  </label>
                  <input
                    type="text"
                    value={activeHf.textoPieCentro}
                    onChange={(e) => updateActiveHf({ textoPieCentro: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeHf.mostrarImagenPie}
                    onChange={(e) =>
                      updateActiveHf({ mostrarImagenPie: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-900"
                  />
                  Mostrar imagen de pie subida
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeHf.mostrarPaginacion}
                    onChange={(e) =>
                      updateActiveHf({ mostrarPaginacion: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-900"
                  />
                  Numeración de páginas
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Report Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {REPORT_DEFS.map((rep) => {
          const isBusy = generating === rep.tipo;
          return (
            <div
              key={rep.tipo}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 space-y-5"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-blue-900">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{rep.titulo}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">{rep.subtitulo}</p>
                  </div>
                </div>

                <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {rep.contenido.map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={Boolean(generating)}
                  onClick={() => handleAction(rep.tipo, 'preview')}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  Vista previa
                </button>
                <button
                  type="button"
                  disabled={Boolean(generating)}
                  onClick={() => handleAction(rep.tipo, 'download')}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-900 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Descargar PDF
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Embedded PDF Preview */}
      {previewUrl && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Vista previa: {previewTitle}
              </h3>
              <p className="text-xs text-slate-500 font-mono">{previewFileName}</p>
            </div>
            <a
              href={previewUrl}
              download={previewFileName}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Guardar archivo PDF
            </a>
          </div>
          <div className="h-[680px] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            <iframe
              src={previewUrl}
              title={previewTitle}
              className="h-full w-full"
            />
          </div>
        </section>
      )}
    </div>
  );
};
