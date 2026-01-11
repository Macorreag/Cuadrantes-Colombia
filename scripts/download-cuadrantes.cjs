/**
 * Script para descargar todos los cuadrantes de SIPCI_CUADRANTES
 * Servicio funcionando de SIG.PUBLICA - Policía Nacional de Colombia
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../data');
const BASE_URL = 'https://services3.arcgis.com/8cBoM4o6pnuUb1z1/arcgis/rest/services/SIPCI_CUADRANTES/FeatureServer/0/query';
const BATCH_SIZE = 1000; // Max records per request

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 60000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function downloadAllCuadrantes() {
  console.log('🚀 Descargando cuadrantes de SIPCI_CUADRANTES...\n');
  
  // Primero obtener el conteo total
  const countUrl = `${BASE_URL}?where=1%3D1&returnCountOnly=true&f=json`;
  console.log('📊 Obteniendo conteo total...');
  
  const countData = await fetchUrl(countUrl);
  const totalCount = countData.count;
  console.log(`   Total de cuadrantes: ${totalCount}\n`);
  
  // Descargar en lotes
  const allFeatures = [];
  let offset = 0;
  let batchNum = 1;
  
  while (offset < totalCount) {
    const queryUrl = `${BASE_URL}?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson&resultRecordCount=${BATCH_SIZE}&resultOffset=${offset}`;
    
    console.log(`📥 Descargando lote ${batchNum} (${offset} - ${Math.min(offset + BATCH_SIZE, totalCount)})...`);
    
    try {
      const data = await fetchUrl(queryUrl);
      
      if (data.features && data.features.length > 0) {
        allFeatures.push(...data.features);
        console.log(`   ✅ ${data.features.length} cuadrantes descargados (total: ${allFeatures.length})`);
      } else {
        console.log(`   ⚠️ Sin features en este lote`);
      }
      
      offset += BATCH_SIZE;
      batchNum++;
      
      // Pequeña pausa para no saturar el servidor
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.error(`   ❌ Error en lote ${batchNum}: ${error.message}`);
      // Reintentar una vez
      await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await fetchUrl(queryUrl);
        if (data.features) {
          allFeatures.push(...data.features);
          console.log(`   ✅ Reintento exitoso: ${data.features.length} cuadrantes`);
        }
      } catch (e) {
        console.error(`   ❌ Reintento fallido, continuando...`);
      }
      offset += BATCH_SIZE;
      batchNum++;
    }
  }
  
  // Crear GeoJSON final
  const geojson = {
    type: 'FeatureCollection',
    name: 'SIPCI_CUADRANTES_Colombia',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    metadata: {
      source: 'SIG.PUBLICA - Policía Nacional de Colombia',
      service: 'SIPCI_CUADRANTES',
      downloadDate: new Date().toISOString(),
      totalFeatures: allFeatures.length
    },
    features: allFeatures
  };
  
  // Guardar archivo
  const outputPath = path.join(OUTPUT_DIR, 'cuadrantes_colombia.geojson');
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\n✅ Archivo guardado: ${outputPath}`);
  console.log(`   Total de cuadrantes: ${allFeatures.length}`);
  console.log(`   Tamaño: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  // También guardar versión compacta
  const compactPath = path.join(OUTPUT_DIR, 'cuadrantes_colombia.min.geojson');
  fs.writeFileSync(compactPath, JSON.stringify(geojson));
  console.log(`   Versión compacta: ${(fs.statSync(compactPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  return allFeatures.length;
}

// Ejecutar
downloadAllCuadrantes()
  .then(count => {
    console.log(`\n🎉 Descarga completada: ${count} cuadrantes`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
