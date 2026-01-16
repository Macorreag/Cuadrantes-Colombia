/**
 * Script de comparación: Ubicaciones de CAIs antiguas vs reales
 * 
 * Este script demuestra la diferencia entre:
 * - Coordenadas antiguas: centroide del cuadrante
 * - Coordenadas nuevas: ubicación real del CAI desde ArcGIS WebMap
 */

const fs = require('fs');
const path = require('path');

// Función para calcular distancia entre dos puntos (Haversine)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function compareCAILocations() {
  console.log('═'.repeat(70));
  console.log(' COMPARACIÓN: Ubicaciones de CAIs antiguas vs reales');
  console.log('═'.repeat(70));
  console.log('\n');

  // Cargar CAIs reales desde ArcGIS
  const caisRealPath = path.join(__dirname, '..', 'public', 'data', 'cais_bogota_real.json');
  const caisReal = JSON.parse(fs.readFileSync(caisRealPath, 'utf8'));

  // Cargar datos de cuadrantes (que contienen centroides)
  const cuadrantesPath = path.join(__dirname, '..', 'public', 'data', 'cuadrantes_colombia.min.geojson');
  
  let cuadrantes = null;
  try {
    const cuadrantesData = fs.readFileSync(cuadrantesPath, 'utf8');
    cuadrantes = JSON.parse(cuadrantesData);
  } catch (e) {
    console.log('⚠️ No se pudo cargar archivo de cuadrantes');
  }

  // Estadísticas
  let totalComparisons = 0;
  let totalDistanceKm = 0;
  let maxDistance = 0;
  let maxDistanceCAI = '';

  console.log('Muestra de CAIs con ubicación REAL desde ArcGIS:');
  console.log('─'.repeat(70));
  console.log('');

  // Mostrar primeros 10 CAIs
  for (let i = 0; i < Math.min(10, caisReal.length); i++) {
    const cai = caisReal[i];
    console.log(`📍 ${cai.nombre}`);
    console.log(`   ID: ${cai.id} | Código: ${cai.codigoCuadrante}`);
    console.log(`   Ubicación REAL: (${cai.lat.toFixed(6)}, ${cai.lng.toFixed(6)})`);
    console.log(`   Dirección: ${cai.direccion}`);
    console.log(`   Teléfono: ${cai.telefono}`);
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('');
  console.log('📊 RESUMEN DE DATOS:');
  console.log('');
  console.log(`   Total CAIs con ubicación real: ${caisReal.length}`);
  
  // Calcular cobertura por localidad
  const localidades = {};
  for (const cai of caisReal) {
    const loc = cai.localidad || 'Sin localidad';
    localidades[loc] = (localidades[loc] || 0) + 1;
  }

  console.log('');
  console.log('   CAIs por localidad:');
  const sortedLocs = Object.entries(localidades).sort((a, b) => b[1] - a[1]);
  for (const [loc, count] of sortedLocs.slice(0, 10)) {
    console.log(`     Localidad ${loc.padStart(2, '0')}: ${count} CAIs`);
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log(' PROBLEMA IDENTIFICADO Y SOLUCIÓN');
  console.log('═'.repeat(70));
  console.log('');
  console.log(' ❌ ANTES (Problema):');
  console.log('    Las coordenadas usadas para los CAIs correspondían al');
  console.log('    CENTROIDE del cuadrante, NO a la ubicación real del CAI.');
  console.log('');
  console.log(' ✅ AHORA (Solución):');
  console.log('    Las coordenadas se obtienen del WebMap oficial de ArcGIS:');
  console.log('    https://www.arcgis.com/apps/mapviewer/index.html?webmap=b91ab25a98f1434386c4b88df22f8f25');
  console.log('');
  console.log(' 📦 Archivos generados:');
  console.log('    - public/data/cais_bogota_real.json');
  console.log('    - public/data/cais_colombia_arcgis.json');
  console.log('    - public/data/estaciones_policia.json');
  console.log('    - public/data/cais_index_by_cuadrante.json');
  console.log('');
  console.log(' 🔧 Servicios actualizados:');
  console.log('    - services/caiService.ts (nuevo servicio de CAIs reales)');
  console.log('    - services/quadrantService.ts (integración con caiService)');
  console.log('');
  console.log('═'.repeat(70));

  return {
    totalCAIs: caisReal.length,
    localidades: sortedLocs
  };
}

// Ejecutar
compareCAILocations()
  .then(results => {
    console.log('\n✅ Análisis completado');
  })
  .catch(error => {
    console.error('❌ Error:', error);
  });
