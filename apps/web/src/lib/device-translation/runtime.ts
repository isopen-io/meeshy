import type { QueryClient } from '@tanstack/react-query';

import type { Message } from '@/lib/api/types';

import { createDeviceTranslationCache, createIndexedDbStore } from './cache';
import { createBuiltinTranslator, createDeviceTranslationRouter, type BuiltinTranslatorApi } from './engine';
import { DEVICE_ENGINE_NAME } from './model';
import { offeredMessagesOf, translationEventOf } from './offer';
import { createDeviceTranslationScheduler, type DeviceTranslationScheduler } from './scheduler';
import { createWorkerTranslator } from './worker-protocol';

/**
 * **LA TRADUCTION DE L'APPAREIL, UNE FOIS PAR SESSION** (#9898) — un seul
 * Worker, un seul modèle en mémoire, une seule file pour tous les fils.
 * Sans Worker (rendu serveur, témoins), rien ne part : le fil se peint comme
 * avant, servi par le serveur.
 *
 * Le consentement est vérifié par `useDeviceTranslation` AVANT l'`import()` de
 * ce module, et ce module ne partage aucun fichier avec le hook : un module
 * commun ferait du chunk du fil un chunk partagé, et son adresse grossirait
 * le point d'entrée (budget de la première peinture).
 */
let scheduler: DeviceTranslationScheduler | null = null;

function deviceTranslationScheduler(queryClient: QueryClient): DeviceTranslationScheduler | null {
  if (scheduler !== null) return scheduler;
  if (typeof Worker === 'undefined') return null;

  const worker = new Worker(new URL('./device-translation-worker.ts', import.meta.url), { type: 'module', name: 'meeshy-device-translation' });
  const builtin = (globalThis as { readonly Translator?: BuiltinTranslatorApi }).Translator;
  scheduler = createDeviceTranslationScheduler({
    translator: createDeviceTranslationRouter({
      accelerators: [createBuiltinTranslator({ api: builtin })],
      engine: createWorkerTranslator({ port: worker, name: DEVICE_ENGINE_NAME }),
    }),
    cache: createDeviceTranslationCache({ store: createIndexedDbStore() }),
    deliver: (delivered) =>
      void import('@/lib/api/realtime').then(({ applyMessageTranslation }) => applyMessageTranslation(queryClient, translationEventOf(delivered))),
  });
  return scheduler;
}

export function offerToDevice(
  queryClient: QueryClient,
  params: { readonly messages: readonly Message[]; readonly viewerId: string; readonly preferredLanguages: readonly string[] },
): void {
  deviceTranslationScheduler(queryClient)?.offer({ messages: offeredMessagesOf(params.messages, params.viewerId), preferredLanguages: params.preferredLanguages });
}
