import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandDetector, FrameData } from '@/lib/mediapipe';
import { supabaseSignService } from '@/lib/supabaseSignService';
import { useToast } from '@/hooks/use-toast';
import { Video, Square, Save, Camera, RefreshCw } from 'lucide-react';
import { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { CameraManager, CameraDevice } from '@/lib/cameraUtils';
import { Capacitor } from '@capacitor/core';

interface SignRecorderProps {
  onSignSaved?: () => void;
}

export const SignRecorder: React.FC<SignRecorderProps> = ({ onSignSaved }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const handDetectorRef = useRef<HandDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onResultsRef = useRef<(handResults: HandLandmarkerResult, faceResults?: any, poseResults?: any) => void>(() => {});
  const isRecordingRef = useRef(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [keyframes, setKeyframes] = useState<FrameData[]>([]);
  const [signName, setSignName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [poseDetected, setPoseDetected] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string | undefined>();
  
  // Variables para optimización móvil
  const isMobile = Capacitor.isNativePlatform() || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isAndroid = Capacitor.getPlatform() === 'android';
  const frameSkipCounter = useRef(0);
  const lastRenderTime = useRef(0);
  
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

  const onHandResults = useCallback((results: HandLandmarkerResult, faceResults?: any, poseResults?: any) => {
    const currentTime = performance.now();
    
    // Frame skipping más agresivo en móvil para mejor rendimiento
    if (isMobile) {
      frameSkipCounter.current++;
      if (frameSkipCounter.current % (isAndroid ? 4 : 2) !== 0) {
        return; // Saltar frames en móvil
      }
      
      // Throttling optimizado para Android - mejor fluidez
      if (isAndroid && currentTime - lastRenderTime.current < 67) {
        return; // Máximo 15 FPS de renderizado en Android para mejor fluidez
      }
      lastRenderTime.current = currentTime;
    }

    console.log('🔍 onHandResults llamado (optimizado móvil):', {
      landmarks: results.landmarks?.length || 0,
      faceDetected: faceResults?.faceLandmarks?.length || 0,
      isRecording,
      isMobile,
      isAndroid,
      frameSkipped: frameSkipCounter.current
    });
    
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { 
        alpha: false, 
        willReadFrequently: false,
        desynchronized: true
      });
      
      if (ctx) {
        // Rendering optimizado para móvil
        if (videoRef.current && videoRef.current.readyState >= 2) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // En móvil, renderizar video con menor calidad para mejor rendimiento
          if (isMobile) {
            ctx.imageSmoothingEnabled = false; // Desactivar antialiasing en móvil
          }
          
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }

        const handsCount = results.landmarks ? results.landmarks.length : 0;
        setHandsDetected(handsCount);
        
        // Actualizar estado de pose detectada
        const hasPose = poseResults?.landmarks && poseResults.landmarks.length > 0;
        setPoseDetected(hasPose);
      
        if (results.landmarks) {
          console.log('👋 Manos detectadas:', results.landmarks.length);
          
          for (const landmarks of results.landmarks) {
            // Renderizado simplificado para móvil
            if (isMobile) {
              // Solo dibujar landmarks clave en móvil para mejor rendimiento
              const keyLandmarks = [0, 4, 8, 12, 16, 20]; // Solo muñeca y puntas
              
              ctx.fillStyle = '#22d3ee';
              ctx.beginPath();
              for (const keyIndex of keyLandmarks) {
                if (landmarks[keyIndex]) {
                  const landmark = landmarks[keyIndex];
                  ctx.moveTo(landmark.x * canvas.width + 2, landmark.y * canvas.height);
                  ctx.arc(
                    landmark.x * canvas.width,
                    landmark.y * canvas.height,
                    2, // Puntos más pequeños en móvil
                    0,
                    2 * Math.PI
                  );
                }
              }
              ctx.fill();
            } else {
              // Renderizado completo para desktop
              const keyLandmarks = [0, 4, 8, 12, 16, 20];
              
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
            }
            
            // Conexiones estructurales de las manos en verde
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            const structuralConnections = [
              [0, 1], [1, 2], [2, 3], [3, 4],     // Pulgar
              [0, 5], [5, 6], [6, 7], [7, 8],     // Índice
              [5, 9], [9, 10], [10, 11], [11, 12], // Medio
              [9, 13], [13, 14], [14, 15], [15, 16], // Anular
              [13, 17], [17, 18], [18, 19], [19, 20], // Meñique
              [0, 17] // Base de la palma
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
            
            // Plano cartesiano centrado en la muñeca (punto 0)
            if (landmarks[0]) {
              const wristX = landmarks[0].x * canvas.width;
              const wristY = landmarks[0].y * canvas.height;
              
              // Ejes del plano cartesiano
              ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
              ctx.lineWidth = 2;
              
              // Eje X
              ctx.beginPath();
              ctx.moveTo(0, wristY);
              ctx.lineTo(canvas.width, wristY);
              
              // Eje Y
              ctx.moveTo(wristX, 0);
              ctx.lineTo(wristX, canvas.height);
              ctx.stroke();
              
              // Cuadrícula
              ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
              const gridSize = 50;
              
              // Líneas verticales
              for (let x = wristX % gridSize; x < canvas.width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
              }
              
              // Líneas horizontales
              for (let y = wristY % gridSize; y < canvas.height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
              }
              
              // Origen (muñeca)
              ctx.fillStyle = '#FF00FF';
              ctx.beginPath();
              ctx.arc(wristX, wristY, 5, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        } else {
          setHandsDetected(0);
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
              const x = point.x * canvas.width;
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
              const startX = poseLandmarks[start].x * canvas.width;
              const startY = poseLandmarks[start].y * canvas.height;
              const endX = poseLandmarks[end].x * canvas.width;
              const endY = poseLandmarks[end].y * canvas.height;
              
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
            }
          });
          ctx.stroke();
          
          // Plano cartesiano centrado en el centro del torso (punto medio entre hombros)
          if (poseLandmarks[11] && poseLandmarks[12] && 
              poseLandmarks[11].visibility > 0.5 && poseLandmarks[12].visibility > 0.5) {
            const centerX = (poseLandmarks[11].x + poseLandmarks[12].x) / 2 * canvas.width;
            const centerY = (poseLandmarks[11].y + poseLandmarks[12].y) / 2 * canvas.height;
            
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

        // DIBUJAR PLANO CARTESIANO DE REFERENCIA - Solo en desktop para mejor rendimiento
        if (!isMobile) {
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 2]);
          
          // Líneas verticales cada 40px
          for (let x = 0; x <= canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
          
          // Líneas horizontales cada 40px
          for (let y = 0; y <= canvas.height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
          
          // Líneas centrales más marcadas
          ctx.strokeStyle = '#6b7280';
          ctx.lineWidth = 1;
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
        }

        // DIBUJAR LANDMARKS FACIALES - Solo en desktop
        if (faceResults?.faceLandmarks && faceResults.faceLandmarks.length > 0 && !isMobile) {
          const faceLandmarks = faceResults.faceLandmarks[0];
          console.log('😊 Cara detectada con', faceLandmarks.length, 'landmarks para normalización');
          
          // Puntos clave de referencia para normalización MEJORADA
          const leftEye = faceLandmarks[33];
          const rightEye = faceLandmarks[263];
          const noseTip = faceLandmarks[1];
          const noseBridge = faceLandmarks[6];
          const chin = faceLandmarks[175];
          const forehead = faceLandmarks[10];
          
          if (leftEye && rightEye && noseTip && chin) {
            // Calcular centro facial robusto usando múltiples puntos
            const faceCenter = {
              x: (leftEye.x + rightEye.x + noseTip.x) / 3,
              y: (leftEye.y + rightEye.y + (noseBridge?.y || noseTip.y)) / 3
            };
            
            const eyeDistance = Math.sqrt(
              Math.pow((rightEye.x - leftEye.x) * canvas.width, 2) +
              Math.pow((rightEye.y - leftEye.y) * canvas.height, 2)
            );
            
            const faceHeight = Math.abs((chin.y - (forehead?.y || leftEye.y)) * canvas.height);
            const normalizeScale = Math.max(eyeDistance, faceHeight);
            
            // Marco de referencia facial para normalización - MÁS VISIBLE
            ctx.strokeStyle = '#ec4899';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.arc(
              faceCenter.x * canvas.width,
              faceCenter.y * canvas.height,
              normalizeScale,
              0,
              2 * Math.PI
            );
            ctx.stroke();
            
            // Ejes de referencia desde el centro facial
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            
            // Eje horizontal
            ctx.beginPath();
            ctx.moveTo((faceCenter.x * canvas.width) - normalizeScale, faceCenter.y * canvas.height);
            ctx.lineTo((faceCenter.x * canvas.width) + normalizeScale, faceCenter.y * canvas.height);
            ctx.stroke();
            
            // Eje vertical
            ctx.beginPath();
            ctx.moveTo(faceCenter.x * canvas.width, (faceCenter.y * canvas.height) - normalizeScale);
            ctx.lineTo(faceCenter.x * canvas.width, (faceCenter.y * canvas.height) + normalizeScale);
            ctx.stroke();
            
            ctx.setLineDash([]);
            
            // Centro facial marcado prominentemente
            ctx.fillStyle = '#ec4899';
            ctx.beginPath();
            ctx.arc(
              faceCenter.x * canvas.width,
              faceCenter.y * canvas.height,
              6,
              0,
              2 * Math.PI
            );
            ctx.fill();
            
            // Etiqueta del centro facial con información
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(faceCenter.x * canvas.width - 35, faceCenter.y * canvas.height - 30, 70, 20);
            ctx.fillStyle = '#000000';
            ctx.font = '9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Centro Facial', faceCenter.x * canvas.width, faceCenter.y * canvas.height - 18);
            ctx.fillText(`E:${normalizeScale.toFixed(0)}px`, faceCenter.x * canvas.width, faceCenter.y * canvas.height - 8);
            
            console.log('📏 Sistema de normalización activo:', {
              centro: faceCenter,
              escala: normalizeScale.toFixed(2)
            });
          }
          
          // Landmarks faciales clave más visibles
          const keyFacePoints = [33, 263, 1, 6, 175, 10]; // Ojos, nariz, barbilla, frente
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          for (const pointIdx of keyFacePoints) {
            if (faceLandmarks[pointIdx]) {
              const landmark = faceLandmarks[pointIdx];
              ctx.moveTo(landmark.x * canvas.width + 4, landmark.y * canvas.height);
              ctx.arc(
                landmark.x * canvas.width,
                landmark.y * canvas.height,
                4,
                0,
                2 * Math.PI
              );
            }
          }
          ctx.fill();

          // Líneas de conexión entre puntos clave para mostrar estructura facial
          const faceConnections = [[33, 263], [1, 6], [6, 10], [1, 175]]; // Ojos, nariz-puente, puente-frente, nariz-barbilla
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (const [start, end] of faceConnections) {
            if (faceLandmarks[start] && faceLandmarks[end]) {
              ctx.moveTo(
                faceLandmarks[start].x * canvas.width,
                faceLandmarks[start].y * canvas.height
              );
              ctx.lineTo(
                faceLandmarks[end].x * canvas.width,
                faceLandmarks[end].y * canvas.height
              );
            }
          }
          ctx.stroke();
        } else {
          // Mensaje cuando no hay cara detectada
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(10, 10, 200, 25);
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.textAlign = 'left';
          ctx.fillText('⚠️ Cara no detectada - sin normalización', 15, 27);
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
              const extractedData = HandDetector.extractHandData(results, faceResults, poseResults);
              const frameData: FrameData = {
                timestamp: performance.now(),
                hands: extractedData.hands,
                face: extractedData.face,
                pose: extractedData.pose
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
  }, [isRecording, isMobile, isAndroid, frameSkipCounter, lastRenderTime]);

  const initializeCamera = useCallback(async (deviceId?: string) => {
    // Stop any existing camera first
    stopCamera();
    
    try {
      console.log('🎥 Inicializando cámara...', { deviceId, isMobile, isAndroid });
      const cameraManager = CameraManager.getInstance();
      const stream = await cameraManager.createCameraStream(deviceId);
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        // Optimizaciones Android - mejor rendimiento
        videoRef.current.playsInline = true;
        videoRef.current.muted = true;
        videoRef.current.autoplay = true;
        
        // Aceleración por hardware en Android
        if (isAndroid) {
          videoRef.current.style.willChange = 'transform';
          videoRef.current.style.backfaceVisibility = 'hidden';
          videoRef.current.style.perspective = '1000px';
        }
        
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('📹 Video metadata cargado:', {
                videoWidth: videoRef.current?.videoWidth,
                videoHeight: videoRef.current?.videoHeight
              });
              resolve();
            };
          }
        });
        
        await videoRef.current.play();
        console.log('▶️ Video reproduciendo');
        
        // Configurar canvas con resolución optimizada
        if (canvasRef.current) {
          // Aceleración por hardware para canvas en Android
          if (isAndroid) {
            canvasRef.current.style.willChange = 'transform';
            canvasRef.current.style.backfaceVisibility = 'hidden';
          }
          
          console.log('🎨 Canvas configurado con aceleración por hardware para Android');
        }
        
        console.log('🤖 Inicializando detector de manos...');
        handDetectorRef.current = new HandDetector();
        await handDetectorRef.current.initialize(videoRef.current, (handRes: HandLandmarkerResult, faceRes?: any, poseRes?: any) => onResultsRef.current(handRes, faceRes, poseRes));
        console.log('✅ Detector de manos inicializado');
        
        setIsInitialized(true);
        setIsCameraOn(true);
        setCurrentCameraId(deviceId);
        
        toast({
          title: "Cámara iniciada",
          description: "Sistema optimizado para Android activo",
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
  }, [stopCamera, onHandResults, isMobile, isAndroid]);


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
      
      await supabaseSignService.saveSign({
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
      await initializeCamera(currentCameraId);
    }
  }, [isCameraOn, stopCamera, initializeCamera, currentCameraId]);

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
          Graba señas con detección de manos y torso en tiempo real - Sistema optimizado para Android
        </p>
      </div>

      <div className="relative">
        <video
          ref={videoRef}
          className="w-full rounded-lg bg-secondary hidden"
          autoPlay
          muted
          playsInline
          webkit-playsinline="true"
          style={{
            willChange: isAndroid ? 'transform' : 'auto',
            backfaceVisibility: isAndroid ? 'hidden' : 'visible'
          }}
        />
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border-2 border-tech-blue shadow-glow-tech"
          width={640}
          height={480}
          style={{
            willChange: isAndroid ? 'transform' : 'auto',
            backfaceVisibility: isAndroid ? 'hidden' : 'visible'
          }}
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

          {poseDetected && (
            <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500/50">
              <div className="w-2 h-2 bg-orange-500 rounded-full mr-1" />
              Torso detectado
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
            className="w-full"
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