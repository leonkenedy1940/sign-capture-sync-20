import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

export class VoiceAlertService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isAndroid = false;

  constructor() {
    this.initializeVoiceService();
  }

  private async initializeVoiceService() {
    // Detectar si estamos en Android
    if (Capacitor.isNativePlatform()) {
      try {
        const deviceInfo = await Device.getInfo();
        this.isAndroid = deviceInfo.platform === 'android';
      } catch (error) {
        console.warn('Error detectando plataforma:', error);
      }
    }

    // Inicializar Web Speech API
    if ('speechSynthesis' in window && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
      
      // En Android WebView, esperar un poco antes de cargar voces
      if (this.isAndroid) {
        setTimeout(() => this.loadVoices(), 100);
      } else {
        this.loadVoices();
      }
    } else {
      console.warn('Speech synthesis not available in this browser');
    }
  }

  /**
   * Carga las voces disponibles con compatibilidad Android
   */
  private loadVoices(): void {
    if (!this.synth) return;
    
    const loadVoicesFromSynth = () => {
      this.voices = this.synth!.getVoices();
      console.log(`Voces cargadas: ${this.voices.length}`, this.voices.map(v => ({ name: v.name, lang: v.lang })));
    };

    // Cargar voces inmediatamente
    loadVoicesFromSynth();
    
    // Si las voces no están cargadas aún o estamos en Android, escuchar el evento
    if (this.voices.length === 0 || this.isAndroid) {
      this.synth.addEventListener('voiceschanged', loadVoicesFromSynth);
      
      // En Android, intentar cargar voces múltiples veces
      if (this.isAndroid) {
        setTimeout(loadVoicesFromSynth, 200);
        setTimeout(loadVoicesFromSynth, 500);
        setTimeout(loadVoicesFromSynth, 1000);
      }
    }
  }

  /**
   * Selecciona la mejor voz en español disponible
   */
  private getSpanishVoice(): SpeechSynthesisVoice | null {
    // Buscar voces en español
    const spanishVoices = this.voices.filter(voice => 
      voice.lang.startsWith('es') || voice.lang.includes('ES')
    );

    if (spanishVoices.length > 0) {
      // Priorizar voces locales
      const localVoice = spanishVoices.find(voice => voice.localService);
      return localVoice || spanishVoices[0];
    }

    // Si no hay voces en español, usar la primera disponible
    return this.voices.length > 0 ? this.voices[0] : null;
  }

  /**
   * Reproduce una alerta de voz con el nombre de la seña reconocida
   * Optimizado para Android WebView
   */
  async playSignRecognitionAlert(signName: string): Promise<void> {
    if (!this.synth || !this.isSupported()) {
      console.warn('Speech synthesis not available');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        // Cancelar cualquier síntesis en curso
        this.synth!.cancel();

        const message = `Seña reconocida: ${signName}`;
        const utterance = new SpeechSynthesisUtterance(message);

        // Configurar la voz
        const voice = this.getSpanishVoice();
        if (voice) {
          utterance.voice = voice;
        }

        // Configurar parámetros de voz optimizados para Android
        utterance.rate = this.isAndroid ? 0.8 : 0.9; // Más lento en Android
        utterance.pitch = 1.0;
        utterance.volume = 1.0; // Volumen máximo en Android

        // Configurar idioma específico para Android
        if (this.isAndroid) {
          utterance.lang = 'es-ES';
        }

        // Configurar eventos con timeout para Android
        let timeoutId: NodeJS.Timeout;
        
        utterance.onend = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        
        utterance.onerror = (event) => {
          clearTimeout(timeoutId);
          console.error('Error de síntesis de voz:', event.error);
          reject(new Error(`Error de síntesis de voz: ${event.error}`));
        };

        // Timeout de seguridad para Android WebView
        if (this.isAndroid) {
          timeoutId = setTimeout(() => {
            console.warn('Timeout en síntesis de voz, resolviendo');
            resolve();
          }, 5000);
        }

        // Reproducir
        console.log('Reproduciendo mensaje:', message);
        this.synth!.speak(utterance);
      } catch (error) {
        console.error('Error en playSignRecognitionAlert:', error);
        resolve(); // No fallar, solo continuar silenciosamente
      }
    });
  }

  /**
   * Reproduce una alerta cuando no hay coincidencias
   * Optimizado para Android WebView
   */
  async playNoMatchAlert(): Promise<void> {
    if (!this.synth || !this.isSupported()) {
      console.warn('Speech synthesis not available');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.synth!.cancel();

        const message = "No se encontraron coincidencias";
        const utterance = new SpeechSynthesisUtterance(message);

        const voice = this.getSpanishVoice();
        if (voice) {
          utterance.voice = voice;
        }

        // Configurar parámetros optimizados para Android
        utterance.rate = this.isAndroid ? 0.8 : 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (this.isAndroid) {
          utterance.lang = 'es-ES';
        }

        // Configurar eventos con timeout
        let timeoutId: NodeJS.Timeout;
        
        utterance.onend = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        
        utterance.onerror = (event) => {
          clearTimeout(timeoutId);
          console.error('Error de síntesis de voz:', event.error);
          resolve(); // No fallar, continuar silenciosamente
        };

        if (this.isAndroid) {
          timeoutId = setTimeout(() => {
            console.warn('Timeout en síntesis de voz, resolviendo');
            resolve();
          }, 5000);
        }

        this.synth!.speak(utterance);
      } catch (error) {
        console.error('Error en playNoMatchAlert:', error);
        resolve();
      }
    });
  }

  /**
   * Detiene cualquier reproducción de voz en curso
   */
  stop(): void {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  /**
   * Verifica si el navegador soporta síntesis de voz
   */
  isSupported(): boolean {
    return 'speechSynthesis' in window && !!window.speechSynthesis && !!this.synth;
  }

  /**
   * Obtiene información sobre las voces disponibles
   */
  getAvailableVoices(): { name: string; lang: string; localService: boolean }[] {
    return this.voices.map(voice => ({
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService
    }));
  }
}

export const voiceAlertService = new VoiceAlertService();