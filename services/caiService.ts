/**
 * Servicio de CAIs con datos reales de ArcGIS
 * 
 * ARQUITECTURA DE FUSIÓN DE DATOS (basado en Informe Técnico de Cuadrantes):
 * 
 * 1. CAPA PRIMARIA (Bogotá - "Estándar de Oro"):
 *    - API SDSCJ: oaiee.scj.gov.co
 *    - Ofrece geometría precisa con campo EPOIUEPOLI como FK
 * 
 * 2. CAPA SECUNDARIA (WebMap ArcGIS):
 *    - WebMap: b91ab25a98f1434386c4b88df22f8f25
 *    - Ubicaciones reales de CAIs con código CAICPOLICI
 * 
 * 3. CAPA LÓGICA (Nacional):
 *    - API SODA: datos.gov.co/resource/jwvi-unqh
 *    - Relación explícita CAI -> Cuadrantes a nivel nacional
 * 
 * El problema que resuelve:
 * - Las coordenadas previas correspondían al centroide del cuadrante, no al CAI real
 * - Este servicio cruza MÚLTIPLES fuentes para obtener ubicaciones precisas
 */

import { CAILocation } from '../types';
import * as turf from '@turf/turf';
import { getCAIFromSDSCJ, getEstacionFromSDSCJ, parseSIVICCCode, preloadSDSCJ, SDSCJEquipamiento } from './bogotaSDSCJService';
import { findCAIForCuadrante, getJerarquiaCuadrante, preloadDirectorio } from './sodaService';

// Re-exportar para uso externo
export { getEstacionFromSDSCJ } from './bogotaSDSCJService';

// URL del WebMap de ArcGIS con ubicaciones reales de CAIs
const ARCGIS_WEBMAP_ID = 'b91ab25a98f1434386c4b88df22f8f25';
const ARCGIS_WEBMAP_DATA_URL = `https://www.arcgis.com/sharing/rest/content/items/${ARCGIS_WEBMAP_ID}/data?f=json`;

// Cache de CAIs cargados
let cachedCAIs: RealCAI[] = [];
let caiLoadedFromAPI = false;
let caiLoadedFromLocal = false;
let lastLoadAttempt = 0;
const RELOAD_INTERVAL = 300000; // 5 minutos

export interface RealCAI {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  horario: string;
  codigoCuadrante: string;
  lat: number;
  lng: number;
  localidad: string;
  upz: string;
}

interface ArcGISWebMapResponse {
  operationalLayers: Array<{
    title: string;
    featureCollection?: {
      layers?: Array<{
        featureSet?: {
          features?: Array<{
            geometry: {
              x: number;
              y: number;
              spatialReference?: {
                wkid: number;
              };
            };
            attributes: Record<string, any>;
          }>;
        };
      }>;
    };
  }>;
}

/**
 * Convierte coordenadas Web Mercator (EPSG:3857) a WGS84 (EPSG:4326)
 */
function webMercatorToWGS84(x: number, y: number): { lat: number; lng: number } {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return { lat, lng };
}

/**
 * Carga CAIs desde el archivo local pre-descargado
 */
async function loadCAIsFromLocal(): Promise<RealCAI[]> {
  try {
    // Intentar cargar desde archivo local (generado por download-cais-arcgis.cjs)
    const localPaths = [
      '/data/cais_bogota_real.json',
      '/data/cais_colombia_arcgis.json'
    ];

    for (const path of localPaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log(`📦 CAIs cargados desde ${path}: ${data.length}`);
            return data;
          }
        }
      } catch (e) {
        // Continuar con siguiente archivo
      }
    }
    return [];
  } catch (error) {
    console.warn('⚠️ No se pudieron cargar CAIs locales');
    return [];
  }
}

/**
 * Carga CAIs directamente desde la API de ArcGIS
 */
