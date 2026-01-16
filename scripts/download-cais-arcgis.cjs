/**
 * Script para descargar y procesar datos de CAIs desde ArcGIS WebMap
 * 
 * Fuente: https://www.arcgis.com/apps/mapviewer/index.html?webmap=b91ab25a98f1434386c4b88df22f8f25
 * Este WebMap contiene las ubicaciones REALES de los CAIs (Centros de Atención Inmediata)
 * 
 * El problema que resuelve:
 * - Los datos actuales usan coordenadas del centroide del cuadrante
 * - Este script extrae las ubicaciones reales de los CAIs desde ArcGIS
 */

const fs = require('fs');
const path = require('path');

// URL del WebMap de ArcGIS
const ARCGIS_WEBMAP_ID = 'b91ab25a98f1434386c4b88df22f8f25';
const ARCGIS_WEBMAP_DATA_URL = `https://www.arcgis.com/sharing/rest/content/items/${ARCGIS_WEBMAP_ID}/data?f=json`;

/**
 * Convierte coordenadas Web Mercator (EPSG:3857) a WGS84 (EPSG:4326)
 */
function webMercatorToWGS84(x, y) {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return { lat, lng };
}

/**
 * Normaliza el nombre del CAI para comparación
 */
function normalizeCAIName(name) {
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/CAI\s+/gi, 'CAI ')
    .replace(/CUAD\.\s*/gi, 'CUAD. ')
    .trim();
}

/**
 * Extrae datos de CAIs del WebMap
 */
async function extractCAIsFromWebMap() {
  console.log('📥 Descargando datos del WebMap de ArcGIS...');
  console.log(`   URL: ${ARCGIS_WEBMAP_DATA_URL}\n`);

  const response = await fetch(ARCGIS_WEBMAP_DATA_URL);
  if (!response.ok) {
    throw new Error(`Error descargando WebMap: ${response.status}`);
  }

  const webMapData = await response.json();
  
  // Buscar la capa de CAIs (ComandoAtencionInmediata)
  const caiLayer = webMapData.operationalLayers.find(layer => 
    layer.title === 'ComandoAtencionInmediata' || 
    layer.title?.toLowerCase().includes('cai')
  );

  if (!caiLayer) {
    throw new Error('No se encontró la capa de CAIs en el WebMap');
  }

  console.log(`✅ Capa encontrada: ${caiLayer.title}`);
  
  const features = caiLayer.featureCollection?.layers?.[0]?.featureSet?.features || [];
  console.log(`   Total de CAIs encontrados: ${features.length}\n`);

  // Procesar cada CAI
  const cais = [];
  const caiBogota = []; // CAIs específicos de Bogotá

  for (const feature of features) {
    const attrs = feature.attributes;
    const geom = feature.geometry;

    // Usar coordenadas del atributo si están disponibles
    let lat = attrs.CAILATITUD;
    let lng = attrs.CAILONGITU;

    // Si no hay coordenadas en atributos, convertir de Web Mercator
    if ((!lat || !lng) && geom) {
      const converted = webMercatorToWGS84(geom.x, geom.y);
      lat = converted.lat;
      lng = converted.lng;
    }

    if (!lat || !lng) {
      console.warn(`⚠️ CAI sin coordenadas: ${attrs.CAIDESCRIP}`);
      continue;
    }

    const caiData = {
      id: attrs.CAIIDENTIF || `CAI_${attrs.FID}`,
      nombre: attrs.CAIDESCRIP || attrs.CAIIEPOLIC || 'CAI Sin Nombre',
      direccion: attrs.CAIDIR_SIT || '',
      telefono: attrs.CAITELEFON || '',
      email: attrs.CAICELECTR || '',
      horario: attrs.CAIHORARIO || attrs.CAITURNO || '24 Horas',
      codigoCuadrante: attrs.CAICPOLICI || '',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      localidad: attrs.CAIIULOCAL || '',
      upz: attrs.CAIIUUPLAN || ''
    };

    cais.push(caiData);

    // Filtrar CAIs de Bogotá (latitud entre 4.4 y 4.9, longitud entre -74.3 y -73.9)
    if (lat >= 4.4 && lat <= 4.9 && lng >= -74.3 && lng <= -73.9) {
      caiBogota.push(caiData);
    }
  }

  console.log(`📍 CAIs procesados exitosamente:`);
  console.log(`   - Total Colombia: ${cais.length}`);
  console.log(`   - Solo Bogotá: ${caiBogota.length}\n`);

  return { cais, caiBogota };
}

/**
 * Extrae datos de Estaciones de Policía
 */
