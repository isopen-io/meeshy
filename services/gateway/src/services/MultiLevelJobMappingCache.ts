/**
 * Service de cache multi-niveau pour les mappings de jobs backend
 *
 * Ce service est un wrapper spécialisé autour de MultiLevelCache<JobMetadata>
 * pour préserver les métadonnées (messageId, attachmentId, conversationId)
 * associées aux jobs backend envoyés au service translator.
 *
 * Garantit le fonctionnement en dev/prod même sans Redis grâce au cache mémoire.
 */

import { Redis } from 'ioredis';
import { MultiLevelCache } from './MultiLevelCache';

export interface JobMetadata {
  messageId?: string;
  attachmentId?: string;
  conversationId?: string;
  userId: string;
  jobType: 'voice' | 'audio' | 'transcription' | 'translation';
  timestamp: number;
  [key: string]: any;
}

export class MultiLevelJobMappingCache {
  private cache: MultiLevelCache<JobMetadata>;

  constructor(redis?: Redis) {
    this.cache = new MultiLevelCache<JobMetadata>({
      name: 'JobMapping',
      memoryTtlMs: 30 * 60 * 1000, // 30 minutes
      redisTtlSeconds: 3600, // 1 heure
      keyPrefix: 'backend_job:',
      redis
    });
  }

  /**
   * Sauvegarde le mapping dans les deux niveaux de cache
   */
  async saveJobMapping(jobId: string, metadata: JobMetadata): Promise<void> {
    return this.cache.set(jobId, metadata);
  }

  /**
   * Récupère et supprime le mapping (priorité: mémoire puis Redis)
   */
  async getAndDeleteJobMapping(jobId: string): Promise<JobMetadata | null> {
    return this.cache.getAndDelete(jobId);
  }

  /**
   * Récupère le mapping sans le supprimer
   */
  async getJobMapping(jobId: string): Promise<JobMetadata | null> {
    return this.cache.get(jobId);
  }

  /**
   * Vérifie si un mapping existe
   */
  async hasJobMapping(jobId: string): Promise<boolean> {
    return this.cache.has(jobId);
  }

  /**
   * Supprime manuellement un mapping
   */
  async deleteJobMapping(jobId: string): Promise<boolean> {
    return this.cache.delete(jobId);
  }

  /**
   * Retourne les statistiques du cache
   */
  getStats(): { memorySize: number; memoryCapacity: number } {
    return this.cache.getStats();
  }

  /**
   * Ferme le service et nettoie les ressources
   */
  async disconnect(): Promise<void> {
    return this.cache.disconnect();
  }
}
