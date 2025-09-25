import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandDetector, FrameData } from '@/lib/mediapipe';
import { signDatabase } from '@/lib/indexeddb';
import { useToast } from '@/hooks/use-toast';
import { Video, Square, Save, Camera } from 'lucide-react';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';

interface SignRecorderProps {
  onSignSaved?: () => void;
}

export const SignRecorder: React.FC<SignRecorderProps> = ({ onSignSaved }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onResultsRef = useRef<(results: HandLandmarkerResult) => void>(() => {});
  const isRecordingRef = useRef(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [keyframes, setKeyframes] = useState<FrameData[]>([]);
  const [signName, setSignName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  
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
    }
    setIsInitialized(false);
    setIsCameraOn(false);
  }, []);

  const onHandResults = useCallback((results: HandLandmarkerResult, faceResults?: any) => {
    console.log('🔍 onHandResults llamado:', {
      landmarks: results.landmarks?.length || 0,
      faceDetected: faceResults?.faceLandmarks?.length || 0,
      isRecording,
      timestamp: performance.now()
    });
    
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

        const handsCount = results.landmarks ? results.landmarks.length : 0;
        setHandsDetected(handsCount);
      
        if (results.landmarks) {
          console.log('👋 Manos detectadas:', results.landmarks.length);
          
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

        // DIBUJAR LANDMARKS FACIALES
        if (faceResults?.faceLandmarks && faceResults.faceLandmarks.length > 0) {
          const faceLandmarks = faceResults.faceLandmarks[0];
          console.log('😊 Cara detectada con', faceLandmarks.length, 'landmarks');
          
          // Landmarks faciales en verde claro
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          for (const landmark of faceLandmarks) {
            ctx.moveTo(landmark.x * canvas.width + 1, landmark.y * canvas.height);
            ctx.arc(
              landmark.x * canvas.width,
              landmark.y * canvas.height,
              1,
              0,
              2 * Math.PI
            );
          }
          ctx.fill();

          // Contorno facial principal
          const faceOutline = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
          
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 1;
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

          // Marcadores clave de la cara (ojos, nariz, boca) más grandes
          const keyFacePoints = [33, 263, 1, 61, 291, 39, 181]; // Ojos, nariz, boca
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          for (const pointIdx of keyFacePoints) {
            if (faceLandmarks[pointIdx]) {
              const landmark = faceLandmarks[pointIdx];
              ctx.moveTo(landmark.x * canvas.width + 2, landmark.y * canvas.height);
              ctx.arc(
                landmark.x * canvas.width,
                landmark.y * canvas.height,
                2,
                0,
                2 * Math.PI
              );
            }
          }
          ctx.fill();
        }
        
        // CAPTURA ESTANDARIZADA DE KEYFRAMES - MEJORADA
        if (isRecordingRef.current) {
          console.log('📹 Modo grabación activo, verificando landmarks...', {
            hasLandmarks: !!results.landmarks,
            landmarksCount: results.landmarks?.length || 0,
            hasFace: !!faceResults?.faceLandmarks?.length
          });
          
          // Capturar keyframes cuando hay manos detectadas
          if (results.landmarks && results.landmarks.length > 0) {
            console.log('✋ Landmarks encontrados, extrayendo datos...');
            
            try {
              const extractedData = HandDetector.extractHandData(results, faceResults);
              const frameData: FrameData = {
                timestamp: performance.now(),
                hands: extractedData.hands,
                face: extractedData.face
              };
              
              console.log('📊 Datos extraídos del frame:', {
                handsCount: frameData.hands.length,
                allHandsLandmarks: frameData.hands.map(h => h.landmarks.length),
                validHands: frameData.hands.filter(h => h.landmarks.length === 21).length
              });
              
              // Validar que al menos una mano tiene datos completos
              const validHands = frameData.hands.filter(h => h.landmarks.length === 21);
              if (validHands.length > 0) {
                setKeyframes(prev => {
                  const newKeyframes = [...prev, frameData];
                  console.log('✓ Keyframe válido capturado. Total keyframes:', newKeyframes.length, {
                    timestamp: frameData.timestamp,
                    handsCount: frameData.hands.length,
                    validHandsCount: validHands.length
                  });
                  return newKeyframes;
                });
              } else {
                console.warn('⚠️ Keyframe rechazado - sin manos válidas:', {
                  handsCount: frameData.hands.length,
                  landmarksPerHand: frameData.hands.map(h => h.landmarks.length)
                });
              }
            } catch (error) {
              console.error('❌ Error extrayendo datos del frame:', error);
            }
          } else {
            console.log('❌ No hay landmarks detectados en este frame durante grabación');
          }
        }
      }
    }
   }, []);

  const initializeCamera = useCallback(async () => {
    // Stop any existing camera first
    stopCamera();
    
    try {
      console.log('🎥 Inicializando cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 320, max: 640 }, 
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 30, max: 30 }, // Cap at 30fps for stability
          facingMode: 'user',
          // Optimized video settings for low latency
          aspectRatio: 4/3
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('📹 Video metadata cargado');
              resolve();
            };
          }
        });
        
        await videoRef.current.play();
        console.log('▶️ Video reproduciendo');
        
        console.log('🤖 Inicializando detector de manos...');
        handDetectorRef.current = new HandDetector();
        await handDetectorRef.current.initialize(videoRef.current, (res: HandLandmarkerResult) => onResultsRef.current(res));
        console.log('✅ Detector de manos inicializado');
        
        setIsInitialized(true);
        setIsCameraOn(true);
        toast({
          title: "Cámara iniciada",
          description: "Sistema de detección de manos activo",
        });
      }
    } catch (error) {
      console.error('❌ Error accessing camera:', error);
      stopCamera(); // Clean up on error
      toast({
        title: "Error de cámara",
        description: "Cámara en uso por otra aplicación. Cierra otras pestañas que usen la cámara.",
        variant: "destructive",
      });
    }
  }, [stopCamera, onHandResults]);


  const startRecording = useCallback(async () => {
    if (!videoRef.current || !isInitialized) return;
    
    try {
      const stream = videoRef.current.srcObject as MediaStream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      setRecordedChunks([]);
      setKeyframes([]);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks(prev => [...prev, event.data]);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      const timer = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= 17) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);
      
      (mediaRecorder as any).timerId = timer;
      
      toast({
        title: "Grabación iniciada",
        description: "Realiza la seña dinámica",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Error de grabación",
        description: "No se pudo iniciar la grabación",
        variant: "destructive",
      });
    }
  }, [isInitialized]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      if ((mediaRecorderRef.current as any).timerId) {
        clearInterval((mediaRecorderRef.current as any).timerId);
      }
      
      setIsRecording(false);
      
      toast({
        title: "Grabación completada",
        description: "Ahora puedes guardar la seña",
      });
    }
  }, [isRecording]);

  const saveSign = useCallback(async () => {
    if (!signName.trim() || recordedChunks.length === 0) {
      toast({
        title: "Error",
        description: "Ingresa un nombre y graba una seña",
        variant: "destructive",
      });
      return;
    }
    
    console.log('=== GUARDANDO SEÑA ===');
    console.log('Nombre:', signName.trim());
    console.log('Total keyframes capturados:', keyframes.length);
    console.log('Keyframes con manos:', keyframes.filter(f => f.hands.length > 0).length);
    console.log('Duración:', recordingTime, 'segundos');
    
    // Validar que tenemos keyframes válidos
    const validKeyframes = keyframes.filter(frame => 
      frame.hands.length > 0 && 
      frame.hands[0].landmarks.length === 21
    );
    
    console.log('Keyframes válidos:', validKeyframes.length);
    
    if (validKeyframes.length === 0) {
      toast({
        title: "Error",
        description: "No se detectaron movimientos de manos válidos durante la grabación",
        variant: "destructive",
      });
      return;
    }
    
    // Mostrar muestra de keyframes
    console.log('Muestra de keyframes válidos:');
    validKeyframes.slice(0, 3).forEach((frame, i) => {
      console.log(`Frame ${i + 1}:`, {
        timestamp: frame.timestamp,
        hands: frame.hands.map(hand => ({
          handedness: hand.handedness,
          landmarks: hand.landmarks.length,
          firstLandmark: hand.landmarks[0]
        }))
      });
    });
    
    try {
      const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });
      
      await signDatabase.saveSign({
        name: signName.trim(),
        videoBlob,
        keyframes: validKeyframes, // Guardar solo keyframes válidos
        duration: recordingTime
      });
      
      console.log('✓ Seña guardada exitosamente en base de datos');
      
      setSignName('');
      setRecordedChunks([]);
      setKeyframes([]);
      setRecordingTime(0);
      
      toast({
        title: "Seña guardada",
        description: `"${signName}" guardada con ${validKeyframes.length} keyframes válidos`,
      });
      
      onSignSaved?.();
    } catch (error) {
      console.error('Error saving sign:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la seña",
        variant: "destructive",
      });
    }
  }, [signName, recordedChunks, keyframes, recordingTime, onSignSaved, toast]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await initializeCamera();
    }
  }, [isCameraOn, stopCamera, initializeCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    onResultsRef.current = onHandResults;
  }, [onHandResults]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

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
          Grabación de Señas
        </h2>
        <p className="text-muted-foreground">
          Graba señas dinámicas con detección de movimiento en tiempo real
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

        {isRecording && (
          <div className="absolute top-4 right-4">
            <Badge className="bg-recording text-recording-foreground animate-pulse">
              <div className="w-2 h-2 bg-current rounded-full mr-2" />
              REC {recordingTime}s
            </Badge>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Input
          placeholder="Nombre de la seña (ej: fiebre, hola, gracias)"
          value={signName}
          onChange={(e) => setSignName(e.target.value)}
          disabled={isRecording}
        />

        <div className="flex gap-3">
          <Button
            onClick={toggleCamera}
            variant={isCameraOn ? "destructive" : "default"}
            className="flex-1"
          >
            <Camera className="w-4 h-4 mr-2" />
            {isCameraOn ? "Apagar Cámara" : "Prender Cámara"}
          </Button>
        </div>

        {isCameraOn && (
          <div className="flex gap-3">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isInitialized}
              variant={isRecording ? "destructive" : "default"}
              className={isRecording ? "shadow-glow-record" : ""}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  Detener ({recordingTime}s)
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  Grabar Seña
                </>
              )}
            </Button>

            <Button
              onClick={saveSign}
              disabled={recordedChunks.length === 0 || !signName.trim()}
              variant="outline"
            >
              <Save className="w-4 h-4 mr-2" />
              Guardar
            </Button>
          </div>
        )}

        {recordedChunks.length > 0 && (
          <div className="text-sm text-success">
            ✓ Seña grabada ({recordingTime}s) con {keyframes.length} frames de movimiento
          </div>
        )}
      </div>
    </Card>
  );
};