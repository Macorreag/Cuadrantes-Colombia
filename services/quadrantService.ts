/**
 * Servicio de Cuadrantes con Fallback
 * Primero intenta la API oficial, si falla usa datos offline
 * 
 * IMPORTANTE: Las ubicaciones de CAIs ahora se obtienen desde el servicio caiService.ts
 * que usa datos reales de ArcGIS WebMap, no del centroide del cuadrante.
 */

import { QuadrantData, CAILocation } from '../types';
import * as turf from '@turf/turf';
import { getCAILocationForQuadrant, preloadCAIs, getEstacionFromSDSCJ } from './caiService';

// URLs de la API oficial
const MNVCC_BASE_URL = "https://utility.arcgis.com/usrsvcs/servers/79feadae6f374b1882eb87e6983e8452/rest/services/CAPAS/MNVCC_CUADRANTES/FeatureServer";
const MNVCC_GEOMETRY_URL = `${MNVCC_BASE_URL}/1/query`;
const MNVCC_PERSONNEL_URL = `${MNVCC_BASE_URL}/0/query`;

// URLs alternativas (servicios que sí funcionan)
const SIPCI_CUADRANTES_URL = "https://services3.arcgis.com/8cBoM4o6pnuUb1z1/arcgis/rest/services/SIPCI_CUADRANTES/FeatureServer/0/query";
const MNVCC_POLICIA_URL = "https://services3.arcgis.com/8cBoM4o6pnuUb1z1/arcgis/rest/services/MNVCC_Policia/FeatureServer/0/query";

// Cache de datos offline
let offlineCuadrantes: any = null;
let offlinePersonal: any = null;
let isOfflineMode = false;
let lastOnlineCheck = 0;
const ONLINE_CHECK_INTERVAL = 60000; // Verificar cada 60 segundos

/**
 * Carga los datos offline desde archivos locales
 */
async function loadOfflineData(): Promise<void> {
  if (offlineCuadrantes && offlinePersonal) return;

  try {
    const [cuadrantesRes, personalRes] = await Promise.all([
      fetch('/data/cuadrantes_colombia.min.geojson').catch(() => null),
      fetch('/data/personal_policia_simple.json').catch(() => null)
    ]);

    if (cuadrantesRes?.ok) {
      offlineCuadrantes = await cuadrantesRes.json();
      console.log(`📦 Cuadrantes offline cargados: ${offlineCuadrantes.features?.length || 0}`);
    }

    if (personalRes?.ok) {
      offlinePersonal = await personalRes.json();
      console.log(`📦 Personal offline cargado: ${offlinePersonal.length || 0}`);
    }
  } catch (error) {
    console.warn('⚠️ No se pudieron cargar datos offline locales');
  }
}

/**
 * Verifica si la API oficial está disponible
 */
async function checkOnlineStatus(): Promise<boolean> {
  const now = Date.now();
  if (now - lastOnlineCheck < ONLINE_CHECK_INTERVAL) {
    return !isOfflineMode;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${MNVCC_BASE_URL}?f=json`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (!data.error) {
        isOfflineMode = false;
        lastOnlineCheck = now;
        console.log('🟢 API oficial disponible');
        return true;
      }
    }
  } catch (error) {
    // API no disponible
  }

  isOfflineMode = true;
  lastOnlineCheck = now;
  console.log('🔴 API oficial no disponible, usando modo offline');
  return false;
}

/**
 * Procesa los datos de personal para formato consistente
 */
function processPersonnel(personnelFeatures: any[]): any[] {
  const seen = new Set();
  return personnelFeatures
    .map(f => f.properties || f)
    .filter(props => {
      const empleado = props.EMPLEADO || props.nombre;
      const telefono = props.TELEFONO || props.telefono;
      const id = `${empleado}-${telefono}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return empleado && empleado !== "null";
    })
    .map(props => {
      const name = (props.EMPLEADO || props.nombre || '').toUpperCase();
      const rangeMatch = name.match(/^(PT|SI|IT|CT|MY|TE|ST|AG)\.?\s/);
      const initials = rangeMatch ? rangeMatch[1] : name.substring(0, 2);
      const phone = props.TELEFONO || props.telefono;

      return {
        name: name,
        phone: (phone && phone !== "0") ? phone : "S/N",
        initials: initials
      };
    });
}

/**
 * Extrae jerarquía MNVCC de un código de cuadrante
 * Basado en el informe técnico - Sección 2.2 (Código SIVICC)
 * Patrón: UUUUUMNVCCDXXEYY(S/C)ZZNNN
 */
