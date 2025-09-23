import { toast } from '@/hooks/use-toast';

export interface LoggingContext {
  handsDetected: number;
  requiredHands: number;
  ambientLightLevel?: number;
  frameQuality?: number;
  timestamp: number;
}

export class EnhancedLogger {
  private static instance: EnhancedLogger;
  private lastAmbientWarning = 0;
  private lastHandsWarning = 0;
  private invalidSignCount = 0;
  private readonly AMBIENT_WARNING_COOLDOWN = 5000; // 5 seconds
  private readonly HANDS_WARNING_COOLDOWN = 3000; // 3 seconds
  private readonly INVALID_SIGN_THRESHOLD = 0.85; // Below 85% similarity

  static getInstance(): EnhancedLogger {
    if (!EnhancedLogger.instance) {
      EnhancedLogger.instance = new EnhancedLogger();
    }
    return EnhancedLogger.instance;
  }

  private constructor() {}

  checkAmbientLight(context: LoggingContext): void {
    const now = Date.now();
    if (context.ambientLightLevel && context.ambientLightLevel > 0.8) {
      if (now - this.lastAmbientWarning > this.AMBIENT_WARNING_COOLDOWN) {
        console.warn('⚠️ ADVERTENCIA: Exceso de luz ambiental detectado', {
          nivel: context.ambientLightLevel,
          recomendacion: 'Reducir iluminación para mejor reconocimiento'
        });
        
        toast({
          title: "⚠️ Mucha luz ambiental",
          description: "Reduce la iluminación para mejorar el reconocimiento de señas",
          variant: "destructive",
        });
        
        this.lastAmbientWarning = now;
      }
    }
  }

  checkHandsDetection(context: LoggingContext): void {
    const now = Date.now();
    
    if (context.handsDetected < context.requiredHands) {
      if (now - this.lastHandsWarning > this.HANDS_WARNING_COOLDOWN) {
        console.error('❌ ERROR: Manos insuficientes detectadas', {
          detectadas: context.handsDetected,
          requeridas: context.requiredHands,
          timestamp: context.timestamp
        });
        
        const message = context.handsDetected === 0 
          ? "No se detectan manos en el campo visual"
          : `Solo se detecta ${context.handsDetected} mano${context.handsDetected > 1 ? 's' : ''}, se requieren ${context.requiredHands}`;
        
        toast({
          title: "❌ Manos insuficientes",
          description: message,
          variant: "destructive",
        });
        
        this.lastHandsWarning = now;
      }
    } else if (context.handsDetected >= context.requiredHands) {
      console.log('✅ Manos suficientes detectadas:', {
        detectadas: context.handsDetected,
        requeridas: context.requiredHands
      });
    }
  }

  logInvalidSign(signName: string, similarity: number): void {
    this.invalidSignCount++;
    
    console.warn('⚠️ SEÑA NO VÁLIDA DETECTADA:', {
      nombre: signName,
      similitud: `${(similarity * 100).toFixed(1)}%`,
      umbral: `${(this.INVALID_SIGN_THRESHOLD * 100)}%`,
      conteoInvalidas: this.invalidSignCount
    });

    toast({
      title: `⚠️ Seña "${signName}" no válida`,
      description: `Similitud ${(similarity * 100).toFixed(1)}% (< ${(this.INVALID_SIGN_THRESHOLD * 100)}%). El proceso continúa normalmente.`,
      variant: "default", // Not destructive to allow process to continue
    });
  }

  logValidSign(signName: string, similarity: number): void {
    console.log('✅ SEÑA VÁLIDA RECONOCIDA:', {
      nombre: signName,
      similitud: `${(similarity * 100).toFixed(1)}%`,
      umbral: `${(this.INVALID_SIGN_THRESHOLD * 100)}%`
    });

    toast({
      title: `✅ ¡Seña "${signName}" reconocida!`,
      description: `Similitud: ${(similarity * 100).toFixed(1)}%`,
    });
  }

  logFrameQuality(context: LoggingContext): void {
    if (context.frameQuality && context.frameQuality < 0.6) {
      console.warn('⚠️ Calidad de frame baja:', {
        calidad: context.frameQuality,
        manos: context.handsDetected,
        timestamp: context.timestamp
      });
    } else if (context.frameQuality) {
      console.log('✓ Frame de calidad aceptable:', {
        calidad: context.frameQuality,
        manos: context.handsDetected
      });
    }
  }

  logDetectionStart(context: LoggingContext): void {
    console.log('🎯 INICIANDO DETECCIÓN:', {
      timestamp: context.timestamp,
      manosRequeridas: context.requiredHands,
      configuración: 'Modo de alta precisión activado'
    });

    toast({
      title: "🎯 Detección iniciada",
      description: `Sistema configurado para detectar ${context.requiredHands} mano${context.requiredHands > 1 ? 's' : ''}`,
    });
  }

  logComparisonResults(results: any[], validResults: any[]): void {
    console.log('📊 RESULTADOS DE COMPARACIÓN:', {
      totalResultados: results.length,
      resultadosVálidos: validResults.length,
      señasInválidas: results.length - validResults.length,
      mejorCoincidencia: validResults.length > 0 ? validResults[0] : 'Ninguna'
    });
  }

  resetCounters(): void {
    this.invalidSignCount = 0;
    this.lastAmbientWarning = 0;
    this.lastHandsWarning = 0;
  }
}

export const enhancedLogger = EnhancedLogger.getInstance();