import { offlineSignedPayload, type OfflineSignedDecision } from './offlineSignedPayload';
import type { ReaderSignedPlan } from './readerSignedDelivery';
import type { PlanOutcome } from './planOutcome';

/**
 * **Ce que la FILE fait d'une ÉDITION dont une pièce se lit PAR LECTEUR**
 * (#19939).
 *
 * `handleMessageEdit` calcule un plan signé et le remet à `emitEditedToReaders` :
 * chaque lecteur CONNECTÉ reçoit un `fileUrl` / `thumbnailUrl` signés pour SA
 * ligne `Participant` (#9646). L'enfilage hors ligne, quarante lignes plus bas,
 * posait la charge GÉNÉRIQUE — non signée — et n'interrogeait pas
 * `PLAN_UNAVAILABLE`.
 *
 * La file est pourtant le canal le PLUS exposé des deux : son entrée vit jusqu'à
 * 48 h (`DELIVERY_QUEUE_TTL_SECONDS`), donc elle SURVIT à la fenêtre pendant
 * laquelle la protection d'une pièce peut changer. `offlineSignedPayload`
 * (#18619) énonce la règle ; elle avait quatre consommateurs, et aucun transport
 * d'édition.
 *
 * ─── Les DEUX autres raisons de ne rien enfiler, rapatriées ici ──────────────
 *
 * Elles vivaient en commentaire au site d'appel, dans `handleMessageEdit`, et
 * c'est le site qui décide le MOINS de ce qu'elles disent :
 *
 * - **l'EXCLUSION** (`excludedQueueKeys`) — sans elle, le texte d'un message
 *   hors du plancher d'historique d'un invité l'attendait dans Redis sous SA
 *   clé, pendant 48 h, alors qu'aucune route ne le lui sert ;
 * - **`'unknown'`** — quand la loi de lecture ne conclut pas, rien n'entre : on
 *   ne sait NI qui est bloqué, NI qui est autorisé, et un contenu persisté deux
 *   jours chez qui n'y a pas droit coûte plus qu'une remise perdue dont la base
 *   garde la vérité.
 *
 * Les trois raisons gouvernent la MÊME décision — enfiler ou non — et elles se
 * lisent donc ensemble, là où la décision se prend.
 *
 * ─── Pourquoi `PLAN_UNAVAILABLE` ferme les DEUX canaux ───────────────────────
 *
 * `planOutcome.ts` l'écrit pour la diffusion : « l'adresse nue d'une pièce
 * peut-être protégée partirait à toute la room ». **La phrase vaut mot pour mot
 * d'une entrée adressée à un destinataire NOMMÉ** — ce qui disqualifie une
 * diffusion n'est pas l'audience, c'est de remettre une adresse dont on ne sait
 * pas si elle est protégée. Ce qu'on perd est une REMISE, que la relecture du
 * fil sert de toute façon sous les mêmes lois (`signReaderAttachmentsIn`).
 *
 * ─── Pourquoi la base IGNORE la clé de file ──────────────────────────────────
 *
 * `offlineSignedPayload` documente que `base(key)` précède la signature, parce
 * que la base porte le masquage par lecteur. **Ce transport n'en a aucun** :
 * `handleMessageEdit` monte `emitEditedToReaders` avec `NO_SEALED_EDIT` (carte
 * vide) et des variantes identité, et son `select` ne charge pas `replyTo` —
 * aucune citation à sceller, aucune source de transfert à retirer. `base` est
 * donc constante et `basePerReader` n'aurait rien à déclarer.
 *
 * Cette justesse est CIRCONSTANCIELLE, et c'est pourquoi elle est écrite ici :
 * le jour où ce handler chargerait `replyTo` ou recevrait un scellement, une
 * base constante signerait une citation non scellée sans qu'aucun type ne
 * rougisse. Le jumeau REST, lui, a déjà son `sealedQuoteAudience` (#19979).
 */
export function offlineSignedEdit(params: {
  readonly plan: PlanOutcome<ReaderSignedPlan>;
  readonly payload: object;
}): OfflineSignedDecision {
  return offlineSignedPayload({
    plan: params.plan,
    base: () => params.payload as Record<string, unknown>,
  });
}

/**
 * Les champs que la décision ajoute à l'enfilage — UN seul hook par lecteur,
 * composé par la décision, jamais deux qui s'excluraient au site d'appel.
 */
export function queueSigningFields(
  decision: OfflineSignedDecision,
): { resolvePayloadForReader?: (queueKey: string, participantId: string) => Record<string, unknown> } {
  return decision.kind === 'per-reader' ? { resolvePayloadForReader: decision.resolve } : {};
}
