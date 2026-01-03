import React from 'react';
import { X, Copy, Check, FileCode } from 'lucide-react';

interface ScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ScriptModal: React.FC<ScriptModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const matlabCode = `function export_simulation_data(simOut, filename)
% EXPORT_SIMULATION_DATA Robust Export for Simulink Web Visualization
%   export_simulation_data(out, 'my_simulation_result')
%
%   Supported Inputs:
%       - Simulink.SimulationOutput (e.g., 'out')
%       - Simulink.SimulationData.Dataset (e.g., 'out.logsout')
%       - Struct with time/signals
%
%   Outputs:
%       - {filename}.json : Hierarchical data for the Web App
%       - {filename}.csv  : Flattened table for analysis
%       - {filename}.html : Standalone interactive dashboard

    if nargin < 2
        error('Usage: export_simulation_data(data, "filename")');
    end

    % 1. Extract Master Time Vector
    t = [];
    rawStruct = struct();
    
    if isa(simOut, 'Simulink.SimulationOutput')
        try
            t = simOut.tout;
            % Extract all properties to a struct for processing
            vars = who(simOut);
            for i = 1:length(vars)
                rawStruct.(vars{i}) = simOut.get(vars{i});
            end
        catch
            warning('Could not extract "tout" directly. Will attempt to infer from signals.');
        end
    elseif isa(simOut, 'Simulink.SimulationData.Dataset')
        rawStruct = struct('dataset', simOut);
    elseif isstruct(simOut)
        rawStruct = simOut;
        if isfield(simOut, 'time'), t = simOut.time; end
        if isfield(simOut, 'tout'), t = simOut.tout; end
    else
        error('Unsupported input type. Use Simulink.SimulationOutput, Dataset, or Struct.');
    end
    
    % If time is missing, try to find the first Timeseries and use its time
    if isempty(t)
        t = find_first_time_vector(rawStruct);
        if isempty(t)
            error('No time vector found (tout/time) and no timeseries with time data found.');
        end
    end
    
    % Force column vector for time
    t = t(:);

    % 2. Initialize Output Structures
    jsonStruct = struct();
    jsonStruct.time = t; 
    
    % Prepare CSV table
    flatTable = table(t, 'VariableNames', {'time'});

    % 3. Process Content recursively
    fields = fieldnames(rawStruct);
    for i = 1:length(fields)
        name = fields{i};
        
        % Skip metadata
        if any(strcmp(name, {'tout', 'time', 'SimulationMetadata'}))
            continue; 
        end
        
        data = rawStruct.(name);
        [jsonNode, tableCols] = process_node(data, name, t);
        
        if ~isempty(jsonNode)
            jsonStruct.(name) = jsonNode;
        end
        
        if ~isempty(tableCols)
            % Merge table, padding if necessary (though process_node aligns time)
            flatTable = [flatTable, tableCols]; %#ok<AGROW>
        end
    end

    % 4. Write JSON
    jsonStr = jsonencode(jsonStruct, 'ConvertInfAndNaN', false);
    fid = fopen([filename '.json'], 'w');
    if fid == -1, error('Cannot create JSON file'); end
    fwrite(fid, jsonStr, 'char');
    fclose(fid);
    fprintf('Generated: %s.json\\n', filename);

    % 5. Write CSV
    try
        writetable(flatTable, [filename '.csv']);
        fprintf('Generated: %s.csv\\n', filename);
    catch me
        warning('Failed to write CSV: %s', me.message);
    end

    % 6. Write HTML Dashboard
    try
        htmlFile = [filename '.html'];
        fhtml = fopen(htmlFile, 'w');
        
        % Write HTML Header & CSS
        fprintf(fhtml, '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sim Report: %s</title>', filename);
        fprintf(fhtml, '<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>');
        fprintf(fhtml, '<style>');
        fprintf(fhtml, 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;display:flex;height:100vh;background:#f1f5f9;color:#0f172a;overflow:hidden}');
        
        % Sidebar CSS
        fprintf(fhtml, '#sidebar{width:320px;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;z-index:10;flex-shrink:0}');
        fprintf(fhtml, '#sidebar-header{padding:1.5rem;border-bottom:1px solid #f1f5f9;background:#fff}');
        fprintf(fhtml, '#tree{flex:1;overflow-y:auto;padding:1rem}');
        
        % Tree Node CSS
        fprintf(fhtml, '.node{margin-left:1rem;font-size:0.85rem;line-height:1.8}');
        fprintf(fhtml, '.folder{cursor:pointer;font-weight:600;color:#334155;padding:2px 8px;border-radius:4px;display:flex;align-items:center;gap:6px;user-select:none}');
        fprintf(fhtml, '.folder:hover{background:#f8fafc}');
        fprintf(fhtml, '.signal{cursor:grab;color:#64748b;padding:2px 8px;border-radius:4px;display:flex;align-items:center;gap:8px;transition:all 0.1s;user-select:none;border:1px solid transparent}');
        fprintf(fhtml, '.signal:hover{background:#eff6ff;color:#2563eb;border-color:#dbeafe}');
        fprintf(fhtml, '.hidden{display:none}');
        
        % Content Grid CSS
        fprintf(fhtml, '#content{flex:1;padding:1.5rem;overflow-y:auto;display:grid;grid-template-columns:1fr;gap:1.5rem;align-content:start}');
        fprintf(fhtml, '@media(min-width:1200px){#content{grid-template-columns:1fr 1fr}}');
        
        % Slot (Card) CSS
        fprintf(fhtml, '.slot{background:#fff;border:2px dashed #cbd5e1;border-radius:12px;height:400px;display:flex;flex-direction:column;position:relative;transition:all 0.2s;overflow:hidden}');
        fprintf(fhtml, '.slot.active{border:1px solid #e2e8f0;border-style:solid;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)}');
        fprintf(fhtml, '.slot.drag-over{border-color:#3b82f6;background:#eff6ff}');
        fprintf(fhtml, '.slot-header{padding:0.75rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;font-size:0.75rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}');
        fprintf(fhtml, '.slot-body{flex:1;position:relative;min-height:0}');
        fprintf(fhtml, '.empty-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#94a3b8;pointer-events:none}');
        fprintf(fhtml, '.legend-tags{display:flex;gap:4px;overflow-x:auto;padding-right:8px}');
        fprintf(fhtml, '.tag{display:inline-flex;align-items:center;background:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;border:1px solid #e2e8f0;color:#334155;white-space:nowrap}');
        fprintf(fhtml, '.tag span{width:8px;height:8px;border-radius:50%%;margin-right:6px}');
        fprintf(fhtml, '.tag button{background:none;border:none;cursor:pointer;color:#cbd5e1;margin-left:6px;padding:0;font-size:14px;line-height:1}');
        fprintf(fhtml, '.tag button:hover{color:#ef4444}');
        
        fprintf(fhtml, '</style></head><body>');
        
        % HTML Body Layout
        fprintf(fhtml, '<div id="sidebar"><div id="sidebar-header"><h2 style="margin:0;font-size:1.2rem;color:#0f172a">%s</h2><p style="margin:0.25rem 0 0;font-size:0.75rem;color:#64748b">Drag signals to slots on the right</p></div><div id="tree"></div></div>', filename);
        fprintf(fhtml, '<div id="content"></div>');
        
        % JSON Data Embedding
        fprintf(fhtml, '<script>');
        fprintf(fhtml, 'const DATA = ');
        fwrite(fhtml, jsonStr);
        fprintf(fhtml, ';');
        
        % JavaScript Logic
        jsCode = {
            'const COLORS = ["#2563eb","#dc2626","#16a34a","#d97706","#9333ea","#0891b2"];',
            'const time = DATA.time || DATA.tout || DATA.t;',
            'const SLOTS_COUNT = 4;',
            '// Store array of {path, data} for each slot',
            'const slotsState = Array(SLOTS_COUNT).fill(null).map(() => []);',
            '',
            'function init() {',
            '  buildTree(DATA, document.getElementById("tree"), "");',
            '  initSlots();',
            '}',
            '',
            'function initSlots() {',
            '  const container = document.getElementById("content");',
            '  container.innerHTML = "";',
            '  for(let i=0; i<SLOTS_COUNT; i++) {',
            '    const slot = document.createElement("div");',
            '    slot.className = "slot";',
            '    slot.dataset.index = i;',
            '    slot.ondragover = (e) => { e.preventDefault(); slot.classList.add("drag-over"); };',
            '    slot.ondragleave = () => slot.classList.remove("drag-over");',
            '    slot.ondrop = (e) => handleDrop(e, i);',
            '    ',
            '    const header = document.createElement("div");',
            '    header.className = "slot-header";',
            '    header.innerHTML = \`<span>Slot \${i+1}</span><div class="legend-tags" id="tags-\${i}"></div><button onclick="clearSlot(\${i})" style="border:none;background:none;cursor:pointer;color:#94a3b8;font-size:0.7rem;font-weight:600">CLEAR</button>\`;',
            '    ',
            '    const body = document.createElement("div");',
            '    body.className = "slot-body";',
            '    body.id = \`chart-\${i}\`;',
            '    body.innerHTML = \`<div class="empty-state"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;margin-bottom:8px"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5"/><path d="M3 12l9 9 9-9"/></svg><span>Drag signals here</span></div>\`;',
            '    ',
            '    slot.appendChild(header);',
            '    slot.appendChild(body);',
            '    container.appendChild(slot);',
            '  }',
            '}',
            '',
            'function buildTree(obj, parent, path) {',
            '  const keys = Object.keys(obj).sort();',
            '  for(const key of keys) {',
            '    if(["time","tout","t","SimulationMetadata"].includes(key)) continue;',
            '    const val = obj[key];',
            '    const currentPath = path ? path + "." + key : key;',
            '    const div = document.createElement("div");',
            '    div.className = "node";',
            '    ',
            '    // Check if leaf (signal)',
            '    if(Array.isArray(val) && (val.length === 0 || typeof val[0] === "number")) {',
            '       div.className += " signal";',
            '       div.draggable = true;',
            '       div.ondragstart = (e) => {',
            '          e.dataTransfer.setData("text/plain", currentPath);',
            '          e.dataTransfer.effectAllowed = "copy";',
            '       };',
            '       // Also allow click to add to first empty or first slot',
            '       div.onclick = () => addSignalToSmartSlot(currentPath);',
            '       div.innerHTML = "<span>📈</span> " + key;',
            '       parent.appendChild(div);',
            '    } else if (typeof val === "object" && val !== null) {',
            '       // Folder',
            '       const header = document.createElement("div");',
            '       header.className = "folder";',
            '       header.innerHTML = "<span>📁</span> " + key;',
            '       const content = document.createElement("div");',
            '       content.className = "hidden";',
            '       header.onclick = () => {',
            '         content.classList.toggle("hidden");',
            '         header.innerHTML = content.classList.contains("hidden") ? "<span>📁</span> " + key : "<span>📂</span> " + key;',
            '       };',
            '       div.appendChild(header);',
            '       div.appendChild(content);',
            '       parent.appendChild(div);',
            '       buildTree(val, content, currentPath);',
            '    }',
            '  }',
            '}',
            '',
            'function getSignalData(pathStr) {',
            '   const parts = pathStr.split(".");',
            '   let curr = DATA;',
            '   for(const p of parts) curr = curr[p];',
            '   return curr;',
            '}',
            '',
            'function handleDrop(e, index) {',
            '   e.preventDefault();',
            '   document.querySelectorAll(".slot").forEach(s => s.classList.remove("drag-over"));',
            '   const path = e.dataTransfer.getData("text/plain");',
            '   if(path) addSignalToSlot(index, path);',
            '}',
            '',
            'function addSignalToSlot(index, path) {',
            '   const current = slotsState[index];',
            '   // Avoid duplicates',
            '   if(current.find(s => s.path === path)) return;',
            '   ',
            '   const data = getSignalData(path);',
            '   if(!data) return;',
            '   ',
            '   current.push({ path, data, name: path.split(".").pop() });',
            '   updateSlot(index);',
            '}',
            '',
            'function addSignalToSmartSlot(path) {',
            '   // Find first empty',
            '   let idx = slotsState.findIndex(s => s.length === 0);',
            '   if(idx === -1) idx = 0; // Default to first',
            '   addSignalToSlot(idx, path);',
            '}',
            '',
            'function removeSignal(slotIndex, path) {',
            '   slotsState[slotIndex] = slotsState[slotIndex].filter(s => s.path !== path);',
            '   updateSlot(slotIndex);',
            '}',
            '',
            'window.clearSlot = (index) => {',
            '   slotsState[index] = [];',
            '   updateSlot(index);',
            '};',
            '',
            'function updateSlot(index) {',
            '   const signals = slotsState[index];',
            '   const chartDiv = document.getElementById(\`chart-\${index}\`);',
            '   const tagsDiv = document.getElementById(\`tags-\${index}\`);',
            '   const slotEl = chartDiv.parentElement;',
            '   ',
            '   // Update Active State',
            '   if(signals.length > 0) slotEl.classList.add("active");',
            '   else slotEl.classList.remove("active");',
            '   ',
            '   // Update Tags',
            '   tagsDiv.innerHTML = signals.map((s, i) => \`',
            '     <div class="tag">',
            '       <span style="background:\${COLORS[i % COLORS.length]}"></span>',
            '       \${s.name}',
            '       <button onclick="removeSignal(\${index}, \\'\${s.path}\\')">×</button>',
            '     </div>',
            '   \`).join("");',
            '   ',
            '   // Update Chart',
            '   if(signals.length === 0) {',
            '      Plotly.purge(chartDiv);',
            '      chartDiv.innerHTML = \`<div class="empty-state"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;margin-bottom:8px"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5"/><path d="M3 12l9 9 9-9"/></svg><span>Drag signals here</span></div>\`;',
            '      return;',
            '   }',
            '   ',
            '   const traces = signals.map((s, i) => ({',
            '      x: time,',
            '      y: s.data,',
            '      name: s.name,',
            '      type: "scatter",',
            '      mode: "lines",',
            '      line: { color: COLORS[i % COLORS.length], width: 2 }',
            '   }));',
            '   ',
            '   const layout = {',
            '      margin: { t: 10, r: 10, l: 40, b: 30 },',
            '      showlegend: false,',
            '      hovermode: "x unified",',
            '      xaxis: { automargin: true, gridcolor: "#f1f5f9" },',
            '      yaxis: { automargin: true, gridcolor: "#f1f5f9" },',
            '      paper_bgcolor: "rgba(0,0,0,0)",',
            '      plot_bgcolor: "rgba(0,0,0,0)"',
            '   };',
            '   ',
            '   Plotly.react(chartDiv, traces, layout, { responsive: true, displayModeBar: true, displaylogo: false });',
            '}',
            '',
            'init();'
        };
        
        % Flatten cell array to string
        finalJs = strjoin(jsCode, '\\n');
        fprintf(fhtml, '%s', finalJs);
        fprintf(fhtml, '</script></body></html>');
        fclose(fhtml);
        fprintf('Generated: %s\\n', htmlFile);
        
    catch me
        warning('Failed to write HTML: %s', me.message);
        if exist('fhtml', 'var'), try fclose(fhtml); end; end
    end
end

function [jsonNode, tableCols] = process_node(data, currentName, masterTime)
    % Recursive function to handle heterogeneous data types
    
    jsonNode = [];
    tableCols = table();
    
    % Safe name for CSV columns
    safeName = regexprep(currentName, '[^a-zA-Z0-9_]', '_');
    
    % --- Type 1: Simulink Dataset (e.g. logsout) ---
    if isa(data, 'Simulink.SimulationData.Dataset')
        jsonNode = struct();
        numElements = data.numElements;
        for i = 1:numElements
            el = data.get(i);
            elName = el.Name;
            if isempty(elName), elName = sprintf('Element_%d', i); end
            
            % Dataset elements usually have a .Values property which is a Timeseries or Struct
            fullName = [currentName '_' elName];
            [subJson, subTable] = process_node(el.Values, fullName, masterTime);
            
            safeElName = regexprep(elName, '[^a-zA-Z0-9_]', '_');
            jsonNode.(safeElName) = subJson;
            if ~isempty(subTable), tableCols = [tableCols, subTable]; end %#ok<AGROW>
        end
        return;
    end
    
    % --- Type 2: Timeseries ---
    if isa(data, 'timeseries')
        rawVals = data.Data;
        rawTime = data.Time;
        
        % Squeeze to handle 1x1xN or Nx1x1
        rawVals = squeeze(rawVals);
        
        % Align data to masterTime
        alignedData = align_data(rawVals, rawTime, masterTime);
        
        if ~isempty(alignedData)
            jsonNode = alignedData;
            
            % For CSV: Handle vector signals (width > 1)
            [rows, cols] = size(alignedData);
            if rows == length(masterTime) && cols > 1
                for k = 1:cols
                    colName = sprintf('%s_%d', safeName, k);
                    tableCols.(colName) = alignedData(:, k);
                end
            else
                tableCols.(safeName) = alignedData;
            end
        end
        return;
    end
    
    % --- Type 3: Struct (Bus or Structure with Time) ---
    if isstruct(data)
        % Check for "Structure with Time" format (time + signals)
        if isfield(data, 'time') && isfield(data, 'signals')
            % It's a struct with time, process signals
            % Note: We use masterTime, but we could use data.time if preferred
             [jsonNode, tableCols] = process_node(data.signals, currentName, masterTime);
             return;
        end
        
        % Standard Struct / Bus
        jsonNode = struct();
        % Handle Struct Array (e.g. array of buses)
        if numel(data) > 1
            % Treat as array of objects
            % Matlab jsonencode handles struct arrays, but we need to process children for CSV/Resampling
            % For simplicity in this script, we iterate indices
            cellNode = cell(1, numel(data));
            for idx = 1:numel(data)
                subName = sprintf('%s_%d', currentName, idx);
                [subJson, subTable] = process_node(data(idx), subName, masterTime);
                cellNode{idx} = subJson;
                if ~isempty(subTable), tableCols = [tableCols, subTable]; end %#ok<AGROW>
            end
            % If structure is uniform, we can try to return it as a struct array, 
            % but cell array is safer for JSON heterogeneity
            try
                jsonNode = [cellNode{:}]; % Attempt to concat to struct array
            catch
                jsonNode = cellNode;
            end
            return;
        end
        
        % Scalar Struct
        fields = fieldnames(data);
        for i = 1:length(fields)
            fName = fields{i};
            
            % Check if this field is 'values' inside a "signals" struct
            if strcmp(fName, 'values') && isnumeric(data.(fName))
                 % This is likely the leaf of a "Structure with Time"
                 % We treat it as a signal
                 vals = double(data.values);
                 % We assume the parent struct had 'time', but we passed masterTime.
                 % If we don't have local time, we assume alignment or fail gracefully?
                 % "Structure with Time" signals usually align with the struct's .time
                 % Here we assume they align with masterTime or we just dump them
                 
                 % Simple approach: If length matches, keep. Else, try to fix?
                 % Without specific time vector for this leaf, strict resampling is hard.
                 % We assume "Structure with Time" implies synchronized data.
                 
                 % Force column
                 vals = squeeze(vals);
                 if size(vals,1) ~= length(masterTime) && size(vals,2) == length(masterTime)
                     vals = vals';
                 end
                 
                 % Final check
                 if size(vals,1) == length(masterTime)
                     jsonNode = vals; 
                     tableCols.(safeName) = vals;
                     return; % Replace the struct with this value in JSON? 
                             % Actually, better to keep hierarchy or return as is.
                             % Let's return the value directly.
                 end
            end
            
            fullName = [currentName '_' fName];
            [subJson, subTable] = process_node(data.(fName), fullName, masterTime);
            
            if ~isempty(subJson)
                jsonNode.(fName) = subJson;
            end
            if ~isempty(subTable)
                tableCols = [tableCols, subTable]; %#ok<AGROW>
            end
        end
        return;
    end
    
    % --- Type 4: Numeric Array ---
    if isnumeric(data) || islogical(data)
        vals = double(data);
        vals = squeeze(vals);
        
        % If it's a scalar or constant, expand it?
        if numel(vals) == 1
            vals = repmat(vals, length(masterTime), 1);
        end
        
        % Check dimensions (row vs col)
        if size(vals, 1) ~= length(masterTime) && size(vals, 2) == length(masterTime)
            vals = vals';
        end
        
        if size(vals, 1) == length(masterTime)
            jsonNode = vals;
            
             % Add to CSV
            if size(vals, 2) > 1
                for k = 1:size(vals, 2)
                    colName = sprintf('%s_%d', safeName, k);
                    tableCols.(colName) = vals(:, k);
                end
            else
                tableCols.(safeName) = vals;
            end
        end
        return;
    end
end

function aligned = align_data(data, t_data, t_master)
    % Resample or interp data to match t_master
    
    % Validate inputs
    if isempty(data) || isempty(t_data), aligned = []; return; end
    
    % Ensure column vectors
    t_data = t_data(:);
    
    % If data is Row x Time (e.g. 3 x N), transpose to N x 3
    if size(data, 1) ~= length(t_data) && size(data, 2) == length(t_data)
        data = data';
    end
    
    % Check if dimensions match time
    if size(data, 1) ~= length(t_data)
        % Mismatch that transpose didn't fix
        aligned = [];
        return;
    end

    % 1. Exact Match Check
    if length(t_data) == length(t_master)
        % Check a few points to verify sync (tolerance)
        if max(abs(t_data - t_master)) < 1e-9
            aligned = data;
            return;
        end
    end
    
    % 2. Resample / Interpolate
    try
        % Use interp1 for linear interpolation
        % Handle multiple columns
        aligned = interp1(t_data, data, t_master, 'linear', 'extrap');
    catch
        aligned = [];
    end
end

function t = find_first_time_vector(s)
    % Helper to deep search for a timeseries and extract its Time
    t = [];
    fields = fieldnames(s);
    for i = 1:length(fields)
        val = s.(fields{i});
        if isa(val, 'timeseries')
            t = val.Time;
            return;
        elseif isa(val, 'Simulink.SimulationData.Dataset')
            if val.numElements > 0
                el = val.get(1);
                if isa(el.Values, 'timeseries')
                    t = el.Values.Time;
                    return;
                end
            end
        elseif isstruct(val)
             t = find_first_time_vector(val);
             if ~isempty(t), return; end
        end
    end
end`;

  const handleCopy = () => {
    navigator.clipboard.writeText(matlabCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-100 rounded-md text-slate-700">
                <FileCode size={20} />
            </div>
            <div>
                <h2 className="text-lg font-bold text-slate-800">Matlab Export Script</h2>
                <p className="text-xs text-slate-500">Copy this code to a .m file in Matlab</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-0 bg-slate-50 relative group">
          <button
            onClick={handleCopy}
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-md shadow-sm text-xs font-medium text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all z-10"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Code"}
          </button>
          
          <pre className="p-6 text-sm font-mono text-slate-800 leading-relaxed overflow-x-auto selection:bg-blue-100 selection:text-blue-900">
            {matlabCode}
          </pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-slate-50 flex justify-end">
            <button 
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default ScriptModal;