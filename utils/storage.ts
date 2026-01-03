import { ParsedDataset, StoredDataset, StoredDatasetMetadata, AuthorizedUser } from "../types";

const DB_NAME = 'Data_VisualizationDB';
// Increment version to trigger upgrade for the new 'users' store
const VERSION = 2; 
const STORE_DATASETS = 'datasets';
const STORE_USERS = 'users';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      
      // Create Datasets Store if not exists
      if (!db.objectStoreNames.contains(STORE_DATASETS)) {
        db.createObjectStore(STORE_DATASETS, { keyPath: 'id' });
      }

      // Create Users Store if not exists
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: 'email' });
      }
    };
  });
};

// --- Dataset Operations ---

export const saveDataset = async (dataset: ParsedDataset, name: string, uploader: string): Promise<StoredDatasetMetadata> => {
  const db = await initDB();
  const id = `${Date.now()}_${name.replace(/\s+/g, '_')}`;
  
  const record: StoredDataset = {
    id,
    name,
    uploadDate: Date.now(),
    uploader: uploader,
    size: JSON.stringify(dataset).length, // Approximate size
    data: dataset
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readwrite');
    const store = tx.objectStore(STORE_DATASETS);
    const request = store.add(record);
    
    request.onsuccess = () => resolve({
      id: record.id,
      name: record.name,
      uploadDate: record.uploadDate,
      uploader: record.uploader,
      size: record.size
    });
    request.onerror = () => reject(request.error);
  });
};

export const getAllMetadata = async (): Promise<StoredDatasetMetadata[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readonly');
    const store = tx.objectStore(STORE_DATASETS);
    const request = store.getAll(); 
    
    request.onsuccess = () => {
      const results: StoredDataset[] = request.result;
      const metadata = results.map(({ data, ...meta }) => meta).sort((a, b) => b.uploadDate - a.uploadDate);
      resolve(metadata);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getDataset = async (id: string): Promise<ParsedDataset | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readonly');
    const store = tx.objectStore(STORE_DATASETS);
    const request = store.get(id);
    
    request.onsuccess = () => {
      const record: StoredDataset = request.result;
      resolve(record ? record.data : null);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteDataset = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATASETS, 'readwrite');
    const store = tx.objectStore(STORE_DATASETS);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- User Management Operations ---

export const addAuthorizedUser = async (email: string, adminEmail: string): Promise<void> => {
  const db = await initDB();
  const user: AuthorizedUser = {
    email: email.trim(),
    addedBy: adminEmail,
    addedDate: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, 'readwrite');
    const store = tx.objectStore(STORE_USERS);
    const request = store.put(user); // Use put to add or update
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const removeAuthorizedUser = async (email: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, 'readwrite');
    const store = tx.objectStore(STORE_USERS);
    const request = store.delete(email);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAuthorizedUsers = async (): Promise<AuthorizedUser[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, 'readonly');
    const store = tx.objectStore(STORE_USERS);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const isUserAuthorized = async (email: string): Promise<boolean> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USERS, 'readonly');
    const store = tx.objectStore(STORE_USERS);
    const request = store.get(email);
    
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
  });
};