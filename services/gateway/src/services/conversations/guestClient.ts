/**
 * LE POSTE D'UN INVITÉ, RÉDUIT (#10102) — relevé à son entrée par lien,
 * gravé dans sa session anonyme (`AnonymousSessionDetails.client`), lu par la
 * seule fiche de modération de World Wide (`services/world/worldParticipantCard.ts`).
 *
 * Réduire, c'est garder ce qu'une modération reconnaît — « Safari 17 sur
 * iOS 17, mobile » — et rien qui suive une personne d'une conversation à
 * l'autre : ni la chaîne User-Agent (une empreinte à elle seule), ni le modèle,
 * ni le fabricant, ni les versions mineures. La lecture est celle des sessions
 * des comptes (`parseUserAgent`, `GeoIPService.ts`) : un seul analyseur.
 */

import { parseUserAgent } from '../GeoIPService';

export type GuestClientDescriptor = {
  readonly browser: string | null;
  readonly browserVersion: string | null;
  readonly os: string | null;
  readonly osVersion: string | null;
  readonly deviceType: string | null;
};

/** `17.4.1` → `17`, `10` → `10`, rien → `null`. */
export function majorVersion(version: string | null | undefined): string | null {
  if (typeof version !== 'string') return null;
  const major = version.trim().split(/[._]/)[0] ?? '';
  return /^\d+$/.test(major) ? major : null;
}

/**
 * `null` quand rien n'est reconnu — ni navigateur ni système : une famille
 * d'appareil seule serait une supposition de l'analyseur, pas un relevé.
 */
export function describeGuestClient(userAgent: string | null | undefined): GuestClientDescriptor | null {
  if (typeof userAgent !== 'string' || userAgent.trim() === '') return null;
  const parsed = parseUserAgent(userAgent);
  if (!parsed || (parsed.browser === null && parsed.os === null)) return null;
  return {
    browser: parsed.browser,
    browserVersion: majorVersion(parsed.browserVersion),
    os: parsed.os,
    osVersion: majorVersion(parsed.osVersion),
    deviceType: parsed.type || null,
  };
}
