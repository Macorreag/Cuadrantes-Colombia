/**
 * Servicio de integración con la API SODA de datos.gov.co
 * 
 * Basado en el análisis del Informe Técnico de Cuadrantes (Sección 5):
 * - Dataset: jwvi-unqh (Directorio de cuadrantes de Metropolitanas y Departamentos)
 * - Ofrece correlación LÓGICA explícita entre CAI y Cuadrantes a nivel NACIONAL
 * 
 * Esta API es la ÚNICA que provee la relación explícita "tipo_unidad" -> CAI
 * permitiendo saber exactamente qué CAI es responsable de cada cuadrante.
 */

// URL de la API SODA
const SODA_BASE_URL = 'https://www.datos.gov.co/resource/jwvi-unqh.json';

// Cache de datos
let cachedDirectorio: DirectorioCuadrante[] = [];
let directorioLoaded = false;
let lastLoadAttempt = 0;
const RELOAD_INTERVAL = 3600000; // 1 hora (datos más estables)

/**
 * Estructura del directorio de cuadrantes según datos.gov.co
 * Basado en el informe (Sección 5.2)
 */
export interface DirectorioCuadrante {
  departamento: string;      // "METROPOLITANA DE BOGOTA", "DEPARTAMENTO DE POLICIA AMAZONAS"
  ciudad_municipio: string;  // "BOGOTA D.C.", "LETICIA"
  unidad: string;            // "ESTACION DE POLICIA USAQUEN" - Estación padre
  tipo_unidad: string;       // "CAI CODITO" - El CAI específico responsable
  codigo_cuadrante: string;  // "MEBOGMNVCCC01E01C02000004" - Código SIVICC completo
  cuadrante: string;         // "004" - Número corto del cuadrante
  numero_celular_cuadrante: string; // Teléfono de contacto
}

/**
 * Estructura de CAI agrupado con sus cuadrantes
 */
export interface CAIConCuadrantes {
  nombre: string;
  estacionPadre: string;
  departamento: string;
  municipio: string;
  cuadrantes: Array<{
    codigo: string;
    numero: string;
    telefono: string;
  }>;
  codigoEstacion?: string; // Extraído del primer cuadrante
  codigoCAI?: string;       // Extraído del primer cuadrante
}

/**
 * Carga el directorio de cuadrantes desde la API SODA
 * Filtra solo registros que tienen CAI asociado
 */
async function loadDirectorioFromSODA(departamento?: string): Promise<DirectorioCuadrante[]> {
  console.log('📥 Cargando directorio de cuadrantes desde datos.gov.co...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    // Construir URL con filtros SODA (SoQL)
    let url = `${SODA_BASE_URL}?$limit=10000`;
    
    // Filtrar solo registros con CAI
    url += `&$where=tipo_unidad like '%25CAI%25'`;
    
    // Filtrar por departamento si se especifica
    if (departamento) {
      url += ` AND departamento='${encodeURIComponent(departamento)}'`;
    }

    const response = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: DirectorioCuadrante[] = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('⚠️ No se encontraron registros en datos.gov.co');
      return [];
    }

    console.log(`✅ ${data.length} registros de cuadrantes cargados desde datos.gov.co`);
    return data;

  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('⚠️ Error cargando desde datos.gov.co:', (error as Error).message);
    return [];
  }
}

/**
 * Carga directorio con cache
 */
async function loadDirectorio(): Promise<void> {
  const now = Date.now();
  
  if (cachedDirectorio.length > 0 && (now - lastLoadAttempt) < RELOAD_INTERVAL) {
    return;
  }
  
  lastLoadAttempt = now;

  const directorio = await loadDirectorioFromSODA();
  if (directorio.length > 0) {
    cachedDirectorio = directorio;
    directorioLoaded = true;
  }
}

/**
 * Parsea el código SIVICC para extraer componentes
 * Replica la función del informe (Sección 2.2)
 */
function parseSIVICCCode(code: string): {
  unidad?: string;
  distrito?: string;
  estacion?: string;
  cai?: string;
  cuadrante?: string;
} | null {
  if (!code) return null;
  
  const normalized = code.toUpperCase().trim();
  
  // Patrón completo: DEAMAMNVCCC01E01C06000001
  const match = normalized.match(
    /^([A-Z]{5})?MNVCC([CDS]\d{2})?(E\d{2})(C\d{2}|S\d{2})?(\d{6})?$/
  );
  
  if (match) {
    return {
      unidad: match[1],
      distrito: match[2],
      estacion: match[3],
      cai: match[4],
      cuadrante: match[5]
    };
  }

  return null;
}

/**
 * Agrupa los cuadrantes por CAI
 * Implementa el algoritmo de "Clustering" del informe (Sección 5.3)
 */
