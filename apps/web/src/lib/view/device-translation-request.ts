import type { QueryClient } from '@tanstack/react-query';

import type { Message } from '@/lib/api/types';
import { offeredMessagesOf } from '@/lib/device-translation/offer';
import { opusMtSupports } from '@/lib/device-translation/opus-mt-routes';
import { offeredMessageTarget } from '@/lib/device-translation/target';
import { navigate } from '@/lib/router';

type OfferParams = {
  readonly messages: readonly Message[];
  readonly viewerId: string;
  readonly preferredLanguages: readonly string[];
  readonly conversationEncryptionMode: string | null;
};

/**
 * LES PORTES DE « TRADUIRE SUR L'APPAREIL » (#11210) — le consentement et le
 * moteur se lisent par `import()`, comme `useDeviceTranslation` : un module
 * statique commun au fil et aux réglages fusionnerait leurs chunks de route
 * (budget de la première peinture). `ports` n'existe que pour les témoins.
 */
export type DeviceTranslationPorts = {
  readonly granted: () => Promise<boolean>;
  readonly offer: (queryClient: QueryClient, params: OfferParams) => Promise<void>;
  /** Les réglages portent la bascule et sa légende (taille du modèle, partage) : l'accord ne se donne que là. */
  readonly openSettings: () => void;
};

export const deviceTranslationPorts: DeviceTranslationPorts = {
  granted: async () => (await import('@/lib/device-translation/consent')).deviceTranslationConsent().granted(),
  offer: async (queryClient, params) => (await import('@/lib/device-translation/runtime')).offerToDevice(queryClient, params),
  openSettings: () => navigate('/settings'),
};

export type DeviceTranslationOutcome = 'queued' | 'consent-needed';

/**
 * LE GESTE DU MENU (#11210) — accordée, la traduction de l'appareil reçoit CE
 * message (`offerToDevice` : la même file que le fil, la même loi de ce qui
 * voyage, `offeredMessagesOf`) et la traduction revient par le puits des
 * traductions. Sans accord, rien ne se télécharge : le geste mène aux réglages
 * où l'accord se donne en connaissance de cause. Aucun appel au serveur de
 * traduction, jamais.
 */
export async function requestDeviceTranslation(input: {
  readonly ports: DeviceTranslationPorts;
  readonly queryClient: QueryClient;
  readonly params: OfferParams;
}): Promise<DeviceTranslationOutcome> {
  const { ports, queryClient, params } = input;
  if (!(await ports.granted())) {
    ports.openSettings();
    return 'consent-needed';
  }
  await ports.offer(queryClient, params);
  return 'queued';
}

/**
 * L'APPAREIL A-T-IL UNE RAISON DE TRADUIRE CE MESSAGE ? (#11372) — la loi de
 * la file, et elle seule : ce que le fil confie (`offeredMessagesOf` : ni les
 * miens, ni les protégés, ni les floutés, ni les supprimés, ni un chiffré sans
 * clair ici), puis la langue que la file calculerait (`offeredMessageTarget`,
 * avec ce que le moteur de l'appareil sait traduire, `opusMtSupports` — le
 * `supports` du routeur de `runtime.ts`). Langue d'origine inconnue, rang 1
 * déjà servi, paire hors de portée : rien que la file accepte, donc rien à
 * offrir — sans quoi « Traduction demandée » mentirait.
 */
export function deviceTranslationWanted(
  message: Message,
  reader: { readonly viewerId: string; readonly languages: readonly string[]; readonly conversationEncryptionMode: string | null },
): boolean {
  return offeredMessagesOf([message], reader.viewerId, reader.conversationEncryptionMode).some(
    (offered) => offeredMessageTarget({ message: offered, preferredLanguages: reader.languages, canTranslate: opusMtSupports }) !== null,
  );
}
