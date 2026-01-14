
export interface QuadrantData {
  id: string;
  name: string;
  cai: string;
  officers: Array<{
    name: string;
    phone: string;
    initials: string;
  }>;
  caiLocation?: {
    lat: number;
    lng: number;
    nombre: string;
  };
}

export interface CAIData {
  cuadrante: string;
  nombre_cai: string;
  lat: number;
  lng: number;
}

export interface SafetyScore {
  score: number;
  theftRisk: 'Low' | 'Moderate' | 'High';
  violentCrime: 'Low' | 'Moderate' | 'High';
  insights: string;
  sources: Array<{ title: string; uri: string }>;
}

export interface MapPosition {
  lat: number;
  lng: number;
}
