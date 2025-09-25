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
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Cámara ${device.deviceId.substring(0, 5)}`,
          kind: device.kind,
          facing: this.detectFacing(device.label)
        }));

      console.log('📷 Cámaras disponibles:', this.devices);
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
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 320, max: 640 },
      height: { ideal: 240, max: 480 },
      frameRate: { ideal: 30, max: 30 },
      aspectRatio: 4/3,
      ...constraints?.video as MediaTrackConstraints
    };

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    } else {
      videoConstraints.facingMode = 'user';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      console.log('📹 Stream de cámara creado:', {
        deviceId: deviceId || 'default',
        tracks: stream.getVideoTracks().length
      });

      return stream;
    } catch (error) {
      console.error('Error creando stream de cámara:', error);
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