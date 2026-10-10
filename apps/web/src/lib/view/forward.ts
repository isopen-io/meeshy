import { contentExitOf, mediaLeaves, type ExitForwardRefusal, type ExitMessage } from '@/lib/view/content-exit';
import type { Message } from '@/lib/api/types';
import type { ForwardSource } from '@/lib/api/forward';
import type { SendPreview, SoleMedia } from '@/lib/send/send-sheet-plan';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

/**
 * LE TRANSFERT, CÔTÉ CLIENT (#5866, #9573) — la règle que `admitMessageForward`
 * (`services/gateway/src/services/messaging/forwardAdmission.ts`) applique,
 * dite AVANT l'aller-retour : une garde qui ne vit que côté serveur laisse
 * l'utilisateur découvrir l'interdit après avoir armé une sélection et choisi
 * un destinataire.
 *
 * AUCUNE RÈGLE ICI. Le verdict vient de la loi de sortie (`content-exit.ts`,
 * projection de `@meeshy/shared`) :
 *  - une VUE UNIQUE et une FLAMME APRÈS LECTURE ne se transfèrent pas — lues
 *    sur le message ET sur chacune de ses pièces ; un éphémère dont la durée
 *    ne se lit pas est jugé « après lecture » ;
 *  - une FLAMME À DURÉE se transfère, et sa copie dure au plus autant
 *    (`maxDurationSeconds`, que la feuille d'envoi propose de réduire) ;
 *  - un FLOU se transfère, la copie le garde ;
 *  - une source SUPPRIMÉE ou ÉCHUE n'a plus rien à copier.
 *
 * Ce fichier ne rend RIEN et n'envoie RIEN : `api/forward.ts` porte le
 * transport, `use-message-menu.ts` compose les deux.
 */

export type ForwardProtection = ExitMessage;

export type ForwardCandidate = ForwardProtection & Pick<Message, 'id'>;

/** Les motifs du serveur (`ForwardRefusal`), dans le vocabulaire de la loi. */
export type ForwardRefusal = ExitForwardRefusal;

export type ForwardAdmission =
  | { readonly admitted: true; readonly ids: readonly string[] }
  | { readonly admitted: false; readonly reason: ForwardRefusal };

/** `null` ⇒ rien ne s'oppose au transfert de CE message. */
export function forwardRefusalOf(message: ForwardProtection, now: number): ForwardRefusal | null {
  const { forward } = contentExitOf(message, now);
  return forward.allowed ? null : forward.reason;
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

/** Le texte d'un message ne se montre pas hors du fil quand il ne peut pas en sortir, ni quand un bit ou le chiffrement le voile. */
const textLeaves = (message: Message, now: number): boolean => mediaLeaves({ message, piece: {}, now });

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
  return { attachmentId: piece.id, mime: piece.mimeType, protected: !mediaLeaves({ message: only, piece, now }) };
};

/**
 * L'APERÇU — JAMAIS un contenu qui ne sort pas. Un message flouté, chiffré ou
 * qui disparaît n'affiche ni son texte ni sa vignette dans la feuille :
 * l'aperçu se réduit à « 1 message ». Sinon : le texte, à défaut la vignette.
 */
const previewOfMessages = (messages: readonly Message[], now: number): SendPreview => {
  const [only] = messages;
  if (only === undefined || messages.length !== 1 || !textLeaves(only, now)) return { kind: 'messages', count: messages.length };
  if (only.content.trim() !== '') return { kind: 'text', text: only.content };
  const piece = only.attachments?.length === 1 ? only.attachments[0] : undefined;
  if (piece === undefined || !mediaLeaves({ message: only, piece, now })) return { kind: 'messages', count: 1 };
  const kind = kindOfMime(piece.mimeType);
  const thumbUrl = piece.thumbnailUrl ?? (kind === 'image' ? piece.fileUrl : undefined);
  return { kind, ...(thumbUrl === undefined ? {} : { thumbUrl }) };
};

/** Une flamme à durée voyage avec SA borne : la feuille la propose, le transport ne la dépasse pas. */
const forwardSourceOf = (message: Message, now: number): ForwardSource => {
  const { forward } = contentExitOf(message, now);
  const bound = forward.allowed ? forward.maxDurationSeconds : null;
  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage,
    ...(bound === null ? {} : { maxDurationSeconds: bound }),
  };
};

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
      messages: messages.map((message) => forwardSourceOf(message, now)),
      preview: previewOfMessages(messages, now),
      ...(soleMedia === undefined ? {} : { soleMedia }),
    },
  };
}
