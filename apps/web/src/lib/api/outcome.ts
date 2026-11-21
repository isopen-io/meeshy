import { isStaleAttachmentRefusal } from './attachment-refusal';

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

/**
 * POURQUOI `outcomeOf` ET `isPermanentFailure` PEUVENT DIVERGER (#19865).
 *
 * Les deux ne posent pas la même question, et le refus d'une pièce jointe
 * balayée est le premier cas du dépôt où les réponses s'écartent :
 *
 * | la question | qui répond |
 * |---|---|
 * | ce MÊME appel, rejoué À L'IDENTIQUE, peut-il aboutir ? | `outcomeOf` — **non** : il redemanderait la pièce supprimée |
 * | cette ENTRÉE offre-t-elle encore un espoir de partir ? | `isPermanentFailure` — **oui** : le client vient de la réparer |
 *
 * `outcomeOf` reste donc INCHANGÉ, et il doit l'être : ses vingt appelants
 * décident de rollbacks optimistes sur des 404 qui, eux, sont définitifs.
 * `isPermanentFailure` ne gouverne qu'UNE chose — le bouton « Réessayer » de
 * la bande d'envoi (`view/use-send.ts`, `components/failed-send-band.tsx`) — et
 * il le lit sur une entrée que `perform-send.ts` a déjà MODIFIÉE : les ids
 * mémorisés oubliés, le rejeu n'est plus identique.
 *
 * **Les deux moitiés se livrent ENSEMBLE, et aucune ne vaut seule.** Oublier
 * les ids sans rendre la reprise offerte laisse une entrée réparée que rien ne
 * relance ; offrir la reprise sans oublier les ids rejoue le même refus
 * indéfiniment.
 */

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
export function isPermanentFailure(failure: { readonly status: number; readonly code?: string } | undefined): boolean {
  if (failure === undefined) return false;
  if (isStaleAttachmentRefusal(failure)) return false;
  return outcomeOf({ ok: false, status: failure.status }) === 'permanent';
}

/**
 * L'ENVOI A-T-IL PU ARRIVER MALGRÉ L'ÉCHEC ? (#12632) — une coupure en cours
 * d'appel (`status: 0`), un délai dépassé (408) ou une erreur serveur (5xx)
 * laissent ouverte la possibilité que la passerelle ait déjà enregistré le
 * message. Un refus 4xx tranché ou un envoi jamais parti (hors ligne,
 * `undefined`) ne l'est pas. Abandonner un tel envoi ne doit donc rien
 * promettre : il peut revenir par l'écho `message:new`.
 */
export function mayHaveReachedServer(failure: { readonly status: number } | undefined): boolean {
  if (failure === undefined) return false;
  return failure.status === 0 || failure.status === 408 || failure.status >= 500;
}
