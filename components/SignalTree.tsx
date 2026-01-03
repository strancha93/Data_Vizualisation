import React, { useState, useEffect } from 'react';
import { BusNode, SignalData } from '../types';
import { ChevronRight, ChevronDown, Activity, Folder, FolderOpen, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';

interface SignalTreeProps {
  node: BusNode;
  onSelectSignal: (signal: SignalData) => void;
  selectedSignalId?: string; // Kept for highlighting if needed, though less relevant with multiple slots
  depth?: number;
  autoExpand?: boolean;
}

const SignalTree: React.FC<SignalTreeProps> = ({ node, onSelectSignal, selectedSignalId, depth = 0, autoExpand = false }) => {
  const [isOpen, setIsOpen] = useState(depth === 0 || !!autoExpand);

  useEffect(() => {
    if (autoExpand) {
      setIsOpen(true);
    }
  }, [autoExpand]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleDragStart = (e: React.DragEvent, signal: SignalData) => {
    e.dataTransfer.setData('signalId', signal.id);
    e.dataTransfer.effectAllowed = 'copy';
    // Create a custom drag image or use default
  };

  // Skip rendering empty nodes
  if (node.signals.length === 0 && node.subBuses.length === 0) return null;

  return (
    <div className="select-none">
      {/* Bus/Folder Node */}
      <div 
        className={clsx(
          "flex items-center py-1 px-2 cursor-pointer hover:bg-slate-100 rounded text-sm transition-colors",
          depth === 0 ? "font-bold text-slate-800" : "text-slate-700"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggleOpen}
      >
        <div className="mr-1 text-slate-400">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="mr-2 text-blue-500">
          {isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
        </div>
        <span className="truncate">{node.name}</span>
      </div>

      {/* Children */}
      {isOpen && (
        <div>
          {/* Signals */}
          {node.signals.map(signal => (
            <div 
              key={signal.id}
              draggable
              onDragStart={(e) => handleDragStart(e, signal)}
              className={clsx(
                "group flex items-center py-1 px-2 cursor-grab active:cursor-grabbing text-sm border-l-2 ml-3 transition-all",
                "border-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900"
              )}
              style={{ paddingLeft: `${(depth + 1) * 16}px` }}
              onClick={() => onSelectSignal(signal)}
            >
              <GripVertical size={12} className="mr-2 opacity-0 group-hover:opacity-50 text-slate-400" />
              <Activity size={12} className="mr-2 opacity-70 text-blue-500" />
              <span className="truncate">{signal.name}</span>
            </div>
          ))}
          
          {/* SubBuses */}
          {node.subBuses.map((subBus, idx) => (
            <SignalTree 
              key={`${subBus.name}-${idx}`} 
              node={subBus} 
              onSelectSignal={onSelectSignal} 
              selectedSignalId={selectedSignalId}
              depth={depth + 1}
              autoExpand={autoExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SignalTree;