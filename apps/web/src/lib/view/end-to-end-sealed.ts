import type { Message } from '@/lib/api/types';
import { endToEndRegimeLedger, endToEndSealed as conversationSealed, isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';
import { endToEndShownSince, threadHoldsSend, threadShowsEndToEnd } from '@/lib/end-to-end-thread-signal';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';
import { authoredOf, clearPrintOf } from '@/lib/clear-print';

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
 * participant) et un supprimé en sortent — jamais une CITATION, qui se rend
 * sous le nom de l'interlocuteur (revue). Tout autre `messageSource` (agent,
 * annonce, application) se rend comme une bulle et suit la loi. Une date
 * illisible ne le sauve pas. Daté d'avant l'ère, il ne se lit que si ce
 * navigateur tenait déjà, quand il a appris le bout en bout, ce que son auteur
 * avait posé (`clearPrintOf`) — la date vient du serveur, qui peut antidater,
 * et l'identifiant aussi.
 *
 * `readable` : hors de la loi. `sealed` : se montre scellé — un clair forgé, ou
 * un message qui se dit chiffré (on n'en garde que l'identité : ni lieu ni
 * story citée à côté d'un contenu illisible). `verified` : un clair d'avant
 * l'ère reconnu, rendu avec ce que l'empreinte vérifie (`verifiedForm`).
 */
type Verdict = 'readable' | 'sealed' | 'verified';

function verdictOf(message: Message, regime: EndToEndRegimeView, quoted = false): Verdict {
  if (!regime.sealed) return 'readable';
  if (endToEndSealed(message)) return 'sealed';
  if (!quoted && message.deletedAt !== undefined && message.deletedAt !== null) return 'readable';
  if (!quoted && (message.messageSource === 'system' || message.messageType === 'system')) return 'readable';
  const at = instantOf(message.createdAt);
  if (at === null || at >= regime.since || regime.clearKnown === null) return 'sealed';
  const print = clearPrintOf(message);
  return print !== null && regime.clearKnown.has(print) ? 'verified' : 'sealed';
}

/** Le message (ou la ligne de liste) se montre-t-il scellé dans ce régime ? */
export const isForgedPlaintext = (message: Message, regime: EndToEndRegimeView): boolean => verdictOf(message, regime) === 'sealed';

/** Un clair d'avant l'ère reconnu par son empreinte (#12992, revue) : il ne se rend qu'avec ce qu'elle vérifie. */
export const isVerifiedPlaintext = (message: Message, regime: EndToEndRegimeView): boolean => verdictOf(message, regime) === 'verified';

/** Le littéral que la passerelle sert pour un message qu'elle ne lit pas. */
export const SEALED_CONTENT = '[Encrypted]';

/**
 * Ce qu'un message montré scellé ou vérifié GARDE hors de ce que l'auteur a
 * posé : sa place, son état et ses compteurs, sans contenu — une LISTE
 * BLANCHE (revues) : un champ que la passerelle ajouterait (lieu, story citée,
 * liens suivis, mentions, provenance) ne passe pas.
 */
const STATE_KEEPS = [
  'id', 'conversationId', 'senderId', 'anonymousSender', 'messageType', 'messageSource', 'originalLanguage', 'replyToId',
  'isEdited', 'editedAt', 'editedById', 'editedByRole', 'deletedAt',
  'effectFlags', 'expiresAt', 'ephemeralDuration', 'isViewOnce', 'maxViewOnceCount', 'viewOnceCount', 'consumedByMe', 'isFullyConsumed', 'isBlurred', 'viewOnceConsumed',
  'pinnedAt', 'pinnedBy', 'deliveredToAllAt', 'readByAllAt', 'deliveredCount', 'readCount', 'recipientCount', 'reactionCount',
  'createdAt', 'updatedAt', 'timestamp',
] as const satisfies readonly (keyof Message)[];

const pick = (message: Message, keys: readonly string[]): Record<string, unknown> => {
  const source = message as unknown as Readonly<Record<string, unknown>>;
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
};

/** Une clé de résumé de réactions est un emoji, jamais un texte que le lecteur d'écran prononcerait. */
const EMOJI_KEY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u200d\ufe0f\u20e3#*0-9])+$/u;

const reactionsOf = (message: Message): Record<string, unknown> => {
  const summary = message.reactionSummary;
  if (summary === undefined || summary === null) return {};
  return { reactionSummary: Object.fromEntries(Object.entries(summary).filter(([key]) => key.length <= 32 && EMOJI_KEY.test(key))) };
};

/** L'expéditeur joint ne se garde que s'il EST l'auteur que l'identifiant nomme. */
const senderOf = (message: Message): Record<string, unknown> =>
  message.sender !== undefined && message.sender !== null && message.sender.id === message.senderId ? { sender: message.sender } : {};

/** La forme commune : état sans contenu, expéditeur vérifié, réactions réduites aux emoji. */
const stateOf = (message: Message): Record<string, unknown> => ({ ...pick(message, STATE_KEEPS), ...senderOf(message), ...reactionsOf(message) });

function sealedForm(message: Message): Message {
  const mode = endToEndSealed(message) && typeof message.encryptionMode === 'string' ? { encryptionMode: message.encryptionMode } : {};
  /* Tous les champs requis de `Message` sont dans l'état gardé ou posés ici. */
  return { ...stateOf(message), ...mode, content: SEALED_CONTENT, isEncrypted: true, translations: [] } as unknown as Message;
}

/**
 * Un clair reconnu par son empreinte se rend avec son état et ce que l'auteur
 * avait posé, tel que l'empreinte le VÉRIFIE (`authoredOf`) : ni traduction,
 * ni transcription, ni champ ajouté à côté. Il se lit dans sa langue d'origine.
 */
function verifiedForm(message: Message): Message {
  return { ...stateOf(message), ...authoredOf(message), isEncrypted: message.isEncrypted, translations: [] } as unknown as Message;
}

/** Ce qu'une ligne montre de ce message : lui-même, sa forme vérifiée ou sa forme scellée. */
export function shownForm(message: Message, regime: EndToEndRegimeView, quoted = false): Message {
  const verdict = verdictOf(message, regime, quoted);
  if (verdict === 'sealed') return sealedForm(message);
  return verdict === 'verified' ? verifiedForm(message) : message;
}

/**
 * **LA LOI UNIQUE DU CLAIR FORGÉ** (#12992) — appliquée au fil (`useThreadData`),
 * à l'aperçu d'appui long (`conversation-peek-card.tsx`) et à la ligne de liste
 * (`previewInputOf`) — et à la citation qu'un message porte : un clair forgé y prend la forme d'un message chiffré
 * sans mode — scellé partout où `endToEndSealed` est lu, sans texte, sans
 * traduction, sans pièce, sans lieu ni sticker. Rien à sceller ⇒ le MÊME
 * tableau (aucun rendu de plus).
 */
function sealedRow(message: Message, regime: EndToEndRegimeView): Message {
  const own = shownForm(message, regime);
  const quote = message.replyTo;
  if (quote === undefined || quote === null) return own;
  const quoted = shownForm(quote, regime, true);
  return own === message && quoted === quote ? message : { ...own, replyTo: quoted };
}

export function sealForgedPlaintext(messages: readonly Message[], regime: EndToEndRegimeView): readonly Message[] {
  if (!regime.sealed) return messages;
  const shown = messages.map((message) => sealedRow(message, regime));
  return shown.every((message, index) => message === messages[index]) ? messages : shown;
}
