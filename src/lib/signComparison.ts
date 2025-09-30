import { FrameData, HandLandmarks } from './mediapipe';

export interface ComparisonResult {
  signId: string;
  signName: string;
  similarity: number;
  isMatch: boolean;
}

export class SignComparisonService {
  private readonly SIMILARITY_THRESHOLD = 0.92; // Más estricto para mayor exactitud
  private readonly TARGET_FRAMES = 60; // Normalizar a 60 frames (8 segundos a ~7.5 fps)
  private readonly MIN_QUALITY_FRAMES = 40; // Mínimo de frames de calidad requeridos

  /**
   * Normaliza una secuencia de frames a una duración específica
   */
  private normalizeSequence(frames: FrameData[]): FrameData[] {
    if (frames.length === 0) return [];
    
    const normalized: FrameData[] = [];
    const step = (frames.length - 1) / (this.TARGET_FRAMES - 1);

    for (let i = 0; i < this.TARGET_FRAMES; i++) {
      const index = Math.round(i * step);
      normalized.push(frames[Math.min(index, frames.length - 1)]);
    }

    return normalized;
  }

  /**
   * Extrae características mejoradas de un frame con normalización relativa
   */
  private extractFeatures(frameData: FrameData): number[] {
    const features: number[] = [];
    
    frameData.hands.forEach(hand => {
      if (hand.landmarks.length !== 21) return; // Validar landmarks completos
      
      // Usar la muñeca (landmark 0) como punto de referencia para normalización
      const wrist = hand.landmarks[0];
      
      // Landmarks clave para mayor precisión en comparación
      const keyLandmarks = [0, 4, 8, 12, 16, 20]; // Muñeca y puntas de dedos
      
      hand.landmarks.forEach((landmark, index) => {
        // Normalizar posición relativa a la muñeca para invarianza de posición
        const relativeX = landmark.x - wrist.x;
        const relativeY = landmark.y - wrist.y;
        const relativeZ = landmark.z - wrist.z;
        
        // Dar más peso a landmarks clave
        const weight = keyLandmarks.includes(index) ? 1.5 : 1.0;
        
        features.push(relativeX * weight, relativeY * weight, relativeZ * weight);
      });

      // Agregar distancias entre landmarks clave para capturar la forma de la mano
      for (let i = 0; i < keyLandmarks.length - 1; i++) {
        for (let j = i + 1; j < keyLandmarks.length; j++) {
          const p1 = hand.landmarks[keyLandmarks[i]];
          const p2 = hand.landmarks[keyLandmarks[j]];
          const distance = Math.sqrt(
            Math.pow(p1.x - p2.x, 2) + 
            Math.pow(p1.y - p2.y, 2) + 
            Math.pow(p1.z - p2.z, 2)
          );
          features.push(distance);
        }
      }
    });

    // Si no hay manos detectadas, retornar vector nulo
    if (features.length === 0) {
      return new Array(78).fill(0); // 21 landmarks * 3 coords + 15 distancias
    }

    // Normalizar tamaño del vector
    while (features.length < 156) { // 2 manos * 78 features
      features.push(0);
    }

    return features.slice(0, 156);
  }

  /**
   * Calcula la similitud de coseno entre dos vectores
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Implementación de Dynamic Time Warping (DTW)
   */
  private calculateDTW(seq1: number[][], seq2: number[][]): number {
    const m = seq1.length;
    const n = seq2.length;
    
    // Matriz de costos
    const dtw: number[][] = Array(m).fill(null).map(() => Array(n).fill(Infinity));
    
    // Inicializar primera celda
    dtw[0][0] = this.euclideanDistance(seq1[0], seq2[0]);

    // Llenar primera fila y columna
    for (let i = 1; i < m; i++) {
      dtw[i][0] = dtw[i-1][0] + this.euclideanDistance(seq1[i], seq2[0]);
    }
    
    for (let j = 1; j < n; j++) {
      dtw[0][j] = dtw[0][j-1] + this.euclideanDistance(seq1[0], seq2[j]);
    }

    // Llenar el resto de la matriz
    for (let i = 1; i < m; i++) {
      for (let j = 1; j < n; j++) {
        const cost = this.euclideanDistance(seq1[i], seq2[j]);
        dtw[i][j] = cost + Math.min(
          dtw[i-1][j],    // inserción
          dtw[i][j-1],    // eliminación
          dtw[i-1][j-1]   // coincidencia
        );
      }
    }

    // Normalizar por la longitud del camino
    return dtw[m-1][n-1] / (m + n);
  }

