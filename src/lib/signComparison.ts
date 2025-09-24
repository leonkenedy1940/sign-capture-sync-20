import { FrameData, HandLandmarks } from './mediapipe';

export interface ComparisonResult {
  signId: string;
  signName: string;
  similarity: number;
  isMatch: boolean;
}

export class SignComparisonService {
  private readonly SIMILARITY_THRESHOLD = 0.8; // Threshold más razonable para detección
  private readonly TARGET_FRAMES = 40; // Normalizar a 40 frames (8 segundos a ~5 fps)
  private readonly MIN_QUALITY_FRAMES = 20; // Mínimo de frames de calidad requeridos

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
   * Normaliza las posiciones de las manos usando la cara como referencia
   */
  private normalizeHandsWithFace(frameData: FrameData): FrameData {
    if (!frameData.face || frameData.face.landmarks.length === 0) {
      return frameData; // Sin cara, devolver original
    }

    const faceLandmarks = frameData.face.landmarks;
    // Usar puntos clave de la cara como referencia (nariz: índice 1, frente: índice 10)
    const nosePoint = faceLandmarks[1] || faceLandmarks[0];
    const foreheadPoint = faceLandmarks[10] || faceLandmarks[0];
    
    // Calcular escala basada en el tamaño de la cara
    const faceHeight = Math.abs(foreheadPoint.y - nosePoint.y);
    const faceScale = faceHeight > 0 ? 1 / faceHeight : 1;

    const normalizedHands = frameData.hands.map(hand => ({
      ...hand,
      landmarks: hand.landmarks.map(landmark => ({
        x: (landmark.x - nosePoint.x) * faceScale,
        y: (landmark.y - nosePoint.y) * faceScale,
        z: (landmark.z - nosePoint.z) * faceScale
      }))
    }));

    return {
      ...frameData,
      hands: normalizedHands
    };
  }

  /**
   * Extrae características mejoradas de un frame usando la cara como referencia
   */
  private extractFeatures(frameData: FrameData): number[] {
    const features: number[] = [];
    
    // Normalizar usando la cara si está disponible
    const normalizedFrame = this.normalizeHandsWithFace(frameData);
    
    normalizedFrame.hands.forEach(hand => {
      if (hand.landmarks.length !== 21) return;
      
      // Landmarks normalizados
      hand.landmarks.forEach(landmark => {
        features.push(landmark.x, landmark.y, landmark.z);
      });

      // Ángulos entre dedos clave
      const wrist = hand.landmarks[0];
      const thumb = hand.landmarks[4];
      const index = hand.landmarks[8];
      const middle = hand.landmarks[12];
      const ring = hand.landmarks[16];
      const pinky = hand.landmarks[20];

      // Calcular ángulos relativos a la muñeca
      const angles = [thumb, index, middle, ring, pinky].map(tip => {
        const dx = tip.x - wrist.x;
        const dy = tip.y - wrist.y;
        return Math.atan2(dy, dx);
      });
      
      features.push(...angles);

      // Distancias entre puntos clave para mejor precisión
      const keyDistances = [
        this.euclideanDistance([thumb.x, thumb.y, thumb.z], [index.x, index.y, index.z]),
        this.euclideanDistance([index.x, index.y, index.z], [middle.x, middle.y, middle.z]),
        this.euclideanDistance([middle.x, middle.y, middle.z], [ring.x, ring.y, ring.z]),
        this.euclideanDistance([ring.x, ring.y, ring.z], [pinky.x, pinky.y, pinky.z]),
        this.euclideanDistance([wrist.x, wrist.y, wrist.z], [middle.x, middle.y, middle.z])
      ];
      
      features.push(...keyDistances);
    });

    // Normalizar tamaño del vector para una o dos manos
    while (features.length < 140) { // 2 manos * (21*3 + 5 ángulos + 5 distancias)
      features.push(0);
    }

    return features.slice(0, 140);
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

      // Combinar métricas de forma balanceada
      const finalSimilarity = (finalDtwSim * 0.6) + (finalCosineSim * 0.4);
      
      return Math.max(0, Math.min(1, finalSimilarity)); // Asegurar que esté entre 0 y 1
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