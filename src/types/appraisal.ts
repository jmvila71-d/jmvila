export type TipoActivo =
  | 'vivienda'
  | 'local'
  | 'garaje'
  | 'trastero'
  | 'terreno_urbano'
  | 'terreno_urbanizable'
  | 'terreno_rustico';

export type MetodoValoracion =
  | 'comparacion'
  | 'reposicion'
  | 'residual_estatico'
  | 'residual_dinamico'
  | 'capitalizacion_rustico';

export type FinalidadTasacion =
  | 'garantia_hipotecaria'
  | 'compraventa_asesoramiento'
  | 'cobertura_provisiones'
  | 'patrimonio_iic';

export type EstadoConservacion =
  | 'obra_nueva'
  | 'excelente'
  | 'bueno'
  | 'normal'
  | 'regular'
  | 'rehabilitar';

export type SituacionBasicaLey8 =
  | 'suelo_urbanizado'
  | 'suelo_urbanizable_con_ordenacion'
  | 'suelo_rural_sin_ordenacion';

export type TipoAnexo =
  | 'trastero'
  | 'garaje'
  | 'jardin'
  | 'terraza'
  | 'bodega'
  | 'buhardilla'
  | 'otro';

export interface PiezaAnexa {
  id: string;
  tipo: TipoAnexo;
  descripcion: string;
  superficieM2: number;
  modoValoracion: 'repercusion' | 'importe_fijo';
  coeficienteHomogeneizacion: number; // e.g., 0.40 for trastero, 0.25 for jardín, 0.50 for terraza
  valorFijoEuros: number; // used when modoValoracion === 'importe_fijo'
}

export interface FotoInmueble {
  id: string;
  url: string; // data URL or bundled asset URL
  pieDeFoto: string;
  categoria: 'exterior' | 'interior' | 'anexo' | 'entorno' | 'documento';
  fechaCaptura: string;
}

export interface FactoresCorrectores {
  negociacion: number; // Oferta vs cierre (ej. 0.92)
  localizacion: number; // Micro-zona (ej. 1.00)
  superficie: number; // Economía de escala (ej. 0.98)
  antiguedadEstado: number; // Año y estado conservación
  calidadAcabados: number; // Calidades constructivas
  plantaOrientacion: number; // Altura, vistas, luz
  equipamientoAnexos: number; // Ascensor, eficiencia, extras
}

export interface Testigo {
  id: string;
  codigoTrazabilidad: string; // e.g. TAS-2026-001-T01
  activoVinculadoId: string;
  fechaCaptura: string;
  titulo: string;
  direccion: string;
  zona: string;
  municipio: string;
  tipoFuente: 'oferta_portal' | 'transaccion_registrada' | 'inmobiliaria_local';
  portalFuente: string;
  enlace: string;
  pantallazo: string | null; // Base64 image or bundled URL
  incluidoEnValoracion: boolean;
  motivoExclusion?: string;
  precioTotal: number;
  superficieM2: number;
  caracteristicas: {
    habitaciones?: number;
    banos?: number;
    planta?: string;
    ascensor?: boolean;
    anoConstruccion?: number;
    estadoConservacion?: string;
  };
  factoresCorrectores: FactoresCorrectores;
  pesoManual?: number;
  observaciones?: string;
}

export interface ParamsReposicion {
  valorSueloEuros: number;
  costeConstruccionM2: number;
  gastosNecesariosPct: number; // honorarios, licencias, tasas (~12-18%)
  vidaUtilAnos: number; // Art. 19 ECO 805/2003 (e.g. 100 años residencial)
  depreciacionFuncionalPct: number; // 0-30%
}

export interface ParamsResidualEstatico {
  superficieParcelaM2: number;
  edificabilidadM2M2: number;
  valorVentaProductoTerminadoM2: number; // €/m² construido producto probable
  costeConstruccionM2: number;
  costesUrbanizacionPendientes: number;
  gastosPromocionPct: number; // honorarios, licencias, comercialización, financieros (~16-22%)
  margenBeneficioPromotorPct: number; // Art. 42 ECO 805/2003 (18-24% residencial)
  cesionAprovechamientoPct: number; // Ley 8/2007 Art. 16 (5-15% en actuaciones urbanizadoras)
}

