
import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { DARK_MAP_STYLE, BOGOTA_CENTER } from './constants';
import { QuadrantData, CAILocation } from './types';
import QuadrantPanel from './components/QuadrantPanel';
import BottomBar from './components/BottomBar';
import { fetchQuadrantWithFallback, preloadOfflineData } from './services/quadrantService';

// Tipo de fuente de datos
type DataSource = 'official' | 'alternative' | 'offline' | null;

const App: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const caiMarkerRef = useRef<any>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<QuadrantData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>(null);

  // Pre-cargar datos offline al iniciar
  useEffect(() => {
    preloadOfflineData().catch(console.warn);
  }, []);

  // Función para crear el marcador del CAI usando Data Layer (mismo sistema que el polígono)
  const updateCAIMarker = (caiLocation: CAILocation | undefined) => {
    // Remover marcador anterior
    if (caiMarkerRef.current) {
      mapInstanceRef.current?.data.remove(caiMarkerRef.current);
      caiMarkerRef.current = null;
    }

    if (!caiLocation || !mapInstanceRef.current) return;

    // Crear un punto GeoJSON para el CAI
    const caiGeoJson = {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [caiLocation.lng, caiLocation.lat]
      },
      properties: {
        type: 'cai',
        name: caiLocation.name
      }
    };

    // Agregar el punto al mapa usando Data Layer
    const features = mapInstanceRef.current.data.addGeoJson(caiGeoJson);
    if (features && features.length > 0) {
      caiMarkerRef.current = features[0];
    }

    console.log(`📍 CAI marcado: ${caiLocation.name} (${caiLocation.lat}, ${caiLocation.lng})`);
  };

  const fetchQuadrantAtLocation = async (lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    
    setLoading(true);

    try {
      // Usar el servicio con fallback automático
      const result = await fetchQuadrantWithFallback(lat, lng);

      if (result) {
        // Limpiar datos anteriores del mapa
        mapInstanceRef.current.data.forEach((feature: any) => mapInstanceRef.current.data.remove(feature));
        
        // Agregar geometría al mapa
        if (result.geometry) {
          mapInstanceRef.current.data.addGeoJson(result.geometry);
        }

        // Actualizar marcador del CAI
        updateCAIMarker(result.quadrant.caiLocation);
        
        // Actualizar estado
        setSelectedQuadrant(result.quadrant);
        setDataSource(result.source);
        
        // Log de la fuente de datos
        const sourceEmoji = result.source === 'official' ? '🟢' : result.source === 'alternative' ? '🟡' : '🔴';
        console.log(`${sourceEmoji} Datos de: ${result.source}`);
      } else {
        setSelectedQuadrant(null);
        setDataSource(null);
        updateCAIMarker(undefined);
      }
    } catch (error) {
      console.error("Error en sincronización SIDENCO:", error);
      setSelectedQuadrant(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        setOptions({
          apiKey: process.env.API_KEY || '',
          version: 'weekly',
        } as any);

        const { Map } = await importLibrary('maps') as any;

        const map = new Map(mapRef.current, {
          center: BOGOTA_CENTER,
          zoom: 15,
          mapTypeId: 'hybrid',
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          backgroundColor: '#000000',
          gestureHandling: 'greedy'
        });

        mapInstanceRef.current = map;

        // Estilo dinámico: diferente para polígonos (cuadrantes) y puntos (CAIs)
        map.data.setStyle((feature: any) => {
          const geomType = feature.getGeometry()?.getType();
          
          if (geomType === 'Point') {
            // Estilo para el marcador del CAI - usando símbolo de círculo (valor 0 en SymbolPath)
            return {
              icon: {
                path: 0, // google.maps.SymbolPath.CIRCLE = 0
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
                scale: 12
              },
              zIndex: 1000
            };
          }
          
          // Estilo para el polígono del cuadrante
          return {
            fillColor: '#afff00',
            fillOpacity: 0.1,
            strokeColor: '#afff00',
            strokeWeight: 2,
            strokeOpacity: 0.8,
            visible: true
          };
        });

        map.addListener('idle', () => {
          const center = map.getCenter();
          fetchQuadrantAtLocation(center.lat(), center.lng());
        });

      } catch (e) {
        console.error("Map Error:", e);
      }
    };

    initMap();
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden font-sans">
      <div ref={mapRef} className="absolute inset-0 z-0" />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.9)] z-10" />

      {/* Advanced Radar Scanner UI - Blue Unified Theme */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
        <div className="relative w-0 h-0 flex items-center justify-center">
          
          {/* Concentric Radar Rings - Blue-400 specified in index.html */}
          <div className="radar-ring radar-ring-1" />
          <div className="radar-ring radar-ring-2" />
          <div className="radar-ring radar-ring-3" />
          
          {/* Central Target UI - Thicker and Blue */}
          <div className="relative flex items-center justify-center">
            {/* Thicker Crosshair accents - Blue-400 */}
            <div className="absolute w-[2px] h-8 bg-blue-400/60 -top-10" />
            <div className="absolute w-[2px] h-8 bg-blue-400/60 -bottom-10" />
            <div className="absolute h-[2px] w-8 bg-blue-400/60 -left-10" />
            <div className="absolute h-[2px] w-8 bg-blue-400/60 -right-10" />
            
            {/* Central locking point with enhanced blue glow */}
            <div className="w-4 h-4 rounded-full bg-white glow-point z-50 animate-pulse border-2 border-blue-500/30" />

            {/* Status Label - Updated to Blue Palette */}
            <div className="absolute top-0 left-16 -translate-y-1/2 flex items-center gap-4">
              <div className="h-[2px] w-20 bg-gradient-to-r from-blue-400/60 to-transparent" />
              <div className="bg-slate-950/90 px-6 py-3 rounded-2xl border border-blue-500/20 backdrop-blur-2xl shadow-[0_15px_40px_rgba(0,0,0,0.8)]">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)] ${
                      dataSource === 'official' ? 'bg-green-400' : 
                      dataSource === 'alternative' ? 'bg-yellow-400' : 
                      dataSource === 'offline' ? 'bg-orange-400' : 'bg-blue-400'
                    }`} />
                    <span className="text-[12px] font-black text-white uppercase tracking-[0.3em] whitespace-nowrap leading-none">
                      {loading ? 'SINCRONIZANDO...' : 'SCANNER POSITION ACTIVE'}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-blue-300/60 uppercase tracking-widest pl-4 border-l border-blue-500/30">
                    {dataSource === 'official' ? '🟢 API OFICIAL' : 
                     dataSource === 'alternative' ? '🟡 API ALTERNATIVA' : 
                     dataSource === 'offline' ? '🔴 DATOS OFFLINE' : 'SIDENCO GEO-LOCK SYNC'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none z-20">
        <QuadrantPanel quadrant={selectedQuadrant} loading={loading} />
        <BottomBar />
      </div>
    </div>
  );
};

export default App;
