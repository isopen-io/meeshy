import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { protectionOf } from '@/lib/reading-mode/protection';
import type { Message } from '@/lib/api/types';

/**
 * LA LOI DU TRANSFERT, CÔTÉ CLIENT (#5866) — miroir de `admitMessageForward`
 * (`services/gateway/src/services/messaging/forwardAdmission.ts:172-229`), le
 * point où les TROIS transports d'envoi de la passerelle convergent.
 *
 * POURQUOI LA REJOUER ICI. Le serveur refuse déjà la vue unique et rend un
 * motif lisible (`describeForwardRefusal`) — mais une garde qui ne vit que
 * côté serveur laisse l'utilisateur DÉCOUVRIR l'interdit après coup : il a
 * armé une sélection, ouvert la feuille, choisi un destinataire, et n'apprend
 * qu'ensuite que rien ne partira. Le refus se dit AVANT l'aller-retour.
 *
 * CE QUI EST REPRIS TEL QUEL DU SERVEUR :
 *  - la VUE UNIQUE est refusée, par la COLONNE (`isViewOnce`) **et** par le
 *    BIT (`effectFlags & VIEW_ONCE`) — « sinon le contournement ne coûte
 *    qu'un champ » (`forwardAdmission.ts:216-220`) ;
 *  - un ÉPHÉMÈRE se transfère : la copie HÉRITE de la durée de la source
 *    (`inheritedDuration`), ce n'est pas un refus ;
 *  - un FLOU se transfère : le serveur ne le refuse pas, le client non plus.
 *
 * CE QUI S'Y AJOUTE, et pourquoi : une source SUPPRIMÉE ou ÉCHUE n'a plus ni
 * texte ni pièce jointe à copier. Le serveur rend alors `SOURCE_UNAVAILABLE`
 * (`forwardAdmission.ts:224-227`) une fois la requête partie ; le dire ici
 * évite d'écrire une ligne vide chez le destinataire. `protectionOf` (D-23)
 * est l'UNIQUE loi consultée pour ces deux états — jamais une seconde lecture
 * de `deletedAt`/`expiresAt` écrite ici.
 *
 * Ce fichier ne rend RIEN et n'envoie RIEN : `api/forward.ts` porte le
 * transport, `use-message-menu.ts` compose les deux.
 */

/** CE QUI DÉCIDE du refus — jamais l'identité : `forwardRefusalOf` juge un
 * message (le menu n'en tient qu'un), `admitForward` compose une sélection. */
export type ForwardProtection = Pick<
  Message,
  'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt' | 'effectFlags'
>;

export type ForwardCandidate = ForwardProtection & Pick<Message, 'id'>;

/** Les deux motifs du serveur, dans son vocabulaire (`ForwardRefusalReason`). */
export type ForwardRefusal = 'view-once' | 'unavailable';

export type ForwardAdmission =
  | { readonly admitted: true; readonly ids: readonly string[] }
  | { readonly admitted: false; readonly reason: ForwardRefusal };

const hasViewOnceFlag = (effectFlags: number | undefined): boolean =>
  ((effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) !== 0;

/** `null` ⇒ rien ne s'oppose au transfert de CE message. */
export function forwardRefusalOf(message: ForwardProtection, now: number): ForwardRefusal | null {
  if (message.isViewOnce || hasViewOnceFlag(message.effectFlags)) return 'view-once';
  const kind = protectionOf(message, now);
  return kind === 'deleted' || kind === 'expired' || kind === 'burned' ? 'unavailable' : null;
}

/**
 * LA SÉLECTION ENTIÈRE, OU RIEN. Un lot dont on retirerait silencieusement les
 * messages refusés transférerait MOINS que ce que la barre annonçait — et
 * l'utilisateur n'aurait aucun moyen de savoir lequel manque. Le premier refus
 * rencontré nomme le lot, exactement comme la passerelle refuse l'envoi entier.
 */
export function admitForward(messages: readonly ForwardCandidate[], now: number): ForwardAdmission {
  if (messages.length === 0) return { admitted: false, reason: 'unavailable' };
  const refusal = messages.map((m) => forwardRefusalOf(m, now)).find((r) => r !== null);
  if (refusal !== undefined && refusal !== null) return { admitted: false, reason: refusal };
  return { admitted: true, ids: messages.map((m) => m.id) };
}
