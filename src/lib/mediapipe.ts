import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

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
  private handLandmarker: HandLandmarker | null = null;
  private onResults: ((results: HandLandmarkerResult) => void) | null = null;
  private isProcessing: boolean = false;
  private animationFrameId: number | null = null;

  constructor() {
    // HandLandmarker instance will be created during initialize()
  }

  public async initialize(videoElement: HTMLVideoElement, onResultsCallback: (results: HandLandmarkerResult) => void): Promise<void> {
    this.onResults = onResultsCallback;

    try {
      // Initialize MediaPipe Tasks Vision
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { 
          modelAssetPath: "/models/hand_landmarker.task"
        },
        numHands: 2,
        runningMode: "VIDEO",
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3
      });
      
      console.log('HandDetector inicializado correctamente con tasks-vision');
      
      // Start detection loop
      this.detectHands(videoElement);
      
    } catch (error) {
      console.error('Error inicializando HandDetector:', error);
      throw new Error(`No se pudo inicializar MediaPipe HandLandmarker: ${error.message}`);
    }
  }

  private detectHands = (videoElement: HTMLVideoElement) => {
    if (videoElement.readyState >= 2 && this.handLandmarker && !this.isProcessing) {
      this.isProcessing = true;
      try {
        const results = this.handLandmarker.detectForVideo(videoElement, performance.now());
        if (this.onResults) {
          this.onResults(results);
        }
      } catch (error) {
        console.error('Error detecting hands:', error);
      } finally {
        this.isProcessing = false;
      }
    }
    
    this.animationFrameId = requestAnimationFrame(() => this.detectHands(videoElement));
  }

  public stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
  }

  public static extractHandData(results: HandLandmarkerResult): HandLandmarks[] {
    const handsData: HandLandmarks[] = [];

    try {
      if (results.landmarks && results.handedness) {
        console.log('Extrayendo datos de', results.landmarks.length, 'manos detectadas');
        
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];
          const handedness = results.handedness[i];

          if (landmarks && landmarks.length === 21) {
            handsData.push({
              landmarks: landmarks.map(landmark => ({
                x: landmark.x,
                y: landmark.y,
                z: landmark.z || 0
              })),
              handedness: handedness[0]?.displayName || 'Unknown'
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