import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Message } from '@/lib/api/types';

import { deviceTranslationConsent } from './consent';
import { offeredMessagesOf } from './offer';

/**
 * **LE FIL CONFIE SES MESSAGES À L'APPAREIL** (#9898) — à chaque fenêtre
 * chargée, les messages que le serveur n'a pas servis dans le rang 1 du
 * lecteur partent dans la file de l'appareil ; leurs traductions reviennent
 * par le puits de `message:translation`. Aucune peau ne change.
 *
 * Sans consentement, rien ne se charge : la file, le Worker et le puits
 * temps réel n'entrent dans la page que par `import()`, au premier fil
 * ouvert après l'accord.
 */
export function useDeviceTranslation(params: {
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  readonly viewerId: string;
}): void {
  const queryClient = useQueryClient();
  const { messages, readerLanguages, viewerId } = params;
  useEffect(() => {
    if (!deviceTranslationConsent().granted()) return;
    let cancelled = false;
    void import('./runtime').then(({ deviceTranslationScheduler }) => {
      if (cancelled) return;
      deviceTranslationScheduler(queryClient)?.offer({ messages: offeredMessagesOf(messages, viewerId), preferredLanguages: readerLanguages });
    });
    return () => {
      cancelled = true;
    };
  }, [queryClient, messages, readerLanguages, viewerId]);
}
