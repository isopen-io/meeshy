import type { QueryClient } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { useBatteryBadge } from '@/lib/battery/use-battery';
import type { BatteryBadge } from '@/lib/battery/battery-view';
import { useInactivityHeadline } from '@/lib/inactivity/use-inactivity';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useListeningBand, type ListeningBand } from '@/lib/now-playing/listening-band';
import { usePhoneCallHeadline } from '@/lib/phone-call/use-phone-call';
import { usePhoneUnreachableBadge } from '@/lib/phone-reachability/use-phone-reachability';
import type { PhoneUnreachableBadge } from '@/lib/phone-reachability/phone-reachability-view';

/**
 * **CE QUE VIT UNE PERSONNE, POUR SON ÉPINGLE** (#19888, iso `PeerLiveOverlays` iOS #19885) — les mêmes signaux que
 * l'en-tête d'un direct, chacun lu dans SON cache tel que le serveur l'a servi à ce lecteur : jamais une requête de
 * plus, jamais un signal déduit. Le téléphone injoignable prime sur la batterie, comme sur l'avatar.
 */
export type PinLife = {
  readonly listening: ListeningBand | undefined;
  readonly battery: BatteryBadge | undefined;
  readonly unreachable: PhoneUnreachableBadge | undefined;
  /** « En appel depuis 12 min » : jamais avec qui. */
  readonly call: string | undefined;
  /** « Aucune activité depuis 08:00 ». */
  readonly inactivity: string | undefined;
};

export function usePinLife(userId: string, language: InterfaceLanguage, client: QueryClient = appQueryClient): PinLife {
  const listening = useListeningBand(userId, language);
  const battery = useBatteryBadge(userId, language, client);
  const unreachable = usePhoneUnreachableBadge(userId, language, client);
  const call = usePhoneCallHeadline(userId, language, client);
  const inactivity = useInactivityHeadline(userId, language, client);
  return { listening, battery, unreachable, call, inactivity };
}

/** Le nom de l'épingle, suivi de ce que vit la personne : ce que l'œil voit sur l'épingle, l'oreille l'entend. */
export function pinLifeLabel(text: string, life: PinLife): string {
  const device = life.unreachable?.spoken ?? life.battery?.spoken;
  return [text, life.listening?.spoken, device, life.call, life.inactivity].filter((part): part is string => part !== undefined && part !== '').join(', ');
}
