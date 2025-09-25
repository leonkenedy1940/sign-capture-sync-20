import { Capacitor } from '@capacitor/core';
import { permissionsService } from './permissions';

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: string;
  facing?: 'front' | 'back' | 'environment' | 'user';
}

export class CameraManager {
  private static instance: CameraManager;
  private devices: CameraDevice[] = [];

  public static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  public async getAvailableCameras(): Promise<CameraDevice[]> {
    try {
      // Verificar y solicitar permisos en plataformas nativas
      if (Capacitor.isNativePlatform()) {
        const hasPermissions = await permissionsService.checkCameraPermissions();
        if (!hasPermissions) {
          const granted = await permissionsService.requestCameraPermissions();
          if (!granted) {
            console.warn('Permisos de cámara no otorgados');
            return [];
          }
        }
      }

      // Enumerar dispositivos
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Cámara ${device.deviceId.substring(0, 5)}`,
          kind: device.kind,
          facing: this.detectFacing(device.label)
        }));

      // En Android, agregar cámaras predeterminadas si no se detectan
      if (Capacitor.getPlatform() === 'android' && this.devices.length === 0) {
        this.devices = [
          {
            deviceId: 'front',
            label: 'Cámara Frontal',
            kind: 'videoinput',
            facing: 'front'
          },
          {
            deviceId: 'back',
            label: 'Cámara Trasera',
            kind: 'videoinput',
            facing: 'back'
          }
        ];
      }

      console.log('📷 Cámaras disponibles:', this.devices, permissionsService.getPlatformInfo());
      return this.devices;
    } catch (error) {
      console.error('Error obteniendo cámaras:', error);
      return [];
    }
  }

  private detectFacing(label: string): 'front' | 'back' | 'environment' | 'user' {
    const lowerLabel = label.toLowerCase();
    if (lowerLabel.includes('front') || lowerLabel.includes('user') || lowerLabel.includes('frontal')) {
      return 'front';
    }
    if (lowerLabel.includes('back') || lowerLabel.includes('rear') || lowerLabel.includes('environment') || lowerLabel.includes('trasera')) {
      return 'back';
    }
    // Default to front for unknown cameras
    return 'front';
  }

  public async createCameraStream(deviceId?: string, constraints?: MediaStreamConstraints): Promise<MediaStream> {
    // Configuración optimizada para móvil - resolución muy baja para mejor rendimiento
    const isMobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const videoConstraints: MediaTrackConstraints = isMobile ? {
      width: { ideal: 320, max: 480 },      // Resolución mejorada para móvil
      height: { ideal: 240, max: 360 },     // Mantener aspect ratio 4:3
      frameRate: { ideal: 20, max: 25 },    // Framerate mejorado para móvil
      aspectRatio: 4/3,
      ...constraints?.video as MediaTrackConstraints
    } : {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 30, max: 30 },
      aspectRatio: 4/3,
      ...constraints?.video as MediaTrackConstraints
    };

    // En Android, manejar deviceIds especiales
    if (Capacitor.getPlatform() === 'android') {
      if (deviceId === 'front') {
        videoConstraints.facingMode = 'user';
        delete videoConstraints.deviceId;
      } else if (deviceId === 'back') {
        videoConstraints.facingMode = 'environment';
        delete videoConstraints.deviceId;
      } else if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = 'user';
      }
    } else {
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = 'user';
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      console.log('📹 Stream de cámara creado:', {
        deviceId: deviceId || 'default',
        tracks: stream.getVideoTracks().length,
        platform: Capacitor.getPlatform()
      });

      return stream;
    } catch (error) {
      console.error('Error creando stream de cámara:', error);
      
      // Fallback para Android - intentar con constraints más básicos
      if (Capacitor.getPlatform() === 'android') {
        try {
          console.log('Intentando fallback de cámara para Android...');
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
          });
          return fallbackStream;
        } catch (fallbackError) {
          console.error('Error en fallback de cámara:', fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  public getNextCamera(currentDeviceId?: string): CameraDevice | null {
    if (this.devices.length <= 1) return null;

    const currentIndex = currentDeviceId 
      ? this.devices.findIndex(device => device.deviceId === currentDeviceId)
      : -1;

    const nextIndex = (currentIndex + 1) % this.devices.length;
    return this.devices[nextIndex];
  }

  public getCameraByFacing(facing: 'front' | 'back'): CameraDevice | null {
    return this.devices.find(device => device.facing === facing) || null;
  }
}