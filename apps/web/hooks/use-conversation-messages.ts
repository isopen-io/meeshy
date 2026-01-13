/**
 * Hook spécialisé pour ConversationLayout et BubbleStreamPage
 * - Messages récents en bas, anciens en haut
 * - Scroll vers le haut pour charger plus de messages anciens
 * - Ordre chronologique strict (anciens → récents)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { authManager } from '@/services/auth-manager.service';
import { apiService } from '@/services/api.service';
import { debounce } from '@/utils/debounce';
import type { User, Message } from '@meeshy/shared/types';

export interface ConversationMessagesOptions {
  limit?: number;
  enabled?: boolean;
  threshold?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  scrollDirection?: 'up' | 'down'; // Direction du scroll pour charger plus: 'up' = haut (défaut), 'down' = bas
  disableAutoFill?: boolean; // Désactive le chargement automatique pour remplir le conteneur
}

export interface ConversationMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  clearMessages: () => void;
  addMessage: (message: Message) => boolean;
  updateMessage: (messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => void;
  removeMessage: (messageId: string) => void;
}

export function useConversationMessages(
  conversationId: string | null,
  currentUser: User | null,
  options: ConversationMessagesOptions & { linkId?: string } = {}
): ConversationMessagesReturn {
  const {
    limit = 20,
    enabled = true,
    threshold = 100,
    containerRef,
    scrollDirection = 'up', // Par défaut: scroll vers le haut (comportement actuel)
    disableAutoFill = false, // Par défaut: auto-fill activé
    linkId // Optionnel: utilisé pour les utilisateurs anonymes
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const defaultContainerRef = useRef<HTMLDivElement>(null);
  const actualContainerRef = containerRef || defaultContainerRef;
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const offsetRef = useRef<number>(0); // Ref pour l'offset pour éviter les problèmes de timing
  const initialScrollDoneRef = useRef<boolean>(false); // Ref pour éviter de charger avant le scroll initial

  // Fonction pour charger les messages
  const loadMessagesInternal = useCallback(async (isLoadMore = false) => {

    if (!conversationId || !currentUser || !enabled) {
      return;
    }


    // Annuler la requête précédente si elle existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setOffset(0);
      }

      setError(null);

      // Chercher le token d'authentification via authManager (source unique)
      const authToken = authManager.getAuthToken();
      const sessionToken = authManager.getAnonymousSession()?.token;

      if (!authToken && !sessionToken) {
        throw new Error('Token d\'authentification manquant');
      }

      // Calculer l'offset AVANT de faire l'appel API
      const currentOffset = isLoadMore ? offsetRef.current : 0;

      // Déterminer l'endpoint selon le contexte
      let endpoint: string;
      const requestOptions: { headers?: Record<string, string> } = {};

      if (sessionToken && linkId) {
        // Route "/chat/[linkId]" : PRIORITÉ à l'endpoint des liens partagés
        endpoint = `/api/links/${linkId}/messages`;
        requestOptions.headers = { 'x-session-token': sessionToken };
      } else if (conversationId && (authToken || sessionToken)) {
        // Route "/" ou "/conversations" : utiliser l'endpoint conversations
        // Cela inclut conversationId="meeshy" pour la page publique "/"
        endpoint = `/conversations/${conversationId}/messages`;
        if (sessionToken && !authToken) {
          // Utilisateur anonyme sur route "/" (conversationId="meeshy")
          requestOptions.headers = { 'x-session-token': sessionToken };
        }
      } else {
        throw new Error('Configuration invalide pour charger les messages');
      }


      const response = await apiService.get<{
        success: boolean;
        data: { messages: Message[]; userLanguage?: string };
        pagination?: { total: number; offset: number; limit: number; hasMore: boolean };
      }>(
        endpoint,
        {
          limit: limit.toString(),
          offset: currentOffset.toString(),
          include_reactions: 'true',
          include_translations: 'true'
        },
        requestOptions.headers ? { headers: requestOptions.headers } : undefined
      );

      const data = response.data;

      if (!data.success) {
        throw new Error('Erreur lors du chargement des messages');
      }

      const newMessages = data.data.messages || [];
      // Utiliser le format de pagination standard (pagination au niveau root)
      const hasMoreMessages = data.pagination?.hasMore ?? false;

      // Log des traductions reçues pour debugging

      if (isLoadMore) {
        // Sauvegarder la position de scroll et la hauteur AVANT d'ajouter les messages
        const container = actualContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;
        const scrollTopBefore = container?.scrollTop || 0;
        
        // Ajouter les messages selon la direction de scroll
        setMessages(prev => {
          // Éviter les doublons
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueNewMessages = newMessages.filter((m: Message) => !existingIds.has(m.id));
          
          if (uniqueNewMessages.length === 0) {
            return prev;
          }
          
          let combined;
          if (scrollDirection === 'up') {
            // Scroll vers le haut: ajouter les messages plus anciens au DÉBUT
            combined = [...uniqueNewMessages, ...prev];
          } else {
            // Scroll vers le bas: ajouter les messages plus anciens à la FIN
            combined = [...prev, ...uniqueNewMessages];
          }
          
          // Tri explicite pour garantir l'ordre DESC par createdAt
          combined.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateB - dateA; // DESC: plus récent en premier
          });
          
          return combined;
        });
        
        // Restaurer la position de scroll après le rendu
        // Utiliser requestAnimationFrame pour attendre que le DOM soit mis à jour
        if (scrollDirection === 'up') {
          // Pour scroll vers le haut: compenser la hauteur ajoutée
          requestAnimationFrame(() => {
            if (container) {
              const scrollHeightAfter = container.scrollHeight;
              const heightDifference = scrollHeightAfter - scrollHeightBefore;
              
              // Ajuster le scrollTop pour compenser la hauteur ajoutée
              const newScrollTop = scrollTopBefore + heightDifference;
              container.scrollTop = newScrollTop;
            }
          });
        }
        
        setOffset(prev => prev + limit);
        offsetRef.current += limit; // Mettre à jour la ref immédiatement
      } else {
        // Premier chargement : garder l'ordre du backend (récents en premier)
        // MessagesDisplay avec reverseOrder=true va inverser pour afficher anciens en haut, récents en bas
        // Tri explicite pour garantir l'ordre DESC par createdAt
        const sortedMessages = [...newMessages].sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA; // DESC: plus récent en premier
        });
        
        setMessages(sortedMessages);
        setOffset(limit);
        offsetRef.current = limit; // Mettre à jour la ref immédiatement
        setIsInitialized(true);
      }

      setHasMore(hasMoreMessages);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Requête annulée, ne pas afficher d'erreur
      }
      
      console.error('Erreur lors du chargement des messages:', error);
      setError(error.message || 'Erreur lors du chargement des messages');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId, currentUser, enabled, limit]); // Retirer offset puisqu'on utilise offsetRef

  // Version debounced de loadMessages pour éviter les appels multiples
  // OPTIMISATION: Réduit de 300ms à 100ms pour une réponse plus rapide
  const loadMessages = useMemo(
    () => debounce(loadMessagesInternal, 100),
    [loadMessagesInternal]
  );

  // Fonction pour charger plus de messages
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !enabled) {
      return;
    }

    // Protection contre les appels trop fréquents
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 1000) {
      return;
    }
    
    lastLoadTimeRef.current = now;
    await loadMessages(true);
  }, [loadMessages, isLoadingMore, hasMore, enabled]);

  // Fonction pour rafraîchir les messages
  const refresh = useCallback(async () => {
    await loadMessages(false);
  }, [loadMessages]);

  // Fonction pour vider les messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setOffset(0);
    offsetRef.current = 0; // Reset ref
    setHasMore(true);
    setIsInitialized(false);
    setError(null);
    initialScrollDoneRef.current = false; // Reset scroll initial
  }, []);

  // Fonction pour ajouter un message (nouveaux messages en temps réel)
  const addMessage = useCallback((message: Message): boolean => {
    let wasAdded = false;
    setMessages(prev => {
      // Éviter les doublons
      if (prev.some(m => m.id === message.id)) {
        return prev;
      }

      wasAdded = true;
      
      // Ajouter le nouveau message et GARANTIR l'ordre DESC par createdAt
      const newMessages = [message, ...prev];
      
      // Tri explicite par createdAt DESC (plus récent en premier)
      // Cela garantit que même si les messages arrivent dans le désordre via WebSocket,
      // l'affichage final (avec reverseOrder) sera correct
      newMessages.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // DESC: plus récent en premier
      });
      
      return newMessages;
    });
    
    return wasAdded;
  }, []);

  // Fonction pour mettre à jour un message (support des callbacks)
  const updateMessage = useCallback((messageId: string, updates: Partial<Message> | ((prev: Message) => Message)) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        return typeof updates === 'function' ? updates(msg) : { ...msg, ...updates };
      }
      return msg;
    }));
  }, []);

  // Fonction pour supprimer un message
  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId));
  }, []);

  // Gestion du scroll infini (scroll vers le haut pour charger plus anciens)
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Attendre que le DOM soit prêt avec un délai
    const timer = setTimeout(() => {
      if (!actualContainerRef.current) {
        console.warn('[useConversationMessages] Container ref not available after 100ms delay');
        return;
      }

      const container = actualContainerRef.current;
      
      if (process.env.NODE_ENV === 'development') {
      }
    
    const handleScroll = () => {
      if (isLoadingMore || !hasMore) {
        return;
      }

      // CORRECTION: Ne pas charger avant que le scroll initial ne soit effectué
      // Cela évite de charger des messages anciens avant que l'utilisateur ne soit scrollé au bon endroit
      if (!initialScrollDoneRef.current && scrollDirection === 'up') {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Vérifier qu'il y a vraiment eu un mouvement de scroll
      const scrollDelta = Math.abs(scrollTop - lastScrollTopRef.current);
      if (scrollDelta < 10) {
        return;
      }
      
      lastScrollTopRef.current = scrollTop;

      // Annuler le timeout précédent
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // OPTIMISATION: Réduit le debounce scroll de 100ms à 30ms pour une pagination plus réactive
      scrollTimeoutRef.current = setTimeout(() => {
        // Protection contre les conteneurs trop petits
        if (clientHeight >= scrollHeight || scrollHeight <= clientHeight + threshold) {
          return;
        }

        // Déterminer la direction de scroll
        let shouldLoadMore = false;

        if (scrollDirection === 'up') {
          shouldLoadMore = scrollTop <= threshold;
        } else {
          const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
          shouldLoadMore = distanceFromBottom <= threshold;
        }

        if (shouldLoadMore) {
          loadMore();
        }
      }, 30);
    };

      container.addEventListener('scroll', handleScroll, { passive: true });
      
      if (process.env.NODE_ENV === 'development') {
      }
      
      return () => {
        if (process.env.NODE_ENV === 'development') {
        }
        container.removeEventListener('scroll', handleScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, 100); // Délai de 100ms pour s'assurer que le DOM est prêt

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, isLoadingMore, hasMore, threshold, loadMore, scrollDirection]);

  // Réinitialiser le flag de scroll initial quand la conversation change
  useEffect(() => {
    initialScrollDoneRef.current = false;
  }, [conversationId]);

  // Chargement initial
  useEffect(() => {
    if (conversationId && currentUser && enabled && !isInitialized) {
      loadMessages(false);
    }
  }, [conversationId, currentUser, enabled, isInitialized]);

  // Marquer le scroll initial comme effectué après l'initialisation
  useEffect(() => {
    if (isInitialized && scrollDirection === 'up') {
      // Attendre un peu que ConversationMessages effectue le scroll vers le bas
      const timer = setTimeout(() => {
        initialScrollDoneRef.current = true;
      }, 500); // Délai pour laisser le temps au scrollToBottom() de s'exécuter
      return () => clearTimeout(timer);
    } else if (scrollDirection === 'down') {
      // Pour BubbleStream, pas besoin d'attendre
      initialScrollDoneRef.current = true;
    }
  }, [isInitialized, scrollDirection]);

  // Chargement automatique si le conteneur n'est pas assez rempli (peut être désactivé)
  useEffect(() => {
    if (disableAutoFill || !isInitialized || isLoadingMore || !hasMore || !actualContainerRef.current) {
      return;
    }

    // Utiliser un timeout pour éviter les appels en boucle
    const checkAndLoadMore = () => {
      if (!actualContainerRef.current || isLoadingMore || !hasMore) return;

      const container = actualContainerRef.current;
      const { scrollHeight, clientHeight } = container;

      // Vérifier si le conteneur n'est pas assez rempli
      if (scrollHeight <= clientHeight + 50 && hasMore) {
        loadMore();
      }
    };

    const timeoutId = setTimeout(checkAndLoadMore, 500);
    return () => clearTimeout(timeoutId);
  }, [disableAutoFill, isInitialized, messages.length, isLoadingMore, hasMore, loadMore]);

  // Nettoyage à la destruction
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    clearMessages,
    addMessage,
    updateMessage,
    removeMessage
  };
}