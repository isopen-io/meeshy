/**
 * Hook de traduction unifié pour le service API
 * Combine la traduction et les statistiques de traduction
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { translationService, type TranslationResult } from '@/services/translation.service';
import type { Message, TranslatedMessage, User } from '@/types';

interface TranslationOptions {
  useCache?: boolean;
}

interface TranslationState {
  isTranslating: boolean;
  error: string | null;
}

interface TranslationStats {
  totalTranslations: number;
  lastUsed: Date | null;
  translationsToday: number;
  languagesUsed: string[];
}

const STORAGE_KEY = 'translation_stats';

export const useMessageTranslation = () => {
  const [state, setState] = useState<TranslationState>({
    isTranslating: false,
    error: null
  });

  const [stats, setStats] = useState<TranslationStats>({
    totalTranslations: 0,
    lastUsed: null,
    translationsToday: 0,
    languagesUsed: []
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const translateText = useCallback(async (
    text: string, 
    targetLanguage: string, 
    sourceLanguage?: string,
    options: TranslationOptions = {}
  ): Promise<TranslationResult | null> => {
    if (!text.trim()) return null;

    // Annuler la traduction précédente si elle existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState({ isTranslating: true, error: null });

    try {
      const result = await translationService.translateText({
        text,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
        model: 'basic'
      });
      
      setState({ isTranslating: false, error: null });
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Erreur de traduction';
      setState({ isTranslating: false, error: errorMessage });
      console.error('Translation error:', error);
      return null;
    }
  }, []);

  const translateMessage = useCallback(async (
    message: Message,
    targetLanguage: string,
    currentUser?: User,
    options: TranslationOptions = {}
  ): Promise<TranslatedMessage | null> => {
    if (!message.content || !targetLanguage) return null;

    try {
      const result = await translateText(
        message.content,
        targetLanguage,
        'auto', // Détecter automatiquement la langue source
        options
      );

      if (!result) return null;

      return {
        ...message,
        translatedContent: result.translatedText,
        originalContent: message.content,
        targetLanguage,
        translationConfidence: result.confidence || 0.95,
        translatedAt: new Date(),
        translationModel: 'api-service'
      } as TranslatedMessage;
    } catch (error) {
      console.error('Message translation error:', error);
      return null;
    }
  }, [translateText]);

  const abortTranslation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({ ...prev, isTranslating: false }));
    }
  }, []);

  // Fonctions de gestion des statistiques
  const loadStats = useCallback(() => {
    try {
      const statsData = localStorage.getItem(STORAGE_KEY);
      if (statsData) {
        const parsedStats = JSON.parse(statsData);
        setStats({
          totalTranslations: parsedStats.totalTranslations || 0,
          lastUsed: parsedStats.lastUsed ? new Date(parsedStats.lastUsed) : null,
          translationsToday: parsedStats.translationsToday || 0,
          languagesUsed: parsedStats.languagesUsed || []
        });
      }
    } catch (error) {
      console.error('Error loading translation stats:', error);
    }
  }, []);

  const saveStats = useCallback((newStats: TranslationStats) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...newStats,
        lastUsed: newStats.lastUsed?.toISOString()
      }));
    } catch (error) {
      console.error('Error saving translation stats:', error);
    }
  }, []);

  const incrementTranslationCount = useCallback((sourceLanguage: string, targetLanguage: string) => {
    const now = new Date();
    const today = now.toDateString();
    
    setStats(prev => {
      const newStats = {
        ...prev,
        totalTranslations: prev.totalTranslations + 1,
        lastUsed: now,
        translationsToday: today === prev.lastUsed?.toDateString() ? prev.translationsToday + 1 : 1,
        languagesUsed: [...new Set([...prev.languagesUsed, sourceLanguage, targetLanguage])]
      };
      
      saveStats(newStats);
      return newStats;
    });
  }, [saveStats]);

  const resetStats = useCallback(() => {
    const resetStats: TranslationStats = {
      totalTranslations: 0,
      lastUsed: null,
      translationsToday: 0,
      languagesUsed: []
    };
    setStats(resetStats);
    saveStats(resetStats);
  }, [saveStats]);

  // Charger les statistiques au montage
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    ...state,
    translateText,
    translate: translateText, // Alias pour compatibilité
    translateMessage,
    abortTranslation,
    
    // Statistiques
    stats,
    incrementTranslationCount,
    resetStats
  };
};
