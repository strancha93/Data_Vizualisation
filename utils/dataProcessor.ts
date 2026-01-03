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

// Generate dummy data for demo purposes
export const generateDemoData = (): any => {
  const steps = 1000;
  const t = Array.from({ length: steps }, (_, i) => i * 0.01);
  
  return {
    time: t,
    simulation_metadata: {
      version: 1.0,
      solver: "ode45"
    },
    vehicle_bus: {
      speed: t.map(val => 10 * (1 - Math.exp(-val)) + Math.random() * 0.5),
      engine: {
        rpm: t.map(val => 2000 + 1000 * Math.sin(val) + Math.random() * 50),
        temperature: t.map(val => 80 + 10 * (1 - Math.exp(-0.1 * val))),
        cylinders: [
           { pressure: t.map(val => 10 * Math.sin(10 * val)) },
           { pressure: t.map(val => 10 * Math.sin(10 * val + Math.PI)) }
        ]
      },
      chassis: {
        suspension_fl: t.map(val => Math.sin(5 * val) * Math.exp(-0.5 * val)),
        suspension_fr: t.map(val => Math.cos(5 * val) * Math.exp(-0.5 * val))
      }
    }
  };
};