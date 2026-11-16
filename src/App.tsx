import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Calculator,
  FileDown,
  FolderPlus,
  Layers,
  Menu,
  Scale,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { ExpedienteTasacion, TipoActivo } from './types/appraisal';
import { createBlankExpediente, createSeedAppraisals } from './data/seedAppraisal';
import {
  METODO_LABELS,
  TIPO_ACTIVO_LABELS,
  calcularValoracion,
  formatEUR,
} from './utils/valuationEngine';
import { AssetAndPhotosTab } from './components/AssetAndPhotosTab';
import { MethodologyTab } from './components/MethodologyTab';
import { ComparablesTab } from './components/ComparablesTab';
import { ReportsTab } from './components/ReportsTab';

type WorkspaceTab = 'activo' | 'metodo' | 'testigos' | 'informes';

export default function App() {
  const [expedientes, setExpedientes] = useState<ExpedienteTasacion[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('activo');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNewMenu, setShowNewMenu] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const saveTimerRef = useRef<number | null>(null);

  // Load saved appraisals from backend or initialize with seed dossiers
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp = await fetch('/api/appraisals');
        const json = await resp.json();
        let list: ExpedienteTasacion[] = Array.isArray(json.appraisals)
          ? json.appraisals
          : [];

        if (list.length === 0) {
          list = createSeedAppraisals();
          for (const item of [...list].reverse()) {
            await fetch('/api/appraisals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item),
            });
          }
        }

        if (!cancelled) {
          setExpedientes(list);
          setActiveId(list[0]?.id ?? '');
        }
      } catch {
        const fallback = createSeedAppraisals();
        if (!cancelled) {
          setExpedientes(fallback);
          setActiveId(fallback[0]?.id ?? '');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeExpediente = useMemo(
    () => expedientes.find((e) => e.id === activeId) ?? expedientes[0] ?? null,
    [expedientes, activeId]
  );

  const resultadoActivo = useMemo(
    () => (activeExpediente ? calcularValoracion(activeExpediente) : null),
    [activeExpediente]
  );

  const persistExpediente = (updated: ExpedienteTasacion) => {
    setSavingState('saving');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await fetch('/api/appraisals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
        setSavingState('saved');
        window.setTimeout(() => setSavingState('idle'), 1500);
      } catch {
        setSavingState('idle');
      }
    }, 450);
  };

  const handleUpdateActive = (updated: ExpedienteTasacion) => {
    setExpedientes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    persistExpediente(updated);
  };

  const handleCreateNew = async (tipo: TipoActivo) => {
    const nuevo = createBlankExpediente(tipo);
    setExpedientes((prev) => [nuevo, ...prev]);
    setActiveId(nuevo.id);
    setActiveTab('activo');
    setShowNewMenu(false);
    setMobileSidebarOpen(false);
    try {
      await fetch('/api/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
      });
    } catch {
      // handled in-memory
    }
  };

  const handleDeleteExpediente = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = expedientes.filter((item) => item.id !== id);
    setExpedientes(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id ?? '');
    }
    try {
      await fetch(`/api/appraisals/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
  };

  const filteredExpedientes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return expedientes;
    return expedientes.filter(
      (exp) =>
        exp.inmueble.tituloExpediente.toLowerCase().includes(q) ||
        exp.inmueble.codigoExpediente.toLowerCase().includes(q) ||
        exp.inmueble.direccion.toLowerCase().includes(q) ||
        exp.inmueble.municipio.toLowerCase().includes(q)
    );
  }, [expedientes, searchQuery]);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          ValoraECO
        </span>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(false)}
          className="rounded p-1 text-slate-400 hover:text-white lg:hidden cursor-pointer"
          aria-label="Cerrar menú"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 border-b border-slate-800">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNewMenu((s) => !s)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 whitespace-nowrap cursor-pointer"
          >
            <FolderPlus className="h-4 w-4 shrink-0" />
            Nueva Tasación
          </button>

          {showNewMenu && (
            <div className="absolute left-0 right-0 top-12 z-30 rounded-lg border border-slate-700 bg-slate-800 p-1.5 shadow-lg">
              <div className="px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                Seleccione tipología de activo
              </div>
              {(Object.keys(TIPO_ACTIVO_LABELS) as TipoActivo[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => handleCreateNew(tipo)}
                  className="block w-full rounded px-2.5 py-2 text-left text-xs text-slate-100 hover:bg-slate-700 cursor-pointer"
                >
                  {TIPO_ACTIVO_LABELS[tipo]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar expediente o calle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
          Expedientes ({filteredExpedientes.length})
        </div>

        {filteredExpedientes.map((exp) => {
          const calc = calcularValoracion(exp);
          const isSelected = exp.id === activeExpediente?.id;
          return (
            <div
              key={exp.id}
              onClick={() => {
                setActiveId(exp.id);
                setMobileSidebarOpen(false);
              }}
              className={`group flex cursor-pointer items-start justify-between gap-2 rounded-md border px-3 py-2.5 transition-colors ${
                isSelected
                  ? 'border-blue-600 bg-slate-800 text-white'
                  : 'border-transparent text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">
                  {exp.inmueble.tituloExpediente || exp.inmueble.codigoExpediente}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-slate-400">
                  {exp.inmueble.codigoExpediente} · {exp.inmueble.municipio || 'Sin municipio'}
                </div>
                <div className="mt-1 font-mono text-xs font-medium tabular-nums text-blue-300">
                  {formatEUR(calc.valorTotalTasacionEuros)}
                </div>
              </div>
              <button
                type="button"
                onClick={(ev) => handleDeleteExpediente(exp.id, ev)}
                title="Eliminar expediente"
                className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-opacity cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-400">
        Orden ECO/805/2003 · Ley 8/2007 de Suelo
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-[272px] shrink-0 border-r border-slate-200 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-full">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: 3 clean zones */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-3.5">
          {/* Zone 1: Breadcrumb */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
              aria-label="Abrir expedientes"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 truncate text-sm text-slate-500">
              <span>Expedientes</span>
              {activeExpediente && (
                <>
                  <span className="mx-2 text-slate-300">/</span>
                  <span className="font-mono text-xs text-slate-600">
                    {activeExpediente.inmueble.codigoExpediente}
                  </span>
                  <span className="mx-2 text-slate-300">/</span>
                  <span className="font-semibold text-slate-900">
                    {activeExpediente.inmueble.tituloExpediente}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Zone 2: Valuation Summary Readout */}
          {resultadoActivo && (
            <div className="hidden xl:flex items-center gap-4 text-xs text-slate-600 whitespace-nowrap shrink-0">
              <span>
                {METODO_LABELS[resultadoActivo.metodoAplicado].split(' (')[0]}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-sm tabular-nums text-blue-900">
                {formatEUR(resultadoActivo.valorTotalTasacionEuros)}
              </span>
              {savingState === 'saving' && (
                <span className="text-[11px] text-slate-400">Guardando...</span>
              )}
              {savingState === 'saved' && (
                <span className="text-[11px] text-emerald-700">Guardado</span>
              )}
            </div>
          )}

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('informes')}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileDown className="h-4 w-4" />
              Informes PDF
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" />
              <div className="h-64 w-full animate-pulse rounded-lg bg-slate-200" />
            </div>
          ) : !activeExpediente || !resultadoActivo ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
              <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900">
                No hay expedientes seleccionados
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Cree un nuevo expediente de tasación para comenzar a valorar un inmueble o
                terreno.
              </p>
              <button
                type="button"
                onClick={() => handleCreateNew('vivienda')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-900 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 cursor-pointer"
              >
                <FolderPlus className="h-4 w-4" />
                Crear primera tasación
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Compact Summary Strip */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Valor Total Tasación</div>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-900">
                    {formatEUR(resultadoActivo.valorTotalTasacionEuros)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Anexos: {formatEUR(resultadoActivo.valorAnexosEuros)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Valor Unitario</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {formatEUR(resultadoActivo.valorUnitarioM2)}/m²
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                    {TIPO_ACTIVO_LABELS[activeExpediente.inmueble.tipoActivo]}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Testigos Activos (6–8)</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {resultadoActivo.cantidadTestigosUsados} / 8
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {resultadoActivo.requiereJustificacionEscasez
                      ? resultadoActivo.justificacionValida
                        ? 'Escasez justificada'
                        : 'Requiere justificación'
                      : 'Muestra conforme ECO'}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">Soporte Documental</div>
                  <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                    {activeExpediente.fotos.length} fotos
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {activeExpediente.piezasAnexas.length} piezas anexas
                  </div>
                </div>
              </div>

              {/* Workspace Navigation Tabs */}
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('activo')}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'activo'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  1. Activo, Anexos y Fotos (OCR)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('metodo')}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'metodo'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calculator className="h-3.5 w-3.5" />
                  2. Normativa y Método
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('testigos')}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'testigos'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Scale className="h-3.5 w-3.5" />
                  3. Testigos y Trazabilidad ({resultadoActivo.cantidadTestigosUsados})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('informes')}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'informes'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  4. Informes PDF
                </button>
              </div>

              {/* Active Tab Panel */}
              {activeTab === 'activo' && (
                <AssetAndPhotosTab
                  expediente={activeExpediente}
                  resultado={resultadoActivo}
                  onChange={handleUpdateActive}
                />
              )}

              {activeTab === 'metodo' && (
                <MethodologyTab
                  expediente={activeExpediente}
                  resultado={resultadoActivo}
                  onChange={handleUpdateActive}
                />
              )}

              {activeTab === 'testigos' && (
                <ComparablesTab
                  expediente={activeExpediente}
                  resultado={resultadoActivo}
                  onChange={handleUpdateActive}
                />
              )}

              {activeTab === 'informes' && (
                <ReportsTab
                  expediente={activeExpediente}
                  resultado={resultadoActivo}
                  onChange={handleUpdateActive}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
