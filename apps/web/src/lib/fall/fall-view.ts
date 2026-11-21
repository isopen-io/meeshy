import type { FallState } from '@meeshy/shared/types/fall-detection';

import { translateFall } from '@/lib/i18n-fall-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { localSinceText, type ClockOptions } from '@/lib/view/local-since';

import type { FallPillKind } from './fall-live';

/**
 * **CE QUE LA CHUTE DÉTECTÉE DIT** (#18748, SAN-01) — lois pures : « Chute détectée à 16:42 » à l'horloge LOCALE du
 * lecteur (l'instant servi est déjà tronqué à la minute par la passerelle), la dernière batterie et la dernière
 * position SEULEMENT quand le serveur les a servies (il a jugé ce que ce Sang reçoit déjà), et la phrase de la
 * pastille. Ce module lit le catalogue de la chute, que l'appelant a chargé (`useFallCatalog`). Jamais un message de
 * conversation, jamais un mot de santé de plus que « chute ».
 */

export type FallPosition = { readonly latitude: number; readonly longitude: number; readonly label: string };

export type FallDetail = {
  /** « Chute détectée à 16:42 ». */
  readonly headline: string;
  /** « Dernière batterie : 41 % » ; nulle quand elle n'est pas servie. */
  readonly battery: string | null;
  /** De quoi ouvrir la carte ; nulle quand la position n'est pas servie. */
  readonly position: FallPosition | null;
};

export function fallHeadline(state: Pick<FallState, 'detectedAt'>, language: InterfaceLanguage, clock: ClockOptions): string {
  return translateFall(language, 'fall.detail.at', { time: localSinceText(language, state.detectedAt, clock) });
}

const percentOf = (language: InterfaceLanguage, level: number): string => new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(level / 100);

export function fallDetailOf(state: FallState, language: InterfaceLanguage, clock: ClockOptions): FallDetail {
  const { lastBattery, lastPosition } = state;
  return {
    headline: fallHeadline(state, language, clock),
    battery: lastBattery === undefined ? null : translateFall(language, 'fall.detail.battery', { value: percentOf(language, lastBattery.level) }),
    position: lastPosition === undefined ? null : { latitude: lastPosition.latitude, longitude: lastPosition.longitude, label: translateFall(language, 'fall.detail.map') },
  };
}

/** La phrase d'une annonce de la pastille : la chute, ou le retour. */
export function fallAnnouncementText(language: InterfaceLanguage, { name, kind }: { readonly name: string | null; readonly kind: FallPillKind }): string {
  if (kind === 'responded') return name === null ? translateFall(language, 'fall.announce.respondedSomeone') : translateFall(language, 'fall.announce.responded', { name });
  return name === null ? translateFall(language, 'fall.announce.detectedSomeone') : translateFall(language, 'fall.announce.detected', { name });
}
