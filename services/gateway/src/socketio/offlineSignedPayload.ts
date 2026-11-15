import type { ReaderSignedPlan } from './readerSignedDelivery';
import { PLAN_UNAVAILABLE, type PlanOutcome } from './planOutcome';

/**
 * **Ce que la FILE fait d'un message dont une pièce se lit PAR LECTEUR**
 * (#18619).
 *
 * L'émission directe est par destinataire : `fileUrl` / `thumbnailUrl` signés
 * pour SA ligne `Participant` (#9646). L'enfilement, trente lignes plus bas,
 * stockait le `peerPayload` GÉNÉRIQUE — non signé — et rien dans le drain ne le
 * signait. La file est pourtant le canal le plus EXPOSÉ des deux : son entrée
 * vit jusqu'à 48 h (`DELIVERY_QUEUE_TTL_SECONDS`), donc elle survit à la
 * fenêtre pendant laquelle la protection d'une pièce peut changer.
 *
 * ─── Le sous-cas qui nomme la règle ──────────────────────────────────────────
 *
 * `PLAN_UNAVAILABLE` — « je ne SAIS pas adresser » — fait que l'émission rend
 * **sans avoir rien émis**, pour la raison que `planOutcome.ts` écrit :
 *
 * > « l'adresse nue d'une pièce peut-être protégée partirait à toute la room »
 *
 * L'enfilement était HORS de cette décision et tournait quand même. **La même
 * phrase vaut mot pour mot d'une entrée adressée à un destinataire NOMMÉ** : ce
 * qui disqualifie une diffusion de room n'est pas l'audience, c'est le fait de
 * remettre une adresse dont on ne sait pas si elle est protégée. Le verdict à
 * trois valeurs gouverne donc les DEUX canaux.
 *
 * ─── Les trois décisions, et pourquoi aucune ne se collapse ──────────────────
 *
 * | plan | décision | ce qu'elle veut dire |
 * |---|---|---|
 * | `PLAN_UNAVAILABLE` | `withhold` | on ne sait pas adresser ⇒ on n'écrit RIEN de durable |
 * | `null` | `as-is` | aucune pièce ne se lit par lecteur ⇒ la charge générique est la bonne |
 * | un plan | `per-reader` | chaque entrée porte les adresses signées de SON destinataire |
 *
 * Confondre `withhold` et `as-is` rejouerait le défaut ; confondre `as-is` et
 * `per-reader` ferait payer une signature à tout le produit pour rien.
 *
 * ─── L'ORDRE de composition, qui n'est pas indifférent ───────────────────────
 *
 * `base(key)` précède la signature, jamais l'inverse. La base porte déjà le
 * retrait des sources de transfert refusées et le scellement d'une citation
 * d'éphémère échu pour CE lecteur (`payloadForKey`, #8562) : signer d'abord
 * puis masquer reviendrait à signer une charge que ce lecteur n'a pas le droit
 * de voir, et masquer une charge déjà signée laisserait une adresse valide
 * pointant sur ce qu'on vient de retirer.
 *
 * ─── Ce que `withhold` coûte, et pourquoi c'est le bon prix ──────────────────
 *
 * Un destinataire hors ligne ne reçoit pas le rejeu temps réel de ce message.
 * Il le retrouve en relisant le fil (`GET …/messages`), qui applique les mêmes
 * lois et lui sert des adresses signées pour lui. Ce qu'on perd est une REMISE ;
 * ce qu'on éviterait de perdre en enfilant est une adresse nue écrite dans Redis
 * pour deux jours. C'est l'arbitrage que l'émission directe a déjà pris.
 */
export type OfflineSignedDecision =
  /** On ne sait pas adresser : rien n'est enfilé pour cette émission. */
  | { readonly kind: 'withhold' }
  /** Aucune pièce liée au lecteur : la charge générique part telle quelle. */
  | { readonly kind: 'as-is' }
  /** Chaque destinataire reçoit SA charge, signée pour sa ligne `Participant`. */
  | {
      readonly kind: 'per-reader';
      readonly resolve: (queueKey: string, participantId: string) => Record<string, unknown>;
    };

export function offlineSignedPayload(params: {
  readonly plan: PlanOutcome<ReaderSignedPlan>;
  /** La charge DE CE LECTEUR avant signature — masquages et scellements compris. */
  readonly base: (queueKey: string) => Record<string, unknown>;
  /**
   * La base DIFFÈRE-t-elle déjà par lecteur, sans aucun plan ? (transferts
   * refusés, citation d'éphémère scellée).
   *
   * Ce drapeau existe pour qu'il n'y ait qu'UN hook par lecteur sur la file.
   * Deux — l'un pour le masquage, l'autre pour la signature — se seraient
   * exclus mutuellement au site d'appel, et le premier qui gagne décide : la
   * forme la plus facile à câbler à l'envers. Ici la composition est faite
   * ICI, une fois, dans l'ordre qui la rend juste.
   */
  readonly basePerReader?: boolean;
}): OfflineSignedDecision {
  const { plan, base } = params;
  if (plan === PLAN_UNAVAILABLE) return { kind: 'withhold' };
  if (plan === null) {
    return params.basePerReader
      ? { kind: 'per-reader', resolve: (queueKey) => base(queueKey) }
      : { kind: 'as-is' };
  }
  return {
    kind: 'per-reader',
    resolve: (queueKey, participantId) => plan.signFor(base(queueKey), participantId),
  };
}

/**
 * La même décision pour `message:attachment-updated`, dont la charge porte UNE
 * pièce plutôt qu'un tableau (#18619).
 *
 * Elle est séparée parce que la signature ne s'applique pas au même objet —
 * `signAttachment` et non `signFor` — et non parce que la règle diffère : elle
 * est identique, et ce module la porte une fois pour les deux formes.
 *
 * Ce site a déjà la règle, écrite pour un AUTRE inconnu, quelques lignes plus
 * haut : « un régime illisible n'enfile RIEN plutôt que de risquer le clair
 * dans Redis ; la relecture de la conversation sert la pièce enrichie ». Un
 * plan illisible est le même genre d'inconnu, et il appelle la même réponse.
 */
export function offlineSignedAttachment(params: {
  readonly plan: PlanOutcome<ReaderSignedPlan>;
  readonly payload: Record<string, unknown> & { readonly attachment: unknown };
}): OfflineSignedDecision {
  const { plan, payload } = params;
  if (plan === PLAN_UNAVAILABLE) return { kind: 'withhold' };
  if (plan === null) return { kind: 'as-is' };
  return {
    kind: 'per-reader',
    resolve: (_queueKey, participantId) => ({
      ...payload,
      attachment: plan.signAttachment(payload.attachment as never, participantId),
    }),
  };
}
