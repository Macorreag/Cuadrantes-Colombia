
export interface QuadrantData {
  id: string;
  name: string;
  cai: string;
  officers: Array<{
    name: string;
    phone: string;
    initials: string;
  }>;
  caiLocation?: CAILocation;
  // Información de la Estación de Policía asociada
  estacionPolicia?: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    lat: number;
    lng: number;
  };
  // Jerarquía MNVCC (Modelo Nacional de Vigilancia Comunitaria por Cuadrantes)
  jerarquia?: {
    departamento?: string;   // Ej: "METROPOLITANA DE BOGOTA"
    estacion?: string;       // Ej: "ESTACION DE POLICIA USAQUEN"
    codigoEstacion?: string; // Ej: "E01"
    codigoCAI?: string;      // Ej: "C02"
    telefonoCuadrante?: string;
  };
  // Fuente de datos utilizada para obtener la ubicación del CAI
  dataSource?: 'SDSCJ' | 'WebMap' | 'SODA' | 'Fallback' | 'API';
}

export interface CAILocation {
  lat: number;
  lng: number;
  name: string;
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
