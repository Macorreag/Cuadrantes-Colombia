/**
 * Script para descargar personal policial de MNVCC_Policia
 * Servicio funcionando de SIG.PUBLICA - Policía Nacional de Colombia
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../data');
const BASE_URL = 'https://services3.arcgis.com/8cBoM4o6pnuUb1z1/arcgis/rest/services/MNVCC_Policia/FeatureServer/0/query';
const BATCH_SIZE = 2000; // Max records per request

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

async function downloadPersonal() {
  console.log('🚀 Descargando personal policial de MNVCC_Policia...\n');
  
  // Primero obtener el conteo total
  const countUrl = `${BASE_URL}?where=1%3D1&returnCountOnly=true&f=json`;
  console.log('📊 Obteniendo conteo total...');
  
  const countData = await fetchUrl(countUrl);
  const totalCount = countData.count;
  console.log(`   Total de policías: ${totalCount}\n`);
  
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
        console.log(`   ✅ ${data.features.length} policías descargados (total: ${allFeatures.length})`);
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
          console.log(`   ✅ Reintento exitoso: ${data.features.length} policías`);
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
    name: 'MNVCC_Personal_Policia_Colombia',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    metadata: {
      source: 'SIG.PUBLICA - Policía Nacional de Colombia',
      service: 'MNVCC_Policia',
      downloadDate: new Date().toISOString(),
      totalFeatures: allFeatures.length,
      fields: ['NRO_CUADRA', 'EMPLEADO', 'TELEFONO', 'NOMBRE_CUA']
    },
    features: allFeatures
  };
  
  // Guardar archivo
  const outputPath = path.join(OUTPUT_DIR, 'personal_policia.geojson');
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\n✅ Archivo guardado: ${outputPath}`);
  console.log(`   Total de policías: ${allFeatures.length}`);
  console.log(`   Tamaño: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  // También crear un JSON simplificado solo con datos esenciales
  const simplifiedData = allFeatures.map(f => ({
    cuadrante: f.properties.NRO_CUADRA,
    nombre: f.properties.EMPLEADO,
    telefono: f.properties.TELEFONO,
    cai: f.properties.NOMBRE_CUA,
    lat: f.geometry?.coordinates?.[1],
    lng: f.geometry?.coordinates?.[0]
  }));
  
  const simplifiedPath = path.join(OUTPUT_DIR, 'personal_policia_simple.json');
  fs.writeFileSync(simplifiedPath, JSON.stringify(simplifiedData, null, 2));
  console.log(`   Versión simplificada: ${(fs.statSync(simplifiedPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  return allFeatures.length;
}

// Ejecutar
downloadPersonal()
  .then(count => {
    console.log(`\n🎉 Descarga completada: ${count} policías`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
