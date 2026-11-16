import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  ScanText,
  SlidersHorizontal,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type {
  ExpedienteTasacion,
  FactoresCorrectores,
  ResultadoValoracion,
  Testigo,
} from '../types/appraisal';
import { formatEUR, formatEURDecimal, formatNumber } from '../utils/valuationEngine';

interface ComparablesTabProps {
  expediente: ExpedienteTasacion;
  resultado: ResultadoValoracion;
  onChange: (updated: ExpedienteTasacion) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

const FACTOR_LABELS: Array<{ key: keyof FactoresCorrectores; label: string; hint: string }> = [
  { key: 'negociacion', label: 'Negociación (Oferta/Cierre)', hint: 'Ej. 0.92 (-8% oferta)' },
  { key: 'localizacion', label: 'Localización / Microzona', hint: 'Entorno, calle, servicios' },
  { key: 'superficie', label: 'Superficie / Tamaño', hint: 'Economía de escala' },
  { key: 'antiguedadEstado', label: 'Antigüedad / Estado', hint: 'Conservación y reforma' },
  { key: 'calidadAcabados', label: 'Calidad Constructiva', hint: 'Materiales y acabados' },
  { key: 'plantaOrientacion', label: 'Planta / Orientación / Vistas', hint: 'Altura y luminosidad' },
  { key: 'equipamientoAnexos', label: 'Equipamiento / Extras', hint: 'Ascensor, eficiencia, otros' },
];

export const ComparablesTab: React.FC<ComparablesTabProps> = ({
  expediente,
  resultado,
  onChange,
}) => {
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    expediente.testigos[0]?.id ?? null
  );

  const activeCount = resultado.cantidadTestigosUsados;
  const maxActiveReached = activeCount >= 8;

  const generateNextCode = () => {
    const num = expediente.testigos.length + 1;
    const prefix = expediente.inmueble.codigoExpediente || 'TAS';
    return `${prefix}-T${String(num).padStart(2, '0')}`;
  };

