import { BusNode, ParsedDataset, SignalData } from "../types";

// Helper to check if an array is purely numeric
const isNumericArray = (arr: any[]): boolean => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every(item => typeof item === 'number');
};

// Calculate basic stats
const calculateStats = (data: number[]) => {
  if (data.length === 0) return { min: 0, max: 0, mean: 0, stdDev: 0 };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const sum = data.reduce((a, b) => a + b, 0);
  const mean = sum / data.length;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
  return { min, max, mean, stdDev: Math.sqrt(variance) };
};

export const parseMatlabJson = (jsonData: any, fileName: string): ParsedDataset => {
  const flatSignals: Record<string, SignalData> = {};
  let commonTimeVector: number[] | undefined = undefined;

  // Look for common time vectors often named 'time', 'tout', 't' at root
  if (jsonData.time && isNumericArray(jsonData.time)) commonTimeVector = jsonData.time;
  else if (jsonData.tout && isNumericArray(jsonData.tout)) commonTimeVector = jsonData.tout;
  else if (jsonData.t && isNumericArray(jsonData.t)) commonTimeVector = jsonData.t;

  const traverse = (node: any, path: string[], busName: string): BusNode => {
    const currentBus: BusNode = {
      name: busName,
      path: path,
      signals: [],
      subBuses: []
    };

    if (typeof node !== 'object' || node === null) return currentBus;

    // Iterate keys
    for (const key of Object.keys(node)) {
      const value = node[key];
      const newPath = [...path, key];
      const id = newPath.join('.');

      // Case 1: Value is a numeric array (Signal)
      if (isNumericArray(value)) {
        // Exclude the common time vector from being treated as a signal if found at root
        if ((key === 'time' || key === 'tout') && path.length === 0) continue;

        const signal: SignalData = {
          id,
          name: key,
          path: newPath,
          data: value,
          stats: calculateStats(value),
          time: commonTimeVector // Assign global time if available
        };
        currentBus.signals.push(signal);
        flatSignals[id] = signal;
        continue;
      }

      // Case 2: Matlab Timeseries Object { data: [], time: [] }
      if (value && typeof value === 'object' && isNumericArray(value.data) && isNumericArray(value.time)) {
        const signal: SignalData = {
          id,
          name: key,
          path: newPath,
          data: value.data,
          time: value.time,
          stats: calculateStats(value.data)
        };
        currentBus.signals.push(signal);
        flatSignals[id] = signal;
        continue;
      }

      // Case 3: Nested Object (SubBus)
      if (typeof value === 'object' && !Array.isArray(value)) {
        const subBus = traverse(value, newPath, key);
        // Only add subBus if it contains something relevant
        if (subBus.signals.length > 0 || subBus.subBuses.length > 0) {
          currentBus.subBuses.push(subBus);
        }
        continue;
      }

       // Case 4: Array of Objects (Struct Array) - Simplified handling
       if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          // Treat the array index as a sub-bus
          value.forEach((item, index) => {
             const subBus = traverse(item, [...newPath, index.toString()], `${key}[${index}]`);
             if (subBus.signals.length > 0 || subBus.subBuses.length > 0) {
                currentBus.subBuses.push(subBus);
             }
          });
       }
    }

    return currentBus;
  };

  const rootBus = traverse(jsonData, [], fileName);

  return {
    rootBus,
    flatSignals,
    commonTimeVector
  };
};

