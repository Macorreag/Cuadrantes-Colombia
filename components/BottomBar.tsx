
import React from 'react';
import { Radio, Clock, Heart } from 'lucide-react';

const BottomBar: React.FC = () => {
  return (
    <div className="absolute bottom-6 left-6 right-6 z-10 flex flex-col md:flex-row items-center justify-between md:justify-end pointer-events-none">
      
      {/* Firma Centrada - Legible y con contraste garantizado */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 pointer-events-auto">
        <div className="flex items-center gap-2 bg-slate-950/80 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md shadow-lg">
          <a 
            href="https://github.com/Macorreag" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white transition-all duration-300 uppercase tracking-[0.15em] group"
          >
            <span>Made with</span>
            <Heart size={10} className="text-red-500 animate-pulse" fill="currentColor" />
            <span>by</span>
            <span className="text-slate-100 border-b border-slate-500 group-hover:border-white transition-colors">macorreag</span>
            <span className="text-slate-500">in Colombia</span>
          </a>
        </div>
      </div>

      {/* Botón de Reporte - Extremo Derecho */}
      <div className="relative group pointer-events-auto mt-4 md:mt-0">
        {/* Tooltip de Desarrollo */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50">
          <div className="bg-slate-950 border border-slate-700 px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 whitespace-nowrap">
            <Clock size={12} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Módulo en construcción - Próximamente disponible</span>
          </div>
          <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"></div>
        </div>

        <button 
          disabled
          className="flex items-center gap-3 bg-slate-800 transition-all px-6 py-3 rounded-2xl border border-slate-600 cursor-help shadow-inner"
        >
          <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
            COMPARTE UN HECHO QUE AFECTE TU SEGURIDAD
          </span>
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
            <Radio size={16} className="text-slate-500" />
          </div>
        </button>
      </div>
    </div>
  );
};

export default BottomBar;
