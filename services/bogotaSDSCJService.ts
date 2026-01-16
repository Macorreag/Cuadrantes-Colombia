/**
 * Servicio de integración con la API de la SDSCJ de Bogotá
 * 
 * Basado en el análisis del Informe Técnico de Cuadrantes:
 * - Endpoint: https://oaiee.scj.gov.co/agc/rest/services/Tematicos_NR/EquipamientoPMSDSCJ
 * - Capa 22: Comando de Atención Inmediata (CAIs) - 153 registros
 * - Capa 23: Estaciones de Policía - 21 registros
 * - Capa 25: Cuadrantes de Policía
 * 
 * Esta API es considerada el "Estándar de Oro" para datos de Bogotá según el informe.
 * Ofrece correlación directa mediante el campo CAIIUCAINM (Foreign Key para CAIs).
 */

import { CAILocation } from '../types';

// URL base de la API de la SDSCJ de Bogotá
const SDSCJ_BASE_URL = 'https://oaiee.scj.gov.co/agc/rest/services/Tematicos_NR/EquipamientoPMSDSCJ';
const SDSCJ_CAI_LAYER = `${SDSCJ_BASE_URL}/FeatureServer/22`;       // CAIs (153)
const SDSCJ_ESTACIONES_LAYER = `${SDSCJ_BASE_URL}/FeatureServer/23`; // Estaciones (21)
const SDSCJ_CUADRANTES_LAYER = `${SDSCJ_BASE_URL}/FeatureServer/25`; // Cuadrantes

// Cache de equipamientos cargados
let cachedCAIs: SDSCJEquipamiento[] = [];
let cachedEstaciones: SDSCJEquipamiento[] = [];
let equipamientosLoaded = false;
let lastLoadAttempt = 0;
const RELOAD_INTERVAL = 600000; // 10 minutos

/**
 * Estructura de datos de equipamiento policial de la SDSCJ
 * Basado en el diccionario de datos del informe (Sección 4.1)
 */
export interface SDSCJEquipamiento {
  objectId: number;
  nombre: string;           // EPONOMBRE
  descripcion: string;      // EPODESCRIP
  direccion: string;        // EPODIR_SITIO
  latitud: number;          // EPOLATITUD
  longitud: number;         // EPOLONGITU
  telefono: string;         // EPOTELEFON
  email: string;            // EPOCELECTR
  horario: string;          // EPOHORARIO
  tipoEquipamiento: string; // EPOTEQUIPA
  codigoEstacionCAI: string; // EPOIUEPOLI - LLAVE DE CORRELACIÓN (ej: "E15C02")
  localidad: string;        // EPOIULOCAL
  upz: string;              // EPOIUUPLAN
  upl: string;              // EPOIUUPLOC
  esCAI: boolean;           // Derivado de EPONOMBRE
}

/**
 * Resultado de una consulta espacial a la capa de cuadrantes
 */
export interface SDSCJCuadrante {
  objectId: number;
  codigoCuadrante: string;
  nombre: string;
  estacion: string;
  localidad: string;
  geometry?: GeoJSON.Polygon;
}

/**
 * Carga CAIs desde la capa 22 de SDSCJ
 */
