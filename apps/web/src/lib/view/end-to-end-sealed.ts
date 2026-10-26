import type { Message } from '@/lib/api/types';
import { endToEndRegimeLedger, endToEndSealed as conversationSealed, isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';
import { endToEndShownSince } from '@/lib/end-to-end-thread-signal';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

/**
 * UN MESSAGE QUE LE SERVEUR NE LIT PAS EST SCELLÉ POUR LE WEB (#12983).
 *
 * Le web ne détient aucune clé libsignal (#10788, décision #12975) : il ne
 * reçoit aucune enveloppe, et la passerelle ne lui sert que le littéral
 * `[Encrypted]`. La loi est celle que l'aperçu d'appui long, la traduction sur
 * l'appareil et la passerelle appliquent déjà
 * (`sharedTranslationServerReadsMessage`) : seuls un message en clair et un
 * message chiffré PAR le serveur (`server`, `hybrid`) se lisent. Bout en bout,
 * mode inconnu ou chiffré sans mode : scellé, on ne devine pas un clair. Le
 * mode de la conversation reste hors de la question, comme côté passerelle :
 * un message en clair antérieur au chiffrement reste lisible.
 *
 * Le jour où le web aura sa pile, ce verdict cédera la place à la provenance
 * du clair déchiffré sur l'appareil, jamais à la forme du texte.
 */
export const endToEndSealed = (message: Pick<Message, 'isEncrypted' | 'encryptionMode'>): boolean =>
  message.isEncrypted === true &&
  !sharedTranslationServerReadsMessage({
    conversationEncryptionMode: null,
    messageIsEncrypted: message.isEncrypted,
    messageEncryptionMode: message.encryptionMode,
  });

/**
 * **LE RÉGIME VU D'UNE CONVERSATION, ET SON ÈRE** (#12992) — scellée si elle
 * est servie e2ee, apprise par le registre du compte ou retenue par le fil
 * (`endToEndSealed`, `lib/end-to-end-regime-ledger.ts`). L'ère est la plus
 * ancienne preuve : la date d'activation servie sous le mode e2ee, l'ère que
 * le registre a retenue, l'avis d'activation ou le premier message e2ee du fil
 * — bornée par l'horloge de ce navigateur quand rien n'est daté (#12936).
 */
export type EndToEndRegimeView = { readonly sealed: boolean; readonly since: number };

const instantOf = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
};

export function endToEndRegimeOf(
  input: {
    readonly conversationId: string;
    readonly servedMode: string | null | undefined;
    readonly servedSince: Date | string | null | undefined;
    readonly trail?: readonly Message[] | undefined;
  },
  state: Pick<EndToEndRegimeState, 'sealed' | 'since'> & Partial<Pick<EndToEndRegimeState, 'held'>> = endToEndRegimeLedger.getState(),
  now: number = Date.now(),
): EndToEndRegimeView {
  const sealed = conversationSealed(state, { conversationId: input.conversationId, servedMode: input.servedMode });
  const evidence = [
    isEndToEndMode(input.servedMode) ? instantOf(input.servedSince) : null,
    state.since[input.conversationId] ?? null,
    input.trail === undefined ? null : endToEndShownSince(input.trail),
  ].filter((at): at is number => at !== null);
  return { sealed, since: Math.min(now, ...evidence) };
}

/**
 * Le message se DIT en clair, d'un utilisateur, après l'ère : dans une
 * conversation chiffrée de bout en bout, la passerelle refuse ce clair (#11216)
 * — il ne peut venir que d'elle. Une date illisible ne le sauve pas.
 */
function forgedPlaintext(message: Message, regime: EndToEndRegimeView): boolean {
  if (!regime.sealed || message.isEncrypted === true) return false;
  if (message.deletedAt !== undefined && message.deletedAt !== null) return false;
  if ((message.messageSource ?? 'user') !== 'user' || message.messageType === 'system') return false;
  const at = instantOf(message.createdAt);
  return at === null || at >= regime.since;
}

/** Le littéral que la passerelle sert pour un message qu'elle ne lit pas. */
const SEALED_CONTENT = '[Encrypted]';

function sealedForm(message: Message): Message {
  const { attachments: _attachments, sticker: _sticker, metadata: _metadata, encryptionMode: _mode, encryptedContent: _cipher, encryptionMetadata: _envelope, ...identity } = message;
  return { ...identity, content: SEALED_CONTENT, isEncrypted: true, translations: [] };
}

/**
 * **LA LOI UNIQUE DU CLAIR FORGÉ** (#12992) — appliquée au fil (`useThreadData`),
 * à l'aperçu d'appui long (`conversation-peek-card.tsx`) et à la ligne de liste
 * (`previewInputOf`) — et à la citation qu'un message porte : un clair forgé y prend la forme d'un message chiffré
 * sans mode — scellé partout où `endToEndSealed` est lu, sans texte, sans
 * traduction, sans pièce, sans lieu ni sticker. Rien à sceller ⇒ le MÊME
 * tableau (aucun rendu de plus).
 */
const quotesForged = (message: Message, regime: EndToEndRegimeView): boolean => message.replyTo !== undefined && forgedPlaintext(message.replyTo, regime);

function sealedRow(message: Message, regime: EndToEndRegimeView): Message {
  const own = forgedPlaintext(message, regime) ? sealedForm(message) : message;
  return own.replyTo !== undefined && forgedPlaintext(own.replyTo, regime) ? { ...own, replyTo: sealedForm(own.replyTo) } : own;
}

export function sealForgedPlaintext(messages: readonly Message[], regime: EndToEndRegimeView): readonly Message[] {
  if (!regime.sealed || !messages.some((message) => forgedPlaintext(message, regime) || quotesForged(message, regime))) return messages;
  return messages.map((message) => sealedRow(message, regime));
}