async function loadCAIsFromArcGIS(): Promise<RealCAI[]> {
  console.log('📥 Cargando CAIs desde ArcGIS WebMap...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(ARCGIS_WEBMAP_DATA_URL, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: ArcGISWebMapResponse = await response.json();
    
    // Buscar la capa de CAIs
    const caiLayer = data.operationalLayers.find(layer => 
      layer.title === 'ComandoAtencionInmediata' || 
      layer.title?.toLowerCase().includes('cai')
    );

    if (!caiLayer?.featureCollection?.layers?.[0]?.featureSet?.features) {
      console.warn('⚠️ No se encontró la capa de CAIs en el WebMap');
      return [];
    }

    const features = caiLayer.featureCollection.layers[0].featureSet.features;
    console.log(`✅ ${features.length} CAIs encontrados en ArcGIS`);

    const cais: RealCAI[] = [];

    for (const feature of features) {
      const attrs = feature.attributes;
      const geom = feature.geometry;

      // Preferir coordenadas de atributos (ya en WGS84)
      let lat = attrs.CAILATITUD as number;
      let lng = attrs.CAILONGITU as number;

      // Si no hay coordenadas en atributos, convertir de Web Mercator
      if ((!lat || !lng) && geom) {
        const converted = webMercatorToWGS84(geom.x, geom.y);
        lat = converted.lat;
        lng = converted.lng;
      }

      if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        continue;
      }

      cais.push({
        id: attrs.CAIIDENTIF || `CAI_${attrs.FID}`,
        nombre: attrs.CAIDESCRIP || attrs.CAIIEPOLIC || 'CAI Sin Nombre',
        direccion: attrs.CAIDIR_SIT || '',
        telefono: attrs.CAITELEFON || '',
        email: attrs.CAICELECTR || '',
        horario: attrs.CAIHORARIO || attrs.CAITURNO || '24 Horas',
        codigoCuadrante: attrs.CAICPOLICI || '',
        lat,
        lng,
        localidad: attrs.CAIIULOCAL || '',
        upz: attrs.CAIIUUPLAN || ''
      });
    }

    console.log(`📍 ${cais.length} CAIs procesados con coordenadas válidas`);
    return cais;

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('⚠️ Error cargando CAIs desde ArcGIS:', (error as Error).message);
    return [];
  }
}

/**
 * Carga los CAIs con fallback automático
 */
async function loadCAIs(): Promise<void> {
  const now = Date.now();
  
  // Evitar recargas frecuentes
  if (cachedCAIs.length > 0 && (now - lastLoadAttempt) < RELOAD_INTERVAL) {
    return;
  }
  
  lastLoadAttempt = now;

  // 1. Intentar desde archivo local primero (más rápido)
  if (!caiLoadedFromLocal) {
    const localCAIs = await loadCAIsFromLocal();
    if (localCAIs.length > 0) {
      cachedCAIs = localCAIs;
      caiLoadedFromLocal = true;
      console.log(`✅ Usando ${cachedCAIs.length} CAIs desde cache local`);
      return;
    }
  }

  // 2. Cargar desde ArcGIS API si no hay datos locales
  if (!caiLoadedFromAPI) {
    const arcgisCAIs = await loadCAIsFromArcGIS();
    if (arcgisCAIs.length > 0) {
      cachedCAIs = arcgisCAIs;
      caiLoadedFromAPI = true;
      console.log(`✅ Usando ${cachedCAIs.length} CAIs desde ArcGIS API`);
    }
  }
}

/**
 * Encuentra el CAI más cercano a una ubicación dada
 */
export async function findNearestCAI(lat: number, lng: number, maxDistanceKm: number = 5): Promise<RealCAI | null> {
  await loadCAIs();
  
  if (cachedCAIs.length === 0) {
    return null;
  }

  const userPoint = turf.point([lng, lat]);
  let nearestCAI: RealCAI | null = null;
  let minDistance = Infinity;

  for (const cai of cachedCAIs) {
    const caiPoint = turf.point([cai.lng, cai.lat]);
    const distance = turf.distance(userPoint, caiPoint, { units: 'kilometers' });

    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      nearestCAI = cai;
    }
  }

  return nearestCAI;
}

/**
 * Extrae el código de estación y número de un código largo de cuadrante
 * Ejemplo: "MEBOGMNVCCC01E01C02000004" -> { estacion: "E01", numero: "04" }
 * Ejemplo: "E01-01" -> { estacion: "E01", numero: "01" }
 */
