
export interface QuadrantData {
  id: string;
  name: string;
  cai: string;
  officers: Array<{
    name: string;
    phone: string;
    initials: string;
  }>;
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
