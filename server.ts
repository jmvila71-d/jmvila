import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const PORT =
  process.env.NODE_ENV === 'production' ? Number(process.env.PORT) || 3000 : 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'appraisals.json');

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

let writeQueue: Promise<void> = Promise.resolve();

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

async function readAppraisals(): Promise<unknown[]> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAppraisals(items: unknown[]): Promise<void> {
  await ensureDataFile();
  const tmpFile = `${DATA_FILE}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(items, null, 2), 'utf-8');
  await fs.rename(tmpFile, DATA_FILE);
}

function stripDataUrlPrefix(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: 'image/jpeg', data: dataUrl };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // List all appraisals
  app.get('/api/appraisals', async (_req, res) => {
    try {
      const items = await withFileLock(() => readAppraisals());
      res.json({ appraisals: items });
    } catch (err) {
      console.error('Error reading appraisals:', err);
      res.status(500).json({ error: 'No se pudieron cargar los expedientes guardados.' });
    }
  });

  // Save or update an appraisal
  app.post('/api/appraisals', async (req, res) => {
    try {
      const dossier = req.body;
      if (!dossier || typeof dossier !== 'object' || !dossier.id) {
        return res.status(400).json({ error: 'Expediente inválido.' });
      }
      await withFileLock(async () => {
        const items = (await readAppraisals()) as Array<{ id: string }>;
        const index = items.findIndex((item) => item.id === dossier.id);
        if (index >= 0) {
          items[index] = dossier;
        } else {
          items.unshift(dossier);
        }
        await writeAppraisals(items);
      });
      res.json({ ok: true, appraisal: dossier });
    } catch (err) {
      console.error('Error saving appraisal:', err);
      res.status(500).json({ error: 'Error al guardar el expediente de tasación.' });
    }
  });

  // Delete an appraisal
  app.delete('/api/appraisals/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await withFileLock(async () => {
        const items = (await readAppraisals()) as Array<{ id: string }>;
        const filtered = items.filter((item) => item.id !== id);
        await writeAppraisals(filtered);
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting appraisal:', err);
      res.status(500).json({ error: 'Error al eliminar el expediente.' });
    }
  });

  // OCR for Subject Property (Nota Simple, Catastro, IBI, Escritura, Ficha o Foto)
  app.post('/api/ocr/property', async (req, res) => {
    try {
      const { fileDataUrl, fileName } = req.body as {
        fileDataUrl?: string;
        fileName?: string;
      };
      if (!fileDataUrl) {
        return res.status(400).json({ error: 'Se requiere una imagen o documento PDF.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'El servicio OCR con Gemini requiere configurar GEMINI_API_KEY en el entorno del servidor.',
        });
      }

      const { mimeType, data } = stripDataUrlPrefix(fileDataUrl);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data,
              },
            },
            {
              text: `Eres un perito tasador inmobiliario español experto en normativa Orden ECO/805/2003 y Ley 8/2007 de Suelo.
Analiza mediante OCR este documento o fotografía (${fileName ?? 'documento'}) del inmueble objeto de tasación (puede ser una Nota Simple Registral, Certificación Catastral, recibo de IBI, escritura, ficha técnica, plano o fotografía).
Extrae todos los datos técnicos, registrales, catastrales y urbanísticos identificables. Si un campo numérico no aparece explícitamente, devuelve 0 o cadena vacía, nunca inventes referencias catastrales falsas. Identifica también posibles piezas anexas (trastero, garaje, jardín, terraza, bodega) si se mencionan.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tipoActivo: {
                type: Type.STRING,
                description:
                  'Uno de: vivienda, local, garaje, trastero, terreno_urbano, terreno_urbanizable, terreno_rustico',
              },
              subtipo: { type: Type.STRING },
              direccion: { type: Type.STRING },
              municipio: { type: Type.STRING },
              provincia: { type: Type.STRING },
              codigoPostal: { type: Type.STRING },
              referenciaCatastral: { type: Type.STRING },
              datosRegistrales: { type: Type.STRING },
              superficieConstruidaM2: { type: Type.NUMBER },
              superficieUtilM2: { type: Type.NUMBER },
              superficieParcelaM2: { type: Type.NUMBER },
              anoConstruccion: { type: Type.INTEGER },
              habitaciones: { type: Type.INTEGER },
              banos: { type: Type.INTEGER },
              planta: { type: Type.STRING },
              ascensor: { type: Type.BOOLEAN },
              calificacionEnergetica: { type: Type.STRING },
              clasificacionUrbanistica: { type: Type.STRING },
              usoPermitido: { type: Type.STRING },
              observacionesTecnicas: { type: Type.STRING },
              piezasAnexasDetectadas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tipo: {
                      type: Type.STRING,
                      description: 'trastero, garaje, jardin, terraza, bodega, buhardilla u otro',
                    },
                    descripcion: { type: Type.STRING },
                    superficieM2: { type: Type.NUMBER },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ extracted: parsed });
    } catch (err: unknown) {
      console.error('OCR Property error:', err);
      const message =
        err instanceof Error ? err.message : 'Error al procesar OCR del inmueble.';
      res.status(500).json({ error: message });
    }
  });

  // OCR for Comparable (Testigo: captura de portal inmobiliario, PDF de anuncio o foto)
  app.post('/api/ocr/comparable', async (req, res) => {
    try {
      const { fileDataUrl, fileName } = req.body as {
        fileDataUrl?: string;
        fileName?: string;
      };
      if (!fileDataUrl) {
        return res.status(400).json({ error: 'Se requiere una imagen o documento del testigo.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'El servicio OCR con Gemini requiere configurar GEMINI_API_KEY en el entorno del servidor.',
        });
      }

      const { mimeType, data } = stripDataUrlPrefix(fileDataUrl);

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data,
              },
            },
            {
              text: `Eres un tasador inmobiliario español (Orden ECO/805/2003).
Analiza mediante OCR esta captura de pantalla, fotografía o documento de un inmueble testigo/comparable (${fileName ?? 'testigo'}).
Extrae el título del anuncio, dirección o calle, barrio/zona, municipio, precio total en euros (solo número), superficie en m² (solo número), portal inmobiliario (Idealista, Fotocasa, Habitaclia, Pisos.com, etc.), URL/enlace si aparece visible en la barra del navegador o en el texto, habitaciones, baños, planta, si tiene ascensor, estado de conservación y observaciones relevantes.`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING },
              direccion: { type: Type.STRING },
              zona: { type: Type.STRING },
              municipio: { type: Type.STRING },
              precioTotal: { type: Type.NUMBER },
              superficieM2: { type: Type.NUMBER },
              portalFuente: { type: Type.STRING },
              enlace: { type: Type.STRING },
              tipoFuente: {
                type: Type.STRING,
                description: 'oferta_portal, transaccion_registrada o inmobiliaria_local',
              },
              habitaciones: { type: Type.INTEGER },
              banos: { type: Type.INTEGER },
              planta: { type: Type.STRING },
              ascensor: { type: Type.BOOLEAN },
              anoConstruccion: { type: Type.INTEGER },
              estadoConservacion: { type: Type.STRING },
              observaciones: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ extracted: parsed });
    } catch (err: unknown) {
      console.error('OCR Comparable error:', err);
      const message =
        err instanceof Error ? err.message : 'Error al procesar OCR del testigo.';
      res.status(500).json({ error: message });
    }
  });

  // Brand Manual & Appearance Instructions Analyzer for PDF Reports
  app.post('/api/brand/analyze', async (req, res) => {
    try {
      const { instrucciones, manualDataUrl, manualFileName } = req.body as {
        instrucciones?: string;
        manualDataUrl?: string | null;
        manualFileName?: string;
      };

      if (!instrucciones?.trim() && !manualDataUrl) {
        return res.status(400).json({
          error:
            'Indique instrucciones de apariencia o suba un manual de imagen corporativa.',
        });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            'El análisis inteligente de manual de imagen requiere configurar GEMINI_API_KEY en el entorno del servidor.',
        });
      }

      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (manualDataUrl) {
        const { mimeType, data } = stripDataUrlPrefix(manualDataUrl);
        parts.push({ inlineData: { mimeType, data } });
      }

      parts.push({
        text: `Eres un diseñador editorial experto en informes técnicos de tasación inmobiliaria en PDF.
Analiza ${manualDataUrl ? `el Manual de Imagen Corporativa adjunto (${manualFileName ?? 'manual'}) y ` : ''}las siguientes instrucciones del usuario para configurar la apariencia visual del informe PDF:
"${instrucciones || 'Extraer paleta corporativa, tipografía y estilo editorial del manual adjunto.'}"

Devuelve una configuración JSON exacta con:
- colorPrimarioHex: color hexadecimal principal oscuro o corporativo (ej. "#1E3A8A")
- colorSecundarioHex: color hexadecimal secundario neutro o de apoyo (ej. "#0F172A")
- colorAcentoHex: color hexadecimal de acento/destaque (ej. "#1D4ED8")
- tipografia: "helvetica" (moderna sans-serif), "times" (clásica editorial serif) o "courier" (técnica monoespaciada)
- incluirPortada: booleano
- estiloPortada: "ejecutiva_banda", "clasica_enmarcada" o "minimal_editorial"
- estiloEncabezado: "corporativo_logo", "clasico_centrado", "banda_color" o "minimalista"
- estiloPie: "estandar_texto", "imagen_faldilla", "dos_columnas_contacto" o "banda_oscura"
- textoEncabezadoIzq: texto corto sugerido para cabecera izquierda si el usuario pide alguno (o vacío para usar el predeterminado)
- textoPieIzq: texto corto legal o corporativo sugerido para el pie de página izquierdo (o vacío)
- subtituloPortada: subtítulo sugerido para la portada (o vacío)
- resumenEstiloAplicado: explicación breve en español (1-2 frases) de los criterios visuales aplicados.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              colorPrimarioHex: { type: Type.STRING },
              colorSecundarioHex: { type: Type.STRING },
              colorAcentoHex: { type: Type.STRING },
              tipografia: { type: Type.STRING },
              incluirPortada: { type: Type.BOOLEAN },
              estiloPortada: { type: Type.STRING },
              estiloEncabezado: { type: Type.STRING },
              estiloPie: { type: Type.STRING },
              textoEncabezadoIzq: { type: Type.STRING },
              textoPieIzq: { type: Type.STRING },
              subtituloPortada: { type: Type.STRING },
              resumenEstiloAplicado: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ config: parsed });
    } catch (err: unknown) {
      console.error('Brand analyze error:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Error al analizar el manual de imagen o instrucciones.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ValoraECO server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