export async function agruparCuadrantesPorCAI(): Promise<Map<string, CAIConCuadrantes>> {
  await loadDirectorio();
  
  const caiMap = new Map<string, CAIConCuadrantes>();

  for (const registro of cachedDirectorio) {
    const caiKey = registro.tipo_unidad.trim().toUpperCase();
    
    if (!caiMap.has(caiKey)) {
      const parsed = parseSIVICCCode(registro.codigo_cuadrante);
      
      caiMap.set(caiKey, {
        nombre: registro.tipo_unidad,
        estacionPadre: registro.unidad,
        departamento: registro.departamento,
        municipio: registro.ciudad_municipio,
        cuadrantes: [],
        codigoEstacion: parsed?.estacion,
        codigoCAI: parsed?.cai
      });
    }

    const cai = caiMap.get(caiKey)!;
    cai.cuadrantes.push({
      codigo: registro.codigo_cuadrante,
      numero: registro.cuadrante,
      telefono: registro.numero_celular_cuadrante
    });
  }

  return caiMap;
}

/**
 * Encuentra el CAI responsable de un cuadrante dado
 * Usa la relación EXPLÍCITA del dataset
 */
export async function findCAIForCuadrante(codigoCuadrante: string): Promise<DirectorioCuadrante | null> {
  await loadDirectorio();
  
  const normalizedCodigo = codigoCuadrante.toUpperCase().trim();
  
  // Búsqueda exacta
  const exact = cachedDirectorio.find(d => 
    d.codigo_cuadrante.toUpperCase() === normalizedCodigo
  );
  
  if (exact) {
    console.log(`✅ SODA: CAI encontrado para cuadrante: ${exact.tipo_unidad}`);
    return exact;
  }

  // Búsqueda parcial por número de cuadrante
  const parsed = parseSIVICCCode(normalizedCodigo);
  if (parsed?.estacion && parsed?.cuadrante) {
    const partial = cachedDirectorio.find(d => {
      const dParsed = parseSIVICCCode(d.codigo_cuadrante);
      return dParsed?.estacion === parsed.estacion && 
             dParsed?.cuadrante === parsed.cuadrante;
    });
    
    if (partial) {
      console.log(`📍 SODA: CAI encontrado por match parcial: ${partial.tipo_unidad}`);
      return partial;
    }
  }

  return null;
}

/**
 * Obtiene todos los CAIs de un departamento/ciudad
 */
export async function getCAIsForLocation(
  departamento?: string,
  municipio?: string
): Promise<CAIConCuadrantes[]> {
  const caiMap = await agruparCuadrantesPorCAI();
  
  let cais = Array.from(caiMap.values());

  if (departamento) {
    const deptNorm = departamento.toUpperCase();
    cais = cais.filter(c => c.departamento.toUpperCase().includes(deptNorm));
  }

  if (municipio) {
    const munNorm = municipio.toUpperCase();
    cais = cais.filter(c => c.municipio.toUpperCase().includes(munNorm));
  }

  return cais;
}

/**
 * Obtiene la información completa de jerarquía para un cuadrante
 * Implementa la ontología del informe (Sección 2.1)
 */
export async function getJerarquiaCuadrante(codigoCuadrante: string): Promise<{
  departamento: string;
  estacion: string;
  cai: string;
  cuadrante: string;
  telefono: string;
} | null> {
  const registro = await findCAIForCuadrante(codigoCuadrante);
  
  if (!registro) return null;

  return {
    departamento: registro.departamento,
    estacion: registro.unidad,
    cai: registro.tipo_unidad,
    cuadrante: registro.codigo_cuadrante,
    telefono: registro.numero_celular_cuadrante
  };
}

/**
 * Busca cuadrantes por teléfono
 */
export async function findCuadranteByTelefono(telefono: string): Promise<DirectorioCuadrante | null> {
  await loadDirectorio();
  
  const telefonoNorm = telefono.replace(/\D/g, '');
  
  return cachedDirectorio.find(d => 
    d.numero_celular_cuadrante.replace(/\D/g, '') === telefonoNorm
  ) || null;
}

/**
 * Pre-carga el directorio de cuadrantes
 */
export async function preloadDirectorio(): Promise<void> {
  await loadDirectorio();
}

/**
 * Estadísticas del servicio SODA
 */
export async function getSODAStats(): Promise<{
  totalRegistros: number;
  totalCAIs: number;
  departamentos: string[];
  loaded: boolean;
}> {
  await loadDirectorio();
  
  const caiMap = await agruparCuadrantesPorCAI();
  const departamentos = new Set(cachedDirectorio.map(d => d.departamento));

  return {
    totalRegistros: cachedDirectorio.length,
    totalCAIs: caiMap.size,
    departamentos: Array.from(departamentos).sort(),
    loaded: directorioLoaded
  };
}

/**
 * Exporta el directorio como JSON estructurado
 * Útil para generar archivos offline
 */
export async function exportDirectorioAsJSON(): Promise<string> {
  const caiMap = await agruparCuadrantesPorCAI();
  const data = Object.fromEntries(caiMap);
  return JSON.stringify(data, null, 2);
}
