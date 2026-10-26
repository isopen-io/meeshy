import type { Message } from '@/lib/api/types';
import { endToEndRegimeLedger, endToEndSealed as conversationSealed, isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';
import { endToEndShownSince, threadHoldsSend, threadShowsEndToEnd } from '@/lib/end-to-end-thread-signal';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';
import { clearPrintOf } from '@/lib/clear-print';

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
export type EndToEndRegimeView = {
  readonly sealed: boolean;
  readonly since: number;
  /**
   * Les empreintes des clairs que ce navigateur avait vus avant d'apprendre le
   * bout en bout (revues #12992, `clearPrintOf`) : seuls eux se lisent « d'avant
   * l'activation », mot pour mot. `null` :
   * aucune photographie (régime servi ou montré par le seul fil, pas encore
   * appris) — fermé, aucun clair ne se lit.
   */
  readonly clearKnown: ReadonlySet<string> | null;
};

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
    /** Tête-à-tête : un message e2ee du fil prouve le régime ; ailleurs il le retient (#13099). */
    readonly isDirect?: boolean | undefined;
  },
  state: Pick<EndToEndRegimeState, 'sealed' | 'since'> & Partial<Pick<EndToEndRegimeState, 'held' | 'clearKnown'>> = endToEndRegimeLedger.getState(),
  now: number = Date.now(),
): EndToEndRegimeView {
  const shape = { isDirect: input.isDirect === true };
  const trail = input.trail ?? [];
  const sealed =
    conversationSealed(state, { conversationId: input.conversationId, servedMode: input.servedMode }) ||
    threadShowsEndToEnd(trail, shape) ||
    threadHoldsSend(trail, shape);
  const known = state.clearKnown?.[input.conversationId];
  const evidence = [
    isEndToEndMode(input.servedMode) ? instantOf(input.servedSince) : null,
    state.since[input.conversationId] ?? null,
    endToEndShownSince(trail, { withAmbiguous: true }),
  ].filter((at): at is number => at !== null);
  return { sealed, since: Math.min(now, ...evidence), clearKnown: known === undefined ? null : new Set(known) };
}

/**
 * Le message se LIT par le serveur — en clair, ou chiffré par lui (`server`,
 * `hybrid`) — dans une conversation chiffrée de bout en bout, où la passerelle
 * refuse tout message qu'elle lirait (#11216, #12562) : il ne peut venir que
 * d'elle. Seul un message SYSTÈME (rendu à part, jamais sous le nom d'un
 * participant) et un supprimé en sortent ; tout autre `messageSource` (agent,
 * annonce, application) se rend comme une bulle et suit la loi (audit). Une
 * date illisible ne le sauve pas. Daté d'avant l'ère, il ne se lit que si ce
 * navigateur le tenait déjà, MOT POUR MOT, quand il a appris le bout en bout
 * (`clearPrintOf` : l'identifiant et ce qu'il disait) — la date vient du
 * serveur, qui peut antidater, et l'identifiant aussi.
 */
export function isForgedPlaintext(message: Message, regime: EndToEndRegimeView): boolean {
  if (!regime.sealed || endToEndSealed(message)) return false;
  if (message.deletedAt !== undefined && message.deletedAt !== null) return false;
  if (message.messageSource === 'system' || message.messageType === 'system') return false;
  const at = instantOf(message.createdAt);
  if (at === null || at >= regime.since) return true;
  const print = clearPrintOf(message);
  return regime.clearKnown === null || print === null || !regime.clearKnown.has(print);
}

/** Le littéral que la passerelle sert pour un message qu'elle ne lit pas. */
export const SEALED_CONTENT = '[Encrypted]';

/**
 * Ce qu'un message scellé GARDE : son identité, sa place et ses compteurs —
 * une LISTE BLANCHE (audit) : un champ que la passerelle ajouterait à la
 * racine (lieu, story citée, liens suivis, mentions, provenance d'un
 * transfert) ne survit pas au scellement.
 */
const SEALED_KEEPS = [
  'id', 'conversationId', 'senderId', 'sender', 'anonymousSender', 'originalLanguage', 'messageType', 'messageSource',
  'isEdited', 'editedAt', 'editedById', 'editedByRole', 'deletedAt', 'replyToId', 'replyTo',
  'effectFlags', 'expiresAt', 'ephemeralDuration', 'isViewOnce', 'maxViewOnceCount', 'viewOnceCount', 'consumedByMe', 'isFullyConsumed', 'isBlurred', 'viewOnceConsumed',
  'pinnedAt', 'pinnedBy', 'deliveredToAllAt', 'readByAllAt', 'deliveredCount', 'readCount', 'recipientCount', 'reactionSummary', 'reactionCount',
  'createdAt', 'updatedAt', 'timestamp',
] as const satisfies readonly (keyof Message)[];

function sealedForm(message: Message): Message {
  const kept = Object.fromEntries(SEALED_KEEPS.filter((key) => key in message).map((key) => [key, message[key]]));
  /* Tous les champs requis de `Message` sont dans la liste blanche ou posés ici. */
  return { ...kept, content: SEALED_CONTENT, isEncrypted: true, translations: [] } as unknown as Message;
}

/**
 * **LA LOI UNIQUE DU CLAIR FORGÉ** (#12992) — appliquée au fil (`useThreadData`),
 * à l'aperçu d'appui long (`conversation-peek-card.tsx`) et à la ligne de liste
 * (`previewInputOf`) — et à la citation qu'un message porte : un clair forgé y prend la forme d'un message chiffré
 * sans mode — scellé partout où `endToEndSealed` est lu, sans texte, sans
 * traduction, sans pièce, sans lieu ni sticker. Rien à sceller ⇒ le MÊME
 * tableau (aucun rendu de plus).
 */
const quotesForged = (message: Message, regime: EndToEndRegimeView): boolean => message.replyTo !== undefined && isForgedPlaintext(message.replyTo, regime);

function sealedRow(message: Message, regime: EndToEndRegimeView): Message {
  const own = isForgedPlaintext(message, regime) ? sealedForm(message) : message;
  return own.replyTo !== undefined && isForgedPlaintext(own.replyTo, regime) ? { ...own, replyTo: sealedForm(own.replyTo) } : own;
}

export function sealForgedPlaintext(messages: readonly Message[], regime: EndToEndRegimeView): readonly Message[] {
  if (!regime.sealed || !messages.some((message) => isForgedPlaintext(message, regime) || quotesForged(message, regime))) return messages;
  return messages.map((message) => sealedRow(message, regime));
}
