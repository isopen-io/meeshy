/**
 * Abonnement typing pour la Lentille — WL-101 (LWS-10).
 *
 * Contrat (§LWS-10, travaux) : « Abonnement typing dans la liste (aujourd'hui
 * `typingUsers` n'atteint jamais `ConversationList`) : MÊME SERVICE que le
 * fil, ligne 2 "X écrit…", dot forcé vert. »
 *
 * « Même service que le fil » — re-preuve (protocole §2, RE-PROUVER) : le fil
 * (`ConversationLayout.tsx`) reçoit ses événements typing par
 * `useSocketIOMessaging({ onUserTyping })`, qui relaie
 * `meeshySocketIOService.onTyping` (`hooks/use-socketio-messaging.ts:147-153`).
 * `TypingService.typingListeners` est un `Set` — plusieurs abonnés
 * simultanés sont déjà le fonctionnement normal du service
 * (`services/socketio/typing.service.ts:28`), donc un second abonnement ici
 * ne dédouble ni ne remplace celui du fil : il écoute le MÊME flux.
 *
 * Ce hook n'est PAS `useConversationTyping` (`hooks/conversations/
 * useConversationTyping.ts`) : ce dernier est bâti pour UNE conversation
 * (il filtre tout événement dont l'id ne correspond pas à la conversation
 * ouverte). La liste, elle, affiche TOUTES les conversations à la fois — la
 * loi ici tient l'état PAR conversation (`Map<conversationId, ...>`) plutôt
 * que d'en filtrer une seule. Le pipeline de données de la liste
 * (`useConversationSorting`/`useConversationFiltering`) n'est pas touché :
 * cet état est un flux dérivé du socket, à côté, jamais écrit dedans.
 *
 * DÉCISION D'ABONNEMENT (documentée, contrat §LWS-10 place ce hook « dans le
 * mux WL-101 ») : ce hook n'est appelé que depuis
 * `components/conversations/lentille/LentilleConversationListMount.tsx`, qui
 * n'est monté QUE quand le drapeau Lentille est actif (mux de
 * `ConversationList.tsx`, chargement `next/dynamic`). Le drapeau ne
 * traverse donc jamais CE fichier — il n'a pas besoin de le lire : son
 * activation se traduit uniquement par le fait que ce hook s'exécute ou non.
 * Drapeau OFF ⇒ ce module n'est même pas téléchargé ⇒ aucun abonnement,
 * coût nul.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';

export interface LentilleTypingUser {
  userId: string;
  displayName: string;
}

// Même filet de sécurité que le fil (`useConversationTyping.ts` —
// `REMOTE_TYPING_SAFETY_TIMEOUT`) : un `typing:stop` distant peut se perdre
// (coupure brève, onglet expéditeur fermé avant son propre timeout local).
// Valeur dupliquée plutôt qu'importée : `useConversationTyping.ts` ne
// l'exporte pas et n'est pas un fichier possédé par LWS-10 (interdiction de
// toucher au pipeline du fil, protocole §5 WL-101).
const REMOTE_TYPING_SAFETY_TIMEOUT_MS = 8000;

/**
 * Tient, PAR conversation, la liste des utilisateurs distants en train de
 * taper — dérivé du même flux socket que le fil, jamais du pipeline de
 * données de la liste.
 */
export function useLentilleListTyping(
  currentUserId: string | null | undefined
): Map<string, LentilleTypingUser[]> {
  const [typingByConversation, setTypingByConversation] = useState<
    Map<string, LentilleTypingUser[]>
  >(new Map());
  const safetyTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeTypingUser = useCallback((conversationId: string, userId: string) => {
    setTypingByConversation(prev => {
      const current = prev.get(conversationId);
      if (!current || !current.some(u => u.userId === userId)) return prev;

      const next = new Map(prev);
      const filtered = current.filter(u => u.userId !== userId);
      if (filtered.length > 0) {
        next.set(conversationId, filtered);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
  }, []);

  const handleUserTyping = useCallback(
    (userId: string, username: string, isTyping: boolean, conversationId: string) => {
      // Même garde que le fil : jamais son propre écho.
      if (!currentUserId || userId === currentUserId) return;

      const timeoutKey = `${conversationId}:${userId}`;
      const existingTimeout = safetyTimeoutsRef.current.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        safetyTimeoutsRef.current.delete(timeoutKey);
      }

      if (!isTyping) {
        removeTypingUser(conversationId, userId);
        return;
      }

      safetyTimeoutsRef.current.set(
        timeoutKey,
        setTimeout(() => {
          safetyTimeoutsRef.current.delete(timeoutKey);
          removeTypingUser(conversationId, userId);
        }, REMOTE_TYPING_SAFETY_TIMEOUT_MS)
      );

      setTypingByConversation(prev => {
        const current = prev.get(conversationId) ?? [];
        if (current.some(u => u.userId === userId)) return prev;

        const next = new Map(prev);
        next.set(conversationId, [...current, { userId, displayName: username }]);
        return next;
      });
    },
    [currentUserId, removeTypingUser]
  );

  // Même service que le fil (voir en-tête) — un abonnement de plus sur le
  // même `Set` d'écouteurs, jamais un second pipeline.
  useSocketIOMessaging({ onUserTyping: handleUserTyping });

  return typingByConversation;
}
