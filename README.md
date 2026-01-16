<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Cuadrantes Colombia - Sistema de Vigilancia Policial

Sistema interactivo para visualización de cuadrantes de la Policía Nacional de Colombia, incluyendo ubicaciones reales de CAIs (Centros de Atención Inmediata) y personal asignado.

## 🔧 Corrección Importante: Ubicaciones de CAIs

### Problema Anterior
Las coordenadas usadas para la ubicación de los CAIs correspondían a un **punto central (centroide) del cuadrante**, no a la ubicación real del CAI.

### Solución Implementada
Se implementó integración con el **WebMap oficial de ArcGIS** que contiene las ubicaciones reales de los CAIs:
- **Fuente**: https://www.arcgis.com/apps/mapviewer/index.html?webmap=b91ab25a98f1434386c4b88df22f8f25
- **Datos**: 160 CAIs de Bogotá con coordenadas precisas
- **Actualización**: Se cruzan los datos entre la API de cuadrantes y las ubicaciones reales de ArcGIS

### Archivos de Datos Generados
```
public/data/
├── cais_bogota_real.json        # CAIs de Bogotá con ubicación real
├── cais_colombia_arcgis.json    # Todos los CAIs de Colombia
├── estaciones_policia.json      # 21 Estaciones de Policía
└── cais_index_by_cuadrante.json # Índice de CAIs por código de cuadrante
```

### Servicios Actualizados
- `services/caiService.ts` - Nuevo servicio para obtener ubicaciones reales de CAIs desde ArcGIS
- `services/quadrantService.ts` - Integración con caiService para cruzar datos

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Scripts Disponibles

### Actualizar datos de CAIs desde ArcGIS
```bash
node scripts/download-cais-arcgis.cjs
```

### Comparar ubicaciones antiguas vs reales
```bash
node scripts/compare-cai-locations.cjs
```

## API y Fuentes de Datos

El sistema utiliza múltiples fuentes con fallback automático:

1. **API Oficial MNVCC** - Ministerio de Defensa Nacional
2. **API Alternativa SIPCI** - Servicio alternativo de cuadrantes
3. **ArcGIS WebMap** - Ubicaciones reales de CAIs (nuevo)
4. **Datos Offline** - Cache local para funcionamiento sin conexión

View your app in AI Studio: https://ai.studio/apps/drive/1TQk4i3P6atkBrd2tLoKR13zjpdnwvewd
