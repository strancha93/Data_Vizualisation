export interface DataPoint {
  time: number;
  value: number;
}

export interface SignalData {
  id: string;
  name: string;
  path: string[];
  data: number[];
  time?: number[]; // Explicit time vector if available
  stats?: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
  };
}

export interface BusNode {
  name: string;
  path: string[];
  signals: SignalData[];
  subBuses: BusNode[];
}

export enum FileStatus {
  IDLE,
  LOADING,
  PARSED,
  ERROR
}

export interface ParsedDataset {
  rootBus: BusNode;
  flatSignals: Record<string, SignalData>;
  commonTimeVector?: number[];
}

export type UserRole = 'tester' | 'viewer' | 'admin';

export interface StoredDatasetMetadata {
  id: string;
  name: string;
  uploadDate: number;
  uploader: string; // email or 'tester'
  size: number;
}

export interface StoredDataset extends StoredDatasetMetadata {
  data: ParsedDataset;
}

export interface AuthorizedUser {
  email: string;
  addedBy: string;
  addedDate: number;
}