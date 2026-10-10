import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Message } from '@/lib/api/types';

type RuntimeModule = typeof import('./runtime');

type DeviceTranslationPorts = {
  readonly granted: () => Promise<boolean>;
  readonly runtime: () => Promise<Pick<RuntimeModule, 'offerToDevice'>>;
};

/**
 * Le consentement ET le moteur se lisent par `import()`. L'écran de réglages
 * pose le consentement (`use-device-translation-setting.ts`) : un module statique
 * commun au fil et aux réglages ferait de leurs deux chunks de route un même
 * chunk partagé, et son adresse grossirait le point d'entrée (budget de la
 * première peinture). `ports` n'existe que pour les témoins.
 */
const defaultPorts: DeviceTranslationPorts = {
  granted: async () => (await import('./consent')).deviceTranslationConsent().granted(),
  runtime: () => import('./runtime'),
};

/**
 * **LE FIL CONFIE SES MESSAGES À L'APPAREIL** (#9898) — à chaque fenêtre
 * chargée, les messages que le serveur n'a pas servis dans le rang 1 du
 * lecteur partent dans la file de l'appareil ; leurs traductions reviennent
 * par le puits de `message:translation`. Aucune peau ne change.
 *
 * Sans consentement, rien ne se charge : la file, le Worker et le puits
 * temps réel n'entrent dans la page que par `import()`, au premier fil
 * ouvert après l'accord. Le consentement se relit à CHAQUE fenêtre : le lecteur
 * qui l'accorde ou le retire dans les réglages est entendu au fil suivant, sans
 * recharger la page.
 *
 * Le mode de chiffrement de la conversation (`null` quand elle ne le dit pas)
 * part avec les messages : avec celui de chaque message, il dit ce que le serveur
 * lit (`offeredMessagesOf`) — un clair qu'il ne lit pas se traduit ici, et ne se
 * partage pas.
 */
export function useDeviceTranslation(
  params: {
    readonly messages: readonly Message[];
    readonly readerLanguages: readonly string[];
    readonly viewerId: string;
    readonly conversationEncryptionMode: string | null;
  },
  ports: DeviceTranslationPorts = defaultPorts,
): void {
  const queryClient = useQueryClient();
  const { messages, readerLanguages, viewerId, conversationEncryptionMode } = params;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await ports.granted()) || cancelled) return;
      const { offerToDevice } = await ports.runtime();
      if (cancelled) return;
      offerToDevice(queryClient, { messages, viewerId, preferredLanguages: readerLanguages, conversationEncryptionMode });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [queryClient, messages, readerLanguages, viewerId, conversationEncryptionMode, ports]);
}