async function loadCAIsFromSDSCJ(): Promise<SDSCJEquipamiento[]> {
  console.log('📥 Cargando CAIs desde SDSCJ Bogotá (Capa 22)...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      f: 'json',
      resultRecordCount: '500',
      outSR: '4326'  // Asegurar coordenadas en WGS84
    });

    const response = await fetch(`${SDSCJ_CAI_LAYER}/query?${params}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Error en API SDSCJ');
    }

    if (!data.features || data.features.length === 0) {
      console.warn('⚠️ No se encontraron CAIs en SDSCJ');
      return [];
    }

    const cais: SDSCJEquipamiento[] = [];

    for (const feature of data.features) {
      const attrs = feature.attributes;
      const geom = feature.geometry;
      
      // Obtener coordenadas desde geometría o atributos
      let lat: number | undefined;
      let lng: number | undefined;
      
      if (geom && geom.y && geom.x) {
        lat = geom.y;
        lng = geom.x;
      }
      
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;

      cais.push({
        objectId: attrs.OBJECTID,
        nombre: attrs.CAIDESCRIP || attrs.CAINOMBRE || 'CAI Sin Nombre',
        descripcion: attrs.CAIDESCRIP || '',
        direccion: attrs.CAIDIR_SIT || '',
        latitud: lat,
        longitud: lng,
        telefono: attrs.CAITELEFON || '',
        email: attrs.CAICELECTR || '',
        horario: attrs.CAIHORARIO || '24 horas',
        tipoEquipamiento: 'CAI',
        codigoEstacionCAI: attrs.CAIIUCAINM || '', // LLAVE CRÍTICA: E01C02
        localidad: attrs.CAIIULOCAL || '',
        upz: '',
        upl: attrs.CAIIUUPLOC || '',
        esCAI: true
      });
    }

    console.log(`✅ ${cais.length} CAIs cargados desde SDSCJ`);
    return cais;

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('⚠️ Error cargando CAIs desde SDSCJ:', (error as Error).message);
    return [];
  }
}

/**
 * Carga Estaciones desde la capa 23 de SDSCJ
 */
async function loadEstacionesFromSDSCJ(): Promise<SDSCJEquipamiento[]> {
  console.log('📥 Cargando Estaciones desde SDSCJ Bogotá (Capa 23)...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      f: 'json',
      resultRecordCount: '100'
    });

    const response = await fetch(`${SDSCJ_ESTACIONES_LAYER}/query?${params}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error || !data.features) {
      return [];
    }

    const estaciones: SDSCJEquipamiento[] = [];

    for (const feature of data.features) {
      const attrs = feature.attributes;
      
      const lat = parseFloat(attrs.EPOLATITUD);
      const lng = parseFloat(attrs.EPOLONGITU);
      
      if (isNaN(lat) || isNaN(lng)) continue;

      estaciones.push({
        objectId: attrs.OBJECTID,
        nombre: attrs.EPONOMBRE || attrs.EPODESCRIP || 'Estación Sin Nombre',
        descripcion: attrs.EPODESCRIP || '',
        direccion: attrs.EPODIR_SITIO || '',
        latitud: lat,
        longitud: lng,
        telefono: attrs.EPOTELEFON || '',
        email: attrs.EPOCELECTR || '',
        horario: attrs.EPOHORARIO || '24 horas',
        tipoEquipamiento: 'Estación',
        codigoEstacionCAI: attrs.EPOIUEPOLI || '', // LLAVE: E15C02
        localidad: attrs.EPOIULOCAL || '',
        upz: attrs.EPOIUUPLAN || '',
        upl: attrs.EPOIUUPLOC || '',
        esCAI: false
      });
    }

    console.log(`✅ ${estaciones.length} Estaciones cargadas desde SDSCJ`);
    return estaciones;

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('⚠️ Error cargando Estaciones desde SDSCJ:', (error as Error).message);
    return [];
  }
}

/**
 * Carga equipamientos (CAIs + Estaciones) con cache
 */
async function loadEquipamientos(): Promise<void> {
  const now = Date.now();
  
  if ((cachedCAIs.length > 0 || cachedEstaciones.length > 0) && (now - lastLoadAttempt) < RELOAD_INTERVAL) {
    return;
  }
  
  lastLoadAttempt = now;

  // Cargar CAIs y Estaciones en paralelo
  const [cais, estaciones] = await Promise.all([
    loadCAIsFromSDSCJ(),
    loadEstacionesFromSDSCJ()
  ]);
  
  if (cais.length > 0) {
    cachedCAIs = cais;
  }
  if (estaciones.length > 0) {
    cachedEstaciones = estaciones;
  }
  
  equipamientosLoaded = cachedCAIs.length > 0 || cachedEstaciones.length > 0;
  console.log(`📊 SDSCJ Total: ${cachedCAIs.length} CAIs + ${cachedEstaciones.length} Estaciones`);
}

/**
 * Parsea el código SIVICC completo según el informe (Sección 2.2)
 * Patrón: UUUUUMNVCCDXXEYY(S/C)ZZNNN
 * 
 * @example "MEBOGMNVCCC01E15C02000033" => {
 *   unidad: "MEBOG",
 *   modelo: "MNVCC",
 *   distrito: "C01", 
 *   estacion: "E15",
 *   cai: "C02",
 *   cuadrante: "000033"
 * }
 */
