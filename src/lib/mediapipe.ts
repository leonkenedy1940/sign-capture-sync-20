import { FilesetResolver, HandLandmarker, HandLandmarkerResult, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

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

  constructor() {
    // HandLandmarker instance will be created during initialize()
  }

  public async initialize(videoElement: HTMLVideoElement, onResultsCallback: (handResults: HandLandmarkerResult, faceResults?: FaceLandmarkerResult) => void): Promise<void> {
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

      // Initialize Face Landmarker
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      console.log('HandDetector y FaceLandmarker inicializados correctamente');
      
      // Start detection loop
      this.detectHands(videoElement);
      
    } catch (error) {
      console.error('Error inicializando HandDetector:', error);
      throw new Error(`No se pudo inicializar MediaPipe HandLandmarker: ${error.message}`);
    }
  }

  private detectHands = (videoElement: HTMLVideoElement) => {
    if (videoElement.readyState >= 2 && this.handLandmarker && this.faceLandmarker && !this.isProcessing) {
      this.isProcessing = true;
      try {
        const timestamp = performance.now();
        const handResults = this.handLandmarker.detectForVideo(videoElement, timestamp);
        const faceResults = this.faceLandmarker.detectForVideo(videoElement, timestamp);
        
        if (this.onResults) {
          this.onResults(handResults, faceResults);
        }
      } catch (error) {
        console.error('Error detecting hands and face:', error);
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
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
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