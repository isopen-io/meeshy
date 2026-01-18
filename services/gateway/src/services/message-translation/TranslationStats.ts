/**
 * Statistiques et métriques du service de traduction
 */

export interface TranslationServiceStats {
  messages_saved: number;
  translation_requests_sent: number;
  translations_received: number;
  errors: number;
  pool_full_rejections: number;
  avg_processing_time: number;
  uptime_seconds: number;
  memory_usage_mb: number;
}

export class TranslationStats {
  private stats: TranslationServiceStats;
  private readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.stats = {
      messages_saved: 0,
      translation_requests_sent: 0,
      translations_received: 0,
      errors: 0,
      pool_full_rejections: 0,
      avg_processing_time: 0,
      uptime_seconds: 0,
      memory_usage_mb: 0
    };
  }

  /**
   * Incrémente le compteur de messages sauvegardés
   */
  incrementMessagesSaved(): void {
    this.stats.messages_saved++;
  }

  /**
   * Incrémente le compteur de requêtes envoyées
   */
  incrementRequestsSent(): void {
    this.stats.translation_requests_sent++;
  }

  /**
   * Incrémente le compteur de traductions reçues
   */
  incrementTranslationsReceived(): void {
    this.stats.translations_received++;
  }

  /**
   * Incrémente le compteur d'erreurs
   */
  incrementErrors(): void {
    this.stats.errors++;
  }

  /**
   * Incrémente le compteur de rejets pool plein
   */
  incrementPoolFullRejections(): void {
    this.stats.pool_full_rejections++;
  }

  /**
   * Met à jour le temps de traitement moyen
   */
  updateAvgProcessingTime(processingTimeMs: number): void {
    const currentAvg = this.stats.avg_processing_time;
    const totalTranslations = this.stats.translations_received;

    if (totalTranslations === 0) {
      this.stats.avg_processing_time = processingTimeMs;
    } else {
      // Moyenne glissante
      this.stats.avg_processing_time =
        (currentAvg * (totalTranslations - 1) + processingTimeMs) / totalTranslations;
    }
  }

  /**
   * Retourne les statistiques actuelles
   */
  getStats(): TranslationServiceStats {
    const uptime = (Date.now() - this.startTime) / 1000;
    const memoryUsageMb = process.memoryUsage().heapUsed / 1024 / 1024;

    return {
      ...this.stats,
      uptime_seconds: uptime,
      memory_usage_mb: memoryUsageMb
    };
  }

  /**
   * Réinitialise toutes les statistiques
   */
  reset(): void {
    this.stats = {
      messages_saved: 0,
      translation_requests_sent: 0,
      translations_received: 0,
      errors: 0,
      pool_full_rejections: 0,
      avg_processing_time: 0,
      uptime_seconds: 0,
      memory_usage_mb: 0
    };
  }

  /**
   * Retourne le temps de fonctionnement en secondes
   */
  get uptimeSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}