function extractJerarquia(codigoCuadrante: string, props: Record<string, any>): {
  departamento?: string;
  estacion?: string;
  codigoEstacion?: string;
  codigoCAI?: string;
  telefonoCuadrante?: string;
} {
  const result: ReturnType<typeof extractJerarquia> = {};
  
  // Intentar extraer desde el código SIVICC
  const normalized = codigoCuadrante.toUpperCase().trim();
  
  // Patrón completo SIVICC
  const siviccMatch = normalized.match(
    /^([A-Z]{5})?(MNVCC)?([CDS]\d{2})?(E\d{2})(C\d{2}|S\d{2})?(\d{6})?$/
  );
  
  if (siviccMatch) {
    const [, unidad, , distrito, estacion, cai] = siviccMatch;
    
    // Mapear códigos de unidad a nombres de departamento
    const unidadToDepto: Record<string, string> = {
      'MEBOG': 'METROPOLITANA DE BOGOTA',
      'DEANT': 'DEPARTAMENTO DE POLICIA ANTIOQUIA',
      'MEAME': 'METROPOLITANA DEL VALLE DE ABURRA',
      'MECAL': 'METROPOLITANA DE SANTIAGO DE CALI',
      'MEBAR': 'METROPOLITANA DE BARRANQUILLA',
      'DEBUC': 'DEPARTAMENTO DE POLICIA BUCARAMANGA',
      'DEAMA': 'DEPARTAMENTO DE POLICIA AMAZONAS'
    };
    
    if (unidad) {
      result.departamento = unidadToDepto[unidad] || unidad;
    }
    
    result.codigoEstacion = estacion;
    result.codigoCAI = cai;
  }
  
  // Complementar desde propiedades de la API
  if (props.UNIDAD && !result.estacion) {
    result.estacion = props.UNIDAD;
  }
  if (props.DEPARTAMENTO && !result.departamento) {
    result.departamento = props.DEPARTAMENTO;
  }
  if (props.TELEFONO_CUAD || props.TELEFONO) {
    result.telefonoCuadrante = props.TELEFONO_CUAD || props.TELEFONO;
  }
  
  return result;
}

/**
 * Busca cuadrante en la API oficial
 */
