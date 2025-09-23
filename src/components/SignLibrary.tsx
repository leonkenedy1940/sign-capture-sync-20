import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SignRecord, signDatabase } from '@/lib/indexeddb';
import { useToast } from '@/hooks/use-toast';
import { Play, Trash2, Clock, Hand, Smartphone } from 'lucide-react';

interface SignLibraryProps {
  refreshTrigger?: number;
}

export const SignLibrary: React.FC<SignLibraryProps> = ({ refreshTrigger }) => {
  const [signs, setSigns] = useState<SignRecord[]>([]);
  const [playingSign, setPlayingSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const { toast } = useToast();

  const loadSigns = async () => {
    try {
      await signDatabase.initialize();
      const allSigns = await signDatabase.getAllSigns();
      setSigns(allSigns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
    } catch (error) {
      console.error('Error loading signs:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las señas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const playSign = async (sign: SignRecord) => {
    try {
      setPlayingSign(sign.id);
      
      if (videoRef.current && canvasRef.current) {
        const videoURL = URL.createObjectURL(sign.videoBlob);
        videoRef.current.src = videoURL;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        videoRef.current.onloadedmetadata = () => {
          canvas.width = videoRef.current!.videoWidth;
          canvas.height = videoRef.current!.videoHeight;
        };
        
        videoRef.current.ontimeupdate = () => {
          if (ctx && videoRef.current) {
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw video frame
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            
            // Find closest keyframe based on video time
            const currentTime = videoRef.current.currentTime * 1000; // Convert to ms
            const startTime = sign.keyframes[0]?.timestamp || 0;
            const relativeTime = currentTime + startTime;
            
            const closestFrame = sign.keyframes.find((frame, index) => {
              const nextFrame = sign.keyframes[index + 1];
              if (!nextFrame) return true;
              return frame.timestamp <= relativeTime && nextFrame.timestamp > relativeTime;
            });
            
            // Draw hand keypoints if available
            if (closestFrame && closestFrame.hands.length > 0) {
              for (const hand of closestFrame.hands) {
                // Draw landmarks
                for (const landmark of hand.landmarks) {
                  ctx.beginPath();
                  ctx.arc(
                    landmark.x * canvas.width,
                    landmark.y * canvas.height,
                    4,
                    0,
                    2 * Math.PI
                  );
                  ctx.fillStyle = hand.handedness === 'Left' ? '#22d3ee' : '#06b6d4';
                  ctx.fill();
                }
                
                // Draw connections
                const connections = [
                  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
                  [0, 5], [5, 6], [6, 7], [7, 8], // Index
                  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
                  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
                  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
                  [5, 9], [9, 13], [13, 17] // Palm
                ];
                
                ctx.strokeStyle = hand.handedness === 'Left' ? '#22d3ee' : '#06b6d4';
                ctx.lineWidth = 2;
                
                for (const [start, end] of connections) {
                  if (hand.landmarks[start] && hand.landmarks[end]) {
                    ctx.beginPath();
                    ctx.moveTo(
                      hand.landmarks[start].x * canvas.width,
                      hand.landmarks[start].y * canvas.height
                    );
                    ctx.lineTo(
                      hand.landmarks[end].x * canvas.width,
                      hand.landmarks[end].y * canvas.height
                    );
                    ctx.stroke();
                  }
                }
              }
            }
          }
        };
        
        videoRef.current.onended = () => {
          setPlayingSign(null);
          URL.revokeObjectURL(videoURL);
        };
        
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Error playing sign:', error);
      toast({
        title: "Error",
        description: "No se pudo reproducir la seña",
        variant: "destructive",
      });
      setPlayingSign(null);
    }
  };

  const deleteSign = async (id: string, name: string) => {
    try {
      await signDatabase.deleteSign(id);
      setSigns(signs.filter(sign => sign.id !== id));
      toast({
        title: "Seña eliminada",
        description: `"${name}" eliminada exitosamente`,
      });
    } catch (error) {
      console.error('Error deleting sign:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la seña",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadSigns();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Cargando biblioteca...</div>
      </Card>
    );
  }

  return (
    <Card className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-tech bg-clip-text text-transparent">
          Biblioteca de Señas
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          {signs.length} seña{signs.length !== 1 ? 's' : ''} guardada{signs.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Video player - responsive */}
      {playingSign && (
        <div className="space-y-4">
          <div className="relative">
            <video ref={videoRef} className="hidden" />
            <canvas
              ref={canvasRef}
              className="w-full rounded-lg border-2 border-accent shadow-glow-tech max-h-[50vh] sm:max-h-96"
            />
            <div className="absolute top-2 sm:top-4 left-2 sm:left-4">
              <Badge className="bg-accent text-accent-foreground text-xs sm:text-sm">
                <Play className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Reproduciendo</span>
                <span className="sm:hidden">▶</span>
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Signs grid - responsive */}
      {signs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <div className="space-y-2">
            <p className="text-sm sm:text-base">No hay señas guardadas aún.</p>
            <p className="text-xs sm:text-sm">Graba tu primera seña arriba.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {signs.map((sign) => (
            <Card key={sign.id} className="p-3 sm:p-4 space-y-3">
              <div className="space-y-2">
                <h3 className="font-semibold text-base sm:text-lg truncate">{sign.name}</h3>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {sign.duration}s
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    <Hand className="w-3 h-3 mr-1" />
                    {sign.keyframes.length}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {sign.createdAt.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => playSign(sign)}
                  disabled={playingSign === sign.id}
                  className="flex-1 text-xs sm:text-sm"
                >
                  <Play className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">
                    {playingSign === sign.id ? 'Reproduciendo...' : 'Reproducir'}
                  </span>
                  <span className="sm:hidden">
                    {playingSign === sign.id ? '...' : '▶'}
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteSign(sign.id, sign.name)}
                  className="px-2 sm:px-3"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Mobile optimization indicator */}
      <div className="flex justify-center sm:hidden pt-4">
        <Badge variant="outline" className="text-xs">
          <Smartphone className="w-3 h-3 mr-1" />
          Vista móvil optimizada
        </Badge>
      </div>
    </Card>
  );
};