export interface FlujoPeriodoDinamico {
  periodo: string; // e.g. "Trim. 1", "Año 1"
  anioDescuento: number; // t in years (e.g. 0.5, 1.0, 1.5, 2.0)
  cobrosVentas: number; // E_t
  pagosUrbanizacion: number; // urbanización + cargas
  pagosConstruccion: number; // obra + honorarios + licencias + marketing
}

export interface ParamsResidualDinamico {
  superficieParcelaM2: number;
  edificabilidadM2M2: number;
  valorVentaProductoTerminadoM2: number;
  costeConstruccionTotal: number;
  costesUrbanizacionPendientes: number;
  gastosGestionYComercializacion: number;
  tasaLibreRiesgoPct: number; // i_0 (ej. 3.2%)
  primaRiesgoPct: number; // p (ej. 8.5% según ECO 805/2003 Art. 39)
  cesionAprovechamientoPct: number; // Ley 8/2007
  plazoTotalMeses: number;
  flujos: FlujoPeriodoDinamico[];
}

export interface ParamsCapitalizacionRustico {
  superficieParcelaM2: number;
  tipoCultivoAprovechamiento: string;
  rentaAnualNetaPorHa: number; // €/Ha/año
  tipoCapitalizacionPct: number; // r (ECO 805/2003 Art. 32 / Ley 8/2007)
  factorLocalizacionFL: number; // Ley 8/2007 Art. 23.1.a (1.00 - 2.00)
  indemnizacionFacultadParticipar: number; // Ley 8/2007 Art. 25 si procede
  valorMejorasConstruccionesAgrarias: number;
}

export interface InmuebleDatos {
  tituloExpediente: string;
  codigoExpediente: string;
  fechaTasacion: string;
  solicitante: string;
  tasadorNombre: string;
  tasadorColegiado: string;
  sociedadTasacion: string;
  finalidad: FinalidadTasacion;
  tipoActivo: TipoActivo;
  subtipo: string; // Piso, Chalet adosado, Solar urbano, Finca regadío, etc.
  direccion: string;
  municipio: string;
  provincia: string;
  codigoPostal: string;
  referenciaCatastral: string;
  datosRegistrales: string; // Finca registral, Tomo, Libro, Folio, Registro
  superficieConstruidaM2: number;
  superficieUtilM2: number;
  superficieParcelaM2: number;
  superficieComunesM2: number;
  anoConstruccion: number;
  estadoConservacion: EstadoConservacion;
  habitaciones: number;
  banos: number;
  planta: string;
  ascensor: boolean;
  orientacion: string;
  calificacionEnergetica: string;
  // Urbanismo y Ley 8/2007
  situacionBasicaLey8: SituacionBasicaLey8;
  clasificacionUrbanistica: string;
  usoPermitido: string;
  observacionesTecnicas: string;
  condicionantesYAdvertencias: string;
}

export type EstiloEncabezado =
  | 'corporativo_logo'
  | 'clasico_centrado'
  | 'banda_color'
  | 'minimalista';

export type EstiloPiePagina =
  | 'estandar_texto'
  | 'imagen_faldilla'
  | 'dos_columnas_contacto'
  | 'banda_oscura';

export type EstiloPortada =
  | 'ejecutiva_banda'
  | 'clasica_enmarcada'
  | 'minimal_editorial';

export type TipografiaPDF = 'helvetica' | 'times' | 'courier';

export interface EncabezadoPieInforme {
  estiloEncabezado: EstiloEncabezado;
  textoEncabezadoIzq: string;
  textoEncabezadoDer: string;
  mostrarLogoEnEncabezado: boolean;
  estiloPie: EstiloPiePagina;
  textoPieIzq: string;
  textoPieCentro: string;
  mostrarImagenPie: boolean;
  mostrarPaginacion: boolean;
}

