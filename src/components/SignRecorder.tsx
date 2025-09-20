import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandDetector, FrameData } from '@/lib/mediapipe';
import { signDatabase } from '@/lib/indexeddb';
import { useToast } from '@/hooks/use-toast';
import { Video, Square, Save, Camera } from 'lucide-react';
import { Results } from '@mediapipe/hands';

interface SignRecorderProps {
  onSignSaved?: () => void;
}

export const SignRecorder: React.FC<SignRecorderProps> = ({ onSignSaved }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [keyframes, setKeyframes] = useState<FrameData[]>([]);
  const [signName, setSignName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
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
  }, []);

  const initializeCamera = useCallback(async () => {
    // Stop any existing camera first
    stopCamera();
    
    try {
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
        videoRef.current.play();
        
        handDetectorRef.current = new HandDetector();
        await handDetectorRef.current.initialize(videoRef.current, onHandResults);
        
        setIsInitialized(true);
        toast({
          title: "Cámara iniciada",
          description: "Sistema de detección de manos activo",
        });
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      stopCamera(); // Clean up on error
      toast({
        title: "Error de cámara",
        description: "Cámara en uso por otra aplicación. Cierra otras pestañas que usen la cámara.",
        variant: "destructive",
      });
    }
  }, [stopCamera]);

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
        
        // CAPTURA ESTANDARIZADA DE KEYFRAMES
        if (isRecording) {
          // Solo capturar keyframes cuando hay manos detectadas
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const frameData: FrameData = {
              timestamp: performance.now(),
              hands: HandDetector.extractHandData(results)
            };
            
            // Validar que los datos están completos
            if (frameData.hands.length > 0 && frameData.hands[0].landmarks.length === 21) {
              setKeyframes(prev => [...prev, frameData]);
              console.log('✓ Keyframe válido capturado:', {
                timestamp: frameData.timestamp,
                handsCount: frameData.hands.length,
                landmarksPerHand: frameData.hands.map(h => h.landmarks.length)
              });
            }
          }
        }
      }
    }
  }, [isRecording]);

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

  useEffect(() => {
    initializeCamera();
    
    return () => {
      stopCamera();
    };
  }, [initializeCamera, stopCamera]);

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

        {recordedChunks.length > 0 && (
          <div className="text-sm text-success">
            ✓ Seña grabada ({recordingTime}s) con {keyframes.length} frames de movimiento
          </div>
        )}
      </div>
    </Card>
  );
};