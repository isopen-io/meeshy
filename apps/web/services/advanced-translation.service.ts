/**
 * Service avancé de traduction avec gestion par lots et optimisations
 * Améliore les perf  private setupEventListeners() {
    // Écouter les réponses de traduction du Socket.IO
    meeshySocketIOService.onTranslation((data) => {
      // Convertir les données de traduction vers notre format interne
      const convertedTranslations: TranslationData[] = data.translations.map(t => ({
        messageId: data.messageId,
        sourceLanguage: t.sourceLanguage || 'unknown',
        targetLanguage: t.targetLanguage,
        originalContent: '', // Pas disponible dans les données Socket.IO
        translatedContent: t.translatedContent,
        translationModel: (t.translationModel as TranslationModel) || 'basic',
        confidence: t.confidenceScore || 85,
        cached: t.cached || false,
        processingTime: 0, // Calculé localement
        timestamp: Date.now()
      }));
      
      this.handleTranslationResponse(data.messageId, convertedTranslations);
    });
  }ions en temps réel
 */

'use client';

import { EventEmitter } from 'events';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import type { TranslationModel, MessagePriority } from '@meeshy/shared/types';

// Types de données de traduction
export interface TranslationData {
  messageId: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalContent: string;
  translatedContent: string;
  translationModel: TranslationModel;
  confidence: number;
  cached: boolean;
  processingTime: number;
  timestamp: number;
}

interface BatchTranslationRequest {
  messageId: string;
  content: string;
  sourceLanguage: string;
  targetLanguages: string[];
  priority: MessagePriority;
  timestamp: number;
  userId?: string;
  conversationId?: string;
}

interface TranslationBatch {
  id: string;
  requests: BatchTranslationRequest[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  processedAt?: number;
  results: Map<string, TranslationData[]>;
  errors: Map<string, string>;
}

interface TranslationOptions {
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
  priority?: MessagePriority;
  retryAttempts?: number;
  cacheResults?: boolean;
}

class AdvancedTranslationService extends EventEmitter {
  private static instance: AdvancedTranslationService | null = null;
  
  // Configuration
  private readonly DEFAULT_BATCH_SIZE = 10;
  private readonly DEFAULT_BATCH_TIMEOUT = 500; // ms
  private readonly MAX_RETRY_ATTEMPTS = 3;
  
  // État du service
  private isEnabled = true;
  private pendingRequests: Map<string, BatchTranslationRequest> = new Map();
  private activeBatches: Map<string, TranslationBatch> = new Map();
  private translationCache: Map<string, TranslationData> = new Map();
  
  // Timers et queues
  private batchTimer: NodeJS.Timeout | null = null;
  private processingQueue: TranslationBatch[] = [];
  private priorityQueue: BatchTranslationRequest[] = [];
  
  // Métriques
  private stats = {
    totalRequests: 0,
    batchedRequests: 0,
    cacheHits: 0,
    errors: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0
  };

  private constructor() {
    super();
    this.setupEventListeners();
  }

  static getInstance(): AdvancedTranslationService {
    if (!AdvancedTranslationService.instance) {
      AdvancedTranslationService.instance = new AdvancedTranslationService();
    }
    return AdvancedTranslationService.instance;
  }

  private setupEventListeners() {
    // Écouter les réponses de traduction du Socket.IO
    meeshySocketIOService.onTranslation((data) => {
      // Convertir les données de traduction vers notre format
      const convertedTranslations: TranslationData[] = data.translations.map(t => ({
        messageId: data.messageId,
        sourceLanguage: t.sourceLanguage || 'unknown',
        targetLanguage: t.targetLanguage,
        originalContent: '', // Not provided by socket event
        translatedContent: t.translatedContent,
        translationModel: (t.translationModel as TranslationModel) || 'basic',
        confidence: t.confidenceScore || 85,
        cached: t.cached || false,
        processingTime: 0, // Not provided by socket event
        timestamp: Date.now()
      }));

      this.handleTranslationResponse(data.messageId, convertedTranslations);
    });
  }

