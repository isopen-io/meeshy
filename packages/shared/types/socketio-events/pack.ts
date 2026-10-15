/**
 * Le domaine PACK : l'état d'installation d'un pack (sticker, cadre de gloire,
 * cadre de capture), préférence de COMPTE synchronisée entre appareils
 * (#10148, LP0, `docs/product/cadres-de-gloire/PROMPT-developpement.md` § 5.10.4).
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */
import type { PackDomain } from '../content-pack.js';
import type { ServedProfileDecor } from '../profile-decor.js';

/**
 * `pack:installation-updated`, émis sur `user:<id>` après chaque écriture
 * d'installation : les autres appareils du compte mettent leur étagère à jour
 * sans relire. Les anciens clients ne l'écoutent pas, et rien ne change pour eux.
 */
export interface PackInstallationUpdatedEventData {
  readonly domain: PackDomain;
  readonly slug: string;
  readonly installed: boolean;
  /** Additif (#10632) : le pack est possédé — un achat l'installe ET le possède. Absent des anciens serveurs. */
  readonly owned?: boolean;
  /** L'instant de l'écriture, ISO 8601. */
  readonly at: string;
}

/**
 * `profile:decor-updated` (#10632), émis sur `user:<id>` après chaque écriture
 * de `PUT /me/profile-decor` : mes autres appareils mettent leur profil à jour
 * sans relire. Événement NEUF : les anciens clients ne l'écoutent pas.
 */
export interface ProfileDecorUpdatedEventData {
  readonly userId: string;
  readonly decor: ServedProfileDecor;
  /** L'instant de l'écriture, ISO 8601. */
  readonly at: string;
}