export function parseSIVICCCode(code: string): {
  unidad?: string;
  modelo?: string;
  distrito?: string;
  estacion?: string;
  cai?: string;
  cuadrante?: string;
  estacionCAI?: string; // Combinado E##C## para join con SDSCJ
} | null {
  if (!code) return null;
  
  const normalized = code.toUpperCase().trim();
  
  // Formato corto de SDSCJ: "E15C02"
  const shortMatch = normalized.match(/^(E\d{2})(C\d{2})?$/);
  if (shortMatch) {
    return {
      estacion: shortMatch[1],
      cai: shortMatch[2],
      estacionCAI: normalized
    };
  }

  // Formato largo SIVICC: "MEBOGMNVCCC01E15C02000033"
  // Patrón mejorado basado en el informe
  const longMatch = normalized.match(
    /^([A-Z]{5})?(MNVCC)?([CDS]\d{2})?(E\d{2})(C\d{2}|S\d{2})?(\d{6})?$/
  );
  
  if (longMatch) {
    const [, unidad, modelo, distrito, estacion, subunidad, cuadrante] = longMatch;
    
    return {
      unidad: unidad,           // MEBOG, DEANT, etc.
      modelo: modelo,           // MNVCC
      distrito: distrito,       // C01, D12, S03
      estacion: estacion,       // E15
      cai: subunidad,           // C02 o S06
      cuadrante: cuadrante,     // 000033
      estacionCAI: estacion + (subunidad || '') // E15C02
    };
  }

  // Fallback: intentar extraer al menos estación
  const estacionMatch = normalized.match(/(E\d{2})/);
  if (estacionMatch) {
    return { estacion: estacionMatch[1] };
  }

  return null;
}

/**
 * Busca un equipamiento (CAI/Estación) por código SIVICC
 * Usa correlación relacional basada en CAIIUCAINM (CAIs) o EPOIUEPOLI (Estaciones)
 */
export async function findEquipamientoByCodigo(codigoSIVICC: string): Promise<SDSCJEquipamiento | null> {
  await loadEquipamientos();
  
  const parsed = parseSIVICCCode(codigoSIVICC);
  if (!parsed) {
    console.log(`⚠️ No se pudo parsear código SIVICC: ${codigoSIVICC}`);
    return null;
  }

  // Construir códigos de búsqueda
  const searchCodes: string[] = [];
  
  if (parsed.estacionCAI) {
    searchCodes.push(parsed.estacionCAI);
  }
  if (parsed.estacion && parsed.cai) {
    searchCodes.push(`${parsed.estacion}${parsed.cai}`);
  }
  if (parsed.estacion) {
    searchCodes.push(parsed.estacion);
  }

  console.log(`🔍 SDSCJ: Buscando con códigos: ${searchCodes.join(', ')} (${cachedCAIs.length} CAIs disponibles)`);

  // 1. Buscar en CAIs primero (prioridad)
  for (const searchCode of searchCodes) {
    const exactCAI = cachedCAIs.find(cai => 
      cai.codigoEstacionCAI.toUpperCase() === searchCode.toUpperCase()
    );
    if (exactCAI) {
      console.log(`✅ SDSCJ: CAI encontrado: ${exactCAI.nombre}`);
      return exactCAI;
    }
  }

  // 2. Buscar CAIs por estación (coincidencia parcial)
  if (parsed.estacion) {
    const caisDeEstacion = cachedCAIs.filter(cai =>
      cai.codigoEstacionCAI.toUpperCase().startsWith(parsed.estacion!)
    );

    if (caisDeEstacion.length > 0) {
      // Si hay código de CAI específico, buscar coincidencia
      if (parsed.cai) {
        const caiEspecifico = caisDeEstacion.find(c => 
          c.codigoEstacionCAI.toUpperCase().includes(parsed.cai!)
        );
        if (caiEspecifico) {
          console.log(`📍 SDSCJ: CAI específico encontrado: ${caiEspecifico.nombre}`);
          return caiEspecifico;
        }
      }
      
      console.log(`📍 SDSCJ: Usando primer CAI de estación ${parsed.estacion}: ${caisDeEstacion[0].nombre}`);
      return caisDeEstacion[0];
    }
  }

  // 3. Fallback: buscar en Estaciones
  for (const searchCode of searchCodes) {
    const estacion = cachedEstaciones.find(est => 
      est.codigoEstacionCAI.toUpperCase().includes(searchCode.toUpperCase())
    );
    if (estacion) {
      console.log(`📍 SDSCJ: Estación encontrada (fallback): ${estacion.nombre}`);
      return estacion;
    }
  }

  return null;
}

