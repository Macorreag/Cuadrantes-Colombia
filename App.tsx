
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { DARK_MAP_STYLE, BOGOTA_CENTER } from './constants';
import { QuadrantData, SafetyScore } from './types';
import { getSafetyAnalysis } from './services/geminiService';
import QuadrantPanel from './components/QuadrantPanel';
import SafetyPanel from './components/SafetyPanel';
import BottomBar from './components/BottomBar';

const MNVCC_BASE_URL = "https://utility.arcgis.com/usrsvcs/servers/79feadae6f374b1882eb87e6983e8452/rest/services/CAPAS/MNVCC_CUADRANTES/FeatureServer";
const MNVCC_GEOMETRY_URL = `${MNVCC_BASE_URL}/1/query`;
const MNVCC_PERSONNEL_URL = `${MNVCC_BASE_URL}/0/query`;

const App: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<QuadrantData | null>(null);
  const [safetyData, setSafetyData] = useState<SafetyScore | null>(null);
  const [loadingSafety, setLoadingSafety] = useState(false);
  
  const processPersonnel = (personnelFeatures: any[]): any[] => {
    const seen = new Set();
    return personnelFeatures
      .map(f => f.properties)
      .filter(props => {
        const id = `${props.EMPLEADO}-${props.TELEFONO}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return props.EMPLEADO && props.EMPLEADO !== "null";
      })
      .map(props => {
        const name = props.EMPLEADO.toUpperCase();
        const rangeMatch = name.match(/^(PT|SI|IT|CT|MY|TE|ST)\.?\s/);
        const initials = rangeMatch ? rangeMatch[1] : name.substring(0, 2);
        
        return {
          name: name,
          phone: (props.TELEFONO && props.TELEFONO !== "0") ? props.TELEFONO : "S/N",
          initials: initials
        };
      });
  };

  const handleSelection = useCallback(async (neighborhood: string, id: string) => {
    setLoadingSafety(true);
    const analysis = await getSafetyAnalysis(neighborhood, id);
    setSafetyData(analysis);
    setLoadingSafety(false);
  }, []);

  const fetchQuadrantAtLocation = async (lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    
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

    try {
      const geomRes = await fetch(`${MNVCC_GEOMETRY_URL}?${geomParams.toString()}`);
      const geomData = await geomRes.json();

      if (geomData.features && geomData.features.length > 0) {
        mapInstanceRef.current.data.forEach((feature: any) => mapInstanceRef.current.data.remove(feature));
        mapInstanceRef.current.data.addGeoJson(geomData);
        
        const mainProps = geomData.features[0].properties;
        const quadrantId = mainProps.COD_CUAD_P || mainProps.NRO_CUADRANTE || mainProps.NRO_CUADRA;
        
        let caiName = (
          mainProps.NOMBRE_CUADRA || 
          mainProps.NOMBRE_CAI || 
          mainProps.CAI || 
          mainProps.NOM_CAI || 
          "CAI SECTORIAL"
        ).toUpperCase();

        const personnelParams = new URLSearchParams({
          f: 'geojson',
          where: `NRO_CUADRA = '${quadrantId}'`,
          outFields: '*',
          returnGeometry: 'false'
        });

        const personnelRes = await fetch(`${MNVCC_PERSONNEL_URL}?${personnelParams.toString()}`);
        const personnelData = await personnelRes.json();
        
        if (caiName === "CAI SECTORIAL" && personnelData.features && personnelData.features.length > 0) {
          const firstPers = personnelData.features[0].properties;
          if (firstPers.NOMBRE_CUADRA) {
            caiName = firstPers.NOMBRE_CUADRA.toUpperCase();
          }
        }

        const officersList = processPersonnel(personnelData.features || []);

        const info: QuadrantData = {
          id: quadrantId,
          name: caiName,
          cai: caiName,
          officers: officersList
        };
        
        setSelectedQuadrant(prev => {
          if (prev?.id !== info.id) {
            handleSelection(info.cai, info.id);
            return info;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error("Error en sincronización SIDENCO:", error);
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

        map.data.setStyle({
          fillColor: '#afff00',
          fillOpacity: 0.1,
          strokeColor: '#afff00',
          strokeWeight: 2,
          strokeOpacity: 0.8,
          visible: true
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
  }, [handleSelection]);

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
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                    <span className="text-[12px] font-black text-white uppercase tracking-[0.3em] whitespace-nowrap leading-none">
                      SCANNER POSITION ACTIVE
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-blue-300/60 uppercase tracking-widest pl-4 border-l border-blue-500/30">
                    SIDENCO GEO-LOCK SYNC
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none z-20">
        <QuadrantPanel quadrant={selectedQuadrant} loading={loadingSafety} />
        <SafetyPanel data={safetyData} loading={loadingSafety} />
        
        <BottomBar />
      </div>
    </div>
  );
};

export default App;
