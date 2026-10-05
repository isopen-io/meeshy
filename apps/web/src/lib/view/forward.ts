import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { protectionOf } from '@/lib/reading-mode/protection';
import { quotedIsProtected } from '@/lib/view/quoted-protection';
import type { Attachment, Message } from '@/lib/api/types';
import type { ForwardSource } from '@/lib/api/forward';
import type { SendPreview, SoleMedia } from '@/lib/send/send-sheet-plan';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

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
  return kind === 'deleted' || kind === 'expired' ? 'unavailable' : null;
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

const MASKING_EFFECTS = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;

type ForwardPiece = Pick<Attachment, 'id' | 'mimeType' | 'fileUrl'> &
  Partial<Pick<Attachment, 'thumbnailUrl' | 'isViewOnce' | 'isBlurred' | 'isEncrypted'>> & {
    readonly effectFlags?: number | null;
  };

/** Le message lui-même ne laisse PAS lire son contenu : voilé (colonne OU bit
 * d'effet), chiffré, éphémère, vue unique — `protectionOf` ne lit ni le bit ni
 * le chiffrement, `quotedIsProtected` les deux. */
const messageMasks = (message: Message, now: number): boolean =>
  protectionOf(message, now) !== 'standard' || message.expiresAt != null || quotedIsProtected(message);

/**
 * UNE PIÈCE NE SE PUBLIE PAS quand l'un des deux niveaux la masque — celui du
 * MESSAGE (voilé, éphémère) et celui de la PIÈCE (vue unique, floutée,
 * chiffrée, bits d'effet) : la passerelle refuse en `PROTECTED_MEDIA`, autant
 * ne pas proposer le geste (leçon 275, la protection se lit aux deux niveaux).
 */
const pieceMasked = (piece: ForwardPiece): boolean =>
  piece.isViewOnce === true ||
  piece.isBlurred === true ||
  piece.isEncrypted === true ||
  ((piece.effectFlags ?? 0) & MASKING_EFFECTS) !== 0;

const kindOfMime = (mime: string): 'image' | 'video' | 'audio' | 'file' => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return mime.startsWith('audio/') ? 'audio' : 'file';
};

const soleMediaOf = (messages: readonly Message[], now: number): SoleMedia | undefined => {
  const [only] = messages;
  const pieces = only?.attachments ?? [];
  const [piece] = pieces;
  if (only === undefined || messages.length !== 1 || pieces.length !== 1 || piece === undefined) return undefined;
  return { attachmentId: piece.id, mime: piece.mimeType, protected: messageMasks(only, now) || pieceMasked(piece) };
};

/**
 * L'APERÇU — JAMAIS un contenu voilé. Un message flouté, éphémère ou à vue
 * unique n'affiche ni son texte ni sa vignette dans la feuille : l'aperçu se
 * réduit à « 1 message ». Sinon : le texte, à défaut la vignette de la pièce.
 */
const previewOfMessages = (messages: readonly Message[], now: number): SendPreview => {
  const [only] = messages;
  if (only === undefined || messages.length !== 1 || messageMasks(only, now)) return { kind: 'messages', count: messages.length };
  if (only.content.trim() !== '') return { kind: 'text', text: only.content };
  const piece = only.attachments?.length === 1 ? only.attachments[0] : undefined;
  if (piece === undefined || pieceMasked(piece)) return { kind: 'messages', count: 1 };
  const kind = kindOfMime(piece.mimeType);
  const thumbUrl = piece.thumbnailUrl ?? (kind === 'image' ? piece.fileUrl : undefined);
  return { kind, ...(thumbUrl === undefined ? {} : { thumbUrl }) };
};

const forwardSourceOf = (message: Message): ForwardSource => ({
  id: message.id,
  content: message.content,
  originalLanguage: message.originalLanguage,
});

/**
 * CE QUE LA SÉLECTION ADMISE REMET À LA FEUILLE D'ENVOI (#8884) — la demande
 * que `openSendSheet` reçoit : les messages, dans l'ordre du fil, que le
 * transport désigne par leur identifiant (la passerelle copie les pièces,
 * aucun ré-upload), l'aperçu, et — pour UN message portant UN média — de quoi
 * le proposer à la publication (story, post, réel). Pur : l'appelant a déjà
 * fait passer la sélection par `admitForward`.
 */
export function forwardRequestOf(params: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly now: number;
}): SendSheetRequest {
  const { conversationId, messages, now } = params;
  const soleMedia = soleMediaOf(messages, now);
  return {
    intent: 'forward',
    payload: {
      kind: 'messages',
      conversationId,
      messages: messages.map(forwardSourceOf),
      preview: previewOfMessages(messages, now),
      ...(soleMedia === undefined ? {} : { soleMedia }),
    },
  };
}
