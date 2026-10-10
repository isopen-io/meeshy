import type { QueryClient } from '@tanstack/react-query';

import { createDeviceTranslationCache, createIndexedDbStore } from './cache';
import { deviceTranslationConsent } from './consent';
import { createBuiltinTranslator, createDeviceTranslationRouter, type BuiltinTranslatorApi } from './engine';
import { DEVICE_ENGINE_NAME } from './model';
import { translationEventOf } from './offer';
import { createDeviceTranslationScheduler, type DeviceTranslationScheduler } from './scheduler';
import { createWorkerTranslator } from './worker-protocol';

/**
 * **LA TRADUCTION DE L'APPAREIL, UNE FOIS PAR SESSION** (#9898) — un seul
 * Worker, un seul modèle en mémoire, une seule file pour tous les fils.
 * `null` tant que le lecteur n'a pas consenti, ou sans Worker (rendu
 * serveur, témoins) : le fil se peint alors comme avant, servi par le serveur.
 */
let scheduler: DeviceTranslationScheduler | null = null;

export function deviceTranslationScheduler(queryClient: QueryClient): DeviceTranslationScheduler | null {
  if (scheduler !== null) return scheduler;
  if (typeof Worker === 'undefined' || !deviceTranslationConsent().granted()) return null;

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
