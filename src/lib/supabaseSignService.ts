import { supabase } from '@/integrations/supabase/client';
import { FrameData } from './mediapipe';

export interface SignRecord {
  id: string;
  user_id: string;
  name: string;
  video_url?: string;
  keyframes: FrameData[];
  duration: number;
  created_at: string;
  updated_at: string;
}

export class SupabaseSignService {
  async saveSign(sign: { 
    name: string; 
    videoBlob: Blob; 
    keyframes: FrameData[]; 
    duration: number 
  }): Promise<string> {
    try {
      // Upload video to storage
      const videoFileName = `public/${crypto.randomUUID()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('sign-videos')
        .upload(videoFileName, sign.videoBlob, {
          contentType: 'video/webm'
        });

      if (uploadError) {
        console.error('Error uploading video:', uploadError);
        throw new Error('Error subiendo el video');
      }

      // Get video URL
      const { data: { publicUrl } } = supabase.storage
        .from('sign-videos')
        .getPublicUrl(videoFileName);

      // Save sign record to database
      const { data, error } = await supabase
        .from('signs')
        .insert({
          user_id: null, // No user required
          name: sign.name,
          video_url: publicUrl,
          keyframes: sign.keyframes as any,
          duration: sign.duration
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving sign:', error);
        throw new Error('Error guardando la seña');
      }

      return data.id;
    } catch (error) {
      console.error('Error in saveSign:', error);
      throw error;
    }
  }

  async getAllSigns(): Promise<SignRecord[]> {
    try {
      const { data, error } = await supabase
        .from('signs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading signs:', error);
        throw new Error('Error cargando las señas');
      }

      return (data || []).map(item => ({
        ...item,
        keyframes: item.keyframes as unknown as FrameData[]
      }));
    } catch (error) {
      console.error('Error in getAllSigns:', error);
      throw error;
    }
  }

  async getSign(id: string): Promise<SignRecord | null> {
    try {
      const { data, error } = await supabase
        .from('signs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error getting sign:', error);
        return null;
      }

      return {
        ...data,
        keyframes: data.keyframes as unknown as FrameData[]
      };
    } catch (error) {
      console.error('Error in getSign:', error);
      return null;
    }
  }

  async deleteSign(id: string): Promise<void> {
    try {
      // Get sign info first to delete video file
      const sign = await this.getSign(id);
      
      // Delete from database
      const { error } = await supabase
        .from('signs')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting sign:', error);
        throw new Error('Error eliminando la seña');
      }

      // Delete video file if exists
      if (sign?.video_url) {
        const videoPath = sign.video_url.split('/').slice(-2).join('/');
        await supabase.storage
          .from('sign-videos')
          .remove([videoPath]);
      }
    } catch (error) {
      console.error('Error in deleteSign:', error);
      throw error;
    }
  }

  async getVideoBlob(videoUrl: string): Promise<Blob> {
    try {
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error('Error descargando el video');
      }
      return await response.blob();
    } catch (error) {
      console.error('Error getting video blob:', error);
      throw error;
    }
  }

  // Initialize method for compatibility with existing code
  async initialize(): Promise<void> {
    // No authentication required anymore
    console.log('✅ Supabase inicializado sin autenticación');
  }
}

export const supabaseSignService = new SupabaseSignService();