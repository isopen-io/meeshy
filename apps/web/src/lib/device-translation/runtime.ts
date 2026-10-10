import type { QueryClient } from '@tanstack/react-query';

import { apiDeps } from '@/lib/api/deps';
import type { Message } from '@/lib/api/types';

import { createDeviceTranslationCache, createIndexedDbStore } from './cache';
import { createBuiltinTranslator, createDeviceTranslationRouter, type BuiltinTranslatorApi } from './engine';
import { OPUS_MT_ENGINE_NAME } from './model';
import { offeredMessagesOf, translationEventOf } from './offer';
import { opusMtSupports } from './opus-mt-routes';
import { createDeviceTranslationScheduler, type DeviceTranslationScheduler } from './scheduler';
import { sealPort } from './seal-port';
import { createShareLedger, createTranslationSharer } from './share';
import { postSharedTranslation } from './shared-translations-api';
import { createWorkerTranslator } from './worker-protocol';

/**
 * **LA TRADUCTION DE L'APPAREIL, UNE FOIS PAR SESSION** (#9898) — un seul
 * Worker, un seul modèle en mémoire, une seule file pour tous les fils.
 * Sans Worker (rendu serveur, témoins), rien ne part : le fil se peint comme
 * avant, servi par le serveur.
 *
 * Chaque traduction livrée prend DEUX chemins, indépendants : le puits des
 * traductions du serveur, qui la peint ; puis le partage scellé aux autres
 * membres (#9899, `share.ts`), qui ne bloque jamais le premier et dont aucune
 * panne ne remonte. Le second n'existe que pour un message que le serveur lit
 * déjà (`OfferedMessage.shareable`) : un clair qu'il ne lit pas se traduit ici et
 * n'en sort pas.
 *
 * Le consentement est vérifié par `useDeviceTranslation` AVANT l'`import()` de
 * ce module, et ce module ne partage aucun fichier statique avec le hook : un
 * module commun ferait du chunk du fil un chunk partagé, et son adresse grossirait
 * le point d'entrée (budget de la première peinture).
 */
let scheduler: DeviceTranslationScheduler | null = null;

function deviceTranslationScheduler(queryClient: QueryClient): DeviceTranslationScheduler | null {
  if (scheduler !== null) return scheduler;
  if (typeof Worker === 'undefined') return null;

  const worker = new Worker(new URL('./device-translation-worker.ts', import.meta.url), { type: 'module', name: 'meeshy-device-translation' });
  const builtin = (globalThis as { readonly Translator?: BuiltinTranslatorApi }).Translator;
  const store = createIndexedDbStore();
  const share = createTranslationSharer({
    seal: sealPort,
    post: (conversationId, body) => postSharedTranslation({ deps: apiDeps, conversationId, body }),
    ledger: createShareLedger(store),
  });
  scheduler = createDeviceTranslationScheduler({
    translator: createDeviceTranslationRouter({
      accelerators: [createBuiltinTranslator({ api: builtin })],
      engine: createWorkerTranslator({ port: worker, name: OPUS_MT_ENGINE_NAME, supports: opusMtSupports }),
    }),
    cache: createDeviceTranslationCache({ store }),
    deliver: (delivered, origin) => {
      void import('@/lib/api/realtime').then(({ applyMessageTranslation }) => applyMessageTranslation(queryClient, translationEventOf(delivered)));
      void share(delivered, origin);
    },
  });
  return scheduler;
}

export function offerToDevice(
  queryClient: QueryClient,
  params: {
    readonly messages: readonly Message[];
    readonly viewerId: string;
    readonly preferredLanguages: readonly string[];
    readonly conversationEncryptionMode: string | null;
  },
): void {
  deviceTranslationScheduler(queryClient)?.offer({
    messages: offeredMessagesOf(params.messages, params.viewerId, params.conversationEncryptionMode),
    preferredLanguages: params.preferredLanguages,
  });
}
