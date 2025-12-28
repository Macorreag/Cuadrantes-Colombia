
import React from 'react';
import { SafetyScore } from '../types';
import { ShieldAlert, ExternalLink, Activity } from 'lucide-react';

interface Props {
  data: SafetyScore | null;
  loading: boolean;
}

const SafetyPanel: React.FC<Props> = ({ data, loading }) => {
  if (!data && !loading) return null;

  return (
    <div className="absolute right-6 top-6 z-10 w-80 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6 animate-in fade-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Seguridad del Barrio</h2>
        <div className="bg-white/5 p-1.5 rounded-lg">
           <ShieldAlert size={14} className="text-blue-400" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 py-4">
          <div className="h-12 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white">{data.score.toFixed(1)}</span>
            <span className="text-white/40 text-sm font-medium">/ 10</span>
          </div>

          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full transition-all duration-1000" 
              style={{ width: `${data.score * 10}%` }}
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-white/50 uppercase font-semibold">Riesgo de Hurto</span>
              <span className={`text-[11px] font-bold ${data.theftRisk === 'High' ? 'text-red-400' : 'text-yellow-400'}`}>
                {data.theftRisk}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-white/50 uppercase font-semibold">Crimen Violento</span>
              <span className={`text-[11px] font-bold ${data.violentCrime === 'High' ? 'text-red-400' : 'text-green-400'}`}>
                {data.violentCrime}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <p className="text-[11px] text-white/70 leading-relaxed italic mb-4">
              "{data.insights}"
            </p>
            
            {data.sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-tighter">Fuentes de Google Search:</p>
                {data.sources.slice(0, 2).map((source, i) => (
                  <a 
                    key={i} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors truncate"
                  >
                    <ExternalLink size={10} />
                    {source.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SafetyPanel;
