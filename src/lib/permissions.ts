import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

export class PermissionsService {
  private static instance: PermissionsService;

  public static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  /**
   * Solicita permisos de cámara de forma compatible con Android
   */
  async requestCameraPermissions(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('Solicitando permisos de cámara en plataforma nativa...');
        const permissions = await Camera.requestPermissions();
        
        if (permissions.camera === 'granted') {
          console.log('✅ Permisos de cámara otorgados');
          return true;
        } else {
          console.warn('❌ Permisos de cámara denegados:', permissions.camera);
          return false;
        }
      } else {
        // En web, los permisos se manejan automáticamente con getUserMedia
        console.log('En web - permisos se manejan automáticamente');
        return true;
      }
    } catch (error) {
      console.error('Error solicitando permisos de cámara:', error);
      return false;
    }
  }

  /**
   * Verifica si los permisos de cámara están otorgados
   */
  async checkCameraPermissions(): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        const permissions = await Camera.checkPermissions();
        return permissions.camera === 'granted';
      } else {
        // En web, asumir que están disponibles
        return true;
      }
    } catch (error) {
      console.error('Error verificando permisos de cámara:', error);
      return false;
    }
  }

  /**
   * Muestra un mensaje de ayuda para permisos en Android
   */
  showAndroidPermissionGuide(): string {
    if (Capacitor.getPlatform() === 'android') {
      return `Para usar la cámara en Android:
1. Ve a Configuración > Aplicaciones
2. Encuentra esta aplicación
3. Selecciona "Permisos"
4. Activa "Cámara"
5. Reinicia la aplicación`;
    }
    return 'Permisos de cámara requeridos para el funcionamiento de la aplicación.';
  }

  /**
   * Verifica si estamos en Android WebView
   */
  isAndroidWebView(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /**
   * Obtiene información de la plataforma para debugging
   */
  getPlatformInfo(): { platform: string; isNative: boolean; isAndroid: boolean } {
    return {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform(),
      isAndroid: Capacitor.getPlatform() === 'android'
    };
  }
}

export const permissionsService = PermissionsService.getInstance();