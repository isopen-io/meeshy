/**
 * L'ISSUE D'UN APPEL RÉSEAU (#5813, étape 0 — extrait de
 * `conversation-actions.ts:26-36`, AUCUN changement de règle) — lue sur la
 * forme `ApiResult` que rend le transport RÉEL (`ok`/`status`), jamais
 * devinée sur le nom d'une erreur.
 *
 * SITE UNIQUE, réutilisé par `conversation-actions.ts` (actions de rangée) ET
 * par `send/perform-send.ts` (un envoi de message, spécification #5813,
 * § 3.5) — deux appelants, une seule règle.
 */
export type Outcome = 'success' | 'permanent' | 'transient';

/**
 * LES 4xx DONT UN REJEU IDENTIQUE PEUT ABOUTIR (revue-correction #5813,
 * défaut majeur 1) — 408 (délai dépassé, posable par Traefik AUTANT que par
 * la passerelle), 425 (Too Early) et surtout 429 (`Rate limit exceeded`,
 * `services/gateway/src/middleware/rate-limiter.ts:56-58` : limiteur GLOBAL
 * 300 req/min PAR IP sur TOUTES les routes, `POST /conversations/:id/messages`
 * compris — atteignable en usage réel derrière un NAT d'entreprise ou un
 * wifi partagé, sans qu'AUCUNE action de l'utilisateur autre que rejouer ne
 * soit requise). `outcomeOf` classait ces trois codes `permanent` au même
 * titre qu'un 401/403 : le produit retirait alors le bouton « Réessayer »
 * pendant que `sendFailureReason` (`send/failure-reason.ts:28`) disait au
 * même utilisateur « réessayez dans un instant » — deux affirmations
 * contradictoires sur la même bande. SITE UNIQUE : toute autre distinction
 * (`sendFailureReason`, un futur rejeu automatique) doit lire CETTE liste,
 * jamais en tenir une seconde.
 */
export const RETRYABLE_CLIENT_STATUSES: ReadonlySet<number> = new Set([408, 425, 429]);

export function outcomeOf(result: unknown): Outcome {
  if (typeof result !== 'object' || result === null) return 'transient';
  const r = result as { readonly ok?: unknown; readonly status?: unknown };
  if (r.ok === true) return 'success';
  const status = typeof r.status === 'number' ? r.status : 0;
  if (RETRYABLE_CLIENT_STATUSES.has(status)) return 'transient';
  return status >= 400 && status < 500 ? 'permanent' : 'transient';
}

/**
 * UN REFUS PERMANENT N'OFFRE PAS DE REJEU (revue-correction #5813, défaut
 * majeur 2) — `outcomeOf` avait justement été extrait pour trancher cette
 * question, et `perform-send.ts` posait `markFailed` pour TOUTE issue non-ok
 * sans jamais le consulter : un 403 « vous n'êtes pas participant » ou un 401
 * « session expirée » offrait le même bouton « Réessayer » qu'une panne
 * réseau, alors qu'aucun rejeu ne peut aboutir sans que l'utilisateur agisse
 * D'ABORD ailleurs (se reconnecter, quitter la conversation). `undefined`
 * (hors ligne, D-16) n'est pas un refus permanent — pas de cause à trancher.
 * Un statut de `RETRYABLE_CLIENT_STATUSES` (408/425/429, défaut majeur 1)
 * n'est jamais permanent non plus : son rejeu À L'IDENTIQUE peut aboutir sans
 * aucun geste de l'utilisateur ailleurs.
 */
export function isPermanentFailure(failure: { readonly status: number } | undefined): boolean {
  return failure !== undefined && outcomeOf({ ok: false, status: failure.status }) === 'permanent';
}