  /**
   * Calcula la distancia euclidiana entre dos vectores
   */
  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    
    return Math.sqrt(sum);
  }

  /**
   * Compara dos secuencias de señas
   */
  private compareSequences(sequence1: FrameData[], sequence2: FrameData[]): number {
    try {
      // Validar que las secuencias no estén vacías
      if (!sequence1 || sequence1.length === 0 || !sequence2 || sequence2.length === 0) {
        console.warn('Una o ambas secuencias están vacías');
        return 0;
      }

      // Normalizar ambas secuencias
      const norm1 = this.normalizeSequence(sequence1);
      const norm2 = this.normalizeSequence(sequence2);

      // Validar secuencias normalizadas
      if (norm1.length === 0 || norm2.length === 0) {
        console.warn('Error en la normalización de secuencias');
        return 0;
      }

      // Extraer características de cada frame
      const features1 = norm1.map(frame => this.extractFeatures(frame));
      const features2 = norm2.map(frame => this.extractFeatures(frame));

      // Validar que se extrajeron características
      if (features1.length === 0 || features2.length === 0) {
        console.warn('No se pudieron extraer características de los frames');
        return 0;
      }

      // Calcular DTW
      const dtwDistance = this.calculateDTW(features1, features2);
      
      // Validar que el DTW es un número válido
      if (isNaN(dtwDistance) || !isFinite(dtwDistance)) {
        console.warn('DTW calculó una distancia inválida');
        return 0;
      }
      
      // Convertir distancia DTW a similitud (0-1)
      const maxDistance = 10; // Distancia máxima esperada para normalizar
      const dtwSimilarity = Math.max(0, 1 - (dtwDistance / maxDistance));

      // Calcular similitud promedio frame por frame usando coseno
      let cosineSimilaritySum = 0;
      const minFrames = Math.min(features1.length, features2.length);
      
      for (let i = 0; i < minFrames; i++) {
        const cosineResult = this.cosineSimilarity(features1[i], features2[i]);
        if (!isNaN(cosineResult) && isFinite(cosineResult)) {
          cosineSimilaritySum += cosineResult;
        }
      }
      
      const avgCosineSimilarity = minFrames > 0 ? cosineSimilaritySum / minFrames : 0;

      // Validar similitudes finales
      const finalDtwSim = isNaN(dtwSimilarity) ? 0 : dtwSimilarity;
      const finalCosineSim = isNaN(avgCosineSimilarity) ? 0 : avgCosineSimilarity;

      // Combinar métricas con pesos optimizados para mayor exactitud
      const finalSimilarity = (finalDtwSim * 0.7) + (finalCosineSim * 0.3);
      
      // Aplicar función de suavizado para penalizar similitudes mediocres
      const smoothedSimilarity = Math.pow(finalSimilarity, 1.2);
      
      return Math.max(0, Math.min(1, smoothedSimilarity)); // Asegurar que esté entre 0 y 1
    } catch (error) {
      console.error('Error en compareSequences:', error);
      return 0;
    }
  }

  /**
   * Compara una seña grabada con todas las señas en la base de datos
   */
  async compareWithDatabase(recordedFrames: FrameData[], savedSigns: Array<{id: string, name: string, keyframes: FrameData[]}>): Promise<ComparisonResult[]> {
    const results: ComparisonResult[] = [];

    // Validar que tenemos frames para comparar
    if (!recordedFrames || recordedFrames.length === 0) {
      console.warn('No hay frames grabados para comparar');
      return results;
    }

    // Validar que tenemos señas guardadas
    if (!savedSigns || savedSigns.length === 0) {
      console.warn('No hay señas guardadas para comparar');
      return results;
    }

    for (const savedSign of savedSigns) {
      try {
        // Validar que la seña guardada tiene keyframes
        if (!savedSign.keyframes || savedSign.keyframes.length === 0) {
          console.warn(`Seña ${savedSign.name} no tiene keyframes válidos`);
          continue;
        }

        const similarity = this.compareSequences(recordedFrames, savedSign.keyframes);
        
        results.push({
          signId: savedSign.id,
          signName: savedSign.name,
          similarity,
          isMatch: similarity >= this.SIMILARITY_THRESHOLD
        });
      } catch (error) {
        console.error(`Error comparando seña ${savedSign.name}:`, error);
        // Continuar con la siguiente seña en caso de error
        continue;
      }
    }

    // Ordenar por similitud descendente
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Encuentra la mejor coincidencia si existe
   */
  async findBestMatch(recordedFrames: FrameData[], savedSigns: Array<{id: string, name: string, keyframes: FrameData[]}>): Promise<ComparisonResult | null> {
    const results = await this.compareWithDatabase(recordedFrames, savedSigns);
    
    if (results.length > 0 && results[0].isMatch) {
      return results[0];
    }
    
    return null;
  }
}

export const signComparisonService = new SignComparisonService();