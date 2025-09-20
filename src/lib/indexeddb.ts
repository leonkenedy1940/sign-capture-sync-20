import { FrameData } from './mediapipe';

export interface SignRecord {
  id: string;
  name: string;
  videoBlob: Blob;
  keyframes: FrameData[];
  duration: number;
  createdAt: Date;
}

class SignDatabase {
  private dbName = 'SignLanguageDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('signs')) {
          const store = db.createObjectStore('signs', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  async saveSign(sign: Omit<SignRecord, 'id' | 'createdAt'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = crypto.randomUUID();
    const signRecord: SignRecord = {
      ...sign,
      id,
      createdAt: new Date()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signs'], 'readwrite');
      const store = transaction.objectStore('signs');
      const request = store.add(signRecord);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getAllSigns(): Promise<SignRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signs'], 'readonly');
      const store = transaction.objectStore('signs');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getSign(id: string): Promise<SignRecord | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signs'], 'readonly');
      const store = transaction.objectStore('signs');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async deleteSign(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['signs'], 'readwrite');
      const store = transaction.objectStore('signs');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

export const signDatabase = new SignDatabase();