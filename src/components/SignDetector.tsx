import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandDetector, FrameData } from '@/lib/mediapipe';
import { supabaseSignService } from '@/lib/supabaseSignService';
import { signComparisonService, ComparisonResult } from '@/lib/signComparison';
import { voiceAlertService } from '@/lib/voiceAlert';
import { enhancedLogger, LoggingContext } from '@/lib/enhancedLogging';
import { useToast } from '@/hooks/use-toast';
import { Camera, Search, Timer, CheckCircle, AlertCircle, Volume2, Smartphone, RefreshCw } from 'lucide-react';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { CameraManager, CameraDevice } from '@/lib/cameraUtils';

export const SignDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onResultsRef = useRef<(handResults: HandLandmarkerResult, faceResults?: any, poseResults?: any) => void>(() => {});
  const animationFrameId = useRef<number>();
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [preparationTime, setPreparationTime] = useState(0);
  const [detectionKeyframes, setDetectionKeyframes] = useState<FrameData[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [bestMatch, setBestMatch] = useState<ComparisonResult | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | undefined>();
  
  const { toast } = useToast();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (handDetectorRef.current) {
      handDetectorRef.current.stop();
      handDetectorRef.current = null;
    }
    setIsInitialized(false);
    setIsCameraOn(false);
  }, []);

  const initializeCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    
    try {
      console.log('🎥 Inicializando cámara optimizada...');
      
      // Configuración optimizada para Android
      const cameraManager = CameraManager.getInstance();
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 }, // Optimizado para APK - 24fps es más estable
          facingMode: deviceId ? undefined : 'user',
          deviceId: deviceId ? { exact: deviceId } : undefined,
          // Configuraciones específicas para Android
          advanced: [
            { width: 1280, aspectRatio: 1.777 },
            { width: 1920, aspectRatio: 1.777 }
          ]
        },
        audio: false
      };

      // Usar createCameraStream para mantener compatibilidad móvil con fallback a constraints optimizados
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.log('Fallback a configuración estándar...');
        stream = await cameraManager.createCameraStream(deviceId);
      }
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        // Activar aceleración por hardware
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.setAttribute('autoplay', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.setAttribute('preload', 'auto');
        
        videoRef.current.srcObject = stream;
        
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('📹 Cámara lista - Resolución:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
              // Intentar orientación horizontal para mejor visualización
              if (typeof screen !== 'undefined' && screen.orientation && 'lock' in screen.orientation) {
                try {
                  (screen.orientation as any).lock('landscape').catch(() => console.log('Orientación no disponible'));
                } catch (e) {
                  console.log('Orientación no soportada');
                }
              }
              resolve();
            };
          }
        });

        await videoRef.current.play();
        
        // Inicializar detector con configuración optimizada para Android
        console.log('🤖 Iniciando detector de manos optimizado...');
        handDetectorRef.current = new HandDetector();
        
        // Configuración optimizada para APK (sin GPU delegate que causa lag)
        const detectorConfig = {
          maxNumHands: 2,
          modelComplexity: 1, // 1 para mejor rendimiento en Android
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
          selfieMode: true,
          // NO usar GPU delegate en APK - causa lag significativo
          // delegate: 'CPU', // CPU es más estable en APK compilado
          numHands: 2,
          runningMode: 'VIDEO' // Modo video para mejor rendimiento
        };
        
        await handDetectorRef.current.initialize(
          videoRef.current, 
          (handRes: HandLandmarkerResult, faceRes?: any, poseRes?: any) => onResultsRef.current?.(handRes, faceRes, poseRes)
        );
        
        console.log('✅ Detector listo');
        setIsInitialized(true);
        setIsCameraOn(true);
        setCurrentCameraId(deviceId);
        
        toast({
          title: "Detector optimizado",
          description: "Sistema de detección HD activo",
        });
      }
    } catch (error) {
      console.error('❌ Error en la cámara:', error);
      stopCamera();
      toast({
        title: "Error de cámara",
        description: "No se pudo acceder a la cámara",
        variant: "destructive",
      });
    }
  }, [stopCamera, toast]);

  const switchCamera = useCallback(async () => {
    const cameraManager = CameraManager.getInstance();
    const nextCamera = cameraManager.getNextCamera(currentCameraId);
    
    if (nextCamera) {
      console.log('🔄 Cambiando a cámara:', nextCamera.label);
      setCurrentCameraId(nextCamera.deviceId);
      await initializeCamera(nextCamera.deviceId);
      
      toast({
        title: "Cámara cambiada",
        description: nextCamera.label,
      });
    } else {
      toast({
        title: "Solo una cámara disponible",
        description: "No hay otras cámaras para cambiar",
      });
    }
  }, [currentCameraId, initializeCamera, toast]);

  // Initialize cameras list on component mount
  useEffect(() => {
    const loadCameras = async () => {
      const cameraManager = CameraManager.getInstance();
      const cameras = await cameraManager.getAvailableCameras();
      setAvailableCameras(cameras);
      
      // Set default camera (preferably front camera)
      const frontCamera = cameraManager.getCameraByFacing('front');
      if (frontCamera) {
        setCurrentCameraId(frontCamera.deviceId);
      } else if (cameras.length > 0) {
        setCurrentCameraId(cameras[0].deviceId);
      }
    };
    
    loadCameras();
  }, []);

  const onHandResults = useCallback((results: HandLandmarkerResult, faceResults?: any, poseResults?: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuración del canvas optimizada para APK compilado
    const video = videoRef.current;
    const targetWidth = video.videoWidth || 1280;
    const targetHeight = video.videoHeight || 720;
    
    // Solo redimensionar si es necesario (evita lag en APK)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    
    // Limpiar el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar el video con efecto espejo para mejor usabilidad
    ctx.save();
    ctx.scale(-1, 1); // Efecto espejo
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Optimización adicional para APK: usar paths más eficientes
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isAPK = window.location.protocol === 'file:' || window.location.hostname === 'localhost';

    // Dibujar landmarks de las manos con mayor claridad
    if (results.landmarks) {
      for (const landmarks of results.landmarks) {
        // Dibujar conexiones de la mano con líneas más claras
        const connections = [
          // Pulgar
          [0, 1], [1, 2], [2, 3], [3, 4],
          // Índice  
          [0, 5], [5, 6], [6, 7], [7, 8],
          // Medio
          [5, 9], [9, 10], [10, 11], [11, 12],
          // Anular
          [9, 13], [13, 14], [14, 15], [15, 16],
          // Meñique
          [13, 17], [17, 18], [18, 19], [19, 20],
          // Base de la palma
          [0, 17]
        ];
        
        // Líneas de conexión en verde brillante
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        connections.forEach(([start, end]) => {
          if (landmarks[start] && landmarks[end]) {
            // Ajustar coordenadas para efecto espejo
            const startX = canvas.width - landmarks[start].x * canvas.width;
            const startY = landmarks[start].y * canvas.height;
            const endX = canvas.width - landmarks[end].x * canvas.width;
            const endY = landmarks[end].y * canvas.height;
            
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
          }
        });
        ctx.stroke();
        
        // Dibujar puntos landmarks más visibles para Android
        ctx.fillStyle = '#FF0000';
        for (const point of landmarks) {
          const x = canvas.width - point.x * canvas.width;
          const y = point.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI); // Puntos más grandes para mejor visibilidad
          ctx.fill();
        }
        
        // Dibujar plano cartesiano mejorado centrado en la muñeca
        if (landmarks[0]) {
          const wristX = canvas.width - landmarks[0].x * canvas.width;
          const wristY = landmarks[0].y * canvas.height;
          
          // Ejes principales del plano cartesiano - optimizado para Android
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'; // Más opaco para mejor visibilidad
          ctx.lineWidth = 2; // Líneas más gruesas
          
          // Eje X horizontal
          ctx.beginPath();
          ctx.moveTo(0, wristY);
          ctx.lineTo(canvas.width, wristY);
          ctx.stroke();
          
          // Eje Y vertical
          ctx.beginPath();
          ctx.moveTo(wristX, 0);
          ctx.lineTo(wristX, canvas.height);
          ctx.stroke();
          
          // Cuadrícula de referencia más fina
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.lineWidth = 1;
          const gridSize = isMobile ? 60 : 40;
          
          // Líneas verticales de la cuadrícula
          for (let x = (wristX % gridSize); x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          
          // Líneas horizontales de la cuadrícula
          for (let y = (wristY % gridSize); y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          
          // Marcar el origen (muñeca) con un punto distintivo
          ctx.fillStyle = '#FF00FF';
          ctx.beginPath();
          ctx.arc(wristX, wristY, 8, 0, 2 * Math.PI);
          ctx.fill();
          
          // Etiqueta del origen
          if (!isMobile) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(wristX - 25, wristY - 25, 50, 20);
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('ORIGEN', wristX, wristY - 10);
          }
        }
      }
    }

    // Dibujar puntos de pose/torso
    if (poseResults?.landmarks && poseResults.landmarks.length > 0) {
      const poseLandmarks = poseResults.landmarks[0];
      
      ctx.strokeStyle = '#FF6B35';
      ctx.fillStyle = '#FF6B35';
      ctx.lineWidth = 3;
      
      // Puntos clave del torso (hombros, codos, muñecas, caderas, rodillas, tobillos)
      const keyPosePoints = [
        11, 12, // Hombros
        13, 14, // Codos
        15, 16, // Muñecas
        23, 24, // Caderas
        25, 26, // Rodillas
        27, 28  // Tobillos
      ];
      
      // Dibujar puntos del torso
      keyPosePoints.forEach((pointIndex) => {
        if (poseLandmarks[pointIndex] && poseLandmarks[pointIndex].visibility > 0.5) {
          const point = poseLandmarks[pointIndex];
          const x = canvas.width - point.x * canvas.width;
          const y = point.y * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
      
      // Conexiones del torso
      const torsoConnections = [
        [11, 12], // Hombros
        [11, 13], [12, 14], // Hombro a codo
        [13, 15], [14, 16], // Codo a muñeca
        [11, 23], [12, 24], // Hombro a cadera
        [23, 24], // Caderas
        [23, 25], [24, 26], // Cadera a rodilla
        [25, 27], [26, 28]  // Rodilla a tobillo
      ];
      
      ctx.beginPath();
      torsoConnections.forEach(([start, end]) => {
        if (poseLandmarks[start] && poseLandmarks[end] && 
            poseLandmarks[start].visibility > 0.5 && poseLandmarks[end].visibility > 0.5) {
          const startX = canvas.width - poseLandmarks[start].x * canvas.width;
          const startY = poseLandmarks[start].y * canvas.height;
          const endX = canvas.width - poseLandmarks[end].x * canvas.width;
          const endY = poseLandmarks[end].y * canvas.height;
          
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
        }
      });
      ctx.stroke();
      
      // Plano cartesiano centrado en el centro del torso (punto medio entre hombros)
      if (poseLandmarks[11] && poseLandmarks[12] && 
          poseLandmarks[11].visibility > 0.5 && poseLandmarks[12].visibility > 0.5) {
        const centerX = canvas.width - ((poseLandmarks[11].x + poseLandmarks[12].x) / 2) * canvas.width;
        const centerY = ((poseLandmarks[11].y + poseLandmarks[12].y) / 2) * canvas.height;
        
        // Ejes del plano cartesiano para el torso
        ctx.strokeStyle = 'rgba(255, 107, 53, 0.7)';
        ctx.lineWidth = 2;
        
        // Eje X
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvas.width, centerY);
        
        // Eje Y
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, canvas.height);
        ctx.stroke();
        
        // Origen (centro del torso)
        ctx.fillStyle = '#FF6B35';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    
    // Actualizar contador de manos detectadas
    setHandsDetected(results.landmarks?.length || 0);
    
    // CAPTURA ESTANDARIZADA DE KEYFRAMES cuando está detectando
    if (isDetecting && results.landmarks && results.landmarks.length > 0) {
      const extractedData = HandDetector.extractHandData(results, faceResults, poseResults);
      const frameData: FrameData = {
        timestamp: performance.now(),
        hands: extractedData.hands,
        face: extractedData.face,
        pose: extractedData.pose
      };
      
      // Validar que los datos están completos - MISMA VALIDACION
      if (frameData.hands.length > 0 && frameData.hands[0].landmarks.length === 21) {
        setDetectionKeyframes(prev => [...prev, frameData]);
        console.log('✓ Frame válido detectado:', {
          timestamp: frameData.timestamp,
          handsCount: frameData.hands.length,
          landmarksPerHand: frameData.hands.map(h => h.landmarks.length)
        });
      }
    }
  }, [isDetecting]);

  // Usar requestAnimationFrame para mejor rendimiento en Android
  const animate = useCallback(() => {
    if (handDetectorRef.current && videoRef.current && isCameraOn) {
      // El detector ya maneja su propio ciclo de detección
    }
    if (isCameraOn) {
      animationFrameId.current = requestAnimationFrame(animate);
    }
  }, [isCameraOn]);

  // Iniciar/Detener la animación
  useEffect(() => {
    if (isCameraOn) {
      animationFrameId.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isCameraOn, animate]);

  useEffect(() => {
    onResultsRef.current = onHandResults;
  }, [onHandResults]);

  const compareWithDatabase = useCallback(async (detectedFrames: FrameData[]) => {
    try {
      setIsComparing(true);
      setComparisonResults([]);
      setBestMatch(null);

      console.log('=== INICIANDO COMPARACIÓN ===');
      console.log('Frames detectados para comparar:', detectedFrames.length);
      console.log('Frames detectados con manos:', detectedFrames.filter(f => f.hands.length > 0).length);

      // Filtrar solo frames válidos para comparación
      const validDetectedFrames = detectedFrames.filter(frame => 
        frame.hands.length > 0 && 
        frame.hands[0].landmarks.length === 21
      );

      console.log('Frames válidos para comparación:', validDetectedFrames.length);

      if (validDetectedFrames.length === 0) {
        toast({
          title: "Error de detección",
          description: "No se detectaron frames válidos para comparar",
          variant: "destructive",
        });
        return;
      }

      await supabaseSignService.initialize();
      const savedSigns = await supabaseSignService.getAllSigns();
      
      console.log('Señas guardadas encontradas:', savedSigns.length);
      
      if (savedSigns.length === 0) {
        toast({
          title: "No hay señas para comparar",
          description: "Graba algunas señas primero para poder compararlas",
        });
        return;
      }

      // Validar señas guardadas y mostrar detalles
      const validSigns = savedSigns.filter(sign => sign.keyframes && sign.keyframes.length > 0);
      console.log('Señas con keyframes:', validSigns.length);
      
      validSigns.forEach((sign, index) => {
        const validKeyframes = sign.keyframes.filter(f => f.hands && f.hands.length > 0);
        console.log(`Seña ${index + 1} - "${sign.name}":`, {
          totalKeyframes: sign.keyframes.length,
          keyframesConManos: validKeyframes.length,
          muestraKeyframe: validKeyframes[0] ? {
            timestamp: validKeyframes[0].timestamp,
            hands: validKeyframes[0].hands.map(h => ({
              handedness: h.handedness,
              landmarks: h.landmarks ? h.landmarks.length : 'sin landmarks'
            }))
          } : 'sin keyframes válidos'
        });
      });

      if (validSigns.length === 0) {
        toast({
          title: "No hay señas válidas",
          description: "Las señas guardadas no tienen datos de keyframes válidos",
          variant: "destructive",
        });
        return;
      }

      console.log('Iniciando comparación con servicio...');
      const results = await signComparisonService.compareWithDatabase(
        validDetectedFrames,
        validSigns.map(sign => ({
          id: sign.id,
          name: sign.name,
          keyframes: sign.keyframes
        }))
      );

      console.log('Resultados de comparación:', results);
      setComparisonResults(results);

      const match = await signComparisonService.findBestMatch(
        validDetectedFrames,
        validSigns.map(sign => ({
          id: sign.id,
          name: sign.name,
          keyframes: sign.keyframes
        }))
      );

        // Enhanced logging for comparison results
        enhancedLogger.logComparisonResults(results, results.filter(r => r.similarity >= 0.8));

        if (match) {
          console.log('✓ Seña reconocida:', match);
          setBestMatch(match);
          
          enhancedLogger.logValidSign(match.signName, match.similarity);
          
          toast({
            title: `Seña reconocida: ${match.signName}`,
            description: `Similitud: ${(match.similarity * 100).toFixed(1)}%`,
          });
          
          try {
            await voiceAlertService.playSignRecognitionAlert(match.signName);
          } catch (voiceError) {
            console.error('Error en alerta de voz:', voiceError);
          }
        } else {
          console.log('✗ Seña no encontrada');
          
          // Log invalid signs for analysis
          const invalidSigns = results.filter(r => r.similarity < 0.8 && r.similarity > 0.2);
          invalidSigns.forEach(result => {
            enhancedLogger.logInvalidSign(result.signName, result.similarity);
          });
          
          toast({
            title: "Seña no encontrada",
            description: "Los resultados de comparación se muestran abajo. Puedes intentar de nuevo.",
          });
          
          try {
            await voiceAlertService.playNoMatchAlert();
          } catch (voiceError) {
            console.error('Error en alerta de voz:', voiceError);
          }
        }

    } catch (error) {
      console.error('Error durante la comparación:', error);
      toast({
        title: "Error de comparación",
        description: `No se pudo comparar la seña: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsComparing(false);
    }
  }, [toast]);

  const startDetection = useCallback(async () => {
    if (!isInitialized) return;
    
    // Reset enhanced logging counters
    enhancedLogger.resetCounters();
    
    const loggingContext: LoggingContext = {
      handsDetected: handsDetected,
      requiredHands: 1,
      timestamp: performance.now()
    };
    
    enhancedLogger.logDetectionStart(loggingContext);
    
    setPreparationTime(3);
    setDetectionKeyframes([]);
    setComparisonResults([]);
    setBestMatch(null);
    
    const countdownTimer = setInterval(() => {
      setPreparationTime(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          setIsDetecting(true);
          setRecordingTime(0);
          
          const detectionTimer = setInterval(() => {
            setRecordingTime(prev => {
              const newTime = prev + 1;
              if (newTime >= 8) {
                clearInterval(detectionTimer);
                setIsDetecting(false);
                
                // Usar setTimeout para asegurar que todos los frames se capturen
                setTimeout(() => {
                  setDetectionKeyframes(currentFrames => {
                    console.log('Frames capturados para comparación:', currentFrames.length);
                    if (currentFrames.length > 0) {
                      compareWithDatabase(currentFrames);
                    } else {
                      toast({
                        title: "Error de detección",
                        description: "No se detectaron frames válidos para comparar",
                        variant: "destructive",
                      });
                    }
                    return currentFrames;
                  });
                }, 500);
                
                toast({
                  title: "Detección completada",
                  description: "Comparando con señas guardadas...",
                });
              }
              return newTime;
            });
          }, 1000);
          
          toast({
            title: "Iniciando detección",
            description: "Realiza la seña ahora",
          });
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [isInitialized, compareWithDatabase, toast]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await initializeCamera(currentCameraId);
    }
  }, [isCameraOn, stopCamera, initializeCamera, currentCameraId]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (canvasRef.current && videoRef.current) {
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
      
      const ctx = canvasRef.current.getContext('2d', { 
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      }) as CanvasRenderingContext2D;
      
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        // Set low-latency rendering hints
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }, []);

  return (
    <Card className="p-6 space-y-6">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold bg-gradient-tech bg-clip-text text-transparent">
          Detección de Señas
        </h2>
        <p className="text-muted-foreground">
          Detecta y compara señas en tiempo real con la base de datos
        </p>
      </div>

      <div className="relative">
        <video
          ref={videoRef}
          className="w-full rounded-lg bg-secondary hidden"
          autoPlay
          muted
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border-2 border-tech-blue shadow-glow-tech"
          width={320}
          height={240}
        />
        
        <div className="absolute top-4 left-4 space-y-2">
          <Badge variant={isInitialized ? "default" : "secondary"}>
            <Camera className="w-3 h-3 mr-1" />
            {isInitialized ? "Cámara activa" : "Iniciando..."}
          </Badge>
          
          {handsDetected > 0 && (
            <Badge variant="outline" className="bg-accent text-accent-foreground">
              {handsDetected} mano{handsDetected > 1 ? 's' : ''} detectada{handsDetected > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Botón de cambio de cámara en esquina superior derecha */}
        {isCameraOn && availableCameras.length > 1 && (
          <div className="absolute top-4 right-4 z-10">
            <Button
              onClick={switchCamera}
              variant="outline"
              size="sm"
              className="bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        )}

        {isDetecting && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-accent text-accent-foreground animate-pulse">
              <Search className="w-3 h-3 mr-1" />
              DETECTANDO {recordingTime}s
            </Badge>
          </div>
        )}
        
        {isComparing && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-warning text-warning-foreground animate-pulse">
              <Search className="w-3 h-3 mr-1" />
              COMPARANDO...
            </Badge>
          </div>
        )}
        
        {bestMatch && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-success text-success-foreground">
              <CheckCircle className="w-3 h-3 mr-1" />
              <Volume2 className="w-3 h-3 mr-1" />
              {bestMatch.signName}
            </Badge>
          </div>
        )}
        
        {preparationTime > 0 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold text-white mb-4 animate-pulse">
                {preparationTime}
              </div>
              <Badge className="bg-warning text-warning-foreground">
                <Timer className="w-4 h-4 mr-2" />
                Preparándose...
              </Badge>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Button
          onClick={toggleCamera}
          variant={isCameraOn ? "destructive" : "default"}
          className="w-full"
        >
          <Camera className="w-4 h-4 mr-2" />
          {isCameraOn ? "Apagar Cámara" : "Prender Cámara"}
        </Button>

        {isCameraOn && (
          <Button
            onClick={startDetection}
            disabled={!isInitialized || isDetecting || preparationTime > 0}
            variant="default"
            className="w-full"
          >
            {preparationTime > 0 ? (
              <>
                <Timer className="w-4 h-4 mr-2" />
                Preparando... {preparationTime}s
              </>
            ) : isDetecting ? (
              <>
                <Search className="w-4 h-4 mr-2" />
                Detectando... {recordingTime}s
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Iniciar Detección
              </>
            )}
          </Button>
        )}

        {detectionKeyframes.length > 0 && !isComparing && !bestMatch && comparisonResults.length === 0 && (
          <div className="text-sm text-success">
            ✓ Detección completada con {detectionKeyframes.length} frames de keypoints en memoria
          </div>
        )}

        {comparisonResults.length > 0 && (
          <div className="space-y-4">
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Resultados de Comparación</h3>
              
              {bestMatch ? (
                <div className="bg-success/10 border border-success/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <Volume2 className="w-4 h-4 text-success animate-pulse" />
                    <span className="font-semibold text-success">¡Seña Reconocida!</span>
                  </div>
                  <p className="text-lg font-bold">{bestMatch.signName}</p>
                  <p className="text-sm text-muted-foreground">
                    Similitud: {(bestMatch.similarity * 100).toFixed(1)}% (≥ 85% requerido)
                  </p>
                </div>
              ) : (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <span className="font-semibold text-destructive">Sin Coincidencias</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ninguna seña alcanzó el 85% de similitud requerido
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Mejores coincidencias encontradas:
                </h4>
                {comparisonResults.slice(0, 3).map((result, index) => (
                  <div
                    key={result.signId}
                    className={`flex justify-between items-center p-3 rounded-lg border ${
                      result.isMatch 
                        ? 'bg-success/5 border-success/20' 
                        : 'bg-muted/50 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground">
                        #{index + 1}
                      </span>
                      <span className="font-medium">{result.signName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm px-2 py-1 rounded ${
                        result.isMatch ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                      }`}>
                        {result.isMatch ? 'Detectada' : 'No detectada'}
                      </span>
                      {result.isMatch && (
                        <CheckCircle className="w-4 h-4 text-success" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};