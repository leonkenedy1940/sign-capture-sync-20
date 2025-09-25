import { FilesetResolver, HandLandmarker, HandLandmarkerResult, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { Capacitor } from '@capacitor/core';

export interface HandKeypoint {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarks {
  landmarks: HandKeypoint[];
  handedness: string;
}

export interface FaceKeypoint {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmarks {
  landmarks: FaceKeypoint[];
}

export interface FrameData {
  timestamp: number;
  hands: HandLandmarks[];
  face?: FaceLandmarks;
}

export class HandDetector {
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private onResults: ((handResults: HandLandmarkerResult, faceResults?: FaceLandmarkerResult) => void) | null = null;
  private isProcessing: boolean = false;
  private animationFrameId: number | null = null;
  private isAndroid = false;
  private lastProcessTime = 0;
  private frameSkipCount = 0;

  constructor() {
    this.isAndroid = Capacitor.getPlatform() === 'android';
    console.log('HandDetector creado para plataforma:', Capacitor.getPlatform());
  }

  public async initialize(videoElement: HTMLVideoElement, onResultsCallback: (handResults: HandLandmarkerResult, faceResults?: FaceLandmarkerResult) => void): Promise<void> {
    this.onResults = onResultsCallback;

    try {
      console.log('Inicializando MediaPipe para Android:', this.isAndroid);
      
      // Initialize MediaPipe Tasks Vision con timeout para Android
      const visionPromise = FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const vision = this.isAndroid 
        ? await Promise.race([
            visionPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cargando MediaPipe')), 15000))
          ])
        : await visionPromise;
      
      // Configuraciones optimizadas para Android
      const handConfig = {
        baseOptions: { 
          modelAssetPath: "/models/hand_landmarker.task"
        },
        numHands: 2,
        runningMode: "VIDEO" as const,
        minHandDetectionConfidence: this.isAndroid ? 0.3 : 0.1,
        minHandPresenceConfidence: this.isAndroid ? 0.3 : 0.1,
        minTrackingConfidence: this.isAndroid ? 0.3 : 0.1
      };

      const faceConfig = {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
        },
        runningMode: "VIDEO" as const,
        numFaces: 1,
        minFaceDetectionConfidence: this.isAndroid ? 0.3 : 0.1,
        minFacePresenceConfidence: this.isAndroid ? 0.3 : 0.1,
        minTrackingConfidence: this.isAndroid ? 0.3 : 0.1
      };

      // Crear landmarks con timeout
      this.handLandmarker = await Promise.race([
        HandLandmarker.createFromOptions(vision as any, handConfig),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout creando HandLandmarker')), 10000)
        )
      ]);

      // Crear FaceLandmarker para todas las plataformas con configuración optimizada para Android
      try {
        this.faceLandmarker = await Promise.race([
          FaceLandmarker.createFromOptions(vision as any, faceConfig),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout creando FaceLandmarker')), 10000)
          )
        ]);
        console.log('✅ FaceLandmarker inicializado para', this.isAndroid ? 'Android' : 'Web');
      } catch (error) {
        console.warn('FaceLandmarker no disponible, continuando sin detección facial:', error);
      }
      
      console.log('✅ MediaPipe inicializado correctamente para Android:', this.isAndroid);
      
      // Start detection loop con throttling para Android
      this.detectHands(videoElement);
      
    } catch (error) {
      console.error('Error inicializando HandDetector:', error);
      throw new Error(`No se pudo inicializar MediaPipe HandLandmarker: ${error.message}`);
    }
  }

  private detectHands = (videoElement: HTMLVideoElement) => {
    if (videoElement.readyState >= 2 && this.handLandmarker && !this.isProcessing) {
      const currentTime = performance.now();
      
      // Throttling más agresivo para Android - solo 5 FPS para mejor rendimiento
      if (this.isAndroid) {
        if (currentTime - this.lastProcessTime < 200) { // 5 FPS máximo en Android
          setTimeout(() => this.detectHands(videoElement), 50);
          return;
        }
        this.lastProcessTime = currentTime;
      }

      this.isProcessing = true;
      try {
        const timestamp = performance.now();
        const handResults = this.handLandmarker.detectForVideo(videoElement, timestamp);
        
        // Face detection para todas las plataformas si está disponible
        let faceResults: FaceLandmarkerResult | undefined;
        if (this.faceLandmarker) {
          try {
            faceResults = this.faceLandmarker.detectForVideo(videoElement, timestamp);
          } catch (error) {
            console.warn('Error en detección facial (no crítico):', error);
          }
        }
        
        if (this.onResults) {
          this.onResults(handResults, faceResults);
        }
      } catch (error) {
        console.error('Error detecting hands:', error);
        // En Android, no fallar completamente, solo continuar
        if (!this.isAndroid) {
          throw error;
        }
      } finally {
        this.isProcessing = false;
      }
    }
    
    // Control de framerate optimizado para móvil
    if (this.isAndroid) {
      setTimeout(() => this.detectHands(videoElement), 200); // 5 FPS en Android para mejor rendimiento
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.detectHands(videoElement));
    }
  }

  public stop(): void {
    console.log('Deteniendo HandDetector...');
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    try {
      if (this.handLandmarker) {
        this.handLandmarker.close();
        this.handLandmarker = null;
      }
    } catch (error) {
      console.warn('Error cerrando handLandmarker:', error);
    }
    
    try {
      if (this.faceLandmarker) {
        this.faceLandmarker.close();
        this.faceLandmarker = null;
      }
    } catch (error) {
      console.warn('Error cerrando faceLandmarker:', error);
    }
    
    this.isProcessing = false;
    console.log('✅ HandDetector detenido');
  }

  public static extractHandData(handResults: HandLandmarkerResult, faceResults?: FaceLandmarkerResult): { hands: HandLandmarks[], face?: FaceLandmarks } {
    const handsData: HandLandmarks[] = [];
    let faceData: FaceLandmarks | undefined;

    try {
      // Extract hand data
      if (handResults.landmarks && handResults.handedness) {
        console.log('Extrayendo datos de', handResults.landmarks.length, 'manos detectadas');
        
        for (let i = 0; i < handResults.landmarks.length; i++) {
          const landmarks = handResults.landmarks[i];
          const handedness = handResults.handedness[i];

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
      }

      // Extract face data
      if (faceResults?.faceLandmarks && faceResults.faceLandmarks.length > 0) {
        const faceLandmarks = faceResults.faceLandmarks[0];
        faceData = {
          landmarks: faceLandmarks.map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z || 0
          }))
        };
        console.log('Cara detectada con', faceLandmarks.length, 'landmarks');
      }
    } catch (error) {
      console.error('Error extrayendo datos:', error);
    }

    return { hands: handsData, face: faceData };
  }
}