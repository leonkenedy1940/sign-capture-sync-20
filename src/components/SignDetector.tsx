import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandDetector, FrameData } from '@/lib/mediapipe';
import { signDatabase } from '@/lib/indexeddb';
import { signComparisonService, ComparisonResult } from '@/lib/signComparison';
import { voiceAlertService } from '@/lib/voiceAlert';
import { useToast } from '@/hooks/use-toast';
import { Camera, Search, Timer, CheckCircle, AlertCircle, Volume2 } from 'lucide-react';
import { Results } from '@mediapipe/hands';

export const SignDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const onResultsRef = useRef<(results: Results) => void>(() => {});
  
  const [isDetecting, setIsDetecting] = useState(false);
  const [preparationTime, setPreparationTime] = useState(0);
  const [detectionKeyframes, setDetectionKeyframes] = useState<FrameData[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([]);
  const [bestMatch, setBestMatch] = useState<ComparisonResult | null>(null);
  
  const { toast } = useToast();

  const initializeCamera = useCallback(async () => {
    try {
      if (!videoRef.current) return;

      handDetectorRef.current = new HandDetector();
      await handDetectorRef.current.initialize(videoRef.current, (res: Results) => onResultsRef.current(res));

      setIsInitialized(true);
      toast({
        title: "Cámara iniciada",
        description: "Sistema de detección de manos activo",
      });
    } catch (error) {
      console.error('Error initializing camera:', error);
      toast({
        title: "Error de cámara",
        description: "No se pudo acceder a la cámara",
        variant: "destructive",
      });
    }
  }, [toast]);

  const onHandResults = useCallback((results: Results) => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: false,
        desynchronized: true
      });
      
      if (ctx) {
        // Use immediate drawing instead of requestAnimationFrame for lower latency
        if (videoRef.current && videoRef.current.readyState >= 2) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
      
        if (results.multiHandLandmarks) {
          setHandsDetected(results.multiHandLandmarks.length);
          
          ctx.fillStyle = '#22d3ee';
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          
          for (const landmarks of results.multiHandLandmarks) {
            ctx.beginPath();
            for (const landmark of landmarks) {
              ctx.moveTo(landmark.x * canvas.width + 2, landmark.y * canvas.height);
              ctx.arc(
                landmark.x * canvas.width,
                landmark.y * canvas.height,
                2,
                0,
                2 * Math.PI
              );
            }
            ctx.fill();
        
            const essentialConnections = [
              [0, 1], [1, 2], [2, 3], [3, 4],
              [0, 5], [5, 6], [6, 7], [7, 8],
              [0, 9], [9, 10], [10, 11], [11, 12],
              [0, 13], [13, 14], [14, 15], [15, 16],
              [0, 17], [17, 18], [18, 19], [19, 20],
              [5, 9], [9, 13], [13, 17]
            ];
            
            ctx.beginPath();
            for (const [start, end] of essentialConnections) {
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
          }
        } else {
          setHandsDetected(0);
        }
        
        // CAPTURA ESTANDARIZADA DE KEYFRAMES - IDENTICA A SIGNRECORDER
        if (isDetecting) {
          // Solo capturar keyframes cuando hay manos detectadas
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const frameData: FrameData = {
              timestamp: performance.now(),
              hands: HandDetector.extractHandData(results)
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

      await signDatabase.initialize();
      const savedSigns = await signDatabase.getAllSigns();
      
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

      if (match) {
        console.log('✓ Coincidencia encontrada:', match);
        setBestMatch(match);
        
        try {
          await voiceAlertService.playSignRecognitionAlert(match.signName);
          
          toast({
            title: "¡Seña reconocida!",
            description: `${match.signName} (${(match.similarity * 100).toFixed(1)}% similitud)`,
          });
        } catch (voiceError) {
          console.error('Error en alerta de voz:', voiceError);
          toast({
            title: "Seña reconocida",
            description: `${match.signName} (${(match.similarity * 100).toFixed(1)}% similitud)`,
          });
        }
      } else {
        console.log('✗ No se encontraron coincidencias válidas');
        try {
          await voiceAlertService.playNoMatchAlert();
        } catch (voiceError) {
          console.error('Error en alerta de voz:', voiceError);
        }
        
        toast({
          title: "No hay coincidencias",
          description: "La seña no coincide con ninguna guardada (< 85%)",
          variant: "destructive",
        });
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

  useEffect(() => {
    initializeCamera();
    
    return () => {
      if (handDetectorRef.current) {
        handDetectorRef.current.stop();
      }
    };
  }, [initializeCamera]);

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
              {bestMatch.signName} ({(bestMatch.similarity * 100).toFixed(1)}%)
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
                      <span className={`text-sm font-mono ${
                        result.isMatch ? 'text-success' : 'text-muted-foreground'
                      }`}>
                        {(result.similarity * 100).toFixed(1)}%
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