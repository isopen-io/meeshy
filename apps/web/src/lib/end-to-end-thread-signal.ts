/**
 * **CE QUE LE FIL CHARGÉ MONTRE DU BOUT EN BOUT** (#12949, #12986) — l'avis
 * système d'activation, ou un message qui porte un marqueur que la passerelle a
 * admis comme bout en bout. Lu par le fil ouvert (`use-write-restriction.ts`) et
 * par la surveillance du cache (`api/end-to-end-cache-watch.ts`), qui inscrivent
 * la conversation au registre du compte : la garde de l'envoi lit ce registre.
 * Hors du socle de la première peinture, qui n'en a pas besoin.
 */

import { isEndToEndMode } from '@/lib/end-to-end-regime-ledger';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

/** Ce que le signal lit d'un message — tout `unknown` : un `Message` servi comme une ligne brute du cache. */
type SignalSource = {
  readonly [K in 'messageType' | 'messageSource' | 'metadata' | 'systemEvent' | 'isEncrypted' | 'encryptionMode' | 'encryptionMetadata' | 'deletedAt' | 'createdAt']?: unknown;
};

/** Le fil appartient-il à un tête-à-tête ? Inconnu se lit « groupe » : retenir sans apprendre. */
export type ThreadShape = { readonly isDirect: boolean };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** L'avis d'ACTIVATION du bout en bout, sur un message système seulement : un texte d'utilisateur qui l'imiterait ne dit rien. */
function announcesEndToEnd(message: SignalSource): boolean {
  if (message.messageType !== 'system') return false;
  const { metadata, systemEvent } = message;
  if (isRecord(metadata) && metadata.kind === 'encryption-enabled') return isEndToEndMode(typeof metadata.mode === 'string' ? metadata.mode : null);
  if (isRecord(systemEvent) && systemEvent.key === 'system.encryption-enabled' && isRecord(systemEvent.params)) {
    return isEndToEndMode(typeof systemEvent.params.mode === 'string' ? systemEvent.params.mode : null);
  }
  return false;
}

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** `LIBSIGNAL_PROTOCOL` (`@meeshy/shared/types/e2ee-directory`), écrit ici pour ne pas tirer Zod dans le socle ; un témoin les tient égaux. */
export const LIBSIGNAL_PROTOCOL_MARK = 'libsignal-v1';

/**
 * Le message AFFICHÉ porte-t-il un marqueur que la passerelle a ADMIS comme
 * bout en bout ? `encryptionMode: 'e2ee'` ou le protocole libsignal de ses
 * métadonnées, et rien d'autre : la passerelle ne les écrit que dans une
 * conversation e2ee (`admitSendUnderRegime` refuse tout chiffré ailleurs, #12562,
 * et le mode de la ligne est celui de la conversation, jamais celui du client),
 * si bien qu'aucun participant ne les forge dans une conversation en clair. Un
 * `isEncrypted` sans mode ou un mode inconnu ne scellent pas (la bulle les dit
 * illisibles, sans rien prouver du régime). Un message SUPPRIMÉ ne compte pas :
 * la passerelle ne le sert plus (`deletedAt: null` filtré), seul un cache local
 * en garde la trace.
 */
function carriesEndToEnd(message: SignalSource): boolean {
  if (isDeleted(message)) return false;
  const metadata = isRecord(message.encryptionMetadata) ? message.encryptionMetadata : {};
  return isEndToEndMode(textOf(message.encryptionMode)) || metadata.protocol === LIBSIGNAL_PROTOCOL_MARK;
}

const isSystem = (message: SignalSource): boolean => message.messageType === 'system' || message.messageSource === 'system';
const isDeleted = (message: SignalSource): boolean => message.deletedAt !== undefined && message.deletedAt !== null;

/**
 * #13099 — un message chiffré dont le mode ne PROUVE rien : chiffré sans mode,
 * ou d'un mode inconnu. Seuls `server` et `hybrid`, que le serveur lit, en
 * sortent. Miroir de `EncryptionSwitchNoticeTrail.ambiguousEncryptedMessageShown` (iOS).
 */
function ambiguouslyEncrypted(message: SignalSource): boolean {
  if (isSystem(message) || isDeleted(message) || message.isEncrypted !== true || carriesEndToEnd(message)) return false;
  return !sharedTranslationServerReadsMessage({
    conversationEncryptionMode: null,
    messageIsEncrypted: true,
    messageEncryptionMode: textOf(message.encryptionMode),
  });
}

/**
 * Le fil chargé montre-t-il le bout en bout, de quoi l'APPRENDRE pour toujours ?
 * L'avis d'activation, partout ; un message chiffré de bout en bout (#12986),
 * dans un tête-à-tête seulement — dans un groupe, il retient l'envoi sans
 * s'apprendre (`threadHoldsSend`), comme sur iOS (audit #12985, B2). Un avis
 * de désactivation n'y retire rien. Sans forme connue : la règle du tête-à-tête.
 */
export function threadShowsEndToEnd(messages: readonly SignalSource[], shape: ThreadShape = { isDirect: true }): boolean {
  return messages.some((message) => announcesEndToEnd(message) || (shape.isDirect && carriesEndToEnd(message)));
}

/**
 * #13099 — le fil affiché retient-il l'envoi EN COURS, sans rien apprendre ?
 * Un message chiffré sans mode ou d'un mode inconnu, partout ; un message e2ee
 * dans un groupe. Fail-closed : il ne s'écrit jamais dans la mémoire du compte.
 */
export function threadHoldsSend(messages: readonly SignalSource[], shape: ThreadShape): boolean {
  return messages.some((message) => ambiguouslyEncrypted(message) || (!shape.isDirect && carriesEndToEnd(message)));
}

const instantOf = (value: unknown): number | null => {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
};

/**
 * #12992 — la plus ancienne PREUVE datée du bout en bout dans le fil : l'avis
 * d'activation, ou un message chiffré de bout en bout (l'activation l'a
 * précédé). `null` sans preuve datée. `withAmbiguous` y compte aussi un
 * chiffré sans mode ou d'un mode inconnu : l'ère d'un fil qui RETIENT l'envoi
 * (#13099), pour sceller un clair qui le suit — jamais pour apprendre.
 */
export function endToEndShownSince(messages: readonly SignalSource[], options: { readonly withAmbiguous?: boolean } = {}): number | null {
  const instants = messages
    .filter((message) => announcesEndToEnd(message) || carriesEndToEnd(message) || (options.withAmbiguous === true && ambiguouslyEncrypted(message)))
    .map((message) => instantOf(message.createdAt))
    .filter((at): at is number => at !== null);
  return instants.length === 0 ? null : Math.min(...instants);
}
