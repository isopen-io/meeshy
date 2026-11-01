/**
 * Le plafond QUOTIDIEN des personnes choisies SANS LIEN pour un post `ONLY` (#14105).
 *
 * Choisir quelqu'un ouvre le post à cette personne. Si elle n'a aucun lien avec
 * l'auteur (`linkedAmong` : ni Connaissance et plus, ni conversation directe en
 * commun), aucune notification ne la prévient — mais le post lui reste ouvert.
 * Sans borne, un compte pourrait ouvrir ses publications à des milliers
 * d'inconnus par jour ; ce seau les compte.
 *
 * ## Le calibrage : 50 par jour et par auteur
 *
 * Un post `ONLY` s'adresse à des proches : le cas nominal ne compte aucun
 * choisi sans lien. Cinquante couvrent les cas légitimes (un groupe de travail
 * neuf, une classe, des invités d'un événement, avant le premier échange) sans
 * faire du `ONLY` un canal de diffusion : c'est un dixième de la liste maximale
 * d'un post (500), et le plafond d'écriture partagé (10 publications par minute)
 * ne le contourne pas, puisque le seau compte des PERSONNES, pas des requêtes.
 *
 * ## Au-delà : refus clair, sans débit
 *
 * La publication est refusée par un 429 `ONLY_UNLINKED_RECIPIENTS_LIMIT`
 * (`Retry-After`, `limit`, `unlinked`) : l'auteur retire ces personnes et publie,
 * ou attend. Retirer en silence lui aurait fait croire qu'elles voient le post.
 * Le débit est ATOMIQUE : un seul `INCRBY` du lot, rendu aussitôt s'il franchit
 * le plafond — deux publications concurrentes ne le franchissent jamais
 * ensemble. Un lot refusé, ou une écriture qui échoue en aval
 * (`releaseOnlyUnlinkedBudget`), ne coûte rien. Un choisi DÉJÀ présent sur le
 * post (édition) n'est pas recompté.
 *
 * Le seau est le limiteur Redis existant (`utils/rate-limiter.ts`). Désactivé
 * ou en panne, il laisse passer (même repli que `middleware()`) : la garde
 * principale ne dépend pas de lui — un choisi sans lien n'est JAMAIS prévenu.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { linkedAmong, type ChosenLinkDb } from '../../services/posts/chosenRecipientLinks';
import { createCustomRateLimiter, type RateLimiter } from '../../utils/rate-limiter';
import { sendError } from '../../utils/response';

export const ONLY_UNLINKED_DAILY_CAP = 50;
export const ONLY_UNLINKED_RECIPIENTS_LIMIT_CODE = 'ONLY_UNLINKED_RECIPIENTS_LIMIT';

const JOUR_MS = 24 * 60 * 60 * 1000;

const SEAUX = new WeakMap<object, RateLimiter>();

function seau(fastify: FastifyInstance): RateLimiter {
  const existant = SEAUX.get(fastify.server);
  if (existant) return existant;
  const cree = createCustomRateLimiter(
    { max: ONLY_UNLINKED_DAILY_CAP, windowMs: JOUR_MS, keyPrefix: 'posts:only-unlinked:d' },
    fastify.redis ?? undefined
  );
  SEAUX.set(fastify.server, cree);
  return cree;
}

export type OnlyUnlinkedVerdict = { readonly allowed: boolean; readonly retryAfter: number; readonly unlinked: number };

type SpendParams = {
  readonly fastify: FastifyInstance;
  readonly prisma: ChosenLinkDb;
  readonly authorId: string;
  readonly chosenIds: readonly string[];
  readonly previouslyChosen?: readonly string[];
};

export async function spendOnlyUnlinkedBudget(params: SpendParams): Promise<OnlyUnlinkedVerdict> {
  const already = new Set([params.authorId, ...(params.previouslyChosen ?? [])]);
  const nouveaux = [...new Set(params.chosenIds)].filter((id) => !already.has(id));
  if (nouveaux.length === 0) return { allowed: true, retryAfter: 0, unlinked: 0 };

  const linked = await linkedAmong(params.prisma, params.authorId, nouveaux);
  const unlinked = nouveaux.filter((id) => !linked?.has(id)).length;
  if (unlinked === 0) return { allowed: true, retryAfter: 0, unlinked: 0 };

  const limiteur = seau(params.fastify);
  const cle = `user:${params.authorId}`;
  const etat = await limiteur.consume(cle, unlinked);
  if (etat?.retryAfter === undefined) return { allowed: true, retryAfter: 0, unlinked };
  await limiteur.release(cle, unlinked);
  return { allowed: false, retryAfter: Math.max(1, etat.retryAfter), unlinked };
}

/** Rend un débit que l'écriture n'a pas suivi (création ou édition échouée en aval). */
export async function releaseOnlyUnlinkedBudget(params: {
  readonly fastify: FastifyInstance;
  readonly authorId: string;
  readonly unlinked: number;
}): Promise<void> {
  if (params.unlinked <= 0) return;
  await seau(params.fastify).release(`user:${params.authorId}`, params.unlinked);
}

/** Le refus levé DANS l'opération journalisée : une création rejouée ne recompte rien. */
export class OnlyUnlinkedBudgetRefused extends Error {
  constructor(readonly verdict: OnlyUnlinkedVerdict) {
    super('ONLY unlinked recipients budget exceeded');
  }
}

export function refuseOnlyUnlinkedBudget(reply: FastifyReply, verdict: OnlyUnlinkedVerdict): void {
  reply.header('Retry-After', String(verdict.retryAfter));
  sendError(
    reply,
    429,
    `Trop de personnes choisies sans lien avec vous aujourd'hui (${ONLY_UNLINKED_DAILY_CAP} par jour). Retirez-les de la liste ou réessayez plus tard.`,
    {
      code: ONLY_UNLINKED_RECIPIENTS_LIMIT_CODE,
      details: { limit: ONLY_UNLINKED_DAILY_CAP, unlinked: verdict.unlinked },
    }
  );
}
