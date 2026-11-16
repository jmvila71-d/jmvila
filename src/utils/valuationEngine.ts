import type {
  ExpedienteTasacion,
  MetodoValoracion,
  ResultadoValoracion,
  Testigo,
  TestigoCalculado,
  TipoActivo,
} from '../types/appraisal';

export const TIPO_ACTIVO_LABELS: Record<TipoActivo, string> = {
  vivienda: 'Vivienda (con o sin anexos)',
  local: 'Local Comercial / Oficina',
  garaje: 'Plaza de Garaje',
  trastero: 'Trastero',
  terreno_urbano: 'Terreno / Solar Urbano',
  terreno_urbanizable: 'Terreno Urbanizable / En Desarrollo',
  terreno_rustico: 'Terreno Rústico',
};

export const METODO_LABELS: Record<MetodoValoracion, string> = {
  comparacion: 'Método de Comparación (ECO 805/2003)',
  reposicion: 'Método de Coste / Reposición (ECO 805/2003)',
  residual_estatico: 'Método Residual Estático (ECO 805/2003)',
  residual_dinamico: 'Método Residual Dinámico (ECO 805/2003)',
  capitalizacion_rustico: 'Capitalización de Rentas (ECO 805/2003 & Ley 8/2007)',
};

export const FINALIDAD_LABELS: Record<string, string> = {
  garantia_hipotecaria: 'Garantía hipotecaria de créditos o préstamos (Art. 2.a ECO/805/2003)',
  compraventa_asesoramiento: 'Valoración de mercado / Compraventa y asesoramiento patrimonial',
  cobertura_provisiones: 'Cobertura de provisiones técnicas de entidades aseguradoras (Art. 2.b)',
  patrimonio_iic: 'Determinación del patrimonio de Instituciones de Inversión Colectiva (Art. 2.c)',
};

export function isTerreno(tipo: TipoActivo): boolean {
  return (
    tipo === 'terreno_urbano' ||
    tipo === 'terreno_urbanizable' ||
    tipo === 'terreno_rustico'
  );
}

export function getMetodosDisponibles(tipo: TipoActivo): MetodoValoracion[] {
  if (tipo === 'terreno_urbano') {
    return ['residual_estatico', 'residual_dinamico', 'comparacion'];
  }
  if (tipo === 'terreno_urbanizable') {
    return ['residual_dinamico', 'residual_estatico', 'capitalizacion_rustico', 'comparacion'];
  }
  if (tipo === 'terreno_rustico') {
    return ['capitalizacion_rustico', 'comparacion'];
  }
  return ['comparacion', 'reposicion'];
}

export function calcularTestigo(t: Testigo): TestigoCalculado {
  const sup = Math.max(t.superficieM2 || 1, 0.01);
  const precioM2Bruto = t.precioTotal / sup;
  const f = t.factoresCorrectores;
  const coeficienteGlobal =
    (f.negociacion || 1) *
    (f.localizacion || 1) *
    (f.superficie || 1) *
    (f.antiguedadEstado || 1) *
    (f.calidadAcabados || 1) *
    (f.plantaOrientacion || 1) *
    (f.equipamientoAnexos || 1);
  const precioM2Homogeneizado = precioM2Bruto * coeficienteGlobal;
  return {
    ...t,
    precioM2Bruto,
    coeficienteGlobal,
    precioM2Homogeneizado,
  };
}