/**
 * Busca CAI por ubicación geográfica usando correlación espacial
 */
export async function findEquipamientoByLocation(
  lat: number, 
  lng: number, 
  maxDistanceKm: number = 2
): Promise<SDSCJEquipamiento | null> {
  await loadEquipamientos();

  let nearest: SDSCJEquipamiento | null = null;
  let minDistance = Infinity;

  for (const cai of cachedCAIs) {
    const distance = haversineDistance(lat, lng, cai.latitud, cai.longitud);
    
    if (distance < minDistance && distance <= maxDistanceKm) {
      minDistance = distance;
      nearest = cai;
    }
  }

  return nearest;
}

/**
 * Obtiene la ubicación del CAI para un cuadrante usando la API SDSCJ
 * Implementa la estrategia de correlación relacional del informe
 */
export async function getCAIFromSDSCJ(
  codigoCuadrante: string,
  fallbackLocation?: { lat: number; lng: number }
): Promise<CAILocation | null> {
  // 1. Correlación relacional por código
  const equipamiento = await findEquipamientoByCodigo(codigoCuadrante);
  if (equipamiento) {
    return {
      lat: equipamiento.latitud,
      lng: equipamiento.longitud,
      name: equipamiento.nombre
    };
  }

  // 2. Fallback: correlación espacial
  if (fallbackLocation) {
    const nearest = await findEquipamientoByLocation(
      fallbackLocation.lat, 
      fallbackLocation.lng
    );
    if (nearest) {
      console.log(`📍 SDSCJ: CAI cercano encontrado: ${nearest.nombre}`);
      return {
        lat: nearest.latitud,
        lng: nearest.longitud,
        name: nearest.nombre
      };
    }
  }

  return null;
}

/**
 * Obtiene la Estación de Policía asociada a un código de cuadrante
 */
export async function getEstacionFromSDSCJ(codigoCuadrante: string): Promise<SDSCJEquipamiento | null> {
  await loadEquipamientos();
  
  const parsed = parseSIVICCCode(codigoCuadrante);
  console.log(`🔍 Buscando estación para: ${codigoCuadrante}`, parsed);
  
  if (!parsed?.estacion) {
    console.log('⚠️ No se pudo extraer código de estación');
    return null;
  }

  console.log(`🔍 Estaciones disponibles: ${cachedEstaciones.length}`, 
    cachedEstaciones.map(e => `${e.codigoEstacionCAI}: ${e.nombre}`).slice(0, 5));

  // Buscar estación que coincida con el código de estación
  const estacion = cachedEstaciones.find(est => 
    est.codigoEstacionCAI.toUpperCase().startsWith(parsed.estacion!)
  );

  if (estacion) {
    console.log(`🏛️ SDSCJ: Estación encontrada: ${estacion.nombre} (${estacion.latitud}, ${estacion.longitud})`);
    return estacion;
  }

  console.log(`⚠️ No se encontró estación para código ${parsed.estacion}`);
  return null;
}

/**
 * Obtiene todos los CAIs de Bogotá desde SDSCJ
 */
export async function getAllCAIsFromSDSCJ(): Promise<SDSCJEquipamiento[]> {
  await loadEquipamientos();
  return cachedCAIs;
}

/**
 * Obtiene todas las Estaciones de Bogotá desde SDSCJ
 */
export async function getAllEstacionesFromSDSCJ(): Promise<SDSCJEquipamiento[]> {
  await loadEquipamientos();
  return cachedEstaciones;
}

/**
 * Pre-carga datos de SDSCJ
 */
export async function preloadSDSCJ(): Promise<void> {
  await loadEquipamientos();
}

/**
 * Estadísticas del servicio SDSCJ
 */
export async function getSDSCJStats(): Promise<{
  total: number;
  cais: number;
  estaciones: number;
  loaded: boolean;
}> {
  await loadEquipamientos();
  
  return {
    total: cachedCAIs.length + cachedEstaciones.length,
    cais: cachedCAIs.length,
    estaciones: cachedEstaciones.length,
    loaded: equipamientosLoaded
  };
}

/**
 * Calcula distancia Haversine entre dos puntos (en km)
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
