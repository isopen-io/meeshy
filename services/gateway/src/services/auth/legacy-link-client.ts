/**
 * LA TRANSITION MESURÉE DU LIEN LIÉ À L'APPAREIL (#10878, décision porteur du
 * 2026-10-17 sur #10872).
 *
 * Depuis #10872, un lien de connexion ouvert ailleurs que sur l'appareil qui
 * l'a demandé exige le OUI de l'utilisateur (`link-device-binding.ts`). Les
 * binaires iOS publiés avant ce lot ne savent ni présenter le secret ni
 * afficher la question : contre le nouveau serveur, leur lien ne connecterait
 * plus personne. La règle de rétrocompatibilité (#9223) interdit la bascule
 * sèche ; le porteur a tranché pour une transition MESURÉE :
 *
 * - un client iOS qui s'ANNONCE sous `LEGACY_LINK_IOS_FIRST_CONFIRMING_VERSION`
 *   garde l'ancien comportement (connexion directe) — risque de « Login CSRF »
 *   accepté pour ces seuls binaires, pendant la transition ;
 * - le web, la PWA, la coque Android, les binaires iOS à jour et TOUT client
 *   qui ne s'annonce pas (ou s'annonce mal) passent par la liaison : l'absence
 *   d'information ferme, elle n'ouvre jamais ;
 * - un client qui présente un secret, ou qui DÉCLARE la capacité
 *   `link-device-binding` (`X-Meeshy-Capabilities`), connaît la liaison quelle
 *   que soit sa version : les builds de `dev`, TestFlight et staging qui
 *   portent #10872 s'annoncent encore « 1.1.3 » (constat de l'audit
 *   adversarial) — la version seule les aurait classés anciens ;
 * - chaque connexion RÉUSSIE grâce au oui implicite est COMPTÉE (Redis, par
 *   jour UTC, par route et version ramenée à un vocabulaire borné) et
 *   JOURNALISÉE, pour retirer le chemin à zéro usage mesuré. Un jeton invalide
 *   ne compte pas : la mesure ne se gonfle pas avec des requêtes forgées.
 *
 * Pourquoi forger l'en-tête n'ouvre rien de neuf : un client que l'attaquant
 * CONTRÔLE peut déjà envoyer `confirm: true` — la confirmation protège la
 * victime contre un lien ouvert par SON client, jamais contre une requête
 * forgée. Une page tierce qui enverrait `X-Meeshy-Platform: ios` depuis le
 * navigateur de la victime obtiendrait au mieux un jeton dans SA réponse
 * (aucun cookie de session n'est posé, l'origine est filtrée par CORS) ; elle
 * n'installe rien dans la session de meeshy.me. Seul un client qui pose
 * lui-même ces en-têtes — un binaire iOS ancien — profite du chemin hérité.
 *
 * Les en-têtes lus sont les deux contrats que le SDK iOS pose sur toutes ses
 * requêtes (`ClientInfoProvider.swift`) : `X-Meeshy-Platform` /
 * `X-Meeshy-Version` (télémétrie, présents depuis 2026-02) et `X-App-Platform`
 * / `X-App-Version` (porte de version, depuis 2026-08). Le web n'émet jamais
 * `ios` (`CLIENT_PLATFORMS` : `web`, `pwa`, `android-shell`).
 *
 * @module services/auth/legacy-link-client
 */

import type { Redis } from 'ioredis';

import { compareAppVersions } from '../../utils/appVersion';
import { CLIENT_CAPABILITIES, announcesCapability } from '../../utils/client-capabilities';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getCacheStore } from '../CacheStore';

/** La 1.1.3 (build 1825), publiée le 2026-10-14, précède #10872 : la première qui confirme est la suivante. */
export const LEGACY_LINK_IOS_FIRST_CONFIRMING_VERSION = '1.1.4';

export type LegacyLinkRoute = 'verify-email' | 'magic-link-validate';

export type LegacyLinkClient = { readonly platform: 'ios'; readonly version: string };

type Headers = Readonly<Record<string, string | readonly string[] | undefined>>;

const VERSION_PATTERN = /^(0|[1-9]\d{0,3})(\.(0|[1-9]\d{0,3})){0,3}$/;
const MAX_COUNTED_PATCH = 20;
const KEY_PREFIX = 'metrics:legacy-link-login';
const KEY_TTL_SECONDS = 180 * 24 * 60 * 60;

const headerOf = (headers: Headers, name: string): string | undefined => {
  const value = headers[name];
  return typeof value === 'string' ? value.trim() : undefined;
};

function announcesIos(headers: Headers): boolean {
  const platforms = [headerOf(headers, 'x-app-platform'), headerOf(headers, 'x-meeshy-platform')]
    .filter((value): value is string => value !== undefined);
  return platforms.length > 0 && platforms.every((value) => value.toLowerCase() === 'ios');
}

