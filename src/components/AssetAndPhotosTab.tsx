import React, { useRef, useState } from 'react';
import {
  Camera,
  FileText,
  ImagePlus,
  Loader2,
  Plus,
  ScanText,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type {
  EstadoConservacion,
  ExpedienteTasacion,
  FotoInmueble,
  PiezaAnexa,
  ResultadoValoracion,
  SituacionBasicaLey8,
  TipoActivo,
  TipoAnexo,
} from '../types/appraisal';
import {
  TIPO_ACTIVO_LABELS,
  formatEUR,
  formatNumber,
  getMetodosDisponibles,
  isTerreno,
} from '../utils/valuationEngine';

interface AssetAndPhotosTabProps {
  expediente: ExpedienteTasacion;
  resultado: ResultadoValoracion;
  onChange: (updated: ExpedienteTasacion) => void;
}

const TIPO_ANEXO_LABELS: Record<TipoAnexo, string> = {
  trastero: 'Trastero',
  garaje: 'Plaza de garaje',
  jardin: 'Jardín privativo',
  terraza: 'Terraza / Porche',
  bodega: 'Bodega / Sótano',
  buhardilla: 'Buhardilla',
  otro: 'Otro anexo',
};

const ESTADO_LABELS: Record<EstadoConservacion, string> = {
  obra_nueva: 'Obra nueva',
  excelente: 'Excelente / Reformado',
  bueno: 'Bueno',
  normal: 'Normal',
  regular: 'Regular (requiere actualización)',
  rehabilitar: 'A rehabilitar',
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export const AssetAndPhotosTab: React.FC<AssetAndPhotosTabProps> = ({
  expediente,
  resultado,
  onChange,
}) => {
  const { inmueble, piezasAnexas, fotos } = expediente;
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const updateInmueble = <K extends keyof typeof inmueble>(
    field: K,
    value: (typeof inmueble)[K]
  ) => {
    const nextInmueble = { ...inmueble, [field]: value };
    let nextMetodo = expediente.metodoPrincipal;
    let nextLey8 = expediente.aplicarLey8_2007;

    if (field === 'tipoActivo') {
      const nuevoTipo = value as TipoActivo;
      const disponibles = getMetodosDisponibles(nuevoTipo);
      if (!disponibles.includes(nextMetodo)) {
        nextMetodo = disponibles[0];
      }
      if (nuevoTipo === 'terreno_urbanizable' || nuevoTipo === 'terreno_rustico') {
        nextLey8 = true;
      }
      if (nuevoTipo === 'terreno_rustico') {
        nextInmueble.situacionBasicaLey8 = 'suelo_rural_sin_ordenacion';
      } else if (nuevoTipo === 'terreno_urbanizable') {
        nextInmueble.situacionBasicaLey8 = 'suelo_urbanizable_con_ordenacion';
      } else if (nuevoTipo === 'terreno_urbano') {
        nextInmueble.situacionBasicaLey8 = 'suelo_urbanizado';
      }
    }

    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      metodoPrincipal: nextMetodo,
      aplicarLey8_2007: nextLey8,
      inmueble: nextInmueble,
    });
  };

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrMessage(null);

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const resp = await fetch('/api/ocr/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, fileName: file.name }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.error || 'Error en el análisis OCR.');
      }
      const ext = json.extracted || {};

      const validTypes: TipoActivo[] = [
        'vivienda',
        'local',
        'garaje',
        'trastero',
        'terreno_urbano',
        'terreno_urbanizable',
        'terreno_rustico',
      ];
      const detectedType = validTypes.includes(ext.tipoActivo)
        ? (ext.tipoActivo as TipoActivo)
        : inmueble.tipoActivo;

      const detectedAnnexes: PiezaAnexa[] = Array.isArray(ext.piezasAnexasDetectadas)
        ? ext.piezasAnexasDetectadas.map(
            (
              ax: { tipo?: string; descripcion?: string; superficieM2?: number },
              idx: number
            ) => ({
              id: `ax-ocr-${Date.now()}-${idx}`,
              tipo: (['trastero', 'garaje', 'jardin', 'terraza', 'bodega', 'buhardilla'].includes(
                ax.tipo || ''
              )
                ? ax.tipo
                : 'otro') as TipoAnexo,
              descripcion: ax.descripcion || 'Pieza anexa detectada por OCR',
              superficieM2: Number(ax.superficieM2) || 0,
              modoValoracion: 'repercusion' as const,
              coeficienteHomogeneizacion: ax.tipo === 'jardin' ? 0.25 : 0.35,
              valorFijoEuros: 0,
            })
          )
        : [];

      const disponibles = getMetodosDisponibles(detectedType);
      const nextMetodo = disponibles.includes(expediente.metodoPrincipal)
        ? expediente.metodoPrincipal
        : disponibles[0];

      // Also attach image to photos if it's an image file
      const nextFotos = [...fotos];
      if (file.type.startsWith('image/')) {
        nextFotos.push({
          id: `foto-ocr-${Date.now()}`,
          url: fileDataUrl,
          pieDeFoto: `Documento / fotografía analizada por OCR (${file.name})`,
          categoria: 'documento',
          fechaCaptura: new Date().toISOString().slice(0, 10),
        });
      }

      onChange({
        ...expediente,
        actualizadoEn: new Date().toISOString(),
        metodoPrincipal: nextMetodo,
        aplicarLey8_2007:
          detectedType === 'terreno_urbanizable' || detectedType === 'terreno_rustico'
            ? true
            : expediente.aplicarLey8_2007,
        inmueble: {
          ...inmueble,
          tipoActivo: detectedType,
          subtipo: ext.subtipo || inmueble.subtipo,
          direccion: ext.direccion || inmueble.direccion,
          municipio: ext.municipio || inmueble.municipio,
          provincia: ext.provincia || inmueble.provincia,
          codigoPostal: ext.codigoPostal || inmueble.codigoPostal,
          referenciaCatastral: ext.referenciaCatastral || inmueble.referenciaCatastral,
          datosRegistrales: ext.datosRegistrales || inmueble.datosRegistrales,
          superficieConstruidaM2:
            Number(ext.superficieConstruidaM2) > 0
              ? Number(ext.superficieConstruidaM2)
              : inmueble.superficieConstruidaM2,
          superficieUtilM2:
            Number(ext.superficieUtilM2) > 0
              ? Number(ext.superficieUtilM2)
              : inmueble.superficieUtilM2,
          superficieParcelaM2:
            Number(ext.superficieParcelaM2) > 0
              ? Number(ext.superficieParcelaM2)
              : inmueble.superficieParcelaM2,
          anoConstruccion:
            Number(ext.anoConstruccion) > 1800
              ? Number(ext.anoConstruccion)
              : inmueble.anoConstruccion,
          habitaciones:
            Number(ext.habitaciones) > 0 ? Number(ext.habitaciones) : inmueble.habitaciones,
          banos: Number(ext.banos) > 0 ? Number(ext.banos) : inmueble.banos,
          planta: ext.planta || inmueble.planta,
          ascensor: typeof ext.ascensor === 'boolean' ? ext.ascensor : inmueble.ascensor,
          calificacionEnergetica:
            ext.calificacionEnergetica || inmueble.calificacionEnergetica,
          clasificacionUrbanistica:
            ext.clasificacionUrbanistica || inmueble.clasificacionUrbanistica,
          usoPermitido: ext.usoPermitido || inmueble.usoPermitido,
          observacionesTecnicas: ext.observacionesTecnicas || inmueble.observacionesTecnicas,
        },
        piezasAnexas:
          detectedAnnexes.length > 0 ? [...piezasAnexas, ...detectedAnnexes] : piezasAnexas,
        fotos: nextFotos,
      });

      setOcrMessage({
        type: 'success',
        text: `Datos extraídos correctamente desde "${file.name}". Revise los campos completados.`,
      });
    } catch (err: unknown) {
      setOcrMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo completar el reconocimiento OCR.',
      });
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const handleAddAnnex = () => {
    const nuevo: PiezaAnexa = {
      id: `ax-${Date.now()}`,
      tipo: 'trastero',
      descripcion: 'Nuevo anejo vinculado',
      superficieM2: 8,
      modoValoracion: 'repercusion',
      coeficienteHomogeneizacion: 0.35,
      valorFijoEuros: 0,
    };
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      piezasAnexas: [...piezasAnexas, nuevo],
    });
  };

  const handleUpdateAnnex = (id: string, patch: Partial<PiezaAnexa>) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      piezasAnexas: piezasAnexas.map((ax) => (ax.id === id ? { ...ax, ...patch } : ax)),
    });
  };

  const handleRemoveAnnex = (id: string) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      piezasAnexas: piezasAnexas.filter((ax) => ax.id !== id),
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const nuevas: FotoInmueble[] = [];
    for (const f of files) {
      const url = await readFileAsDataUrl(f);
      nuevas.push({
        id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        pieDeFoto: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        categoria: 'interior',
        fechaCaptura: new Date().toISOString().slice(0, 10),
      });
    }

    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      fotos: [...fotos, ...nuevas],
    });
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleUpdatePhoto = (id: string, patch: Partial<FotoInmueble>) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      fotos: fotos.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const handleDeletePhoto = (id: string) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      fotos: fotos.filter((f) => f.id !== id),
    });
  };

  const esSuelo = isTerreno(inmueble.tipoActivo);
  const soportaAnexos = inmueble.tipoActivo === 'vivienda' || inmueble.tipoActivo === 'local';

  return (
    <div className="space-y-8">
      {/* OCR Import Strip */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Extracción automática OCR (Nota Simple, Catastro, IBI o fotografía)
            </h2>
            <p className="text-sm text-slate-600">
              Suba un documento PDF o una fotografía del inmueble para rellenar automáticamente
              los datos registrales, superficies, urbanismo y piezas anexas.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleOcrUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => ocrInputRef.current?.click()}
              disabled={ocrLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {ocrLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanText className="h-4 w-4" />
              )}
              {ocrLoading ? 'Analizando documento...' : 'Subir documento / foto OCR'}
            </button>
          </div>
        </div>

        {ocrMessage && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-md border px-3.5 py-2.5 text-sm ${
              ocrMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {ocrMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{ocrMessage.text}</span>
          </div>
        )}
      </section>

      {/* Identification & Technical Data */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Identificación del Activo y Datos Registrales
            </h2>
            <p className="text-xs text-slate-500">
              ID Trazabilidad: {expediente.id} · Código: {inmueble.codigoExpediente}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{TIPO_ACTIVO_LABELS[inmueble.tipoActivo]}</span>
            <span aria-hidden="true">·</span>
            <span>{inmueble.fechaTasacion}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Título descriptivo del expediente
            </label>
            <input
              type="text"
              value={inmueble.tituloExpediente}
              onChange={(e) => updateInmueble('tituloExpediente', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Tipología del bien inmueble
            </label>
            <select
              value={inmueble.tipoActivo}
              onChange={(e) => updateInmueble('tipoActivo', e.target.value as TipoActivo)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              {(Object.keys(TIPO_ACTIVO_LABELS) as TipoActivo[]).map((key) => (
                <option key={key} value={key}>
                  {TIPO_ACTIVO_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Código de expediente
            </label>
            <input
              type="text"
              value={inmueble.codigoExpediente}
              onChange={(e) => updateInmueble('codigoExpediente', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Fecha de tasación
            </label>
            <input
              type="date"
              value={inmueble.fechaTasacion}
              onChange={(e) => updateInmueble('fechaTasacion', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Subtipo constructivo / urbanístico
            </label>
            <input
              type="text"
              placeholder="Ej. Piso exterior, Chalet pareado, Solar..."
              value={inmueble.subtipo}
              onChange={(e) => updateInmueble('subtipo', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Dirección completa / Polígono y Parcela
            </label>
            <input
              type="text"
              value={inmueble.direccion}
              onChange={(e) => updateInmueble('direccion', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Referencia Catastral
            </label>
            <input
              type="text"
              value={inmueble.referenciaCatastral}
              onChange={(e) => updateInmueble('referenciaCatastral', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Municipio</label>
            <input
              type="text"
              value={inmueble.municipio}
              onChange={(e) => updateInmueble('municipio', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Provincia</label>
            <input
              type="text"
              value={inmueble.provincia}
              onChange={(e) => updateInmueble('provincia', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Código Postal</label>
            <input
              type="text"
              value={inmueble.codigoPostal}
              onChange={(e) => updateInmueble('codigoPostal', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Datos Registrales (Registro, Finca, Tomo, Libro, Folio)
            </label>
            <input
              type="text"
              value={inmueble.datosRegistrales}
              onChange={(e) => updateInmueble('datosRegistrales', e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>
        </div>

        {/* Surfaces & Physical attributes */}
        <div className="border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Superficies y Características Físicas
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {!esSuelo && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Sup. Construida (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={inmueble.superficieConstruidaM2}
                    onChange={(e) =>
                      updateInmueble('superficieConstruidaM2', Number(e.target.value))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Sup. Útil (m²)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={inmueble.superficieUtilM2}
                    onChange={(e) => updateInmueble('superficieUtilM2', Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Sup. Parcela / Suelo (m²)
              </label>
              <input
                type="number"
                step="0.01"
                value={inmueble.superficieParcelaM2}
                onChange={(e) => updateInmueble('superficieParcelaM2', Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>

            {!esSuelo && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Año construcción
                  </label>
                  <input
                    type="number"
                    value={inmueble.anoConstruccion}
                    onChange={(e) => updateInmueble('anoConstruccion', Number(e.target.value))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Estado conservación
                  </label>
                  <select
                    value={inmueble.estadoConservacion}
                    onChange={(e) =>
                      updateInmueble('estadoConservacion', e.target.value as EstadoConservacion)
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                  >
                    {(Object.keys(ESTADO_LABELS) as EstadoConservacion[]).map((k) => (
                      <option key={k} value={k}>
                        {ESTADO_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Planta / Altura
                  </label>
                  <input
                    type="text"
                    value={inmueble.planta}
                    onChange={(e) => updateInmueble('planta', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Habitaciones / Baños
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Hab"
                      value={inmueble.habitaciones}
                      onChange={(e) => updateInmueble('habitaciones', Number(e.target.value))}
                      className="w-1/2 rounded-md border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Baños"
                      value={inmueble.banos}
                      onChange={(e) => updateInmueble('banos', Number(e.target.value))}
                      className="w-1/2 rounded-md border border-slate-300 px-2.5 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Calificación energética
                  </label>
                  <input
                    type="text"
                    value={inmueble.calificacionEnergetica}
                    onChange={(e) => updateInmueble('calificacionEnergetica', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Situación Básica (Ley 8/2007)
              </label>
              <select
                value={inmueble.situacionBasicaLey8}
                onChange={(e) =>
                  updateInmueble('situacionBasicaLey8', e.target.value as SituacionBasicaLey8)
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              >
                <option value="suelo_urbanizado">Suelo Urbanizado</option>
                <option value="suelo_urbanizable_con_ordenacion">
                  Suelo Urbanizable c/ Ordenación (En desarrollo)
                </option>
                <option value="suelo_rural_sin_ordenacion">
                  Suelo Rural / Urbanizable sin ordenación
                </option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Clasificación Urbanística y Aprovechamiento
              </label>
              <input
                type="text"
                value={inmueble.clasificacionUrbanistica}
                onChange={(e) => updateInmueble('clasificacionUrbanistica', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Uso permitido / Planeamiento
              </label>
              <input
                type="text"
                value={inmueble.usoPermitido}
                onChange={(e) => updateInmueble('usoPermitido', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Observaciones Técnicas y Constructivas
              </label>
              <textarea
                rows={3}
                value={inmueble.observacionesTecnicas}
                onChange={(e) => updateInmueble('observacionesTecnicas', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Client & Appraiser */}
        <div className="border-t border-slate-200 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            Solicitante y Técnico Tasador
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Cliente / Solicitante
              </label>
              <input
                type="text"
                value={inmueble.solicitante}
                onChange={(e) => updateInmueble('solicitante', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Nombre del Tasador
              </label>
              <input
                type="text"
                value={inmueble.tasadorNombre}
                onChange={(e) => updateInmueble('tasadorNombre', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Nº Colegiado / Titulación
              </label>
              <input
                type="text"
                value={inmueble.tasadorColegiado}
                onChange={(e) => updateInmueble('tasadorColegiado', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Sociedad / Gabinete
              </label>
              <input
                type="text"
                value={inmueble.sociedadTasacion}
                onChange={(e) => updateInmueble('sociedadTasacion', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Piezas Anexas */}
      {soportaAnexos && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Piezas Anexas Vinculadas (Garaje, Trastero, Jardín, Terraza)
              </h2>
              <p className="text-xs text-slate-500">
                Se valoran por coeficiente de homogeneización sobre el valor unitario o por importe
                de mercado directo. Subtotal anexos:{' '}
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatEUR(resultado.valorAnexosEuros)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddAnnex}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir pieza anexa
            </button>
          </div>

          {piezasAnexas.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500">
              Este activo no tiene piezas anexas vinculadas. Pulse «Añadir pieza anexa» para
              incluir garajes, trasteros, jardines o terrazas.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 px-3">Descripción</th>
                    <th className="py-2 px-3 text-right">Sup. (m²)</th>
                    <th className="py-2 px-3">Criterio</th>
                    <th className="py-2 px-3 text-right">Coef. / Importe (€)</th>
                    <th className="py-2 px-3 text-right">Valor Calculado</th>
                    <th className="py-2 pl-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {piezasAnexas.map((ax) => {
                    const valAnexo =
                      ax.modoValoracion === 'importe_fijo'
                        ? ax.valorFijoEuros
                        : ax.superficieM2 *
                          resultado.mediaHomogeneizadaM2 *
                          ax.coeficienteHomogeneizacion;
                    return (
                      <tr key={ax.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3">
                          <select
                            value={ax.tipo}
                            onChange={(e) =>
                              handleUpdateAnnex(ax.id, { tipo: e.target.value as TipoAnexo })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          >
                            {(Object.keys(TIPO_ANEXO_LABELS) as TipoAnexo[]).map((k) => (
                              <option key={k} value={k}>
                                {TIPO_ANEXO_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={ax.descripcion}
                            onChange={(e) =>
                              handleUpdateAnnex(ax.id, { descripcion: e.target.value })
                            }
                            className="w-full min-w-44 rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            value={ax.superficieM2}
                            onChange={(e) =>
                              handleUpdateAnnex(ax.id, { superficieM2: Number(e.target.value) })
                            }
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={ax.modoValoracion}
                            onChange={(e) =>
                              handleUpdateAnnex(ax.id, {
                                modoValoracion: e.target.value as 'repercusion' | 'importe_fijo',
                              })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                          >
                            <option value="repercusion">Repercusión (€/m² × coef)</option>
                            <option value="importe_fijo">Importe directo (€)</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {ax.modoValoracion === 'importe_fijo' ? (
                            <input
                              type="number"
                              step="500"
                              value={ax.valorFijoEuros}
                              onChange={(e) =>
                                handleUpdateAnnex(ax.id, {
                                  valorFijoEuros: Number(e.target.value),
                                })
                              }
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900"
                            />
                          ) : (
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="1.5"
                              value={ax.coeficienteHomogeneizacion}
                              onChange={(e) =>
                                handleUpdateAnnex(ax.id, {
                                  coeficienteHomogeneizacion: Number(e.target.value),
                                })
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                          {formatEUR(valAnexo)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveAnnex(ax.id)}
                            title="Eliminar anejo"
                            className="inline-flex rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Property Photos Gallery */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Reportaje Fotográfico del Bien ({fotos.length} fotos)
            </h2>
            <p className="text-xs text-slate-500">
              Las fotografías adjuntas se incluirán automáticamente tanto en el Informe Normal como
              en el Informe Ampliado en PDF.
            </p>
          </div>
          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ImagePlus className="h-4 w-4" />
              Adjuntar fotografías
            </button>
          </div>
        </div>

        {fotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 py-10 text-center">
            <Camera className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Sin fotografías del activo</p>
            <p className="mt-1 text-xs text-slate-500">
              Adjunte imágenes de fachada, estancias interiores, anejos o entorno urbano.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fotos.map((foto) => (
              <div
                key={foto.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="relative aspect-[4/3] w-full bg-slate-200">
                  <img
                    src={foto.url}
                    alt={foto.pieDeFoto}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 -z-10">
                    <FileText className="h-8 w-8" />
                  </div>
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={foto.categoria}
                      onChange={(e) =>
                        handleUpdatePhoto(foto.id, {
                          categoria: e.target.value as FotoInmueble['categoria'],
                        })
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                    >
                      <option value="exterior">Exterior / Fachada</option>
                      <option value="interior">Interior</option>
                      <option value="anexo">Pieza anexa</option>
                      <option value="entorno">Entorno / Parcela</option>
                      <option value="documento">Documento / Plano</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(foto.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      title="Eliminar fotografía"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={foto.pieDeFoto}
                    onChange={(e) => handleUpdatePhoto(foto.id, { pieDeFoto: e.target.value })}
                    placeholder="Pie de foto..."
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  />
                  <div className="text-[11px] text-slate-500">
                    Fecha captura: {formatNumber(0, 0) && foto.fechaCaptura}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