export const parseCsv = (content: string, fileName: string): ParsedDataset => {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV file is empty or missing headers");

  // Parse Headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Parse Data Rows
  // Filter out empty lines
  const dataRows = lines.slice(1)
    .filter(line => line.trim().length > 0)
    .map(line => line.split(',').map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? 0 : num; // Handle NaNs gracefully
    }));

  if (dataRows.length === 0) throw new Error("No data rows found in CSV");

  // Pivot data: row-major to column-major
  // headers.length determines number of columns
  const columns: number[][] = headers.map(() => []);
  
  dataRows.forEach(row => {
    headers.forEach((_, colIdx) => {
       // If row is shorter than headers, push 0 or similar
       const val = row[colIdx] !== undefined ? row[colIdx] : 0;
       columns[colIdx].push(val);
    });
  });

  let timeVector: number[] = [];
  const signals: SignalData[] = [];
  const flatSignals: Record<string, SignalData> = {};

  // Identify Time Column
  const timeIdx = headers.findIndex(h => /^(time|t|tout)$/i.test(h));
  
  if (timeIdx !== -1) {
    timeVector = columns[timeIdx];
  } else {
    // Fallback: Use the first column as time if strictly monotonic? 
    // Or just generate an index based time 0..N
    // Let's default to first column as generic 'x-axis' if no time found, 
    // unless there is only 1 column, then it is data.
    if (columns.length > 1) {
       timeVector = columns[0];
    } else {
       timeVector = columns[0].map((_, i) => i);
    }
  }

  headers.forEach((header, idx) => {
    // If we identified a specific time column, skip it in the signal list
    // (unless you want to plot time vs time)
    if (timeIdx !== -1 && idx === timeIdx) return;
    
    // If we used column 0 as fallback time, we might still want to plot it, but usually not.
    // Let's include it if we want, but for now let's skip if it is exactly the time vector.

    const safeName = header.replace(/\W/g, '_');
    const id = `${fileName}.${safeName}`;
    const signal: SignalData = {
      id,
      name: header,
      path: [fileName, header],
      data: columns[idx],
      time: timeVector,
      stats: calculateStats(columns[idx])
    };
    signals.push(signal);
    flatSignals[id] = signal;
  });

  const rootBus: BusNode = {
    name: fileName,
    path: [],
    signals: signals,
    subBuses: []
  };

  return {
    rootBus,
    flatSignals,
    commonTimeVector: timeVector
  };
};

export const parseJs = (content: string, fileName: string): ParsedDataset => {
  // 1. Try to extract JSON object between first { and last }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');

  let targetObject: any = null;

  if (firstBrace !== -1 && lastBrace !== -1) {
    const potentialJson = content.substring(firstBrace, lastBrace + 1);
    try {
      targetObject = JSON.parse(potentialJson);
    } catch (e) {
      // If strict JSON parse fails, try evaluating as JS object (e.g. keys without quotes)
      try {
        // use Function constructor to safely evaluate data object
        targetObject = new Function(`return ${potentialJson};`)();
      } catch (e2) {
        console.warn("Failed to parse JS object block", e2);
      }
    }
  }

  // 2. If that failed, try evaluating the whole file content if it looks like an assignment
  if (!targetObject) {
     const cleaned = content.replace(/^(export\s+)?(const|let|var)\s+\w+\s*=\s*/, '').replace(/;$/, '');
     try {
        targetObject = new Function(`return ${cleaned};`)();
     } catch (e) {
        throw new Error("Could not parse JS/Text file as valid data object.");
     }
  }

  if (targetObject) {
    return parseMatlabJson(targetObject, fileName);
  }
  
  throw new Error("No valid data structure found in file.");
};

export const filterBusTree = (node: BusNode, term: string): BusNode | null => {
  if (!term) return node;
  const lowerTerm = term.toLowerCase();

  // If current node name matches, we return the full subtree to allow exploration of that bus
  if (node.name.toLowerCase().includes(lowerTerm)) {
     return node;
  }

  // Filter signals in this node
  const matchingSignals = node.signals.filter(s => s.name.toLowerCase().includes(lowerTerm));
  
  // Recursively filter sub-buses
  const matchingSubBuses: BusNode[] = [];
  node.subBuses.forEach(sub => {
    const res = filterBusTree(sub, term);
    if (res) matchingSubBuses.push(res);
  });
  
  // Return node only if it has matching content
  if (matchingSignals.length > 0 || matchingSubBuses.length > 0) {
    return {
      ...node,
      signals: matchingSignals,
      subBuses: matchingSubBuses
    };
  }
  
  return null;
};