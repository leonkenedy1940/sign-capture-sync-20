export class VoiceAlertService {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    this.synth = window.speechSynthesis;
    this.loadVoices();
  }

  /**
   * Carga las voces disponibles
   */
  private loadVoices(): void {
    this.voices = this.synth.getVoices();
    
    // Si las voces no están cargadas aún, escuchar el evento
    if (this.voices.length === 0) {
      this.synth.addEventListener('voiceschanged', () => {
        this.voices = this.synth.getVoices();
      });
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
   */
  async playSignRecognitionAlert(signName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Cancelar cualquier síntesis en curso
      this.synth.cancel();

      const message = `Seña reconocida: ${signName}`;
      const utterance = new SpeechSynthesisUtterance(message);

      // Configurar la voz
      const voice = this.getSpanishVoice();
      if (voice) {
        utterance.voice = voice;
      }

      // Configurar parámetros de voz
      utterance.rate = 0.9; // Velocidad ligeramente más lenta para claridad
      utterance.pitch = 1.0; // Tono normal
      utterance.volume = 0.8; // Volumen alto pero no máximo

      // Configurar eventos
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`Error de síntesis de voz: ${event.error}`));

      // Reproducir
      this.synth.speak(utterance);
    });
  }

  /**
   * Reproduce una alerta cuando no hay coincidencias
   */
  async playNoMatchAlert(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.synth.cancel();

      const message = "No se encontraron coincidencias";
      const utterance = new SpeechSynthesisUtterance(message);

      const voice = this.getSpanishVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`Error de síntesis de voz: ${event.error}`));

      this.synth.speak(utterance);
    });
  }

  /**
   * Detiene cualquier reproducción de voz en curso
   */
  stop(): void {
    this.synth.cancel();
  }

  /**
   * Verifica si el navegador soporta síntesis de voz
   */
  isSupported(): boolean {
    return 'speechSynthesis' in window;
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