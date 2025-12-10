/**
 * Hook d'optimisation des performances de traduction
 * Gère le batching, le cache et les métriques de performance
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { advancedTranslationService } from '@/services/advanced-translation.service';
import type { TranslationData, TranslationOptions } from '@/services/advanced-translation.service';

interface PerformanceMetrics {
  totalRequests: number;
  batchedRequests: number;
  cacheHits: number;
  errors: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  cacheHitRate: number;
  pendingRequests: number;
  activeBatches: number;
  cacheSize: number;
}

interface TranslationRequest {
  messageId: string;
  content: string;
  sourceLanguage: string;
  targetLanguages: string[];
  status: 'pending' | 'processing' | 'completed' | 'error' | 'cached';
  timestamp: number;
  results?: TranslationData[];
  error?: string;
  processingTime?: number;
}

interface UseTranslationPerformanceOptions {
  enableBatching?: boolean;
  batchSize?: number;
  batchTimeout?: number;
  cacheResults?: boolean;
  trackMetrics?: boolean;
  maxRetries?: number;
  priority?: 'low' | 'normal' | 'high';
}

interface UseTranslationPerformanceReturn {
  // État des traductions
  requests: Map<string, TranslationRequest>;
  isProcessing: boolean;
  hasErrors: boolean;
  
  // Métriques de performance
  metrics: PerformanceMetrics;
  
  // Actions
  requestTranslation: (
    messageId: string,
    content: string,
    sourceLanguage: string,
    targetLanguages: string[],
    options?: TranslationOptions
  ) => Promise<TranslationData[]>;
  
  cancelRequest: (messageId: string) => void;
  retryRequest: (messageId: string) => Promise<TranslationData[]>;
  clearCache: () => void;
  clearErrors: () => void;
  flushBatches: () => void;
  
  // État avancé
  getRequestStatus: (messageId: string) => TranslationRequest['status'] | null;
  getProcessingTime: (messageId: string) => number | null;
  getBatchInfo: () => { size: number; timeout: number; enabled: boolean };
}

export function useTranslationPerformance(
  options: UseTranslationPerformanceOptions = {}
): UseTranslationPerformanceReturn {
  const {
    enableBatching = true,
    batchSize = 10,
    batchTimeout = 500,
    cacheResults = true,
    trackMetrics = true,
    maxRetries = 3,
    priority = 'normal'
  } = options;

  // État des requêtes de traduction
  const [requests, setRequests] = useState<Map<string, TranslationRequest>>(new Map());
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    totalRequests: 0,
    batchedRequests: 0,
    cacheHits: 0,
    errors: 0,
    avgBatchSize: 0,
    avgProcessingTime: 0,
    cacheHitRate: 0,
    pendingRequests: 0,
    activeBatches: 0,
    cacheSize: 0
  });

  // État dérivé
  const isProcessing = Array.from(requests.values()).some(
    req => req.status === 'processing' || req.status === 'pending'
  );
  
  const hasErrors = Array.from(requests.values()).some(
    req => req.status === 'error'
  );

    // Références
  const metricsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<Map<string, number>>(new Map());

  // Mise à jour des métriques
  const updateMetrics = useCallback(() => {
    if (!trackMetrics) return;
    
    const stats = advancedTranslationService.getStats();
    setMetrics(stats);
  }, [trackMetrics]);

  // Configurer les écouteurs d'événements
  useEffect(() => {
    const handleTranslationCompleted = (data: { messageId: string; results: TranslationData[] }) => {
      const processingTime = Date.now() - (requests.get(data.messageId)?.timestamp || 0);
      
      setRequests(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.messageId);
        if (existing) {
          updated.set(data.messageId, {
            ...existing,
            status: 'completed',
            results: data.results,
            processingTime
          });
        }
        return updated;
      });

      updateMetrics();
    };

    const handleTranslationFailed = (data: { messageId: string; error: string }) => {
      setRequests(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.messageId);
        if (existing) {
          updated.set(data.messageId, {
            ...existing,
            status: 'error',
            error: data.error
          });
        }
        return updated;
      });

      updateMetrics();
    };

    const handleTranslationCached = (data: { messageId: string; results: TranslationData[] }) => {
      setRequests(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.messageId);
        if (existing) {
          updated.set(data.messageId, {
            ...existing,
            status: 'cached',
            results: data.results,
            processingTime: 0
          });
        }
        return updated;
      });

      updateMetrics();
    };

    advancedTranslationService.on('translation:completed', handleTranslationCompleted);
    advancedTranslationService.on('translation:failed', handleTranslationFailed);
    advancedTranslationService.on('translation:cached', handleTranslationCached);

    // Timer pour mise à jour des métriques
    if (trackMetrics) {
      metricsTimerRef.current = setInterval(updateMetrics, 2000);
    }

    return () => {
      advancedTranslationService.off('translation:completed', handleTranslationCompleted);
      advancedTranslationService.off('translation:failed', handleTranslationFailed);
      advancedTranslationService.off('translation:cached', handleTranslationCached);
      
      if (metricsTimerRef.current) {
        clearInterval(metricsTimerRef.current);
      }
    };
  }, [updateMetrics, trackMetrics, requests]);

  // Demander une traduction
  const requestTranslation = useCallback(async (
    messageId: string,
    content: string,
    sourceLanguage: string,
    targetLanguages: string[],
    requestOptions: TranslationOptions = {}
  ): Promise<TranslationData[]> => {
    const mergedOptions: TranslationOptions = {
      enableBatching,
      batchSize,
      batchTimeout,
      cacheResults,
      priority,
      retryAttempts: maxRetries,
      ...requestOptions
    };

    // Créer la requête
    const request: TranslationRequest = {
      messageId,
      content,
      sourceLanguage,
      targetLanguages,
      status: 'pending',
      timestamp: Date.now()
    };

    setRequests(prev => new Map(prev.set(messageId, request)));

    try {
      // Marquer comme en cours de traitement
      setRequests(prev => {
        const updated = new Map(prev);
        const existing = updated.get(messageId);
        if (existing) {
          updated.set(messageId, { ...existing, status: 'processing' });
        }
        return updated;
      });

      const results = await advancedTranslationService.requestTranslation(
        messageId,
        content,
        sourceLanguage,
        targetLanguages,
        mergedOptions
      );

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      
      setRequests(prev => {
        const updated = new Map(prev);
        const existing = updated.get(messageId);
        if (existing) {
          updated.set(messageId, {
            ...existing,
            status: 'error',
            error: errorMessage
          });
        }
        return updated;
      });

      throw error;
    }
  }, [enableBatching, batchSize, batchTimeout, cacheResults, priority, maxRetries]);

  // Annuler une requête
  const cancelRequest = useCallback((messageId: string) => {
    setRequests(prev => {
      const updated = new Map(prev);
      updated.delete(messageId);
      return updated;
    });
    
    retryCountRef.current.delete(messageId);
  }, []);

  // Réessayer une requête
  const retryRequest = useCallback(async (messageId: string): Promise<TranslationData[]> => {
    const request = requests.get(messageId);
    if (!request) {
      throw new Error(`Requête ${messageId} non trouvée`);
    }

    const retryCount = retryCountRef.current.get(messageId) || 0;
    if (retryCount >= maxRetries) {
      throw new Error(`Nombre maximum de tentatives atteint pour ${messageId}`);
    }

    retryCountRef.current.set(messageId, retryCount + 1);

    return requestTranslation(
      request.messageId,
      request.content,
      request.sourceLanguage,
      request.targetLanguages,
      { priority: 'high' } // Haute priorité pour les retry
    );
  }, [requests, maxRetries, requestTranslation]);

  // Vider le cache
  const clearCache = useCallback(() => {
    advancedTranslationService.clearCache();
    updateMetrics();
  }, [updateMetrics]);

  // Effacer les erreurs
  const clearErrors = useCallback(() => {
    setRequests(prev => {
      const updated = new Map();
      prev.forEach((request, messageId) => {
        if (request.status !== 'error') {
          updated.set(messageId, request);
        }
      });
      return updated;
    });
    
    retryCountRef.current.clear();
  }, []);

  // Forcer le traitement des batches
  const flushBatches = useCallback(() => {
    advancedTranslationService.flush();
  }, []);

  // Obtenir le statut d'une requête
  const getRequestStatus = useCallback((messageId: string): TranslationRequest['status'] | null => {
    return requests.get(messageId)?.status || null;
  }, [requests]);

  // Obtenir le temps de traitement d'une requête
  const getProcessingTime = useCallback((messageId: string): number | null => {
    return requests.get(messageId)?.processingTime || null;
  }, [requests]);

  // Obtenir les informations de batch
  const getBatchInfo = useCallback(() => ({
    size: batchSize,
    timeout: batchTimeout,
    enabled: enableBatching
  }), [batchSize, batchTimeout, enableBatching]);

  return {
    // État
    requests,
    isProcessing,
    hasErrors,
    metrics,
    
    // Actions
    requestTranslation,
    cancelRequest,
    retryRequest,
    clearCache,
    clearErrors,
    flushBatches,
    
    // État avancé
    getRequestStatus,
    getProcessingTime,
    getBatchInfo
  };
}