async function fetchFromOfficialAPI(lat: number, lng: number): Promise<{ geometry: any; quadrant: QuadrantData } | null> {
  const geomParams = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: '*',
    geometryType: 'esriGeometryPoint',
    geometry: `${lng},${lat}`,
    spatialRel: 'esriSpatialRelIntersects',
    inSr: '4326',
    outSr: '4326',
    returnGeometry: 'true'
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const geomRes = await fetch(`${MNVCC_GEOMETRY_URL}?${geomParams.toString()}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!geomRes.ok) throw new Error('API response not ok');
    
    const geomData = await geomRes.json();
    
    if (geomData.error) throw new Error(geomData.error.message);
    if (!geomData.features || geomData.features.length === 0) return null;

    const mainProps = geomData.features[0].properties;
    const quadrantId = mainProps.COD_CUAD_P || mainProps.NRO_CUADRANTE || mainProps.NRO_CUADRA;

    let caiName = (
      mainProps.NOMBRE_CUADRA ||
      mainProps.NOMBRE_CAI ||
      mainProps.CAI ||
      mainProps.NOM_CAI ||
      "CAI SECTORIAL"
    ).toUpperCase();

    // Obtener personal
    const personnelParams = new URLSearchParams({
      f: 'geojson',
      where: `NRO_CUADRA = '${quadrantId}'`,
      outFields: '*',
      returnGeometry: 'false'
    });

    const personnelRes = await fetch(`${MNVCC_PERSONNEL_URL}?${personnelParams.toString()}`);
    const personnelData = await personnelRes.json();

    if (caiName === "CAI SECTORIAL" && personnelData.features?.length > 0) {
      const firstPers = personnelData.features[0].properties;
      if (firstPers.NOMBRE_CUADRA) {
        caiName = firstPers.NOMBRE_CUADRA.toUpperCase();
      }
    }

    const officersList = processPersonnel(personnelData.features || []);

    // Usar coordenadas REALES del CAI desde la arquitectura de fusión de datos
    let caiLocation: CAILocation | undefined;
    let dataSource: 'SDSCJ' | 'WebMap' | 'SODA' | 'Fallback' | 'API' = 'API';
    
    // Calcular centro del cuadrante para búsqueda de CAI cercano
    const quadrantCenter = geomData.features[0].geometry ? 
      turf.centroid(geomData.features[0]).geometry.coordinates : null;
    
    // Buscar ubicación real del CAI usando arquitectura de fusión
    caiLocation = await getCAILocationForQuadrant(
      quadrantId,
      quadrantCenter ? { lat: quadrantCenter[1], lng: quadrantCenter[0] } : undefined
    );
    
    if (caiLocation) {
      // Detectar fuente basándonos en los logs (la arquitectura lo maneja internamente)
      dataSource = quadrantId.toUpperCase().includes('MEBOG') ? 'SDSCJ' : 'WebMap';
    }

    // Fallback: usar coordenadas de la API oficial si no se encuentra
    if (!caiLocation && mainProps.LATITUD && mainProps.LONGITUD) {
      caiLocation = {
        lat: parseFloat(mainProps.LATITUD),
        lng: parseFloat(mainProps.LONGITUD),
        name: caiName
      };
      dataSource = 'API';
      console.log(`📍 CAI ubicado desde API oficial (fallback): (${caiLocation.lat}, ${caiLocation.lng})`);
    } else if (!caiLocation) {
      // Si no hay coordenadas en el API, buscar en personal offline
      await loadOfflineData();
      caiLocation = findCAILocationFromPersonnel(quadrantId);
      dataSource = 'Fallback';
      if (!caiLocation) {
        console.log('⚠️ Sin coordenadas disponibles para CAI');
      }
    }

    // Extraer jerarquía del código SIVICC
    const jerarquia = extractJerarquia(quadrantId, mainProps);

    // Obtener información de la Estación de Policía asociada
    let estacionPolicia: QuadrantData['estacionPolicia'];
    try {
      const estacion = await getEstacionFromSDSCJ(quadrantId);
      console.log('📊 [Official] Estación obtenida:', estacion);
      if (estacion) {
        estacionPolicia = {
          nombre: estacion.nombre,
          direccion: estacion.direccion,
          telefono: estacion.telefono,
          email: estacion.email,
          lat: estacion.latitud,
          lng: estacion.longitud
        };
        console.log('📊 [Official] estacionPolicia mapeada:', estacionPolicia);
      }
    } catch (e) {
      console.warn('⚠️ No se pudo obtener estación de policía', e);
    }

    return {
      geometry: geomData,
      quadrant: {
        id: quadrantId,
        name: caiName,
        cai: caiName,
        officers: officersList,
        caiLocation: caiLocation,
        estacionPolicia: estacionPolicia,
        jerarquia: jerarquia,
        dataSource: dataSource
      }
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Busca cuadrante en el servicio alternativo SIPCI
 */
async function fetchFromAlternativeAPI(lat: number, lng: number): Promise<{ geometry: any; quadrant: QuadrantData } | null> {
  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: '*',
    geometryType: 'esriGeometryPoint',
    geometry: `${lng},${lat}`,
    spatialRel: 'esriSpatialRelIntersects',
    inSr: '4326',
    outSr: '4326',
    returnGeometry: 'true'
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${SIPCI_CUADRANTES_URL}?${params.toString()}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Alternative API not available');
    
    const data = await response.json();
    if (data.error || !data.features?.length) return null;

    const props = data.features[0].properties;
    const quadrantId = props.NRO_CUADRANTE || props.CUAD;

    // Buscar personal en el servicio alternativo
    const personalParams = new URLSearchParams({
      f: 'geojson',
      where: `NRO_CUADRA LIKE '%${quadrantId.split('-').pop()}%'`,
      outFields: '*',
      returnGeometry: 'false',
      resultRecordCount: '20'
    });

    let officers: any[] = [];
    try {
      const personalRes = await fetch(`${MNVCC_POLICIA_URL}?${personalParams.toString()}`);
      const personalData = await personalRes.json();
      if (personalData.features) {
        officers = processPersonnel(personalData.features);
      }
    } catch (e) {
      console.warn('No se pudo obtener personal del servicio alternativo');
    }

    // Usar coordenadas REALES del CAI desde la arquitectura de fusión
    let caiLocation: CAILocation | undefined;
    let dataSource: 'SDSCJ' | 'WebMap' | 'SODA' | 'Fallback' | 'API' = 'API';
    
    // Calcular centro del cuadrante para búsqueda de CAI cercano
    const quadrantCenter = data.features?.[0]?.geometry ? 
      turf.centroid(data.features[0]).geometry.coordinates : null;
    
    // Buscar ubicación real del CAI usando arquitectura de fusión
    caiLocation = await getCAILocationForQuadrant(
      quadrantId,
      quadrantCenter ? { lat: quadrantCenter[1], lng: quadrantCenter[0] } : undefined
    );
    
    if (caiLocation) {
      dataSource = quadrantId.toUpperCase().includes('MEBOG') ? 'SDSCJ' : 'WebMap';
    }
    
    // Fallback: usar coordenadas de la API si no se encuentra
    if (!caiLocation && props.LATITUD && props.LONGITUD) {
      caiLocation = {
        lat: parseFloat(props.LATITUD),
        lng: parseFloat(props.LONGITUD),
        name: props.DESCRIPCION || props.CUAD || 'CAI'
      };
      dataSource = 'API';
      console.log(`📍 CAI ubicado desde API (fallback): (${caiLocation.lat}, ${caiLocation.lng})`);
    } else if (!caiLocation) {
      // Si no hay coordenadas en el API, buscar en personal offline
      await loadOfflineData();
      caiLocation = findCAILocationFromPersonnel(quadrantId);
      dataSource = 'Fallback';
      if (!caiLocation) {
        console.log('⚠️ Sin coordenadas disponibles para CAI');
      }
    }

    // Extraer jerarquía del código SIVICC
    const jerarquia = extractJerarquia(quadrantId, props);

    // Obtener información de la Estación de Policía asociada
    let estacionPolicia: QuadrantData['estacionPolicia'];
    try {
      const estacion = await getEstacionFromSDSCJ(quadrantId);
      console.log('📊 [Alternative] Estación obtenida:', estacion);
      if (estacion) {
        estacionPolicia = {
          nombre: estacion.nombre,
          direccion: estacion.direccion,
          telefono: estacion.telefono,
          email: estacion.email,
          lat: estacion.latitud,
          lng: estacion.longitud
        };
        console.log('📊 [Alternative] estacionPolicia mapeada:', estacionPolicia);
      }
    } catch (e) {
      console.warn('⚠️ No se pudo obtener estación de policía', e);
    }

    return {
      geometry: data,
      quadrant: {
        id: quadrantId,
        name: props.DESCRIPCION || props.CUAD || 'Cuadrante',
        cai: props.DESCRIPCION || props.CUAD || 'CAI',
        officers: officers,
        caiLocation: caiLocation,
        estacionPolicia: estacionPolicia,
        jerarquia: jerarquia,
        dataSource: dataSource
      }
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Verifica si dos identificadores de cuadrante coinciden exactamente
 */
function matchesQuadrantId(personnelCuadrante: string | undefined, quadrantId: string): boolean {
  if (!personnelCuadrante) return false;
  
  // Normalizar ambos identificadores
  const normalizedPersonnel = personnelCuadrante.trim().toUpperCase();
  const normalizedQuadrant = quadrantId.trim().toUpperCase();
  
  // Coincidencia exacta
  if (normalizedPersonnel === normalizedQuadrant) return true;
  
  // Extraer sufijos y comparar exactamente
  const personnelSuffix = normalizedPersonnel.split('-').pop() || '';
  const quadrantSuffix = normalizedQuadrant.split('-').pop() || '';
  
  // Solo coincide si los sufijos son exactamente iguales
  return personnelSuffix === quadrantSuffix && personnelSuffix !== '';
}

/**
 * Encuentra las coordenadas del CAI en el personal offline
 */
function findCAILocationFromPersonnel(quadrantId: string): CAILocation | undefined {
  if (!offlinePersonal) return undefined;

  // Buscar personal que coincida exactamente con este cuadrante
  const match = offlinePersonal.find((p: any) => 
    matchesQuadrantId(p.cuadrante, quadrantId) && p.lat && p.lng
  );

  if (match) {
    console.log(`📍 CAI encontrado desde personal: ${match.cai} (${match.lat}, ${match.lng})`);
    return {
      lat: match.lat,
      lng: match.lng,
      name: match.cai || 'CAI'
    };
  }

  return undefined;
}

/**
 * Busca cuadrante en los datos offline usando geometría
 */
async function fetchFromOfflineData(lat: number, lng: number): Promise<{ geometry: any; quadrant: QuadrantData } | null> {
  await loadOfflineData();

  if (!offlineCuadrantes?.features) {
    console.warn('⚠️ Datos offline de cuadrantes no disponibles');
    return null;
  }

  const point = turf.point([lng, lat]);

  // Buscar el cuadrante que contiene el punto
  for (const feature of offlineCuadrantes.features) {
    try {
      if (turf.booleanPointInPolygon(point, feature)) {
        const props = feature.properties;
        const quadrantId = props.NRO_CUADRANTE || props.CUAD;

        // Buscar personal asociado
        let officers: any[] = [];
        let caiLocation: CAILocation | undefined;

        // Calcular centro del cuadrante para búsqueda de CAI
        const quadrantCenter = feature.geometry ? 
          turf.centroid(feature).geometry.coordinates : null;

        // 1. Buscar ubicación REAL del CAI desde ArcGIS
        caiLocation = await getCAILocationForQuadrant(
          quadrantId,
          quadrantCenter ? { lat: quadrantCenter[1], lng: quadrantCenter[0] } : undefined
        );

        // 2. Fallback: coordenadas del cuadrante (centroide, no recomendado)
        if (!caiLocation && props.LATITUD && props.LONGITUD) {
          caiLocation = {
            lat: parseFloat(props.LATITUD),
            lng: parseFloat(props.LONGITUD),
            name: props.DESCRIPCION || props.CUAD || 'CAI'
          };
          console.log(`📍 CAI ubicado desde propiedades (fallback): ${caiLocation.name}`);
        }

        // Procesar personal
        if (offlinePersonal) {
          const matchingPersonnel = offlinePersonal.filter((p: any) => 
            matchesQuadrantId(p.cuadrante, quadrantId) ||
            matchesQuadrantId(p.cai, quadrantId)
          );
          officers = processPersonnel(matchingPersonnel);

          // 3. Fallback final: obtener coordenadas del personal si no hay del CAI
          if (!caiLocation) {
            const personnelWithCoords = matchingPersonnel.find((p: any) => p.lat && p.lng);
            if (personnelWithCoords) {
              caiLocation = {
                lat: personnelWithCoords.lat,
                lng: personnelWithCoords.lng,
                name: personnelWithCoords.cai || props.DESCRIPCION || 'CAI'
              };
              console.log(`📍 CAI ubicado desde personal (fallback): ${caiLocation.name}`);
            }
          }
        }

        return {
          geometry: {
            type: 'FeatureCollection',
            features: [feature]
          },
          quadrant: {
            id: quadrantId,
            name: props.DESCRIPCION || props.CUAD || 'Cuadrante',
            cai: props.DESCRIPCION || props.CUAD || 'CAI',
            officers: officers,
            caiLocation: caiLocation
          }
        };
      }
    } catch (e) {
      // Continuar con el siguiente feature si hay error de geometría
    }
  }

  return null;
}

/**
 * Función principal: busca cuadrante con fallback automático
 */
export async function fetchQuadrantWithFallback(
  lat: number, 
  lng: number
): Promise<{ geometry: any; quadrant: QuadrantData; source: 'official' | 'alternative' | 'offline' } | null> {
  
  // 1. Intentar API oficial
  try {
    console.log('🔍 Intentando API oficial...');
    const result = await fetchFromOfficialAPI(lat, lng);
    if (result) {
      console.log('✅ Datos obtenidos de API oficial');
      return { ...result, source: 'official' };
    }
  } catch (error) {
    console.warn('⚠️ API oficial falló:', (error as Error).message);
  }

  // 2. Intentar API alternativa (SIPCI)
  try {
    console.log('🔍 Intentando API alternativa (SIPCI)...');
    const result = await fetchFromAlternativeAPI(lat, lng);
    if (result) {
      console.log('✅ Datos obtenidos de API alternativa');
      return { ...result, source: 'alternative' };
    }
  } catch (error) {
    console.warn('⚠️ API alternativa falló:', (error as Error).message);
  }

  // 3. Usar datos offline
  try {
    console.log('🔍 Usando datos offline...');
    const result = await fetchFromOfflineData(lat, lng);
    if (result) {
      console.log('✅ Datos obtenidos de cache offline');
      return { ...result, source: 'offline' };
    }
  } catch (error) {
    console.warn('⚠️ Búsqueda offline falló:', (error as Error).message);
  }

  console.log('❌ No se encontró cuadrante en ninguna fuente');
  return null;
}

/**
 * Obtener el estado actual de la conexión
 */
export function getConnectionStatus(): 'online' | 'alternative' | 'offline' {
  if (!isOfflineMode) return 'online';
  return 'offline';
}

/**
 * Pre-cargar datos offline para mejor rendimiento
 */
export async function preloadOfflineData(): Promise<void> {
  await Promise.all([
    loadOfflineData(),
    preloadCAIs() // También pre-cargar CAIs reales de ArcGIS
  ]);
}

export { processPersonnel };