  /**
   * Demander une traduction (avec batching automatique)
   */
  async requestTranslation(
    messageId: string,
    content: string,
    sourceLanguage: string,
    targetLanguages: string[],
    options: TranslationOptions = {}
  ): Promise<TranslationData[]> {
    const {
      enableBatching = true,
      priority = 'normal',
      retryAttempts = this.MAX_RETRY_ATTEMPTS,
      cacheResults = true
    } = options;

    this.stats.totalRequests++;

    // Vérifier le cache d'abord
    if (cacheResults) {
      const cachedResults = this.getCachedTranslations(messageId, targetLanguages);
      if (cachedResults.length === targetLanguages.length) {
        this.stats.cacheHits++;
        this.emit('translation:cached', { messageId, results: cachedResults });
        return cachedResults;
      }
    }

    const request: BatchTranslationRequest = {
      messageId,
      content,
      sourceLanguage,
      targetLanguages,
      priority,
      timestamp: Date.now(),
      conversationId: 'current' // À récupérer du contexte
    };

    if (enableBatching && priority !== 'high') {
      return this.addToBatch(request, options);
    } else {
      return this.processImmediately(request, options);
    }
  }

  /**
   * Ajouter une requête au batch
   */
  private async addToBatch(
    request: BatchTranslationRequest,
    options: TranslationOptions
  ): Promise<TranslationData[]> {
    const { batchSize = this.DEFAULT_BATCH_SIZE, batchTimeout = this.DEFAULT_BATCH_TIMEOUT } = options;

    this.pendingRequests.set(request.messageId, request);
    this.stats.batchedRequests++;

    // Démarrer le timer de batch si nécessaire
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processPendingBatch();
      }, batchTimeout);
    }

    // Traiter immédiatement si le batch est plein
    if (this.pendingRequests.size >= batchSize) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
      this.processPendingBatch();
    }

    // Retourner une promesse qui sera résolue quand la traduction sera prête
    return new Promise((resolve, reject) => {
      const handler = (data: { messageId: string; results: TranslationData[] }) => {
        if (data.messageId === request.messageId) {
          this.off('translation:completed', handler);
          this.off('translation:failed', failHandler);
          resolve(data.results);
        }
      };

      const failHandler = (data: { messageId: string; error: string }) => {
        if (data.messageId === request.messageId) {
          this.off('translation:completed', handler);
          this.off('translation:failed', failHandler);
          reject(new Error(data.error));
        }
      };

      this.on('translation:completed', handler);
      this.on('translation:failed', failHandler);
    });
  }

  /**
   * Traiter une requête immédiatement (haute priorité)
   */
  private async processImmediately(
    request: BatchTranslationRequest,
    options: TranslationOptions
  ): Promise<TranslationData[]> {
    const batchId = `immediate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batch: TranslationBatch = {
      id: batchId,
      requests: [request],
      status: 'processing',
      createdAt: Date.now(),
      results: new Map(),
      errors: new Map()
    };

    this.activeBatches.set(batchId, batch);
    
    try {
      await this.processBatch(batch);
      const results = batch.results.get(request.messageId) || [];
      
      if (results.length === 0 && batch.errors.has(request.messageId)) {
        throw new Error(batch.errors.get(request.messageId));
      }
      
      return results;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * Traiter le batch en attente
   */
  private processPendingBatch() {
    if (this.pendingRequests.size === 0) return;

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const requests = Array.from(this.pendingRequests.values());
    
    // Trier par priorité
    requests.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    const batch: TranslationBatch = {
      id: batchId,
      requests,
      status: 'processing',
      createdAt: Date.now(),
      results: new Map(),
      errors: new Map()
    };

    this.activeBatches.set(batchId, batch);
    this.pendingRequests.clear();

    // Traiter le batch de manière asynchrone
    this.processBatch(batch)
      .then(() => {
        this.stats.avgBatchSize = (this.stats.avgBatchSize + requests.length) / 2;
      })
      .catch((error) => {
        console.error(`❌ Erreur traitement batch ${batchId}:`, error);
        this.stats.errors++;
      })
      .finally(() => {
        this.activeBatches.delete(batchId);
      });
  }

  /**
   * Traiter un batch de traductions
   */
  private async processBatch(batch: TranslationBatch): Promise<void> {
    const startTime = Date.now();
    batch.status = 'processing';
    batch.processedAt = startTime;


    // Grouper les requêtes par langue source pour optimiser
    const groupedRequests = new Map<string, BatchTranslationRequest[]>();
    
    batch.requests.forEach(request => {
      const key = request.sourceLanguage;
      if (!groupedRequests.has(key)) {
        groupedRequests.set(key, []);
      }
      groupedRequests.get(key)!.push(request);
    });

    // Traiter chaque groupe
    const promises = Array.from(groupedRequests.entries()).map(([sourceLanguage, requests]) =>
      this.processLanguageGroup(sourceLanguage, requests, batch)
    );

    await Promise.allSettled(promises);

    const processingTime = Date.now() - startTime;
    this.stats.avgProcessingTime = (this.stats.avgProcessingTime + processingTime) / 2;

    batch.status = 'completed';

    // Émettre les résultats
    batch.requests.forEach(request => {
      const results = batch.results.get(request.messageId);
      const error = batch.errors.get(request.messageId);

      if (results) {
        this.emit('translation:completed', { messageId: request.messageId, results });
      } else if (error) {
        this.emit('translation:failed', { messageId: request.messageId, error });
      }
    });
  }

  /**
   * Traiter un groupe de requêtes avec la même langue source
   */
  private async processLanguageGroup(
    sourceLanguage: string,
    requests: BatchTranslationRequest[],
    batch: TranslationBatch
  ): Promise<void> {

    for (const request of requests) {
      try {
        // Utiliser l'ancienne méthode de traduction via Socket.IO
        const success = await this.requestTranslationViaSocket(request);
        
        if (!success) {
          batch.errors.set(request.messageId, 'Échec de la demande de traduction');
        }
        
        // Les résultats arriveront via handleTranslationResponse
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        batch.errors.set(request.messageId, errorMessage);
        console.error(`❌ Erreur traduction ${request.messageId}:`, error);
      }
    }
  }

  /**
   * Demander une traduction via Socket.IO
   */
  private async requestTranslationViaSocket(request: BatchTranslationRequest): Promise<boolean> {
    try {
      // Utiliser la méthode d'émission directe du socket
      const socket = meeshySocketIOService.getSocket();
      if (socket && socket.connected) {
        // Émettre l'événement de demande de traduction
        socket.emit('request_translation', {
          messageId: request.messageId,
          targetLanguage: request.targetLanguages[0] // Premier langue cible
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Erreur émission traduction via Socket.IO:`, error);
      return false;
    }
  }

  /**
   * Gérer les réponses de traduction
   */
  private handleTranslationResponse(messageId: string, translations: TranslationData[]) {

    // Mettre en cache les résultats
    translations.forEach(translation => {
      const cacheKey = this.getCacheKey(messageId, translation.targetLanguage);
      this.translationCache.set(cacheKey, translation);
    });

    // Notifier les batches concernés
    for (const batch of this.activeBatches.values()) {
      const request = batch.requests.find(r => r.messageId === messageId);
      if (request) {
        batch.results.set(messageId, translations);
        
        // Vérifier si le batch est terminé
        const allCompleted = batch.requests.every(r => 
          batch.results.has(r.messageId) || batch.errors.has(r.messageId)
        );
        
        if (allCompleted) {
          batch.status = 'completed';
        }
        
        break;
      }
    }

    this.emit('translation:received', { messageId, translations });
  }

  /**
   * Récupérer les traductions en cache
   */
  private getCachedTranslations(messageId: string, targetLanguages: string[]): TranslationData[] {
    const results: TranslationData[] = [];
    
    targetLanguages.forEach(language => {
      const cacheKey = this.getCacheKey(messageId, language);
      const cached = this.translationCache.get(cacheKey);
      if (cached) {
        results.push(cached);
      }
    });
    
    return results;
  }

  /**
   * Générer une clé de cache
   */
  private getCacheKey(messageId: string, targetLanguage: string): string {
    return `${messageId}_${targetLanguage}`;
  }

  /**
   * Obtenir les statistiques du service
   */
  getStats() {
    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
      activeBatches: this.activeBatches.size,
      cacheSize: this.translationCache.size,
      cacheHitRate: this.stats.totalRequests > 0 ? (this.stats.cacheHits / this.stats.totalRequests) * 100 : 0
    };
  }

  /**
   * Vider le cache
   */
  clearCache() {
    this.translationCache.clear();
  }

  /**
   * Activer/désactiver le service
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      // Arrêter tous les timers et vider les queues
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.pendingRequests.clear();
      this.processingQueue.length = 0;
    }
  }

  /**
   * Forcer le traitement des batches en attente
   */
  flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.processPendingBatch();
  }
}

// Export de l'instance singleton
export const advancedTranslationService = AdvancedTranslationService.getInstance();

// Export du type pour usage externe
export type { TranslationOptions, BatchTranslationRequest };