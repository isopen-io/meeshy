import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { apiDeps } from '@/lib/api/deps';
import type { LiveSocketWatcher } from '@/lib/api/live-socket-watchers';
import type { Message } from '@/lib/api/types';

import { offeredMessagesOf } from './offer';
import { openPort } from './seal-port';
import { createSharedTranslationReceiver, type SharedTranslationReceiver } from './shared-translations';
import { fetchSharedTranslations } from './shared-translations-api';

/**
 * **LA SESSION DES TRADUCTIONS PARTAGÉES** (#9899) — ce que le fil ouvert fait
 * du receveur : lui offrir ses messages, et l'abonner à la socket vivante le
 * temps où il est ouvert. Elle ne s'importe que par `import()`
 * (`use-shared-translations.ts`) : rien de ce module n'entre dans le chunk du
 * fil.
 *
 * `offer` ne confie au receveur que ce que la loi de sortie laisse partir
 * (`offeredMessagesOf` : ni les miens, ni les protégés, ni les floutés, ni les
 * supprimés) ; un lecteur non identifié n'en confie aucun. Le mode de chiffrement
 * de la conversation voyage avec les messages : avec celui de chaque message, il
 * dit ce que le serveur lit, et le receveur ne demande ni n'ouvre que cela.
 *
 * `watch` s'accroche à `message:translation-shared` par la connexion temps réel
 * (`watchLiveSocket`), pas par `socket.ts` : le point d'entrée du temps réel ne
 * connaît pas cet événement, et la connexion se reconstruit à chaque changement
 * d'identité. Un fil fermé avant que le temps réel ne soit prêt ne s'accroche
 * pas ; un temps réel qui ne se charge pas ne remonte pas — le `GET` de
 * l'ouverture reste le rattrapage.
 */
export function createSharedTranslationSession(params: {
  readonly receiver: SharedTranslationReceiver;
  readonly watchSocket: (watcher: LiveSocketWatcher) => Promise<() => void>;
}) {
  const { receiver, watchSocket } = params;

  return {
    offer: (thread: {
      readonly conversationId: string;
      readonly messages: readonly Message[];
      readonly viewerId: string;
      readonly readerLanguages: readonly string[];
      readonly conversationEncryptionMode: string | null;
    }): void => {
      void receiver.offer({
        conversationId: thread.conversationId,
        messages: offeredMessagesOf(thread.messages, thread.viewerId, thread.conversationEncryptionMode),
        readerLanguages: thread.readerLanguages,
      });
    },

    watch: (conversationId: string): (() => void) => {
      let released = false;
      let detach: (() => void) | null = null;
      const onShared = (payload: unknown): void => void receiver.receive(payload);
      void watchSocket((socket) => {
        socket.on(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, onShared);
        return () => socket.off(SERVER_EVENTS.MESSAGE_TRANSLATION_SHARED, onShared);
      })
        .then((stop) => {
          if (released) stop();
          else detach = stop;
        })
        .catch(() => undefined);
      return () => {
        released = true;
        detach?.();
        receiver.forget(conversationId);
      };
    },
  };
}

export type SharedTranslationSession = ReturnType<typeof createSharedTranslationSession>;

let session: SharedTranslationSession | null = null;

/** Une session par page : un seul receveur, une seule mémoire de ce qui a été demandé et ouvert. */
export function sharedTranslationSession(queryClient: QueryClient): SharedTranslationSession {
  if (session !== null) return session;
  session = createSharedTranslationSession({
    receiver: createSharedTranslationReceiver({
      fetch: (request) => fetchSharedTranslations({ deps: apiDeps, ...request }),
      open: openPort,
      apply: async (event) => {
        const { applyMessageTranslation } = await import('@/lib/api/realtime');
        applyMessageTranslation(queryClient, event);
      },
    }),
    watchSocket: async (watcher) => (await import('@/lib/api/realtime')).watchLiveSocket(watcher),
  });
  return session;
}
