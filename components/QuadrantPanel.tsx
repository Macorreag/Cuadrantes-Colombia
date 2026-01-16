
import React, { useState } from 'react';
import { Phone, Shield, ChevronDown, ChevronUp, Radio, User, MapPin, Building2 } from 'lucide-react';
import { QuadrantData } from '../types';

interface Props {
  quadrant: QuadrantData | null;
  loading?: boolean;
}

const QuadrantPanel: React.FC<Props> = ({ quadrant, loading }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!quadrant) return null;

  return (
    <div className={`absolute left-6 top-6 z-10 w-85 bg-slate-950/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden transition-all duration-300 ease-in-out animate-in fade-in slide-in-from-left`}>
      {/* Header Interactivo */}
      <div 
        className="p-5 border-b border-white/5 bg-slate-900/60 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 transition-colors pointer-events-auto group/header"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-12 h-12 flex-shrink-0 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
            <Shield size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] truncate">DATOS DE CUADRANTE</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 
                className="text-lg font-bold text-white tracking-tight uppercase truncate group-hover/header:whitespace-normal group-hover/header:overflow-visible transition-all cursor-help"
                title={quadrant.cai}
              >
                {quadrant.cai}
              </h3>
              {quadrant.caiLocation && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${quadrant.caiLocation.lat},${quadrant.caiLocation.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/30 hover:border-blue-400/50 transition-all group/maps"
                  title="Ver ubicación del CAI en Google Maps"
                >
                  <MapPin size={14} className="text-blue-400 group-hover/maps:text-blue-300" />
                </a>
              )}
            </div>
          </div>
        </div>
        <button className="p-2 flex-shrink-0 hover:bg-white/10 rounded-xl transition-colors text-white/60 ml-2">
          {isCollapsed ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
        </button>
      </div>

      {/* Contenido Dinámico de Asociados */}
      <div className={`grid transition-all duration-500 ease-in-out ${isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
        <div className="overflow-hidden">
          <div className="p-5 space-y-6">
            {/* Información de Estación de Policía */}
            {quadrant.estacionPolicia && (
              <div className="flex flex-col gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 pointer-events-auto">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-amber-400" />
                  <span className="text-[10px] font-bold text-amber-400/60 uppercase tracking-widest">Estación de Policía</span>
                </div>
                <div>
                  <p className="text-[11px] font-black text-white/90">{quadrant.estacionPolicia.nombre}</p>
                  {quadrant.estacionPolicia.direccion && (
                    <p className="text-[9px] text-white/50 mt-1">{quadrant.estacionPolicia.direccion}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 pointer-events-auto">
                  {quadrant.estacionPolicia.telefono && (
                    <a
                      href={`tel:${quadrant.estacionPolicia.telefono}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-all text-[9px] font-bold text-amber-400 pointer-events-auto cursor-pointer"
                    >
                      <Phone size={10} />
                      {quadrant.estacionPolicia.telefono}
                    </a>
                  )}
                  {quadrant.estacionPolicia.email && (
                    <a
                      href={`mailto:${quadrant.estacionPolicia.email}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-all text-[8px] font-bold text-amber-400 truncate pointer-events-auto cursor-pointer"
                      title={quadrant.estacionPolicia.email}
                    >
                      {quadrant.estacionPolicia.email}
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${quadrant.estacionPolicia.lat || 0},${quadrant.estacionPolicia.lng || 0}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/30 hover:border-amber-400/50 transition-all group/estmaps pointer-events-auto cursor-pointer"
                    title="Ver ubicación de la Estación en Google Maps"
                  >
                    <MapPin size={12} className="text-amber-400 group-hover/estmaps:text-amber-300" />
                  </a>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4 mb-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Radio size={14} className="text-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Personal Operativo MNVCC</span>
                </div>
                <span 
                  className="text-[10px] font-mono text-green-400/40 truncate max-w-[120px] hover:max-w-none hover:text-green-300 transition-all cursor-help bg-green-500/5 px-2 py-0.5 rounded border border-green-500/10"
                  title={quadrant.id}
                >
                  {quadrant.id}
                </span>
              </div>
              
              {/* Contenedor con Scroll para múltiples asociados */}
              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3 custom-scrollbar pointer-events-auto">
                {quadrant.officers.length > 0 ? (
                  quadrant.officers.map((officer, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 group hover:bg-white/[0.06] transition-all">
                      <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-blue-400 font-black text-[10px] shadow-inner group-hover:border-blue-500/50 transition-all">
                        {officer.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.1em] mb-1">
                          {idx === 0 ? 'Responsable de Turno' : 'Unidad de Patrullaje'}
                        </p>
                        
                        {officer.name && (
                          <p className="text-[11px] font-black text-white/90 group-hover:text-blue-400 transition-all truncate hover:whitespace-normal cursor-help" title={officer.name}>
                            {officer.name}
                          </p>
                        )}
                        
                        {officer.phone && officer.phone !== "S/N" && (
                          <div className="flex items-center gap-1.5 mt-1 text-green-500">
                            <Phone size={10} className="opacity-70" />
                            <span className="text-[10px] font-mono font-bold tracking-widest">{officer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 px-4 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                    <div className="flex justify-center mb-4">
                       <User size={24} className="text-white/10 animate-pulse" />
                    </div>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] leading-relaxed">
                      Sincronizando asociados...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-400 border-t-transparent" />
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Sincronizando Cuadrante...</span>
              </div>
            )}
          </div>

          <div className="px-5 py-4 bg-slate-900/40 border-t border-white/5">
            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-white/20">
              <span>Red MNVCC Digital</span>
              <span>LIVE FEED</span>
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(175,255,0,0.2); }
      `}</style>
    </div>
  );
};

export default QuadrantPanel;