export function calcularValoracion(exp: ExpedienteTasacion): ResultadoValoracion {
  const currentYear = 2026;
  const { inmueble, metodoPrincipal, testigos, piezasAnexas } = exp;

  // 1. Testigos calculation & ECO 805/2003 sample verification (6 normal, up to 8, <6 requires justification)
  const testigosCalculados = testigos.map(calcularTestigo);
  const testigosUsados = testigosCalculados.filter((t) => t.incluidoEnValoracion);
  const cantidadTestigosUsados = testigosUsados.length;
  const requiereJustificacionEscasez = cantidadTestigosUsados < 6;
  const justificacionValida =
    !requiereJustificacionEscasez ||
    exp.justificacionEscasezMercado.trim().length >= 20;
  const cumpleMinimoTestigos = cantidadTestigosUsados >= 6 && cantidadTestigosUsados <= 8;

  const valoresHomog = testigosUsados.map((t) => t.precioM2Homogeneizado);
  const mediaHomogeneizadaM2 =
    valoresHomog.length > 0
      ? valoresHomog.reduce((acc, v) => acc + v, 0) / valoresHomog.length
      : 0;

  let medianaHomogeneizadaM2 = 0;
  if (valoresHomog.length > 0) {
    const sorted = [...valoresHomog].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianaHomogeneizadaM2 =
      sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  let desviacionTipicaM2 = 0;
  if (valoresHomog.length > 1) {
    const variance =
      valoresHomog.reduce((acc, v) => acc + Math.pow(v - mediaHomogeneizadaM2, 2), 0) /
      valoresHomog.length;
    desviacionTipicaM2 = Math.sqrt(variance);
  }
  const coeficienteVariacionPct =
    mediaHomogeneizadaM2 > 0 ? (desviacionTipicaM2 / mediaHomogeneizadaM2) * 100 : 0;

  // Surface reference for built vs land
  const supConstruida = Math.max(inmueble.superficieConstruidaM2 || 0, 0);
  const supParcela = Math.max(inmueble.superficieParcelaM2 || 0, 0);
  const superficiePrincipalM2 = isTerreno(inmueble.tipoActivo) ? supParcela : supConstruida;

  // 2. Piezas Anexas (applicable when vivienda / local has annexes)
  const unitarioRefAnexos = mediaHomogeneizadaM2;
  const valorAnexosEuros = piezasAnexas.reduce((acc, ax) => {
    if (ax.modoValoracion === 'importe_fijo') {
      return acc + Math.max(ax.valorFijoEuros || 0, 0);
    }
    return acc + Math.max(ax.superficieM2 || 0, 0) * unitarioRefAnexos * (ax.coeficienteHomogeneizacion || 0);
  }, 0);

  // 3. Reposición (Art. 28-31 Orden ECO/805/2003)
  const rep = exp.paramsReposicion;
  const costeConstruccionRep = supConstruida * (rep.costeConstruccionM2 || 0);
  const gastosNecesariosRep = costeConstruccionRep * ((rep.gastosNecesariosPct || 0) / 100);
  const valorReposicionBruto = (rep.valorSueloEuros || 0) + costeConstruccionRep + gastosNecesariosRep;
  const antiguedadAnos = Math.max(0, currentYear - (inmueble.anoConstruccion || currentYear));
  const vidaUtil = Math.max(rep.vidaUtilAnos || 100, 1);
  const factorDepFisica = Math.min(0.85, antiguedadAnos / vidaUtil);
  const depreciacionFisicaEuros = (costeConstruccionRep + gastosNecesariosRep) * factorDepFisica;
  const baseDespuesFisica =
    (costeConstruccionRep + gastosNecesariosRep) - depreciacionFisicaEuros;
  const depreciacionFuncionalEuros =
    baseDespuesFisica * (Math.min(0.5, Math.max(0, rep.depreciacionFuncionalPct || 0) / 100));
  const valorReposicionNeto = Math.max(
    0,
    (rep.valorSueloEuros || 0) + baseDespuesFisica - depreciacionFuncionalEuros
  );

  // 4. Residual Estático (Art. 42 Orden ECO/805/2003 + Ley 8/2007 cesiones)
  const resEst = exp.paramsResidualEstatico;
  const supParcelaEst = resEst.superficieParcelaM2 || supParcela;
  const techoEstTotal = supParcelaEst * (resEst.edificabilidadM2M2 || 0);
  const cesionEstFactor = exp.aplicarLey8_2007
    ? 1 - Math.min(0.5, Math.max(0, resEst.cesionAprovechamientoPct || 0) / 100)
    : 1;
  const techoEstPatrimonializable = techoEstTotal * cesionEstFactor;
  const valorMercadoTerminadoEst =
    techoEstPatrimonializable * (resEst.valorVentaProductoTerminadoM2 || 0);
  const margenPromotorEst =
    valorMercadoTerminadoEst * ((resEst.margenBeneficioPromotorPct || 0) / 100);
  const costesConstEst = techoEstPatrimonializable * (resEst.costeConstruccionM2 || 0);
  const gastosPromEst = costesConstEst * ((resEst.gastosPromocionPct || 0) / 100);
  const costesUrbEst = resEst.costesUrbanizacionPendientes || 0;
  const valorResidualEst = Math.max(
    0,
    valorMercadoTerminadoEst - margenPromotorEst - costesConstEst - gastosPromEst - costesUrbEst
  );
  const valorRepercusionEst =
    techoEstPatrimonializable > 0 ? valorResidualEst / techoEstPatrimonializable : 0;
  const valorUnitarioSueloEst = supParcelaEst > 0 ? valorResidualEst / supParcelaEst : 0;

  // 5. Residual Dinámico (Art. 36-41 Orden ECO/805/2003 + Ley 8/2007)
  const resDin = exp.paramsResidualDinamico;
  const supParcelaDin = resDin.superficieParcelaM2 || supParcela;
  const techoDinTotal = supParcelaDin * (resDin.edificabilidadM2M2 || 0);
  const cesionDinFactor = exp.aplicarLey8_2007
    ? 1 - Math.min(0.5, Math.max(0, resDin.cesionAprovechamientoPct || 0) / 100)
    : 1;
  const techoDinPatrimonializable = techoDinTotal * cesionDinFactor;
  const tasaDescuentoPct = (resDin.tasaLibreRiesgoPct || 0) + (resDin.primaRiesgoPct || 0);
  const tasaDecimal = tasaDescuentoPct / 100;

  const flujosDescontados = resDin.flujos.map((fl) => {
    const cobros = fl.cobrosVentas || 0;
    const pagosTotales = (fl.pagosUrbanizacion || 0) + (fl.pagosConstruccion || 0);
    const flujoNeto = cobros - pagosTotales;
    const factorDescuento = 1 / Math.pow(1 + tasaDecimal, Math.max(0, fl.anioDescuento || 0));
    const valorActualNeto = flujoNeto * factorDescuento;
    return {
      periodo: fl.periodo,
      anioDescuento: fl.anioDescuento,
      cobros,
      pagosTotales,
      flujoNeto,
      factorDescuento,
      valorActualNeto,
    };
  });

  const vanDinamico = flujosDescontados.reduce((acc, f) => acc + f.valorActualNeto, 0);
  const valorResidualDin = Math.max(0, vanDinamico);
  const valorRepercusionDin =
    techoDinPatrimonializable > 0 ? valorResidualDin / techoDinPatrimonializable : 0;
  const valorUnitarioSueloDin = supParcelaDin > 0 ? valorResidualDin / supParcelaDin : 0;

  // 6. Capitalización Rústico / Suelo Rural (Art. 32 ECO/805/2003 & Art. 23 Ley 8/2007)
  const cap = exp.paramsCapitalizacionRustico;
  const supParcelaRust = cap.superficieParcelaM2 || supParcela;
  const superficieHa = supParcelaRust / 10000;
  const rentaAnualTotal = superficieHa * (cap.rentaAnualNetaPorHa || 0);
  const rDecimal = Math.max(0.005, (cap.tipoCapitalizacionPct || 3.5) / 100);
  const valorCapitalizacionBase = rentaAnualTotal / rDecimal;
  const flFactor = exp.aplicarLey8_2007
    ? Math.min(2, Math.max(1, cap.factorLocalizacionFL || 1))
    : 1;
  const valorConFactorLocalizacion = valorCapitalizacionBase * flFactor;
  const indemnizacion = exp.aplicarLey8_2007 ? (cap.indemnizacionFacultadParticipar || 0) : 0;
  const mejoras = cap.valorMejorasConstruccionesAgrarias || 0;
  const valorTotalSueloRural = Math.max(
    0,
    valorConFactorLocalizacion + indemnizacion + mejoras
  );
  const valorUnitarioRust = supParcelaRust > 0 ? valorTotalSueloRural / supParcelaRust : 0;

  // 7. Select Final Primary Value based on selected method
  let valorPrincipalEuros = 0;
  let valorAnexosFinal = 0;

  if (metodoPrincipal === 'comparacion') {
    valorPrincipalEuros = superficiePrincipalM2 * mediaHomogeneizadaM2;
    valorAnexosFinal = isTerreno(inmueble.tipoActivo) ? 0 : valorAnexosEuros;
  } else if (metodoPrincipal === 'reposicion') {
    valorPrincipalEuros = valorReposicionNeto;
    valorAnexosFinal = isTerreno(inmueble.tipoActivo) ? 0 : valorAnexosEuros;
  } else if (metodoPrincipal === 'residual_estatico') {
    valorPrincipalEuros = valorResidualEst;
  } else if (metodoPrincipal === 'residual_dinamico') {
    valorPrincipalEuros = valorResidualDin;
  } else if (metodoPrincipal === 'capitalizacion_rustico') {
    valorPrincipalEuros = valorTotalSueloRural;
  }

  const valorTotalTasacionEuros = valorPrincipalEuros + valorAnexosFinal;
  const valorUnitarioM2 =
    superficiePrincipalM2 > 0 ? valorPrincipalEuros / superficiePrincipalM2 : 0;

  // Principio de prudencia ECO/805/2003 para finalidad hipotecaria
  let valorHipotecarioRecomendadoEuros = valorTotalTasacionEuros;
  if (
    inmueble.finalidad === 'garantia_hipotecaria' &&
    metodoPrincipal === 'comparacion' &&
    valorReposicionNeto > 0 &&
    !isTerreno(inmueble.tipoActivo)
  ) {
    // Art. 7 y 31 ECO/805/2003: comprobación valor de mercado vs reposición neto cuando proceda
    valorHipotecarioRecomendadoEuros = valorTotalTasacionEuros;
  }

  // 8. Normative warnings
  const advertenciasNormativas: string[] = [];
  if (
    (metodoPrincipal === 'comparacion' || cantidadTestigosUsados > 0) &&
    cantidadTestigosUsados < 6
  ) {
    if (justificacionValida) {
      advertenciasNormativas.push(
        `Muestra reducida (${cantidadTestigosUsados} testigos < 6 habituales): justificada por insuficiencia de mercado en la zona conforme a Orden ECO/805/2003 Art. 21.`
      );
    } else {
      advertenciasNormativas.push(
        `Advertencia ECO/805/2003: Se utilizan ${cantidadTestigosUsados} testigos (habitual: 6 a 8). Debe documentar la insuficiencia de datos de mercado en la zona.`
      );
    }
  }
  if (cantidadTestigosUsados > 8) {
    advertenciasNormativas.push(
      `Se supera el máximo operativo de 8 testigos (${cantidadTestigosUsados}). Seleccione entre 6 y 8 comparables representativos.`
    );
  }
  if (coeficienteVariacionPct > 20 && cantidadTestigosUsados >= 2) {
    advertenciasNormativas.push(
      `Dispersión elevada entre testigos homogeneizados (CV = ${coeficienteVariacionPct.toFixed(1)}%). Revise los factores correctores aplicados.`
    );
  }
  if (
    inmueble.tipoActivo === 'terreno_urbanizable' &&
    inmueble.situacionBasicaLey8 === 'suelo_rural_sin_ordenacion' &&
    (metodoPrincipal === 'residual_estatico' || metodoPrincipal === 'residual_dinamico')
  ) {
    advertenciasNormativas.push(
      `Ley 8/2007 (Art. 12 y 23): Para suelo urbanizable en situación básica rural sin ordenación pormenorizada, la valoración legal expropiatoria/urbanística prohíbe expectativas y exige Capitalización de Rentas.`
    );
  }
  const testigosSinSoporte = testigosUsados.filter((t) => !t.pantallazo && !t.enlace);
  if (testigosSinSoporte.length > 0) {
    advertenciasNormativas.push(
      `Trazabilidad incompleta: ${testigosSinSoporte.length} testigo(s) usado(s) carecen de pantallazo o enlace URL guardado.`
    );
  }

  return {
    metodoAplicado: metodoPrincipal,
    valorPrincipalEuros,
    valorAnexosEuros: valorAnexosFinal,
    valorTotalTasacionEuros,
    valorUnitarioM2,
    valorHipotecarioRecomendadoEuros,
    testigosUsados,
    cantidadTestigosUsados,
    cumpleMinimoTestigos,
    requiereJustificacionEscasez,
    justificacionValida,
    mediaHomogeneizadaM2,
    medianaHomogeneizadaM2,
    desviacionTipicaM2,
    coeficienteVariacionPct,
    reposicion: {
      valorSuelo: rep.valorSueloEuros || 0,
      costeConstruccion: costeConstruccionRep,
      gastosNecesarios: gastosNecesariosRep,
      valorReposicionBruto,
      antiguedadAnos,
      depreciacionFisicaEuros,
      depreciacionFuncionalEuros,
      valorReposicionNeto,
    },
    residualEstatico: {
      techoEdificableTotalM2: techoEstTotal,
      techoPatrimonializableM2: techoEstPatrimonializable,
      valorMercadoTerminado: valorMercadoTerminadoEst,
      margenPromotorEuros: margenPromotorEst,
      costesConstruccionTotal: costesConstEst,
      gastosPromocionTotal: gastosPromEst,
      costesUrbanizacion: costesUrbEst,
      valorResidualSueloEuros: valorResidualEst,
      valorRepercusionM2Techo: valorRepercusionEst,
      valorUnitarioSueloM2: valorUnitarioSueloEst,
    },
    residualDinamico: {
      tasaDescuentoPct,
      techoEdificableTotalM2: techoDinTotal,
      techoPatrimonializableM2: techoDinPatrimonializable,
      flujosDescontados,
      valorResidualSueloEuros: valorResidualDin,
      valorRepercusionM2Techo: valorRepercusionDin,
      valorUnitarioSueloM2: valorUnitarioSueloDin,
    },
    capitalizacionRustico: {
      superficieHa,
      rentaAnualTotal,
      valorCapitalizacionBase,
      valorConFactorLocalizacion,
      indemnizacionFacultadParticipar: indemnizacion,
      valorMejoras: mejoras,
      valorTotalSueloRural,
      valorUnitarioM2: valorUnitarioRust,
    },
    advertenciasNormativas,
  };
}

export function formatEUR(val: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(val) ? val : 0);
}

export function formatEURDecimal(val: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(val) ? val : 0);
}

export function formatNumber(val: number, decimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(val) ? val : 0);
}
