import type {
  ConfiguracionInforme,
  EncabezadoPieInforme,
  ExpedienteTasacion,
} from '../types/appraisal';

export function createDefaultEncabezadoPie(
  overrides?: Partial<EncabezadoPieInforme>
): EncabezadoPieInforme {
  return {
    estiloEncabezado: 'corporativo_logo',
    textoEncabezadoIzq: '',
    textoEncabezadoDer: '',
    mostrarLogoEnEncabezado: true,
    estiloPie: 'estandar_texto',
    textoPieIzq: '',
    textoPieCentro: 'Documento emitido conforme a la Orden ECO/805/2003',
    mostrarImagenPie: true,
    mostrarPaginacion: true,
    ...overrides,
  };
}

export function getDefaultConfiguracionInforme(): ConfiguracionInforme {
  return {
    incluirPortada: true,
    estiloPortada: 'ejecutiva_banda',
    subtituloPortada: 'Informe Técnico de Valoración Inmobiliaria',
    notaConfidencialPortada:
      'Documento técnico confidencial destinado exclusivamente al solicitante y finalidad indicada.',
    incluirFotoPrincipalEnPortada: true,
    colorPrimarioHex: '#1E3A8A',
    colorSecundarioHex: '#0F172A',
    colorAcentoHex: '#1D4ED8',
    tipografia: 'helvetica',
    logoPrincipal: null,
    imagenPiePagina: null,
    manualImagenNombre: '',
    manualImagenDataUrl: null,
    instruccionesApariencia: '',
    resumenEstiloAplicado: '',
    personalizarPorTipoInforme: false,
    general: createDefaultEncabezadoPie(),
    porTipo: {
      normal: createDefaultEncabezadoPie({
        estiloEncabezado: 'corporativo_logo',
        estiloPie: 'estandar_texto',
      }),
      testigos: createDefaultEncabezadoPie({
        estiloEncabezado: 'banda_color',
        estiloPie: 'dos_columnas_contacto',
        textoPieCentro: 'Anexo de Trazabilidad de Testigos Vinculados al Activo',
      }),
      ampliado: createDefaultEncabezadoPie({
        estiloEncabezado: 'clasico_centrado',
        estiloPie: 'banda_oscura',
        textoPieCentro: 'Informe Ampliado · Orden ECO/805/2003 y Ley 8/2007 de Suelo',
      }),
    },
  };
}

export function resolveConfiguracionInforme(
  exp: ExpedienteTasacion
): ConfiguracionInforme {
  const def = getDefaultConfiguracionInforme();
  const cur = exp.configuracionInforme;
  if (!cur) return def;
  return {
    ...def,
    ...cur,
    general: { ...def.general, ...(cur.general || {}) },
    porTipo: {
      normal: { ...def.porTipo.normal, ...(cur.porTipo?.normal || {}) },
      testigos: { ...def.porTipo.testigos, ...(cur.porTipo?.testigos || {}) },
      ampliado: { ...def.porTipo.ampliado, ...(cur.porTipo?.ampliado || {}) },
    },
  };
}
