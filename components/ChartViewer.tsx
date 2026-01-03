import React, { useMemo, useState, useEffect } from 'react';
import { SignalData } from '../types';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  Brush,
  ReferenceArea,
  ReferenceLine
} from 'recharts';
import { ZoomOut, MousePointer2, X, Ruler } from 'lucide-react';

interface ChartViewerProps {
  signals: SignalData[];
  onRemoveSignal: (signalId: string) => void;
  onClear: () => void;
  cursor1: number | null;
  cursor2: number | null;
  onCursorChange: (t1: number | null, t2: number | null) => void;
}

const COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#be123c', // Rose
  '#4d7c0f', // Lime
];

const ChartViewer: React.FC<ChartViewerProps> = ({ 
  signals, 
  onRemoveSignal, 
  onClear,
  cursor1,
  cursor2,
  onCursorChange
}) => {
  // Zoom State
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  // Measure Interaction Mode (Local to chart)
  const [isMeasureMode, setIsMeasureMode] = useState(false);

  // Reset zoom when the set of signals changes drastically
  useEffect(() => {
    if (signals.length === 0) {
      setZoomRange(null);
      setIsMeasureMode(false);
    }
  }, [signals.length]);

  const chartData = useMemo(() => {
    if (signals.length === 0) return [];
    
    // Use the first signal as the time base
    const baseSignal = signals[0];
    const dataLength = baseSignal.data.length;
    
    // Performance optimization: Downsample if too large
    const maxDisplayPoints = 3000;
    let step = 1;
    if (dataLength > maxDisplayPoints) {
      step = Math.ceil(dataLength / maxDisplayPoints);
    }

    const processedData = [];
    for (let i = 0; i < dataLength; i += step) {
      const point: any = {
        index: i,
        time: baseSignal.time ? baseSignal.time[i] : i,
      };
      
      // Add value for each signal
      signals.forEach(sig => {
        // Handle potentially different lengths gracefully
        if (i < sig.data.length) {
          point[sig.id] = sig.data[i];
        }
      });
      
      processedData.push(point);
    }

    return processedData;
  }, [signals]);

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null || refAreaLeft === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    // Identify min and max time selected
    let minTime = Math.min(refAreaLeft, refAreaRight);
    let maxTime = Math.max(refAreaLeft, refAreaRight);

    // Find corresponding indices in chartData
    let startIndex = chartData.findIndex((d) => d.time >= minTime);
    let endIndex = chartData.findIndex((d) => d.time > maxTime);

    // Fallbacks if not found
    if (startIndex === -1) startIndex = 0;
    if (endIndex === -1) endIndex = chartData.length - 1;
    else endIndex = Math.max(0, endIndex - 1);

    // Apply zoom if range is valid
    if (endIndex > startIndex) {
      setZoomRange({ startIndex, endIndex });
    }

    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const zoomOut = () => {
    if (chartData.length > 0) {
      setZoomRange({ startIndex: 0, endIndex: chartData.length - 1 });
    } else {
      setZoomRange(null);
    }
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const handleBrushChange = (range: any) => {
    if (range && typeof range.startIndex === 'number' && typeof range.endIndex === 'number') {
      setZoomRange({ startIndex: range.startIndex, endIndex: range.endIndex });
    }
  };

  const handleChartClick = (data: any) => {
    if (!isMeasureMode || !data) return;
    const time = Number(data.activeLabel);
    if (isNaN(time)) return;

    if (cursor1 === null) {
      onCursorChange(time, null);
    } else if (cursor2 === null) {
      onCursorChange(cursor1, time);
    } else {
      // If both are set, reset to just the new one as T1
      onCursorChange(time, null);
    }
  };

  const toggleMeasureMode = () => {
    const newMode = !isMeasureMode;
    setIsMeasureMode(newMode);
  };

  const isZoomed = useMemo(() => {
    if (!zoomRange) return false;
    if (chartData.length === 0) return false;
    return zoomRange.startIndex > 0 || zoomRange.endIndex < chartData.length - 1;
  }, [zoomRange, chartData.length]);

  if (signals.length === 0) return null;

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200 h-[450px]">
      {/* Header */}
      <div className="border-b px-4 py-3 flex justify-between items-start bg-slate-50 z-10 min-h-[60px]">
        <div className="flex flex-wrap gap-2 items-center flex-1 mr-4">
          {signals.map((sig, idx) => (
            <div 
              key={sig.id} 
              className="flex items-center bg-white border border-slate-200 rounded-full pl-2 pr-1 py-1 shadow-sm text-xs group"
            >
              <span 
                className="w-2 h-2 rounded-full mr-2" 
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              />
              <span className="font-medium text-slate-700 mr-1 max-w-[150px] truncate" title={sig.name}>
                {sig.name}
              </span>
              <button 
                onClick={() => onRemoveSignal(sig.id)}
                className="p-0.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Remove signal"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {(cursor1 !== null || cursor2 !== null) && (
            <div className="hidden sm:flex items-center gap-3 text-xs bg-slate-100 px-2 py-1.5 rounded border border-slate-200 mr-2 animate-in fade-in duration-300">
                {cursor1 !== null && <span className="text-blue-600 font-medium">T1: {cursor1.toFixed(3)}s</span>}
                {cursor2 !== null && <span className="text-red-600 font-medium">T2: {cursor2.toFixed(3)}s</span>}
                {cursor1 !== null && cursor2 !== null && (
                    <span className="text-slate-800 font-bold pl-2 border-l border-slate-300">
                        Δ: {Math.abs(cursor2 - cursor1).toFixed(3)}s
                    </span>
                )}
                <button 
                  onClick={() => onCursorChange(null, null)}
                  className="ml-1 text-slate-400 hover:text-red-500"
                  title="Clear Cursors"
                >
                  <X size={12} />
                </button>
            </div>
          )}

          <button
            onClick={toggleMeasureMode}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                isMeasureMode 
                ? "bg-blue-50 text-blue-700 border-blue-200" 
                : "text-slate-600 bg-white border-slate-200 hover:bg-slate-100"
            }`}
            title={isMeasureMode ? "Exit Measure Mode" : "Enter Measure Mode"}
          >
            <Ruler size={14} />
            Measure
          </button>

          {isZoomed && (
            <button
              onClick={zoomOut}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <ZoomOut size={14} />
              Reset
            </button>
          )}

          <button 
            onClick={onClear}
            className="ml-1 text-slate-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded"
            title="Clear all"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 w-full p-2 relative min-h-0">
        {!isMeasureMode && !isZoomed && (
           <div className="absolute top-4 right-10 z-0 flex items-center gap-1.5 text-xs text-slate-400 pointer-events-none">
             <MousePointer2 size={12} />
             <span>Drag to zoom</span>
           </div>
        )}
        {isMeasureMode && (
           <div className="absolute top-4 right-10 z-0 flex items-center gap-1.5 text-xs text-blue-400 pointer-events-none bg-white/80 px-2 py-1 rounded border border-blue-100">
             <Ruler size={12} />
             <span>Click to place cursors</span>
           </div>
        )}

        <div className="h-full w-full select-none" style={{ userSelect: 'none', cursor: isMeasureMode ? 'crosshair' : 'default' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              syncId="signal-view"
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
              onMouseDown={isMeasureMode ? undefined : (e) => e && setRefAreaLeft(Number(e.activeLabel))}
              onMouseMove={isMeasureMode ? undefined : (e) => refAreaLeft !== null && e && setRefAreaRight(Number(e.activeLabel))}
              onMouseUp={isMeasureMode ? undefined : zoom}
              onClick={isMeasureMode ? handleChartClick : undefined}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="time" 
                type="number" 
                domain={['auto', 'auto']}
                tickFormatter={(val) => val.toFixed(2)}
                stroke="#94a3b8"
                fontSize={10}
                allowDataOverflow
              />
              <YAxis 
                domain={['auto', 'auto']} 
                stroke="#94a3b8"
                fontSize={10}
                allowDataOverflow
                width={40}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                itemStyle={{ fontWeight: 600 }}
                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                labelFormatter={(val) => `Time: ${Number(val).toFixed(4)}`}
                formatter={(value: number, name: string) => {
                   const sig = signals.find(s => s.id === name);
                   return [value.toFixed(4), sig ? sig.name : name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
              
              {signals.map((sig, idx) => (
                <Line 
                  key={sig.id}
                  type="monotone" 
                  dataKey={sig.id}
                  name={sig.name} 
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={2} 
                  dot={false} 
                  activeDot={{ r: 4 }} 
                  animationDuration={300}
                />
              ))}
              
              {/* Global Cursors */}
              {cursor1 !== null && (
                 <ReferenceLine x={cursor1} stroke="#2563eb" strokeDasharray="3 3" isFront label={{ position: 'top', value: 'T1', fill: '#2563eb', fontSize: 10 }} />
              )}
              {cursor2 !== null && (
                 <ReferenceLine x={cursor2} stroke="#dc2626" strokeDasharray="3 3" isFront label={{ position: 'top', value: 'T2', fill: '#dc2626', fontSize: 10 }} />
              )}

              {/* Highlight area during drag (Zoom Mode) */}
              {!isMeasureMode && refAreaLeft !== null && refAreaRight !== null && (
                <ReferenceArea 
                  x1={refAreaLeft} 
                  x2={refAreaRight} 
                  strokeOpacity={0.3} 
                  fill="#2563eb" 
                  fillOpacity={0.1} 
                />
              )}

              <Brush 
                dataKey="time" 
                height={20} 
                stroke="#cbd5e1"
                fill="#f8fafc"
                startIndex={zoomRange?.startIndex}
                endIndex={zoomRange?.endIndex}
                onChange={handleBrushChange}
                alwaysShowText={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ChartViewer;