/**
 * withMutationLog helper — Wave 1 Task 3.5
 *
 * Convenience wrapper that ties together the three moving parts of the
 * dedup pattern :
 *   1. The optional `request.clientMutationId` decorated by the
 *      `clientMutationId` middleware.
 *   2. The `MutationLogService.recordOrReturn` exception-based contract.
 *   3. The route's own refetch logic (provided as `onDuplicate`).
 *
 * When the request carries no cmid, this helper just runs `op()` once
 * and returns its result — routes still behave the same for legacy
 * (non-iOS) clients that haven't been migrated to the outbox yet.
 *
 * Usage :
 *
 * ```ts
 * const friendRequest = await withMutationLog({
 *   request,
 *   fastify,
 *   userId,
 *   kind: 'sendFriendRequest',
 *   replayCost: 'converges',
 *   op: () => createFriendRequest(...),
 *   onDuplicate: (resultId) =>
 *     fastify.prisma.friendRequest.findUnique({ where: { id: resultId }, include: {...} })
 *       .then(fr => fr ?? null),
 * });
 * ```
 *
 * ## Deux questions, deux sorties
 *
 * Un journal de mutation répond à DEUX questions, et n'en rendait qu'une :
 *
 *   1. « quel résultat sert-on ? » — `withMutationLog`, la projection
 *      historique, rend le résultat et rien d'autre ;
 *   2. « ce résultat vient-il d'être PRODUIT, ou REJOUÉ ? » —
 *      {@link withMutationOutcome}, qui rend le verdict avec lui.
 *
 * La seconde n'est pas un détail de confort : **le verrou ne vaut que pour
 * ce qu'il enveloppe.** Une route qui, après le journal, diffuse un
 * évènement et écrit une notification refait ces deux effets à chaque
 * rejeu — le contenu n'est plus dupliqué, mais l'annonce l'est. Mesuré sur
 * `POST /posts/:postId/repost` : deux `post:reposted` et deux lignes
 * `Notification` (donc deux pushes) pour UN repost. Tout appelant qui porte
 * un effet de bord APRÈS le journal doit appeler `withMutationOutcome` et
 * garder cet effet sur `status === 'applied'`.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  MutationLogService,
  MutationLogDuplicate,
} from '../services/MutationLogService';

/**
 * Ce que COÛTE la ré-exécution de `op()` quand le résultat antérieur n'est
 * plus relisible (`onDuplicate` → `null`/`undefined`, ou aucune `resultId`
 * sur la ligne de journal).
 *
 * Ce n'est pas une préférence de style : c'est une propriété de l'op, et
 * elle se déclare parce qu'elle n'est pas devinable depuis l'extérieur.
 */
export type ReplayCost =
  /**
   * L'op CONVERGE : la rejouer rend le même état (appartenance à un
   * ensemble de réactions, affectation d'un champ de profil, marquage
   * « lu »). Le helper la rejoue plutôt que de rendre un 404 à un client
   * dont la mutation avait pourtant abouti.
   */
  | 'converges'
  /**
   * L'op DIVERGE : chaque exécution insère une ligne neuve (`create`) ou
   * détruit un état acquis (remise à zéro d'engagement). La rejouer
   * FABRIQUE un doublon — ou détruit deux fois. Le helper refuse et rend
   * le verdict `gone`, à charge pour la route de dire au client que sa
   * mutation a bien eu lieu mais que son résultat n'est plus là (410).
   */
  | 'diverges';

/**
 * Verdict d'une mutation journalisée.
 *
 * - `applied`  : `op()` vient de s'exécuter. Les effets de bord d'aval
 *                (diffusion, notification, traduction) sont LÉGITIMES.
 * - `replayed` : rien n'a été exécuté, le résultat antérieur est resservi.
 *                Les effets de bord d'aval ont DÉJÀ eu lieu — les refaire
 *                double l'annonce d'un geste unique.
 * - `gone`     : le cmid a bien été appliqué, son résultat n'est plus
 *                relisible, et l'op ne peut pas être rejouée sans diverger.
 */
