import { signDatabase, SignRecord as IndexedDBSignRecord } from '@/lib/indexeddb';
import { supabaseSignService, SignRecord as SupabaseSignRecord } from '@/lib/supabaseSignService';
import { FrameData } from './mediapipe';

// Unified interface for both storage types
export interface SignRecord {
  id: string;
  name: string;
  videoBlob?: Blob;
  video_url?: string;
  keyframes: FrameData[];
  duration: number;
  createdAt?: Date;
  created_at?: string;
  isLocal: boolean;
}

export class HybridSignService {
  private isOnline: boolean = navigator.onLine;
  private hasSupabaseAuth: boolean = false;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📶 Conexión restaurada - modo online');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 Sin conexión - modo offline');
    });
  }

  async initialize(): Promise<void> {
    // Always initialize IndexedDB for offline support
    await signDatabase.initialize();
    
    // Try to initialize Supabase if online
    if (this.isOnline) {
      try {
        await supabaseSignService.initialize();
        this.hasSupabaseAuth = true;
        console.log('✅ Supabase inicializado - datos en la nube disponibles');
      } catch (error) {
        console.log('📱 Modo offline - usando almacenamiento local');
        this.hasSupabaseAuth = false;
      }
    }
  }

  async saveSign(sign: { 
    name: string; 
    videoBlob: Blob; 
    keyframes: FrameData[]; 
    duration: number 
  }): Promise<string> {
    // Always save locally first for offline functionality
    const localId = await signDatabase.saveSign(sign);
    console.log('💾 Seña guardada localmente:', localId);

    // Try to save to Supabase if available
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        const cloudId = await supabaseSignService.saveSign(sign);
        console.log('☁️ Seña sincronizada en la nube:', cloudId);
        return cloudId;
      } catch (error) {
        console.log('⚠️ Error sincronizando con la nube, manteniendo copia local');
      }
    }

    return localId;
  }

  async getAllSigns(): Promise<SignRecord[]> {
    const allSigns: SignRecord[] = [];

    // Always load local signs
    try {
      const localSigns = await signDatabase.getAllSigns();
      allSigns.push(...localSigns.map(sign => ({
        ...sign,
        isLocal: true,
        createdAt: sign.createdAt,
        created_at: sign.createdAt.toISOString()
      })));
    } catch (error) {
      console.error('Error loading local signs:', error);
    }

    // Load cloud signs if available
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        const cloudSigns = await supabaseSignService.getAllSigns();
        allSigns.push(...cloudSigns.map(sign => ({
          ...sign,
          isLocal: false,
          createdAt: new Date(sign.created_at)
        })));
      } catch (error) {
        console.log('📱 No se pudieron cargar las señas de la nube - mostrando solo locales');
      }
    }

    // Remove duplicates and sort by date
    const uniqueSigns = this.removeDuplicates(allSigns);
    return uniqueSigns.sort((a, b) => {
      const dateA = a.createdAt || new Date(a.created_at || 0);
      const dateB = b.createdAt || new Date(b.created_at || 0);
      return dateB.getTime() - dateA.getTime();
    });
  }

  async getSign(id: string): Promise<SignRecord | null> {
    // Try local first
    const localSign = await signDatabase.getSign(id);
    if (localSign) {
      return {
        ...localSign,
        isLocal: true,
        created_at: localSign.createdAt.toISOString()
      };
    }

    // Try cloud if available
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        const cloudSign = await supabaseSignService.getSign(id);
        if (cloudSign) {
          return {
            ...cloudSign,
            isLocal: false,
            createdAt: new Date(cloudSign.created_at)
          };
        }
      } catch (error) {
        console.error('Error getting cloud sign:', error);
      }
    }

    return null;
  }

  async deleteSign(id: string): Promise<void> {
    // Try to delete from both local and cloud
    const errors: string[] = [];

    try {
      await signDatabase.deleteSign(id);
    } catch (error) {
      errors.push('local');
      console.error('Error deleting local sign:', error);
    }

    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        await supabaseSignService.deleteSign(id);
      } catch (error) {
        errors.push('cloud');
        console.error('Error deleting cloud sign:', error);
      }
    }

    if (errors.length === 2) {
      throw new Error('Error eliminando la seña');
    }
  }

  async getVideoBlob(sign: SignRecord): Promise<Blob> {
    if (sign.isLocal && sign.videoBlob) {
      return sign.videoBlob;
    }

    if (!sign.isLocal && sign.video_url && this.isOnline) {
      try {
        return await supabaseSignService.getVideoBlob(sign.video_url);
      } catch (error) {
        console.error('Error getting video from cloud:', error);
        throw new Error('No se pudo cargar el video');
      }
    }

    throw new Error('Video no disponible');
  }

  private removeDuplicates(signs: SignRecord[]): SignRecord[] {
    const seen = new Set();
    return signs.filter(sign => {
      const key = `${sign.name}-${sign.duration}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  getConnectionStatus(): { isOnline: boolean; hasSupabaseAuth: boolean } {
    return {
      isOnline: this.isOnline,
      hasSupabaseAuth: this.hasSupabaseAuth
    };
  }
}

export const hybridSignService = new HybridSignService();