function parseQuadrantCode(code: string): { estacion: string; numero: string; cai?: string } | null {
  const normalized = code.toUpperCase().trim();
  
  // Formato corto del WebMap: "E01-01" o "E10-21"
  const shortMatch = normalized.match(/^(E\d{2})-(\d{2})$/);
  if (shortMatch) {
    return { estacion: shortMatch[1], numero: shortMatch[2] };
  }

  // Formato largo de la API: "MEBOGMNVCCC01E01C02000004"
  // Buscar patrón E## (estación) y los últimos dígitos (número de cuadrante)
  const longMatch = normalized.match(/(E\d{2})(C\d{2})?(\d{6})$/);
  if (longMatch) {
    const numero = longMatch[3].replace(/^0+/, '') || '0'; // Remover ceros iniciales
    return { 
      estacion: longMatch[1], 
      numero: numero.padStart(2, '0'),
      cai: longMatch[2] // C02, C08, etc.
    };
  }

  // Intentar extraer al menos la estación
  const estacionMatch = normalized.match(/(E\d{2})/);
  if (estacionMatch) {
    return { estacion: estacionMatch[1], numero: '' };
  }

  return null;
}

/**
 * Encuentra el CAI por código de cuadrante
 * Soporta tanto códigos largos (API) como cortos (WebMap)
 */
export async function findCAIByCuadrante(codigoCuadrante: string): Promise<RealCAI | null> {
  await loadCAIs();
  
  const parsed = parseQuadrantCode(codigoCuadrante);
  if (!parsed) {
    console.log(`⚠️ No se pudo parsear código de cuadrante: ${codigoCuadrante}`);
    return null;
  }

  console.log(`🔍 Buscando CAI para estación ${parsed.estacion}${parsed.cai ? ', CAI ' + parsed.cai : ''}`);

  // Buscar CAIs que coincidan con la estación
  const caisDeEstacion = cachedCAIs.filter(cai => {
    const caiParsed = parseQuadrantCode(cai.codigoCuadrante);
    return caiParsed && caiParsed.estacion === parsed.estacion;
  });

  if (caisDeEstacion.length === 0) {
    console.log(`⚠️ No se encontraron CAIs para estación ${parsed.estacion}`);
    return null;
  }

  // Si solo hay un CAI en la estación, usarlo
  if (caisDeEstacion.length === 1) {
    return caisDeEstacion[0];
  }

  // Si tenemos código de CAI específico (C02, C08), buscar coincidencia
  if (parsed.cai) {
    // El CAI en el código largo (C02) corresponde al segundo número en el código corto
    // C01 -> primer CAI, C02 -> segundo CAI, etc.
    const caiNumero = parseInt(parsed.cai.replace('C', ''), 10);
    
    // Buscar CAI que tenga ese número en su código
    for (const cai of caisDeEstacion) {
      const caiParsed = parseQuadrantCode(cai.codigoCuadrante);
      if (caiParsed && parseInt(caiParsed.numero, 10) === caiNumero) {
        return cai;
      }
    }
  }

  // Retornar el primer CAI de la estación como fallback
  console.log(`📍 Usando CAI principal de estación ${parsed.estacion}: ${caisDeEstacion[0].nombre}`);
  return caisDeEstacion[0];
}

/**
 * Busca el CAI real para un cuadrante dado
 * ARQUITECTURA DE FUSIÓN según el Informe Técnico:
 * 
 * 1. SDSCJ Bogotá (Estándar de Oro) - Correlación relacional por EPOIUEPOLI
 * 2. WebMap ArcGIS - Correlación por CAICPOLICI
 * 3. API SODA datos.gov.co - Relación lógica explícita (nacional)
 * 4. Fallback geográfico - CAI más cercano al centroide
 */