export type MutationOutcome<T> =
  | { readonly status: 'applied'; readonly result: T }
  | { readonly status: 'replayed'; readonly result: T }
  | { readonly status: 'gone'; readonly resultId: string | null };

/**
 * Levée par {@link withMutationLog} — la projection qui ne rend qu'un
 * résultat — quand le verdict est `gone`. Une route qui déclare
 * `replayCost: 'diverges'` doit soit l'attraper, soit passer par
 * {@link withMutationOutcome}.
 */
export class MutationResultGone extends Error {
  public readonly resultId: string | null;
  public readonly kind: string;
  public readonly statusCode = 410;

  constructor(resultId: string | null, kind: string) {
    super(
      `Mutation already applied but its result is gone (kind=${kind}, resultId=${resultId ?? 'null'})`
    );
    this.name = 'MutationResultGone';
    this.resultId = resultId;
    this.kind = kind;
  }
}

export interface WithMutationLogArgs<T> {
  readonly request: FastifyRequest;
  readonly fastify: FastifyInstance;
  readonly userId: string;
  readonly kind: string;
  /**
   * OBLIGATOIRE — voir {@link ReplayCost}. Sans déclaration, le helper
   * appliquait à TOUTE op le filet « rejoue `op()` », qui n'est juste que
   * pour une op convergente : sur un `create`, il fabriquait un doublon
   * (repost supprimé ressuscité sous un id neuf).
   */
  readonly replayCost: ReplayCost;
  readonly op: () => Promise<T & { id: string }>;
  /**
   * Refetch the original mutation result by id. Called with the
   * `resultId` stored on the prior `MutationLog` row.
   *
   * Return `null`/`undefined` when the original record can no longer be
   * read (soft-deleted, expired, filtered out by the viewer's ACL). Ce que
   * le helper en fait dépend de {@link ReplayCost}.
   */
  readonly onDuplicate: (resultId: string) => Promise<(T & { id: string }) | null | undefined>;
}

/**
 * Journalise la mutation ET rend le verdict. À préférer partout où la
 * route porte un effet de bord APRÈS le journal.
 */
export async function withMutationOutcome<T>(
  args: WithMutationLogArgs<T>
): Promise<MutationOutcome<T & { id: string }>> {
  const { request, fastify, userId, kind, op, onDuplicate, replayCost } = args;
  const cmid = request.clientMutationId;

  if (!cmid) {
    return { status: 'applied', result: await op() };
  }

  const svc: MutationLogService = fastify.mutationLogService;

  try {
    return { status: 'applied', result: await svc.recordOrReturn({ userId, clientMutationId: cmid, kind, op }) };
  } catch (err) {
    if (!(err instanceof MutationLogDuplicate)) throw err;

    if (err.resultId) {
      const replayed = await onDuplicate(err.resultId);
      if (replayed) return { status: 'replayed', result: replayed };
    }

    // Soit la ligne antérieure ne porte aucune `resultId`, soit le
    // résultat n'est plus relisible. La suite dépend de la NATURE de l'op,
    // qu'elle a déclarée elle-même.
    if (replayCost === 'converges') {
      return { status: 'applied', result: await op() };
    }
    return { status: 'gone', resultId: err.resultId };
  }
}

/**
 * Projection de {@link withMutationOutcome} qui ne rend que le résultat.
 *
 * @throws MutationResultGone quand `replayCost === 'diverges'` et que le
 *         résultat antérieur a disparu.
 */
export async function withMutationLog<T>(
  args: WithMutationLogArgs<T>
): Promise<T & { id: string }> {
  const outcome = await withMutationOutcome(args);
  if (outcome.status === 'gone') {
    throw new MutationResultGone(outcome.resultId, args.kind);
  }
  return outcome.result;
}
