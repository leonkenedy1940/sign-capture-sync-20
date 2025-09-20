import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export interface HandKeypoint {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarks {
  landmarks: HandKeypoint[];
  handedness: string;
}

export interface FrameData {
  timestamp: number;
  hands: HandLandmarks[];
}

export class HandDetector {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private onResults: ((results: Results) => void) | null = null;
  private isProcessing: boolean = false;

  constructor() {
    // Hands instance will be created during initialize() via dynamic import
  }

  public async initialize(videoElement: HTMLVideoElement, onResultsCallback: (results: Results) => void): Promise<void> {
    this.onResults = onResultsCallback;

    try {
      // Try direct import first
      this.hands = new Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
      });
      
      console.log('HandDetector inicializado correctamente');
    } catch (error) {
      console.error('Error inicializando HandDetector con import directo:', error);
      
      // Fallback to dynamic import
      try {
        const mpHands = await import('@mediapipe/hands');
        const HandsCtor = mpHands.Hands || (mpHands as any).default?.Hands || (mpHands as any).Hands;
        
        if (!HandsCtor) {
          throw new Error('No se pudo obtener el constructor Hands de MediaPipe');
        }
        
        this.hands = new HandsCtor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
        });
        
        console.log('HandDetector inicializado con import dinámico');
      } catch (fallbackError) {
        console.error('Error en fallback de inicialización:', fallbackError);
        throw new Error(`No se pudo inicializar MediaPipe Hands: ${error.message}`);
      }
    }

    // Highly optimized configuration for real-time tracking without lag
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0, // Fastest model
      minDetectionConfidence: 0.3, // Lower for faster detection
      minTrackingConfidence: 0.3, // Lower for smoother tracking
      staticImageMode: false, // Dynamic tracking mode
      smoothLandmarks: true, // Enable smoothing
      smoothSegmentation: true, // Reduce jitter
      refineLandmarks: false // Disable for speed
    } as any);

    this.hands.onResults(onResultsCallback);

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        // Skip frames if processing is behind to maintain real-time performance
        if (videoElement.readyState >= 2 && this.hands && !this.isProcessing) {
          this.isProcessing = true;
          try {
            await this.hands.send({ image: videoElement });
          } finally {
            this.isProcessing = false;
          }
        }
      },
      width: 320,
      height: 240,
      facingMode: 'user'
    } as any);

    await this.camera.start();
  }

  public stop(): void {
    if (this.camera) {
      this.camera.stop();
    }
  }

  public static extractHandData(results: Results): HandLandmarks[] {
    const handsData: HandLandmarks[] = [];

    try {
      if (results.multiHandLandmarks && results.multiHandedness) {
        console.log('Extrayendo datos de', results.multiHandLandmarks.length, 'manos detectadas');
        
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const landmarks = results.multiHandLandmarks[i];
          const handedness = results.multiHandedness[i];

          if (landmarks && landmarks.length === 21) {
            handsData.push({
              landmarks: landmarks.map(landmark => ({
                x: landmark.x,
                y: landmark.y,
                z: landmark.z || 0
              })),
              handedness: handedness.label || 'Unknown'
            });
          } else {
            console.warn('Landmarks incompletos detectados:', landmarks?.length || 0);
          }
        }
        
        console.log('Datos de manos extraídos exitosamente:', handsData.length);
      } else {
        // No hay manos detectadas - esto es normal
      }
    } catch (error) {
      console.error('Error extrayendo datos de manos:', error);
    }

    return handsData;
  }
}