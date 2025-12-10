'use client';

import { useState, useCallback, useContext, createContext, ReactNode } from 'react';

// Types pour les vues de message
export type MessageViewMode = 'normal' | 'reaction' | 'language' | 'edit' | 'delete' | 'report';

export interface MessageViewState {
  messageId: string;
  mode: MessageViewMode;
  data?: any;
  previousMode?: MessageViewMode;
}

export interface MessageViewContextType {
  activeView: MessageViewState | null;
  activateView: (messageId: string, mode: MessageViewMode, data?: any) => void;
  deactivateView: () => void;
  isViewActive: (messageId: string, mode?: MessageViewMode) => boolean;
  canTransition: (fromMode: MessageViewMode, toMode: MessageViewMode) => boolean;
}

// Context pour partager l'état entre tous les messages
const MessageViewContext = createContext<MessageViewContextType | null>(null);

// Provider pour la gestion globale des vues de messages
export function MessageViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<MessageViewState | null>(null);

  // Transitions autorisées - State Machine Pattern
  const allowedTransitions: Record<MessageViewMode, MessageViewMode[]> = {
    normal: ['reaction', 'language', 'edit', 'delete', 'report'],
    reaction: ['normal'],
    language: ['normal'],
    edit: ['normal'],
    delete: ['normal'],
    report: ['normal']
  };

  const canTransition = useCallback((fromMode: MessageViewMode, toMode: MessageViewMode): boolean => {
    return allowedTransitions[fromMode]?.includes(toMode) ?? false;
  }, []);

  const activateView = useCallback((messageId: string, mode: MessageViewMode, data?: any) => {
    setActiveView(prev => {
      // Vérifier si transition autorisée
      const currentMode = prev?.messageId === messageId ? prev.mode : 'normal';
      if (!canTransition(currentMode, mode)) {
        console.warn(`Transition not allowed: ${currentMode} -> ${mode}`);
        return prev;
      }

      return {
        messageId,
        mode,
        data,
        previousMode: currentMode !== 'normal' ? currentMode : undefined
      };
    });
  }, [canTransition]);

  const deactivateView = useCallback(() => {
    setActiveView(null);
  }, []);

  const isViewActive = useCallback((messageId: string, mode?: MessageViewMode): boolean => {
    if (!activeView || activeView.messageId !== messageId) {
      return false;
    }
    
    if (mode) {
      return activeView.mode === mode;
    }
    
    return activeView.mode !== 'normal';
  }, [activeView]);

  return (
    <MessageViewContext.Provider value={{
      activeView,
      activateView,
      deactivateView,
      isViewActive,
      canTransition
    }}>
      {children}
    </MessageViewContext.Provider>
  );
}

// Hook pour utiliser le contexte des vues de messages
export function useMessageViewState() {
  const context = useContext(MessageViewContext);
  
  if (!context) {
    throw new Error('useMessageViewState must be used within a MessageViewProvider');
  }
  
  return context;
}

// Hook spécialisé pour un message individuel
export function useMessageView(messageId: string) {
  const { activeView, activateView, deactivateView, isViewActive, canTransition } = useMessageViewState();
  
  // Getters pour ce message spécifique
  const isActive = useCallback((mode?: MessageViewMode) => {
    return isViewActive(messageId, mode);
  }, [messageId, isViewActive]);

  const currentMode = activeView?.messageId === messageId ? activeView.mode : 'normal';
  const currentData = activeView?.messageId === messageId ? activeView.data : undefined;

  // Actions pour ce message spécifique
  const enterReactionMode = useCallback(() => {
    activateView(messageId, 'reaction');
  }, [messageId, activateView]);

  const enterLanguageMode = useCallback((data?: any) => {
    activateView(messageId, 'language', data);
  }, [messageId, activateView]);

  const enterEditMode = useCallback((data?: any) => {
    activateView(messageId, 'edit', data);
  }, [messageId, activateView]);

  const enterDeleteMode = useCallback(() => {
    activateView(messageId, 'delete');
  }, [messageId, activateView]);

  const enterReportMode = useCallback(() => {
    activateView(messageId, 'report');
  }, [messageId, activateView]);

  const exitMode = useCallback(() => {
    if (isActive()) {
      deactivateView();
    }
  }, [isActive, deactivateView]);

  // Vérifications d'état
  const canEnterMode = useCallback((mode: MessageViewMode) => {
    return canTransition(currentMode, mode);
  }, [currentMode, canTransition]);

  return {
    // État
    currentMode,
    currentData,
    isActive,

    // Actions
    enterReactionMode,
    enterLanguageMode,
    enterEditMode,
    enterDeleteMode,
    enterReportMode,
    exitMode,

    // Vérifications
    canEnterMode,

    // État global (pour debug/dev)
    globalState: activeView
  };
}