export interface ConfiguracionInforme {
  incluirPortada: boolean;
  estiloPortada: EstiloPortada;
  subtituloPortada: string;
  notaConfidencialPortada: string;
  incluirFotoPrincipalEnPortada: boolean;
  colorPrimarioHex: string;
  colorSecundarioHex: string;
  colorAcentoHex: string;
  tipografia: TipografiaPDF;
  logoPrincipal: string | null;
  imagenPiePagina: string | null;
  manualImagenNombre: string;
  manualImagenDataUrl: string | null;
  instruccionesApariencia: string;
  resumenEstiloAplicado: string;
  personalizarPorTipoInforme: boolean;
  general: EncabezadoPieInforme;
  porTipo: {
    normal: EncabezadoPieInforme;
    testigos: EncabezadoPieInforme;
    ampliado: EncabezadoPieInforme;
  };
}

export interface ExpedienteTasacion {
  id: string;
  actualizadoEn: string;
  inmueble: InmuebleDatos;
  metodoPrincipal: MetodoValoracion;
  aplicarLey8_2007: boolean;
  piezasAnexas: PiezaAnexa[];
  fotos: FotoInmueble[];
  testigos: Testigo[];
  justificacionEscasezMercado: string;
  paramsReposicion: ParamsReposicion;
  paramsResidualEstatico: ParamsResidualEstatico;
  paramsResidualDinamico: ParamsResidualDinamico;
  paramsCapitalizacionRustico: ParamsCapitalizacionRustico;
  configuracionInforme?: ConfiguracionInforme;
}

export interface TestigoCalculado extends Testigo {
  precioM2Bruto: number;
  coeficienteGlobal: number;
  precioM2Homogeneizado: number;
}

export interface ResultadoValoracion {
  metodoAplicado: MetodoValoracion;
  valorPrincipalEuros: number;
  valorAnexosEuros: number;
  valorTotalTasacionEuros: number;
  valorUnitarioM2: number;
  valorHipotecarioRecomendadoEuros: number;
  // Comparación stats
  testigosUsados: TestigoCalculado[];
  cantidadTestigosUsados: number;
  cumpleMinimoTestigos: boolean;
  requiereJustificacionEscasez: boolean;
  justificacionValida: boolean;
  mediaHomogeneizadaM2: number;
  medianaHomogeneizadaM2: number;
  desviacionTipicaM2: number;
  coeficienteVariacionPct: number;
  // Reposición breakdown
  reposicion: {
    valorSuelo: number;
    costeConstruccion: number;
    gastosNecesarios: number;
    valorReposicionBruto: number;
    antiguedadAnos: number;
    depreciacionFisicaEuros: number;
    depreciacionFuncionalEuros: number;
    valorReposicionNeto: number;
  };
  // Residual estático breakdown
  residualEstatico: {
    techoEdificableTotalM2: number;
    techoPatrimonializableM2: number;
    valorMercadoTerminado: number;
    margenPromotorEuros: number;
    costesConstruccionTotal: number;
    gastosPromocionTotal: number;
    costesUrbanizacion: number;
    valorResidualSueloEuros: number;
    valorRepercusionM2Techo: number;
    valorUnitarioSueloM2: number;
  };
  // Residual dinámico breakdown
  residualDinamico: {
    tasaDescuentoPct: number;
    techoEdificableTotalM2: number;
    techoPatrimonializableM2: number;
    flujosDescontados: Array<{
      periodo: string;
      anioDescuento: number;
      cobros: number;
      pagosTotales: number;
      flujoNeto: number;
      factorDescuento: number;
      valorActualNeto: number;
    }>;
    valorResidualSueloEuros: number;
    valorRepercusionM2Techo: number;
    valorUnitarioSueloM2: number;
  };
  // Capitalización rústico / Ley 8/2007 breakdown
  capitalizacionRustico: {
    superficieHa: number;
    rentaAnualTotal: number;
    valorCapitalizacionBase: number;
    valorConFactorLocalizacion: number;
    indemnizacionFacultadParticipar: number;
    valorMejoras: number;
    valorTotalSueloRural: number;
    valorUnitarioM2: number;
  };
  advertenciasNormativas: string[];
}