export async function getCAILocationForQuadrant(
  quadrantId: string,
  quadrantCenter?: { lat: number; lng: number }
): Promise<CAILocation | undefined> {
  
  // Detectar si estamos en Bogotá (códigos MEBOG)
  const esBogota = quadrantId.toUpperCase().includes('MEBOG') || 
                   quadrantId.toUpperCase().startsWith('E');

  // 1. PRIORIDAD: API SDSCJ de Bogotá (más precisa para la capital)
  if (esBogota) {
    try {
      const sdscjResult = await getCAIFromSDSCJ(quadrantId, quadrantCenter);
      if (sdscjResult) {
        console.log(`🏆 [SDSCJ] CAI encontrado: ${sdscjResult.name} (${sdscjResult.lat}, ${sdscjResult.lng})`);
        return sdscjResult;
      }
    } catch (error) {
      console.warn('⚠️ Error consultando SDSCJ, continuando con otras fuentes...');
    }
  }

  // 2. WebMap ArcGIS (datos locales pre-descargados)
  await loadCAIs();
  const caiByCode = await findCAIByCuadrante(quadrantId);
  if (caiByCode) {
    console.log(`📍 [WebMap] CAI encontrado por código: ${caiByCode.nombre} (${caiByCode.lat}, ${caiByCode.lng})`);
    return {
      lat: caiByCode.lat,
      lng: caiByCode.lng,
      name: caiByCode.nombre
    };
  }

  // 3. API SODA datos.gov.co (para obtener información de jerarquía)
  try {
    const jerarquia = await getJerarquiaCuadrante(quadrantId);
    if (jerarquia) {
      console.log(`📋 [SODA] Jerarquía encontrada: ${jerarquia.cai} -> Estación: ${jerarquia.estacion}`);
      // Nota: SODA no tiene coordenadas, pero nos da el nombre del CAI para buscar
      // Buscar en nuestros datos locales por nombre
      const caiPorNombre = cachedCAIs.find(c => 
        c.nombre.toUpperCase().includes(jerarquia.cai.replace('CAI ', '').toUpperCase())
      );
      if (caiPorNombre) {
        console.log(`📍 [SODA+Local] CAI encontrado: ${caiPorNombre.nombre}`);
        return {
          lat: caiPorNombre.lat,
          lng: caiPorNombre.lng,
          name: caiPorNombre.nombre
        };
      }
    }
  } catch (error) {
    console.warn('⚠️ Error consultando SODA, continuando con fallback...');
  }

  // 4. FALLBACK: CAI más cercano geográficamente
  if (quadrantCenter) {
    const nearestCAI = await findNearestCAI(quadrantCenter.lat, quadrantCenter.lng, 2);
    if (nearestCAI) {
      console.log(`📍 [Fallback] CAI cercano encontrado: ${nearestCAI.nombre} (${nearestCAI.lat}, ${nearestCAI.lng})`);
      return {
        lat: nearestCAI.lat,
        lng: nearestCAI.lng,
        name: nearestCAI.nombre
      };
    }
  }

  return undefined;
}

/**
 * Obtiene todos los CAIs cargados (para debug/visualización)
 */
export async function getAllCAIs(): Promise<RealCAI[]> {
  await loadCAIs();
  return cachedCAIs;
}

/**
 * Obtiene CAIs dentro de un bounding box
 */
export async function getCAIsInBounds(
  minLat: number, 
  maxLat: number, 
  minLng: number, 
  maxLng: number
): Promise<RealCAI[]> {
  await loadCAIs();
  
  return cachedCAIs.filter(cai => 
    cai.lat >= minLat && 
    cai.lat <= maxLat && 
    cai.lng >= minLng && 
    cai.lng <= maxLng
  );
}

/**
 * Pre-carga los CAIs para mejor rendimiento
 * Carga en paralelo todas las fuentes de datos
 */
export async function preloadCAIs(): Promise<void> {
  console.log('🚀 Pre-cargando fuentes de datos de CAIs...');
  
  // Cargar todas las fuentes en paralelo para mejor rendimiento
  await Promise.all([
    loadCAIs(),                // WebMap ArcGIS local
    preloadSDSCJ().catch(e => console.warn('⚠️ SDSCJ no disponible')),  // API Bogotá
    preloadDirectorio().catch(e => console.warn('⚠️ SODA no disponible'))  // API Nacional
  ]);
  
  console.log('✅ Fuentes de datos pre-cargadas');
}

/**
 * Obtiene estadísticas de los CAIs cargados
 */
export async function getCAIStats(): Promise<{
  total: number;
  bogota: number;
  source: 'local' | 'arcgis' | 'none';
}> {
  await loadCAIs();
  
  const bogotaCAIs = cachedCAIs.filter(cai => 
    cai.lat >= 4.4 && cai.lat <= 4.9 && 
    cai.lng >= -74.3 && cai.lng <= -73.9
  );

  return {
    total: cachedCAIs.length,
    bogota: bogotaCAIs.length,
    source: caiLoadedFromLocal ? 'local' : (caiLoadedFromAPI ? 'arcgis' : 'none')
  };
}