async function extractEstacionesFromWebMap() {
  console.log('📥 Descargando datos de Estaciones de Policía...');

  const response = await fetch(ARCGIS_WEBMAP_DATA_URL);
  const webMapData = await response.json();
  
  const estacionLayer = webMapData.operationalLayers.find(layer => 
    layer.title === 'EstacionPolicia' || 
    layer.title?.toLowerCase().includes('estacion')
  );

  if (!estacionLayer) {
    console.warn('⚠️ No se encontró la capa de Estaciones de Policía');
    return [];
  }

  const features = estacionLayer.featureCollection?.layers?.[0]?.featureSet?.features || [];
  console.log(`✅ Estaciones encontradas: ${features.length}\n`);

  const estaciones = [];

  for (const feature of features) {
    const attrs = feature.attributes;
    
    let lat = attrs.EPOLATITUD;
    let lng = attrs.EPOLONGITU;

    if (!lat || !lng) {
      const geom = feature.geometry;
      if (geom) {
        const converted = webMercatorToWGS84(geom.x, geom.y);
        lat = converted.lat;
        lng = converted.lng;
      }
    }

    if (!lat || !lng) continue;

    estaciones.push({
      id: attrs.EPOIDENTIF || `EPO_${attrs.FID}`,
      nombre: attrs.EPONOMBRE || attrs.EPODESCRIP || 'Estación Sin Nombre',
      direccion: attrs.EPODIR_SIT || '',
      telefono: attrs.EPOTELEFON || '',
      email: attrs.EPOCELECTR || '',
      horario: attrs.EPOHORARIO || '24 horas',
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      localidad: attrs.EPOIULOCAL || '',
      upz: attrs.EPOIUUPLAN || ''
    });
  }

  return estaciones;
}

/**
 * Genera archivo JSON con todos los datos
 */
async function generateDataFiles() {
  try {
    const { cais, caiBogota } = await extractCAIsFromWebMap();
    const estaciones = await extractEstacionesFromWebMap();

    // Crear directorio de salida si no existe
    const outputDir = path.join(__dirname, '..', 'public', 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Guardar CAIs de Bogotá (formato optimizado para la app)
    const caisBogotaPath = path.join(outputDir, 'cais_bogota_real.json');
    fs.writeFileSync(caisBogotaPath, JSON.stringify(caiBogota, null, 2));
    console.log(`✅ Guardado: ${caisBogotaPath}`);
    console.log(`   (${caiBogota.length} CAIs de Bogotá con ubicación real)\n`);

    // Guardar todos los CAIs de Colombia
    const caisColombiaPath = path.join(outputDir, 'cais_colombia_arcgis.json');
    fs.writeFileSync(caisColombiaPath, JSON.stringify(cais, null, 2));
    console.log(`✅ Guardado: ${caisColombiaPath}`);
    console.log(`   (${cais.length} CAIs de Colombia)\n`);

    // Guardar estaciones de policía
    const estacionesPath = path.join(outputDir, 'estaciones_policia.json');
    fs.writeFileSync(estacionesPath, JSON.stringify(estaciones, null, 2));
    console.log(`✅ Guardado: ${estacionesPath}`);
    console.log(`   (${estaciones.length} Estaciones de Policía)\n`);

    // Crear archivo combinado con índice por código de cuadrante
    const caiIndex = {};
    for (const cai of cais) {
      if (cai.codigoCuadrante) {
        caiIndex[cai.codigoCuadrante] = {
          lat: cai.lat,
          lng: cai.lng,
          nombre: cai.nombre,
          direccion: cai.direccion,
          telefono: cai.telefono
        };
      }
    }

    const indexPath = path.join(outputDir, 'cais_index_by_cuadrante.json');
    fs.writeFileSync(indexPath, JSON.stringify(caiIndex, null, 2));
    console.log(`✅ Guardado: ${indexPath}`);
    console.log(`   (Índice de ${Object.keys(caiIndex).length} CAIs por código de cuadrante)\n`);

    // Estadísticas
    console.log('📊 Resumen:');
    console.log('═'.repeat(50));
    console.log(`   Total CAIs Colombia:     ${cais.length}`);
    console.log(`   CAIs Bogotá:             ${caiBogota.length}`);
    console.log(`   Estaciones de Policía:   ${estaciones.length}`);
    console.log(`   CAIs con código cuad.:   ${Object.keys(caiIndex).length}`);
    console.log('═'.repeat(50));

    return { cais, caiBogota, estaciones, caiIndex };

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Ejecutar si es el script principal
if (require.main === module) {
  generateDataFiles()
    .then(() => {
      console.log('\n✅ Proceso completado exitosamente');
    })
    .catch(error => {
      console.error('\n❌ Error en el proceso:', error);
      process.exit(1);
    });
}

module.exports = { extractCAIsFromWebMap, extractEstacionesFromWebMap, generateDataFiles };