  const handleAddManual = () => {
    const newId = `t-${Date.now()}`;
    const nuevo: Testigo = {
      id: newId,
      codigoTrazabilidad: generateNextCode(),
      activoVinculadoId: expediente.id,
      fechaCaptura: new Date().toISOString(),
      titulo: 'Nuevo testigo comparable',
      direccion: '',
      zona: expediente.inmueble.municipio || '',
      municipio: expediente.inmueble.municipio || '',
      tipoFuente: 'oferta_portal',
      portalFuente: 'Idealista',
      enlace: '',
      pantallazo: null,
      incluidoEnValoracion: !maxActiveReached,
      precioTotal: 350000,
      superficieM2: 100,
      caracteristicas: {
        habitaciones: 3,
        banos: 2,
        planta: '2ª',
        ascensor: true,
        anoConstruccion: 2000,
        estadoConservacion: 'Bueno',
      },
      factoresCorrectores: {
        negociacion: 0.94,
        localizacion: 1.0,
        superficie: 1.0,
        antiguedadEstado: 1.0,
        calidadAcabados: 1.0,
        plantaOrientacion: 1.0,
        equipamientoAnexos: 1.0,
      },
    };
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      testigos: [...expediente.testigos, nuevo],
    });
    setSelectedId(newId);
  };

  const handleOcrTestigo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrFeedback(null);

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      const resp = await fetch('/api/ocr/comparable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileDataUrl, fileName: file.name }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json.error || 'Error en el análisis OCR del testigo.');
      }

      const ext = json.extracted || {};
      const newId = `t-ocr-${Date.now()}`;
      const esImagen = file.type.startsWith('image/');

      const nuevo: Testigo = {
        id: newId,
        codigoTrazabilidad: generateNextCode(),
        activoVinculadoId: expediente.id,
        fechaCaptura: new Date().toISOString(),
        titulo: ext.titulo || `Testigo extraído (${file.name})`,
        direccion: ext.direccion || '',
        zona: ext.zona || '',
        municipio: ext.municipio || expediente.inmueble.municipio || '',
        tipoFuente:
          ext.tipoFuente === 'transaccion_registrada' ||
          ext.tipoFuente === 'inmobiliaria_local'
            ? ext.tipoFuente
            : 'oferta_portal',
        portalFuente: ext.portalFuente || 'Portal Inmobiliario',
        enlace: ext.enlace || '',
        pantallazo: esImagen ? fileDataUrl : null,
        incluidoEnValoracion: !maxActiveReached,
        motivoExclusion: maxActiveReached
          ? 'Límite de 8 testigos activos alcanzado; excluya otro para incluir este.'
          : undefined,
        precioTotal: Number(ext.precioTotal) > 0 ? Number(ext.precioTotal) : 300000,
        superficieM2: Number(ext.superficieM2) > 0 ? Number(ext.superficieM2) : 90,
        caracteristicas: {
          habitaciones: Number(ext.habitaciones) || undefined,
          banos: Number(ext.banos) || undefined,
          planta: ext.planta || undefined,
          ascensor: typeof ext.ascensor === 'boolean' ? ext.ascensor : undefined,
          anoConstruccion: Number(ext.anoConstruccion) || undefined,
          estadoConservacion: ext.estadoConservacion || undefined,
        },
        factoresCorrectores: {
          negociacion: ext.tipoFuente === 'transaccion_registrada' ? 1.0 : 0.94,
          localizacion: 1.0,
          superficie: 1.0,
          antiguedadEstado: 1.0,
          calidadAcabados: 1.0,
          plantaOrientacion: 1.0,
          equipamientoAnexos: 1.0,
        },
        observaciones: ext.observaciones || '',
      };

      onChange({
        ...expediente,
        actualizadoEn: new Date().toISOString(),
        testigos: [...expediente.testigos, nuevo],
      });
      setSelectedId(newId);
      setOcrFeedback({
        type: 'success',
        text: `Testigo ${nuevo.codigoTrazabilidad} extraído y vinculado con su pantallazo automáticamente.`,
      });
    } catch (err: unknown) {
      setOcrFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo extraer información OCR del testigo.',
      });
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const updateTestigo = (id: string, patch: Partial<Testigo>) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      testigos: expediente.testigos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  };

  const updateFactor = (id: string, key: keyof FactoresCorrectores, val: number) => {
    const target = expediente.testigos.find((t) => t.id === id);
    if (!target) return;
    updateTestigo(id, {
      factoresCorrectores: {
        ...target.factoresCorrectores,
        [key]: val,
      },
    });
  };

  const toggleIncluido = (t: Testigo) => {
    if (!t.incluidoEnValoracion && activeCount >= 8) {
      setOcrFeedback({
        type: 'error',
        text: 'Máximo reglamentario alcanzado: solo pueden incorporarse hasta 8 testigos en la valoración final.',
      });
      return;
    }
    updateTestigo(t.id, { incluidoEnValoracion: !t.incluidoEnValoracion });
  };

  const deleteTestigo = (id: string) => {
    const next = expediente.testigos.filter((t) => t.id !== id);
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      testigos: next,
    });
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  };

  const handlePantallazoUpload = async (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateTestigo(id, {
      pantallazo: dataUrl,
      fechaCaptura: new Date().toISOString(),
    });
  };

  const selectedTestigo =
    expediente.testigos.find((t) => t.id === selectedId) ?? expediente.testigos[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Sample Compliance & OCR Import */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Muestra de Testigos de Mercado y Trazabilidad (6 habituales · máximo 8)
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>
                Testigos activos:{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {activeCount} / 8
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Media homogeneizada:{' '}
                <strong className="font-mono text-blue-900 tabular-nums">
                  {formatEURDecimal(resultado.mediaHomogeneizadaM2)}/m²
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                CV dispersión:{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {formatNumber(resultado.coeficienteVariacionPct, 2)}%
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleOcrTestigo}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => ocrInputRef.current?.click()}
              disabled={ocrLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {ocrLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanText className="h-4 w-4" />
              )}
              {ocrLoading ? 'Extrayendo testigo...' : 'Subir captura / PDF testigo (OCR)'}
            </button>

            <button
              type="button"
              onClick={handleAddManual}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Añadir testigo manual
            </button>
          </div>
        </div>

        {/* Status Feedback */}
        {ocrFeedback && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3.5 py-2.5 text-xs ${
              ocrFeedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {ocrFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{ocrFeedback.text}</span>
          </div>
        )}

        {/* Rule: < 6 requires market scarcity justification */}
        {resultado.requiereJustificacionEscasez ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Muestra inferior a 6 testigos ({activeCount} seleccionados). Solo se permiten
                menos de 6 si no existe información de mercado suficiente en la zona del activo.
              </span>
            </div>
            <label className="block text-xs font-medium text-amber-900">
              Justificación técnica obligatoria de escasez de mercado (constará en los informes):
            </label>
            <textarea
              rows={2}
              value={expediente.justificacionEscasezMercado}
              onChange={(e) =>
                onChange({
                  ...expediente,
                  actualizadoEn: new Date().toISOString(),
                  justificacionEscasezMercado: e.target.value,
                })
              }
              placeholder="Ej. Mercado rural/local con nula oferta pública comparable en el radio de búsqueda durante los últimos 6 meses..."
              className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Muestra reglamentaria conforme ({activeCount} testigos vinculados dentro del rango
              6–8 establecido para la Orden ECO/805/2003).
            </span>
          </div>
        )}
      </section>

      {/* Main Comparables Table */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          Tabla de Homogeneización y Factores Correctores
        </h3>

        {expediente.testigos.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
            No hay testigos registrados todavía. Suba una captura de portal inmobiliario con OCR o
            añada un testigo manualmente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2">Usar</th>
                  <th className="py-2 px-2">Trazabilidad</th>
                  <th className="py-2 px-2">Ubicación / Fuente</th>
                  <th className="py-2 px-2 text-right">Sup. m²</th>
                  <th className="py-2 px-2 text-right">Precio (€)</th>
                  <th className="py-2 px-2 text-right">€/m² Bruto</th>
                  <th className="py-2 px-2 text-right">Coef. Global</th>
                  <th className="py-2 px-2 text-right">€/m² Homog.</th>
                  <th className="py-2 px-2 text-center">Soporte</th>
                  <th className="py-2 pl-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expediente.testigos.map((t) => {
                  const calc = resultado.testigosUsados.find((u) => u.id === t.id);
                  const bruto = t.superficieM2 > 0 ? t.precioTotal / t.superficieM2 : 0;
                  const f = t.factoresCorrectores;
                  const global =
                    f.negociacion *
                    f.localizacion *
                    f.superficie *
                    f.antiguedadEstado *
                    f.calidadAcabados *
                    f.plantaOrientacion *
                    f.equipamientoAnexos;
                  const homog = calc ? calc.precioM2Homogeneizado : bruto * global;
                  const isSelected = selectedTestigo?.id === t.id;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td
                        className="py-2.5 pr-2"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={t.incluidoEnValoracion}
                          onChange={() => toggleIncluido(t)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-900 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-2 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {t.codigoTrazabilidad}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-900 max-w-56 truncate">
                          {t.titulo || t.direccion}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {t.direccion || t.zona} · {t.portalFuente}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {formatNumber(t.superficieM2, 1)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {formatEUR(t.precioTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                        {formatEUR(bruto)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                        × {global.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums text-blue-900">
                        {formatEUR(homog)}
                      </td>
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <span className="text-[11px] text-slate-600">
                          {t.pantallazo ? 'Captura OK' : 'Sin captura'}
                          {' · '}
                          {t.enlace ? 'Enlace OK' : 'Sin URL'}
                        </span>
                      </td>
                      <td
                        className="py-2.5 pl-2 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          className="mr-1 rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
                          title="Editar testigo y factores"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTestigo(t.id)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          title="Eliminar testigo"
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

      {/* Detailed Traceability & Corrective Factors Editor for Selected Comparable */}
      {selectedTestigo && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Ficha de Trazabilidad y Factores: {selectedTestigo.codigoTrazabilidad}
              </h3>
              <p className="text-xs text-slate-500">
                Vinculado al activo {expediente.id} ({expediente.inmueble.codigoExpediente}) ·
                Capturado: {selectedTestigo.fechaCaptura.slice(0, 16).replace('T', ' ')}
              </p>
            </div>
            {selectedTestigo.enlace && (
              <a
                href={selectedTestigo.enlace}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
              >
                Abrir anuncio original
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left: Screenshot (Pantallazo) & Source URL */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">
                    Pantallazo guardado del testigo (Trazabilidad PDF)
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline cursor-pointer">
                    <ImagePlus className="h-3.5 w-3.5" />
                    {selectedTestigo.pantallazo ? 'Cambiar captura' : 'Adjuntar captura'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePantallazoUpload(selectedTestigo.id, e)}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                  {selectedTestigo.pantallazo ? (
                    <img
                      src={selectedTestigo.pantallazo}
                      alt={`Pantallazo ${selectedTestigo.codigoTrazabilidad}`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-slate-500">
                      Sin pantallazo adjunto. Adjunte una captura del anuncio para garantizar la
                      trazabilidad en los informes de testigos y ampliado.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Enlace URL de origen (constará como vínculo en PDF)
                </label>
                <input
                  type="url"
                  placeholder="https://www.idealista.com/inmueble/..."
                  value={selectedTestigo.enlace}
                  onChange={(e) => updateTestigo(selectedTestigo.id, { enlace: e.target.value })}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Portal / Fuente
                  </label>
                  <input
                    type="text"
                    value={selectedTestigo.portalFuente}
                    onChange={(e) =>
                      updateTestigo(selectedTestigo.id, { portalFuente: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Tipo de Dato
                  </label>
                  <select
                    value={selectedTestigo.tipoFuente}
                    onChange={(e) =>
                      updateTestigo(selectedTestigo.id, {
                        tipoFuente: e.target.value as Testigo['tipoFuente'],
                      })
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="oferta_portal">Oferta en portal</option>
                    <option value="transaccion_registrada">Transacción cerrada</option>
                    <option value="inmobiliaria_local">Inmobiliaria local</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Attributes & 7 Corrective Factors */}
            <div className="lg:col-span-7 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Título del comparable
                  </label>
                  <input
                    type="text"
                    value={selectedTestigo.titulo}
                    onChange={(e) => updateTestigo(selectedTestigo.id, { titulo: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Dirección / Calle
                  </label>
                  <input
                    type="text"
                    value={selectedTestigo.direccion}
                    onChange={(e) =>
                      updateTestigo(selectedTestigo.id, { direccion: e.target.value })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Zona / Municipio
                  </label>
                  <input
                    type="text"
                    value={selectedTestigo.zona}
                    onChange={(e) => updateTestigo(selectedTestigo.id, { zona: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Precio Total (€)
                  </label>
                  <input
                    type="number"
                    value={selectedTestigo.precioTotal}
                    onChange={(e) =>
                      updateTestigo(selectedTestigo.id, { precioTotal: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Superficie Comparable (m²)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedTestigo.superficieM2}
                    onChange={(e) =>
                      updateTestigo(selectedTestigo.id, { superficieM2: Number(e.target.value) })
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="mb-3 text-xs font-semibold text-slate-900">
                  Coeficientes / Factores Correctores de Homogeneización (Orden ECO/805/2003)
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {FACTOR_LABELS.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-800">{item.label}</div>
                        <div className="text-[11px] text-slate-500">{item.hint}</div>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.5"
                        max="1.5"
                        value={selectedTestigo.factoresCorrectores[item.key]}
                        onChange={(e) =>
                          updateFactor(selectedTestigo.id, item.key, Number(e.target.value))
                        }
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono text-xs tabular-nums text-slate-900"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
