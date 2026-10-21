import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Message } from '@/lib/api/types';

type SessionModule = typeof import('./shared-translations-session');

const loadSession = (): Promise<SessionModule> => import('./shared-translations-session');

/**
 * **LE FIL OUVERT LIT CE QUE LES AUTRES MEMBRES ONT TRADUIT** (#9899) — pour
 * TOUT lecteur, avec ou sans traduction sur l'appareil : à chaque fenêtre
 * chargée, les partages de la conversation sont relus et ouverts ; tant que le
 * fil est ouvert, `message:translation-shared` les apporte en direct. Les
 * traductions entrent par le puits des traductions du serveur : aucune peau ne
 * change. Le mode de chiffrement de la conversation (`null` quand elle ne le dit
 * pas) part avec les messages : seul un clair que le serveur lit déjà est demandé.
 *
 * Ce hook ne pèse rien dans le chunk du fil : la session, le contrat de
 * scellement et leur lot de dépendances n'arrivent que par `import()`, et le
 * hook ne partage aucun module avec le reste de la page (un module commun ferait
 * du chunk du fil un chunk partagé, et son adresse grossirait le point d'entrée).
 * `load` n'existe que pour les témoins.
 */
export function useSharedTranslations(
  params: {
    readonly conversationId: string;
    readonly messages: readonly Message[];
    readonly readerLanguages: readonly string[];
    readonly viewerId: string;
    readonly conversationEncryptionMode: string | null;
  },
  load: () => Promise<Pick<SessionModule, 'sharedTranslationSession'>> = loadSession,
): void {
  const queryClient = useQueryClient();
  const { conversationId, messages, readerLanguages, viewerId, conversationEncryptionMode } = params;

  useEffect(() => {
    if (conversationId === '') return;
    let cancelled = false;
    let release: (() => void) | undefined;
    void load()
      .then(({ sharedTranslationSession }) => {
        if (cancelled) return;
        release = sharedTranslationSession(queryClient).watch(conversationId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      release?.();
    };
  }, [queryClient, conversationId, load]);

  useEffect(() => {
    if (conversationId === '' || viewerId === '') return;
    let cancelled = false;
    void load()
      .then(({ sharedTranslationSession }) => {
        if (cancelled) return;
        sharedTranslationSession(queryClient).offer({ conversationId, messages, viewerId, readerLanguages, conversationEncryptionMode });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [queryClient, conversationId, messages, readerLanguages, viewerId, conversationEncryptionMode, load]);
}