function announcedVersion(headers: Headers): string | undefined {
  const version = headerOf(headers, 'x-app-version') ?? headerOf(headers, 'x-meeshy-version');
  return version !== undefined && VERSION_PATTERN.test(version) ? version : undefined;
}

/** L'ancien client iOS que ces en-têtes annoncent, ou `null` — tout doute rend `null`. */
export function legacyLinkClientOf(input: { readonly headers: Headers; readonly presentedSecret: string | undefined }): LegacyLinkClient | null {
  if (input.presentedSecret !== undefined) return null;
  if (announcesCapability(input.headers, CLIENT_CAPABILITIES.linkDeviceBinding)) return null;
  if (!announcesIos(input.headers)) return null;
  const version = announcedVersion(input.headers);
  if (version === undefined) return null;
  return compareAppVersions(version, LEGACY_LINK_IOS_FIRST_CONFIRMING_VERSION) < 0 ? { platform: 'ios', version } : null;
}

/**
 * La version telle qu'elle est COMPTÉE : `majeur.mineur.correctif` pour les
 * versions iOS plausibles (1.0.x et 1.1.x), `other` pour tout le reste — le
 * nombre de champs par jour reste borné quoi que l'appelant annonce.
 */
export function countedLegacyVersion(version: string): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => parseInt(part, 10) || 0);
  return major === 1 && minor <= 1 && patch <= MAX_COUNTED_PATCH ? `${major}.${minor}.${patch}` : 'other';
}

/** Une clé de hachage Redis par jour UTC ; champ `route|plateforme|version`. */
export const legacyLinkLoginKey = (at: Date): string => `${KEY_PREFIX}:${at.toISOString().slice(0, 10)}`;

export type LegacyLinkLoginEntry = { readonly route: LegacyLinkRoute; readonly client: LegacyLinkClient };

export type LegacyLinkLoginCounter = { readonly record: (entry: LegacyLinkLoginEntry) => Promise<void> };

export type LegacyLinkLoginLog = {
  readonly event: 'legacy-link-login';
  readonly route: LegacyLinkRoute;
  readonly platform: 'ios';
  readonly version: string;
};

export function createLegacyLinkLoginCounter(deps: {
  readonly redis: () => Redis | null;
  readonly log: (entry: LegacyLinkLoginLog) => void;
  readonly now: () => Date;
}): LegacyLinkLoginCounter {
  return {
    async record({ route, client }) {
      const version = countedLegacyVersion(client.version);
      deps.log({ event: 'legacy-link-login', route, platform: client.platform, version });
      const redis = deps.redis();
      if (!redis) return;
      const key = legacyLinkLoginKey(deps.now());
      try {
        await redis.multi().hincrby(key, `${route}|${client.platform}|${version}`, 1).expire(key, KEY_TTL_SECONDS).exec();
      } catch {
        return;
      }
    },
  };
}

const logger = enhancedLogger.child({ module: 'legacy-link-client' });

let shared: LegacyLinkLoginCounter | undefined;

export function getLegacyLinkLoginCounter(): LegacyLinkLoginCounter {
  shared ??= createLegacyLinkLoginCounter({
    redis: () => getCacheStore().getNativeClient(),
    log: (entry) => logger.info('[AUTH] Lien de connexion — chemin hérité (#10878)', entry),
    now: () => new Date(),
  });
  return shared;
}

export type LinkLoginConsent = {
  /** Le oui remis au service : celui de l'utilisateur, ou le oui IMPLICITE d'un ancien client iOS. */
  readonly confirmed: boolean;
  /** Non nul SEULEMENT quand le oui est implicite : c'est ce passage-là qui se compte, une fois la connexion réussie. */
  readonly legacyClient: LegacyLinkClient | null;
};

export function linkLoginConsent(input: {
  readonly headers: Headers;
  readonly confirm: boolean | undefined;
  readonly linkDeviceSecret: string | undefined;
}): LinkLoginConsent {
  if (input.confirm === true) return { confirmed: true, legacyClient: null };
  const legacyClient = legacyLinkClientOf({ headers: input.headers, presentedSecret: input.linkDeviceSecret });
  return { confirmed: legacyClient !== null, legacyClient };
}

/** Compte une connexion réussie par le chemin hérité, sans retarder la réponse. */
export function countLegacyLinkLogin(input: {
  readonly route: LegacyLinkRoute;
  readonly consent: LinkLoginConsent;
  readonly counter: LegacyLinkLoginCounter;
}): void {
  if (!input.consent.legacyClient) return;
  void input.counter.record({ route: input.route, client: input.consent.legacyClient }).catch(() => undefined);
}
