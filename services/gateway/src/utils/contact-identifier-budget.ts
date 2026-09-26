/**
 * Le budget d'IDENTIFIANTS de contact d'un compte (#8104).
 *
 * Trois portes rapprochent un carnet d'adresses des comptes Meeshy :
 * `POST /users/me/contacts/match`, `POST /users/me/contacts/sync` et
 * `PUT`/`PATCH /directory/contacts`. Chacune accepte 2000 contacts de
 * 25 identifiants par appel : compter leurs REQUÊTES laissait passer 50 000
 * questions « ce numéro a-t-il un compte ? » par appel — un annuaire inversé à
 * grande échelle, derrière un plafond nominal de quelques requêtes par minute.
 *
 * Ce module compte donc ce qu'une requête TRANSPORTE : le nombre
 * d'identifiants normalisés soumis (numéros + e-mails + pseudos), dans UN seau
 * par compte partagé par les trois portes — basculer de l'une à l'autre ne
 * rouvre aucun quota.
 *
 * ## Le calibrage
 *
 * | fenêtre | plafond | ce qu'il laisse passer |
 * |---|---|---|
 * | 1 heure | 20 000 | un carnet de 5 000 contacts à 3 identifiants chacun (15 000), envoyé en lots de 2 000, plus la reprise d'un lot interrompu |
 * | 24 heures | 50 000 | trois synchronisations complètes de ce même carnet dans la journée |
 *
 * Un carnet réel porte en moyenne 1,3 à 2 identifiants par contact : le cas
 * nominal (quelques milliers de contacts) consomme moins de la moitié du seau
 * horaire. Un balayage, lui, plafonne à 50 000 identifiants par jour et par
 * compte, contre 50 000 PAR APPEL auparavant.
 *
 * Le refus est un 429 dans l'enveloppe `sendError`, `code`
 * `CONTACT_IDENTIFIER_BUDGET_EXCEEDED`, avec `Retry-After`.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { NormalizedContact } from './contact-identifiers';
import { createCustomRateLimiter, type RateLimiter } from './rate-limiter';
import { sendError } from './response';

export const CONTACT_IDENTIFIER_BUDGET = {
  perHour: 20_000,
  perDay: 50_000,
} as const;

export const CONTACT_IDENTIFIER_BUDGET_CODE = 'CONTACT_IDENTIFIER_BUDGET_EXCEEDED';

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

type Seaux = { readonly heure: RateLimiter; readonly jour: RateLimiter };

/**
 * UN jeu de seaux par SERVEUR : sans Redis, `createCustomRateLimiter` retombe
 * sur un magasin mémoire propre à chaque limiteur — deux appels créeraient deux
 * compteurs et les trois portes ne partageraient plus rien. La clé est
 * `fastify.server`, commun à tous les contextes encapsulés d'une même
 * application : les portes vivent dans des plugins différents
 * (`/directory` est enregistré sous préfixe), et une clé par instance leur
 * donnait autant de seaux que de plugins.
 */
const SEAUX = new WeakMap<object, Seaux>();

function seaux(fastify: FastifyInstance): Seaux {
  const existants = SEAUX.get(fastify.server);
  if (existants) return existants;
  const redis = fastify.redis ?? undefined;
  const crees: Seaux = {
    heure: createCustomRateLimiter(
      { max: CONTACT_IDENTIFIER_BUDGET.perHour, windowMs: HEURE_MS, keyPrefix: 'contacts:identifiers:h' },
      redis
    ),
    jour: createCustomRateLimiter(
      { max: CONTACT_IDENTIFIER_BUDGET.perDay, windowMs: JOUR_MS, keyPrefix: 'contacts:identifiers:d' },
      redis
    ),
  };
  SEAUX.set(fastify.server, crees);
  return crees;
}

/** Le COÛT d'un lot : chaque identifiant normalisé est une question posée à l'annuaire. */
export function countContactIdentifiers(contacts: readonly NormalizedContact[]): number {
  return contacts.reduce(
    (total, contact) => total + contact.phoneNumbers.length + contact.emails.length + contact.usernames.length,
    0
  );
}

export type ContactBudgetVerdict = { readonly allowed: true } | { readonly allowed: false; readonly retryAfter: number };

/**
 * Débite le lot sur les deux fenêtres, et dit s'il passe.
 *
 * Les deux fenêtres sont débitées même quand la première refuse : un lot
 * refusé a été REÇU, et ne pas le compter ferait d'un balayage obstiné un
 * balayage gratuit sur l'autre fenêtre.
 */
export async function spendContactIdentifierBudget(
  fastify: FastifyInstance,
  userId: string,
  cost: number
): Promise<ContactBudgetVerdict> {
  if (cost <= 0) return { allowed: true };
  const { heure, jour } = seaux(fastify);
  const cle = `user:${userId}`;
  const verdicts = await Promise.all([heure.consume(cle, cost), jour.consume(cle, cost)]);
  const depasses = verdicts.flatMap((info) => (info?.retryAfter !== undefined ? [info.retryAfter] : []));
  if (depasses.length === 0) return { allowed: true };
  return { allowed: false, retryAfter: Math.max(...depasses) };
}

export function refuseContactIdentifierBudget(reply: FastifyReply, retryAfter: number): void {
  reply.header('Retry-After', String(retryAfter));
  sendError(reply, 429, 'Trop de contacts recherchés. Réessayez plus tard.', {
    code: CONTACT_IDENTIFIER_BUDGET_CODE,
  });
}
