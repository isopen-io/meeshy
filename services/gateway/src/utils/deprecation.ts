import type { FastifyReply } from 'fastify';

/**
 * En-têtes de dépréciation — SITE UNIQUE (#4274).
 *
 * Huit issues (#4149, #4150, #4151, #4175, #4178, #4181, #4182, #4184)
 * exigent qu'une route dépréciée l'ANNONCE, et le dépôt n'avait AUCUN moyen de
 * le faire — mesuré : `grep -rn "Deprecation\|Sunset\|successor-version"
 * services/gateway/src` ne rendait aucune occurrence hors tests. Sans ce
 * module, chacune des huit aurait écrit sa propre formulation des trois
 * en-têtes : trois jumelles de plus, la classe de défaut que les milestones
 * #66-#72 passent leur temps à refermer.
 *
 * Ce module POSE DES EN-TÊTES, jamais un corps : il COMPOSE avec
 * `sendSuccess`/`sendError` (`utils/response.ts`), il ne les remplace pas.
 * `applyDeprecationHeaders(reply, …)` s'appelle donc AVANT
 * `sendSuccess`/`sendError`/`sendWithETag` — Fastify refuse un en-tête posé
 * après que `.send()` a fermé la réponse ; l'appeler avant fonctionne quel
 * que soit le code final (200, 404, 500…), ce qui est le comportement voulu :
 * un alias reste en sursis même sur sa branche d'erreur.
 */

/**
 * Fenêtre de retrait par défaut, en jours.
 *
 * ## D'où vient ce chiffre — et pourquoi il n'est pas inventé
 *
 * `docs/product/api-simplification/` documente une règle de retrait pour
 * chaque module (« deux versions d'app », « une version App Store et une
 * version Android publiées »), mais une seule est CHIFFRÉE en jours :
 * `identity.md` § « Ordre des étapes », point 5 — « Retrait des alias, six
 * mois après le montage double, après vérification qu'aucun compteur d'accès
 * n'a bougé sur les anciens chemins pendant trente jours ». C'est la règle
 * qu'on retient ici, comme fenêtre PAR DÉFAUT commune aux quatre familles
 * d'alias que ce lot instrumente (`directory/blocks`, `users/profile`,
 * `admin/users-write`, `admin/reports`) : les variantes par version de store
 * ne fixent pas de date CALENDAIRE, et RFC 8594 §3 le permet — le `Sunset`
 * énonce une INTENTION, jamais un engagement irrévocable. Le retrait RÉEL
 * reste gouverné par le compteur d'accès nul pendant trente jours, jamais par
 * cette seule date : elle informe le client, elle ne remplace pas la mesure.
 *
 * Toute route dont la règle de retrait diffère (permanente, ou liée à une
 * publication de store précise) passe son propre `windowDays` — jamais une
 * date en dur au site d'appel.
 */
export const DEPRECATION_WINDOW_DAYS = 180;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export type DeprecationSunsetOptions = {
  /** Ancre du calcul — le jour où CETTE route a commencé à être annoncée. Par défaut, maintenant. */
  readonly since?: Date;
  /** Fenêtre en jours. Par défaut {@link DEPRECATION_WINDOW_DAYS}. */
  readonly windowDays?: number;
};

/**
 * Dérive la date de retrait depuis la règle du dépôt — jamais une date en
 * dur à chaque site d'appel (critère 5 de #4274). Un appelant qui connaît une
 * ancre plus ancienne que "maintenant" (un alias déjà servi avant ce lot) la
 * fournit via `since`.
 */
export function deprecationSunsetDate(options?: DeprecationSunsetOptions): Date {
  const depuis = options?.since ?? new Date();
  const jours = options?.windowDays ?? DEPRECATION_WINDOW_DAYS;
  return new Date(depuis.getTime() + jours * MS_PAR_JOUR);
}

export type DeprecationHeadersOptions = {
  /**
   * Adresse qui remplace cette route — un chemin concret (paramètres déjà
   * résolus quand on les connaît au site d'appel), jamais un gabarit
   * `:param` que le client ne peut pas suivre tel quel.
   */
  readonly successorPath: string;
  /** Date de retrait ; dérivée par {@link deprecationSunsetDate} si omise. */
  readonly sunsetAt?: Date;
};

/**
 * Pose les trois en-têtes standard d'une route dépréciée sur `reply` :
 *
 * - `Deprecation: true` (draft-ietf-httpapi-deprecation-header / RFC 9745)
 * - `Sunset: <HTTP-date>` (RFC 8594) — format RFC 7231 IMF-fixdate,
 *   `Date.toUTCString()`, jamais l'ISO 8601 de `toISOString()`.
 * - `Link: <successorPath>; rel="successor-version"` (RFC 8594 §5)
 *
 * Ne ferme JAMAIS la réponse : appeler avant `sendSuccess`/`sendError`, qui
 * restent l'unique site d'envoi du corps (critère 1 de #4274 — ce helper
 * COMPOSE avec eux).
 */
export function applyDeprecationHeaders(reply: FastifyReply, options: DeprecationHeadersOptions): void {
  const sunsetAt = options.sunsetAt ?? deprecationSunsetDate();
  reply.header('Deprecation', 'true');
  reply.header('Sunset', sunsetAt.toUTCString());
  reply.header('Link', `<${options.successorPath}>; rel="successor-version"`);
}
