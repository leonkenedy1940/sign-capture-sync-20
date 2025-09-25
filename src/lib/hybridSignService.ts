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
  private migrationCompleted: boolean = false;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📶 Conexión restaurada - modo online');
      this.syncIfPossible();
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
        
        // Migrate IndexedDB data to Supabase if not done yet
        await this.migrateLocalDataToSupabase();
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
    // Try to save to Supabase first if available
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        const cloudId = await supabaseSignService.saveSign(sign);
        console.log('☁️ Seña guardada en la nube:', cloudId);
        return cloudId;
      } catch (error) {
        console.log('⚠️ Error guardando en la nube, guardando localmente');
      }
    }

    // Fallback to local storage
    const localId = await signDatabase.saveSign(sign);
    console.log('💾 Seña guardada localmente:', localId);
    return localId;
  }

  async getAllSigns(): Promise<SignRecord[]> {
    // Prioritize cloud signs if available
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        const cloudSigns = await supabaseSignService.getAllSigns();
        console.log('☁️ Cargadas señas desde la nube');
        return cloudSigns.map(sign => ({
          ...sign,
          isLocal: false,
          createdAt: new Date(sign.created_at)
        }));
      } catch (error) {
        console.log('⚠️ Error cargando desde la nube, usando datos locales');
      }
    }

    // Fallback to local signs
    try {
      const localSigns = await signDatabase.getAllSigns();
      console.log('💾 Cargadas señas locales');
      return localSigns.map(sign => ({
        ...sign,
        isLocal: true,
        createdAt: sign.createdAt,
        created_at: sign.createdAt.toISOString()
      }));
    } catch (error) {
      console.error('Error loading local signs:', error);
      return [];
    }
  }

  async getSign(id: string): Promise<SignRecord | null> {
    // Try cloud first if available
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

    // Fallback to local
    const localSign = await signDatabase.getSign(id);
    if (localSign) {
      return {
        ...localSign,
        isLocal: true,
        created_at: localSign.createdAt.toISOString()
      };
    }

    return null;
  }

  async deleteSign(id: string): Promise<void> {
    // Try to delete from cloud first
    if (this.isOnline && this.hasSupabaseAuth) {
      try {
        await supabaseSignService.deleteSign(id);
        console.log('☁️ Seña eliminada de la nube');
        return;
      } catch (error) {
        console.error('Error deleting cloud sign:', error);
      }
    }

    // Fallback to local deletion
    try {
      await signDatabase.deleteSign(id);
      console.log('💾 Seña eliminada localmente');
    } catch (error) {
      console.error('Error deleting local sign:', error);
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

  private async migrateLocalDataToSupabase(): Promise<void> {
    if (this.migrationCompleted || !this.hasSupabaseAuth) return;

    try {
      const localSigns = await signDatabase.getAllSigns();
      if (localSigns.length === 0) {
        this.migrationCompleted = true;
        return;
      }

      console.log(`🔄 Migrando ${localSigns.length} señas locales a Supabase...`);
      
      for (const localSign of localSigns) {
        try {
          await supabaseSignService.saveSign({
            name: localSign.name,
            videoBlob: localSign.videoBlob,
            keyframes: localSign.keyframes,
            duration: localSign.duration
          });
          
          // Delete from local storage after successful migration
          await signDatabase.deleteSign(localSign.id);
          console.log(`✅ Migrada seña: ${localSign.name}`);
        } catch (error) {
          console.error(`❌ Error migrando seña ${localSign.name}:`, error);
        }
      }
      
      this.migrationCompleted = true;
      console.log('🎉 Migración completada');
    } catch (error) {
      console.error('Error durante la migración:', error);
    }
  }

  private async syncIfPossible(): Promise<void> {
    if (this.hasSupabaseAuth && !this.migrationCompleted) {
      await this.migrateLocalDataToSupabase();
    }
  }

  getConnectionStatus(): { isOnline: boolean; hasSupabaseAuth: boolean } {
    return {
      isOnline: this.isOnline,
      hasSupabaseAuth: this.hasSupabaseAuth
    };
  }
}

export const hybridSignService = new HybridSignService();