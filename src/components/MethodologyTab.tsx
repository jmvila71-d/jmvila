import React from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import type {
  ExpedienteTasacion,
  FinalidadTasacion,
  MetodoValoracion,
  ResultadoValoracion,
  SituacionBasicaLey8,
} from '../types/appraisal';
import {
  FINALIDAD_LABELS,
  METODO_LABELS,
  formatEUR,
  formatEURDecimal,
  formatNumber,
  getMetodosDisponibles,
  isTerreno,
} from '../utils/valuationEngine';

interface MethodologyTabProps {
  expediente: ExpedienteTasacion;
  resultado: ResultadoValoracion;
  onChange: (updated: ExpedienteTasacion) => void;
}

export const MethodologyTab: React.FC<MethodologyTabProps> = ({
  expediente,
  resultado,
  onChange,
}) => {
  const { inmueble, metodoPrincipal } = expediente;
  const disponibles = getMetodosDisponibles(inmueble.tipoActivo);
  const esSuelo = isTerreno(inmueble.tipoActivo);

  const updateMethod = (m: MetodoValoracion) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      metodoPrincipal: m,
    });
  };

  const addFlujoPeriodo = () => {
    const idx = expediente.paramsResidualDinamico.flujos.length + 1;
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      paramsResidualDinamico: {
        ...expediente.paramsResidualDinamico,
        flujos: [
          ...expediente.paramsResidualDinamico.flujos,
          {
            periodo: `Semestre ${idx}`,
            anioDescuento: idx * 0.5,
            cobrosVentas: 0,
            pagosUrbanizacion: 0,
            pagosConstruccion: 0,
          },
        ],
      },
    });
  };

  const removeFlujoPeriodo = (index: number) => {
    onChange({
      ...expediente,
      actualizadoEn: new Date().toISOString(),
      paramsResidualDinamico: {
        ...expediente.paramsResidualDinamico,
        flujos: expediente.paramsResidualDinamico.flujos.filter((_, i) => i !== index),
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Normative Framework: Orden ECO/805/2003 & Ley 8/2007 */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
        <div className="border-b border-slate-200 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Marco Normativo: Orden ECO/805/2003 y Ley 8/2007 de Suelo
          </h2>
          <p className="text-xs text-slate-500">
            Seleccione la finalidad legal del informe y la metodología de valoración aplicable a la
            tipología del activo.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Finalidad de la Tasación (Art. 2 Orden ECO/805/2003)
            </label>
            <select
              value={inmueble.finalidad}
              onChange={(e) =>
                onChange({
                  ...expediente,
                  actualizadoEn: new Date().toISOString(),
                  inmueble: {
                    ...inmueble,
                    finalidad: e.target.value as FinalidadTasacion,
                  },
                })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
            >
              {(Object.keys(FINALIDAD_LABELS) as FinalidadTasacion[]).map((k) => (
                <option key={k} value={k}>
                  {FINALIDAD_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Régimen Legal del Suelo (Ley 8/2007 / TRLS)
            </label>
            <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expediente.aplicarLey8_2007}
                  onChange={(e) =>
                    onChange({
                      ...expediente,
                      actualizadoEn: new Date().toISOString(),
                      aplicarLey8_2007: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-900"
                />
                Aplicar criterios Ley 8/2007 de Suelo (urbanizables / desarrollo / rurales)
              </label>
              <select
                value={inmueble.situacionBasicaLey8}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    actualizadoEn: new Date().toISOString(),
                    inmueble: {
                      ...inmueble,
                      situacionBasicaLey8: e.target.value as SituacionBasicaLey8,
                    },
                  })
                }
                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="suelo_urbanizado">
                  Art. 12.3: Suelo Urbanizado (edificado o solar consolidado)
                </option>
                <option value="suelo_urbanizable_con_ordenacion">
                  Art. 12.2 / 24: Suelo en Transformación / Urbanizable con ordenación
                </option>
                <option value="suelo_rural_sin_ordenacion">
                  Art. 12.2 / 23: Suelo Rural o Urbanizable sin ordenación pormenorizada
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Method selector */}
        <div>
          <label className="mb-2 block text-xs font-medium text-slate-700">
            Método Principal de Valoración
          </label>
          <div className="flex flex-wrap gap-2">
            {disponibles.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => updateMethod(m)}
                className={`rounded-lg border px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  metodoPrincipal === m
                    ? 'border-blue-900 bg-blue-900 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {METODO_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {resultado.advertenciasNormativas.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Verificaciones Normativas ECO/805/2003 y Ley 8/2007</span>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {resultado.advertenciasNormativas.map((adv, idx) => (
                <li key={idx}>{adv}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Method-specific Calculation Panel */}
      {metodoPrincipal === 'comparacion' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            Resumen de Cálculo por Método de Comparación (Arts. 21–24 ECO/805/2003)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Testigos usados</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                {resultado.cantidadTestigosUsados} / 6–8
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Valor unitario homog.</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                {formatEURDecimal(resultado.mediaHomogeneizadaM2)}/m²
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Dispersión muestra (CV)</div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-900">
                {formatNumber(resultado.coeficienteVariacionPct, 2)}%
              </div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs text-blue-800">Valor Total (Principal + Anexos)</div>
              <div className="mt-1 font-mono text-xl font-bold tabular-nums text-blue-900">
                {formatEUR(resultado.valorTotalTasacionEuros)}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Superficie principal considerada:{' '}
            <span className="font-mono font-medium tabular-nums">
              {formatNumber(
                esSuelo ? inmueble.superficieParcelaM2 : inmueble.superficieConstruidaM2,
                2
              )}{' '}
              m²
            </span>{' '}
            · Valor elemento principal:{' '}
            <span className="font-mono font-medium tabular-nums">
              {formatEUR(resultado.valorPrincipalEuros)}
            </span>{' '}
            · Valor piezas anexas:{' '}
            <span className="font-mono font-medium tabular-nums">
              {formatEUR(resultado.valorAnexosEuros)}
            </span>
          </p>
        </section>
      )}

      {metodoPrincipal === 'reposicion' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <h3 className="text-base font-semibold text-slate-900">
            Método de Coste / Reposición Bruto y Neto (Arts. 28–31 ECO/805/2003)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Valor del Suelo F (€)
              </label>
              <input
                type="number"
                value={expediente.paramsReposicion.valorSueloEuros}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsReposicion: {
                      ...expediente.paramsReposicion,
                      valorSueloEuros: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Coste Construcción (€/m²)
              </label>
              <input
                type="number"
                value={expediente.paramsReposicion.costeConstruccionM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsReposicion: {
                      ...expediente.paramsReposicion,
                      costeConstruccionM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Gastos Necesarios (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={expediente.paramsReposicion.gastosNecesariosPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsReposicion: {
                      ...expediente.paramsReposicion,
                      gastosNecesariosPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Vida Útil Total (años)
              </label>
              <input
                type="number"
                value={expediente.paramsReposicion.vidaUtilAnos}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsReposicion: {
                      ...expediente.paramsReposicion,
                      vidaUtilAnos: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Obsolescencia Funcional (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={expediente.paramsReposicion.depreciacionFuncionalPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsReposicion: {
                      ...expediente.paramsReposicion,
                      depreciacionFuncionalPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2 text-slate-600">Valor del suelo (F)</td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {formatEUR(resultado.reposicion.valorSuelo)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">
                    Coste de ejecución por contrata ({formatNumber(inmueble.superficieConstruidaM2, 1)} m²)
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {formatEUR(resultado.reposicion.costeConstruccion)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">
                    Gastos necesarios ({expediente.paramsReposicion.gastosNecesariosPct}%)
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {formatEUR(resultado.reposicion.gastosNecesarios)}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-medium">
                  <td className="py-2 px-2 text-slate-900">Valor de Reposición Bruto (VRB)</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-900">
                    {formatEUR(resultado.reposicion.valorReposicionBruto)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">
                    Depreciación física ({resultado.reposicion.antiguedadAnos} años /{' '}
                    {expediente.paramsReposicion.vidaUtilAnos} años)
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-red-700">
                    - {formatEUR(resultado.reposicion.depreciacionFisicaEuros)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-600">Depreciación funcional</td>
                  <td className="py-2 text-right font-mono tabular-nums text-red-700">
                    - {formatEUR(resultado.reposicion.depreciacionFuncionalEuros)}
                  </td>
                </tr>
                <tr className="bg-blue-50 font-semibold">
                  <td className="py-2.5 px-2 text-blue-900">
                    Valor de Reposición Neto (VRN) + Anexos
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-blue-900">
                    {formatEUR(resultado.valorTotalTasacionEuros)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {metodoPrincipal === 'residual_estatico' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <h3 className="text-base font-semibold text-slate-900">
            Método Residual Estático (Art. 42 Orden ECO/805/2003 · Ley 8/2007)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Superficie Parcela (m²)
              </label>
              <input
                type="number"
                value={expediente.paramsResidualEstatico.superficieParcelaM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      superficieParcelaM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Edificabilidad (m²t / m²s)
              </label>
              <input
                type="number"
                step="0.05"
                value={expediente.paramsResidualEstatico.edificabilidadM2M2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      edificabilidadM2M2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Valor Venta Producto Terminado (€/m²)
              </label>
              <input
                type="number"
                value={expediente.paramsResidualEstatico.valorVentaProductoTerminadoM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      valorVentaProductoTerminadoM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Coste Construcción (€/m²t)
              </label>
              <input
                type="number"
                value={expediente.paramsResidualEstatico.costeConstruccionM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      costeConstruccionM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Costes Urbanización Pendientes (€)
              </label>
              <input
                type="number"
                value={expediente.paramsResidualEstatico.costesUrbanizacionPendientes}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      costesUrbanizacionPendientes: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Gastos Promoción / Técnicos (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={expediente.paramsResidualEstatico.gastosPromocionPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      gastosPromocionPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Margen Beneficio Promotor b (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={expediente.paramsResidualEstatico.margenBeneficioPromotorPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      margenBeneficioPromotorPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Cesión Aprovechamiento Ley 8/2007 (%)
              </label>
              <input
                type="number"
                step="1"
                value={expediente.paramsResidualEstatico.cesionAprovechamientoPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualEstatico: {
                      ...expediente.paramsResidualEstatico,
                      cesionAprovechamientoPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-slate-200 pt-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Techo patrimonializable</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatNumber(resultado.residualEstatico.techoPatrimonializableM2, 2)} m²t
              </div>
              <div className="text-[11px] text-slate-500">
                Bruto: {formatNumber(resultado.residualEstatico.techoEdificableTotalM2, 2)} m²t
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Valor repercusión s/ techo</div>
              <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatEURDecimal(resultado.residualEstatico.valorRepercusionM2Techo)}/m²t
              </div>
              <div className="text-[11px] text-slate-500">
                Suelo: {formatEURDecimal(resultado.residualEstatico.valorUnitarioSueloM2)}/m²s
              </div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3.5">
              <div className="text-xs text-blue-800">Valor Residual del Suelo (Vs)</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-blue-900">
                {formatEUR(resultado.residualEstatico.valorResidualSueloEuros)}
              </div>
            </div>
          </div>
        </section>
      )}

      {metodoPrincipal === 'residual_dinamico' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Método Residual Dinámico (Arts. 36–41 ECO/805/2003 · Ley 8/2007)
              </h3>
              <p className="text-xs text-slate-500">
                Descuento de flujos de caja de la promoción a tasa i = i₀ + prima de riesgo (
                {formatNumber(resultado.residualDinamico.tasaDescuentoPct, 2)}%).
              </p>
            </div>
            <button
              type="button"
              onClick={addFlujoPeriodo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir periodo
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Sup. Parcela (m²)
              </label>
              <input
                type="number"
                value={expediente.paramsResidualDinamico.superficieParcelaM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualDinamico: {
                      ...expediente.paramsResidualDinamico,
                      superficieParcelaM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Edificabilidad (m²/m²)
              </label>
              <input
                type="number"
                step="0.05"
                value={expediente.paramsResidualDinamico.edificabilidadM2M2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualDinamico: {
                      ...expediente.paramsResidualDinamico,
                      edificabilidadM2M2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Tipo libre riesgo i₀ (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={expediente.paramsResidualDinamico.tasaLibreRiesgoPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualDinamico: {
                      ...expediente.paramsResidualDinamico,
                      tasaLibreRiesgoPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Prima de riesgo p (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={expediente.paramsResidualDinamico.primaRiesgoPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualDinamico: {
                      ...expediente.paramsResidualDinamico,
                      primaRiesgoPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Cesión Ley 8/2007 (%)
              </label>
              <input
                type="number"
                step="1"
                value={expediente.paramsResidualDinamico.cesionAprovechamientoPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsResidualDinamico: {
                      ...expediente.paramsResidualDinamico,
                      cesionAprovechamientoPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2">Periodo</th>
                  <th className="py-2 px-2 text-right">t (años)</th>
                  <th className="py-2 px-2 text-right">Cobros Ventas (€)</th>
                  <th className="py-2 px-2 text-right">Pagos Urb. (€)</th>
                  <th className="py-2 px-2 text-right">Pagos Const. (€)</th>
                  <th className="py-2 px-2 text-right">VAN Periodo (€)</th>
                  <th className="py-2 pl-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expediente.paramsResidualDinamico.flujos.map((fl, idx) => {
                  const calc = resultado.residualDinamico.flujosDescontados[idx];
                  return (
                    <tr key={idx}>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={fl.periodo}
                          onChange={(e) => {
                            const next = [...expediente.paramsResidualDinamico.flujos];
                            next[idx] = { ...fl, periodo: e.target.value };
                            onChange({
                              ...expediente,
                              paramsResidualDinamico: {
                                ...expediente.paramsResidualDinamico,
                                flujos: next,
                              },
                            });
                          }}
                          className="w-full min-w-36 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          step="0.25"
                          value={fl.anioDescuento}
                          onChange={(e) => {
                            const next = [...expediente.paramsResidualDinamico.flujos];
                            next[idx] = { ...fl, anioDescuento: Number(e.target.value) };
                            onChange({
                              ...expediente,
                              paramsResidualDinamico: {
                                ...expediente.paramsResidualDinamico,
                                flujos: next,
                              },
                            });
                          }}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          value={fl.cobrosVentas}
                          onChange={(e) => {
                            const next = [...expediente.paramsResidualDinamico.flujos];
                            next[idx] = { ...fl, cobrosVentas: Number(e.target.value) };
                            onChange({
                              ...expediente,
                              paramsResidualDinamico: {
                                ...expediente.paramsResidualDinamico,
                                flujos: next,
                              },
                            });
                          }}
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          value={fl.pagosUrbanizacion}
                          onChange={(e) => {
                            const next = [...expediente.paramsResidualDinamico.flujos];
                            next[idx] = { ...fl, pagosUrbanizacion: Number(e.target.value) };
                            onChange({
                              ...expediente,
                              paramsResidualDinamico: {
                                ...expediente.paramsResidualDinamico,
                                flujos: next,
                              },
                            });
                          }}
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input
                          type="number"
                          value={fl.pagosConstruccion}
                          onChange={(e) => {
                            const next = [...expediente.paramsResidualDinamico.flujos];
                            next[idx] = { ...fl, pagosConstruccion: Number(e.target.value) };
                            onChange({
                              ...expediente,
                              paramsResidualDinamico: {
                                ...expediente.paramsResidualDinamico,
                                flujos: next,
                              },
                            });
                          }}
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-mono tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatEUR(calc ? calc.valorActualNeto : 0)}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeFlujoPeriodo(idx)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 bg-blue-50 font-semibold text-blue-900">
                  <td colSpan={5} className="py-2.5 px-2">
                    Valor Residual Dinámico del Suelo (VAN · Repercusión:{' '}
                    {formatEURDecimal(resultado.residualDinamico.valorRepercusionM2Techo)}/m²t)
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-sm tabular-nums">
                    {formatEUR(resultado.residualDinamico.valorResidualSueloEuros)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {metodoPrincipal === 'capitalizacion_rustico' && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <h3 className="text-base font-semibold text-slate-900">
            Capitalización de Rentas en Suelo Rústico / Rural (Art. 32 ECO/805/2003 & Art. 23 Ley
            8/2007)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Superficie Finca (m²)
              </label>
              <input
                type="number"
                value={expediente.paramsCapitalizacionRustico.superficieParcelaM2}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      superficieParcelaM2: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Cultivo / Aprovechamiento real o potencial
              </label>
              <input
                type="text"
                value={expediente.paramsCapitalizacionRustico.tipoCultivoAprovechamiento}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      tipoCultivoAprovechamiento: e.target.value,
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Renta Anual Neta (€ / Ha · año)
              </label>
              <input
                type="number"
                value={expediente.paramsCapitalizacionRustico.rentaAnualNetaPorHa}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      rentaAnualNetaPorHa: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Tipo de Capitalización r (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={expediente.paramsCapitalizacionRustico.tipoCapitalizacionPct}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      tipoCapitalizacionPct: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Factor Localización Ley 8/2007 Art. 23 (1.00–2.00)
              </label>
              <input
                type="number"
                step="0.05"
                min="1"
                max="2"
                value={expediente.paramsCapitalizacionRustico.factorLocalizacionFL}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      factorLocalizacionFL: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Indemnización facultad participar (Art. 25 Ley 8/2007)
              </label>
              <input
                type="number"
                value={expediente.paramsCapitalizacionRustico.indemnizacionFacultadParticipar}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      indemnizacionFacultadParticipar: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Mejoras / Construcciones agrarias (€)
              </label>
              <input
                type="number"
                value={expediente.paramsCapitalizacionRustico.valorMejorasConstruccionesAgrarias}
                onChange={(e) =>
                  onChange({
                    ...expediente,
                    paramsCapitalizacionRustico: {
                      ...expediente.paramsCapitalizacionRustico,
                      valorMejorasConstruccionesAgrarias: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-slate-200 pt-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Superficie y Renta Anual</div>
              <div className="mt-1 font-mono text-base font-semibold tabular-nums">
                {formatNumber(resultado.capitalizacionRustico.superficieHa, 4)} Ha ·{' '}
                {formatEURDecimal(resultado.capitalizacionRustico.rentaAnualTotal)}/año
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500">Capitalización base × FL</div>
              <div className="mt-1 font-mono text-base font-semibold tabular-nums">
                {formatEUR(resultado.capitalizacionRustico.valorConFactorLocalizacion)}
              </div>
            </div>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3.5">
              <div className="text-xs text-blue-800">Valor Total Suelo Rural / Rústico</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-blue-900">
                {formatEUR(resultado.capitalizacionRustico.valorTotalSueloRural)}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
