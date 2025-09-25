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
  const onResultsRef = useRef<(handResults: HandLandmarkerResult, faceResults?: any) => void>(() => {});
  
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
    // Stop any existing camera first
    stopCamera();
    
    try {
      console.log('🎥 Inicializando cámara en detector...');
      const cameraManager = CameraManager.getInstance();
      const stream = await cameraManager.createCameraStream(deviceId);
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('📹 Video metadata cargado en detector');
              resolve();
            };
          }
        });
        
        await videoRef.current.play();
        console.log('▶️ Video reproduciendo en detector');
        
        console.log('🤖 Inicializando detector de manos en detector...');
        handDetectorRef.current = new HandDetector();
        await handDetectorRef.current.initialize(videoRef.current, (handRes: HandLandmarkerResult, faceRes?: any) => onResultsRef.current(handRes, faceRes));
        console.log('✅ Detector de manos inicializado en detector');
        
        setIsInitialized(true);
        setIsCameraOn(true);
        
        toast({
          title: "Detector iniciado",
          description: "Sistema de detección activo",
        });
      }
    } catch (error) {
      console.error('❌ Error accessing camera in detector:', error);
      stopCamera();
      toast({
        title: "Error de cámara",
        description: "Cámara en uso por otra aplicación. Cierra otras pestañas que usen la cámara.",
        variant: "destructive",
      });
    }
  }, [toast, stopCamera]);

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

  const onHandResults = useCallback((results: HandLandmarkerResult, faceResults?: any) => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: false,
        desynchronized: true
      });
      
      if (ctx) {
        // Detección de móvil para optimizaciones de renderizado
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Sincronizar tamaño del canvas con el tamaño real del video (evita blur y grilla invisible en móvil)
        if (videoRef.current && videoRef.current.readyState >= 2) {
          const v = videoRef.current;
          const targetW = v.videoWidth || canvas.clientWidth || 320;
          const targetH = v.videoHeight || canvas.clientHeight || 240;
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          
          // Dibujar frame actual
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        }
      
        const handsCount = results.landmarks ? results.landmarks.length : 0;
        setHandsDetected(handsCount);

        // Enhanced logging context
        const loggingContext: LoggingContext = {
          handsDetected: handsCount,
          requiredHands: 1, // Can be configured based on sign requirements
          timestamp: performance.now(),
          frameQuality: results.landmarks && results.landmarks.length > 0 ? 0.8 : 0.3
        };

        // Check for ambient light and hands detection issues
        if (isDetecting) {
          enhancedLogger.checkHandsDetection(loggingContext);
          enhancedLogger.logFrameQuality(loggingContext);
        }
      
        if (results.landmarks) {
          
          for (const landmarks of results.landmarks) {
            // Dibujar landmarks clave con mayor tamaño y colores diferentes
            const keyLandmarks = [0, 4, 8, 12, 16, 20]; // Muñeca y puntas de dedos
            
            // Landmarks normales en azul claro
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            for (let i = 0; i < landmarks.length; i++) {
              if (!keyLandmarks.includes(i)) {
                const landmark = landmarks[i];
                ctx.moveTo(landmark.x * canvas.width + 1.5, landmark.y * canvas.height);
                ctx.arc(
                  landmark.x * canvas.width,
                  landmark.y * canvas.height,
                  1.5,
                  0,
                  2 * Math.PI
                );
              }
            }
            ctx.fill();
            
            // Landmarks clave en amarillo/naranja más grandes
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            for (const keyIndex of keyLandmarks) {
              if (landmarks[keyIndex]) {
                const landmark = landmarks[keyIndex];
                ctx.moveTo(landmark.x * canvas.width + 3, landmark.y * canvas.height);
                ctx.arc(
                  landmark.x * canvas.width,
                  landmark.y * canvas.height,
                  3,
                  0,
                  2 * Math.PI
                );
              }
            }
            ctx.fill();
            
            // Conexiones estructurales en verde
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.5;
            const structuralConnections = [
              [0, 1], [1, 2], [2, 3], [3, 4],
              [0, 5], [5, 6], [6, 7], [7, 8],
              [0, 9], [9, 10], [10, 11], [11, 12],
              [0, 13], [13, 14], [14, 15], [15, 16],
              [0, 17], [17, 18], [18, 19], [19, 20],
            ];
            
            ctx.beginPath();
            for (const [start, end] of structuralConnections) {
              if (landmarks[start] && landmarks[end]) {
                ctx.moveTo(
                  landmarks[start].x * canvas.width,
                  landmarks[start].y * canvas.height
                );
                ctx.lineTo(
                  landmarks[end].x * canvas.width,
                  landmarks[end].y * canvas.height
                );
              }
            }
            ctx.stroke();
            
            // Líneas de distancia entre landmarks clave en rojo para visualizar medidas exactas
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            
            const keyConnections = [
              [0, 4], [0, 8], [0, 12], [0, 16], [0, 20], // Muñeca a puntas
              [4, 8], [8, 12], [12, 16], [16, 20] // Entre puntas adyacentes
            ];
            
            ctx.beginPath();
            for (const [start, end] of keyConnections) {
              if (landmarks[start] && landmarks[end]) {
                ctx.moveTo(
                  landmarks[start].x * canvas.width,
                  landmarks[start].y * canvas.height
                );
                ctx.lineTo(
                  landmarks[end].x * canvas.width,
                  landmarks[end].y * canvas.height
                );
                
                // Mostrar distancia numérica
                const midX = (landmarks[start].x + landmarks[end].x) * canvas.width / 2;
                const midY = (landmarks[start].y + landmarks[end].y) * canvas.height / 2;
                const distance = Math.sqrt(
                  Math.pow(landmarks[start].x - landmarks[end].x, 2) + 
                  Math.pow(landmarks[start].y - landmarks[end].y, 2)
                ).toFixed(3);
                
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(midX - 15, midY - 8, 30, 16);
                ctx.fillStyle = '#000000';
                ctx.font = '8px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(distance, midX, midY + 2);
              }
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
          setHandsDetected(0);
        }

        // DIBUJAR PLANO CARTESIANO DE REFERENCIA - Optimizado para móvil
        if (!isMobile) {
          // Plano completo solo en escritorio
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 2]);
          
          // Líneas verticales cada 50px
          for (let x = 0; x <= canvas.width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          
          // Líneas horizontales cada 50px
          for (let y = 0; y <= canvas.height; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        
        // Líneas centrales para referencia - siempre visibles
        ctx.strokeStyle = '#6b7280';
        ctx.lineWidth = isMobile ? 0.8 : 1;
        ctx.setLineDash([5, 3]);
        
        // Línea vertical central
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        
        // Línea horizontal central
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        
        ctx.setLineDash([]);

        // DIBUJAR LANDMARKS FACIALES CON REFERENCIA MEJORADA - Optimizado para móvil
        if (faceResults?.faceLandmarks && faceResults.faceLandmarks.length > 0) {
          const faceLandmarks = faceResults.faceLandmarks[0];
          
          // Puntos clave de referencia para normalización
          const leftEye = faceLandmarks[33];
          const rightEye = faceLandmarks[263];
          const noseTip = faceLandmarks[1];
          const chin = faceLandmarks[175];
          
          if (leftEye && rightEye && noseTip && chin) {
            // Dibujar marco de referencia facial - simplificado en móvil
            const faceCenter = {
              x: (leftEye.x + rightEye.x + noseTip.x) / 3,
              y: (leftEye.y + rightEye.y + noseTip.y) / 3
            };
            
            const eyeDistance = Math.sqrt(
              Math.pow((rightEye.x - leftEye.x) * canvas.width, 2) +
              Math.pow((rightEye.y - leftEye.y) * canvas.height, 2)
            );
            
            // Marco de referencia facial en color distintivo
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = isMobile ? 1.5 : 2;
            if (!isMobile) ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.arc(
              faceCenter.x * canvas.width,
              faceCenter.y * canvas.height,
              eyeDistance * 1.5,
              0,
              2 * Math.PI
            );
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Centro facial marcado
            ctx.fillStyle = '#8b5cf6';
            ctx.beginPath();
            ctx.arc(
              faceCenter.x * canvas.width,
              faceCenter.y * canvas.height,
              isMobile ? 3 : 4,
              0,
              2 * Math.PI
            );
            ctx.fill();
            
            // Etiqueta del centro facial - solo en escritorio
            if (!isMobile) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(faceCenter.x * canvas.width - 25, faceCenter.y * canvas.height - 20, 50, 15);
              ctx.fillStyle = '#000000';
              ctx.font = '10px Arial';
              ctx.textAlign = 'center';
              ctx.fillText('Centro', faceCenter.x * canvas.width, faceCenter.y * canvas.height - 8);
            }
          }
          
          // Landmarks faciales en verde claro (solo puntos clave)
          const keyFacePoints = isMobile ? [33, 263, 1] : [33, 263, 1, 6, 175, 10]; // Menos puntos en móvil
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          for (const pointIdx of keyFacePoints) {
            if (faceLandmarks[pointIdx]) {
              const landmark = faceLandmarks[pointIdx];
              const radius = isMobile ? 2 : 3;
              ctx.moveTo(landmark.x * canvas.width + radius, landmark.y * canvas.height);
              ctx.arc(
                landmark.x * canvas.width,
                landmark.y * canvas.height,
                radius,
                0,
                2 * Math.PI
              );
            }
          }
          ctx.fill();

          // Contorno facial simplificado - solo en escritorio para mejor rendimiento
          if (!isMobile) {
            const faceOutline = [10, 151, 9, 10]; // Solo contorno básico
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < faceOutline.length - 1; i++) {
              const currentIdx = faceOutline[i];
              const nextIdx = faceOutline[i + 1];
              if (faceLandmarks[currentIdx] && faceLandmarks[nextIdx]) {
                if (i === 0) {
                  ctx.moveTo(
                    faceLandmarks[currentIdx].x * canvas.width,
                    faceLandmarks[currentIdx].y * canvas.height
                  );
                }
                ctx.lineTo(
                  faceLandmarks[nextIdx].x * canvas.width,
                  faceLandmarks[nextIdx].y * canvas.height
                );
              }
            }
            ctx.stroke();
          }
        }
        
        // CAPTURA ESTANDARIZADA DE KEYFRAMES - IDENTICA A SIGNRECORDER
        if (isDetecting) {
          // Solo capturar keyframes cuando hay manos detectadas
          if (results.landmarks && results.landmarks.length > 0) {
            const extractedData = HandDetector.extractHandData(results, faceResults);
            const frameData: FrameData = {
              timestamp: performance.now(),
              hands: extractedData.hands,
              face: extractedData.face
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
        }
      }
    }
  }, [isDetecting]);

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