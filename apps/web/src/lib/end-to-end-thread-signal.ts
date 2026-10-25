/**
 * **CE QUE LE FIL CHARGÉ MONTRE DU BOUT EN BOUT** (#12949, #12986) — l'avis
 * système d'activation, ou un message qui porte un marqueur que la passerelle a
 * admis comme bout en bout. Lu par le fil ouvert (`use-write-restriction.ts`) et
 * par la surveillance du cache (`api/end-to-end-cache-watch.ts`), qui inscrivent
 * la conversation au registre du compte : la garde de l'envoi lit ce registre.
 * Hors du socle de la première peinture, qui n'en a pas besoin.
 */

import { isEndToEndMode } from '@/lib/end-to-end-regime-ledger';

/** Ce que le signal lit d'un message — tout `unknown` : un `Message` servi comme une ligne brute du cache. */
type SignalSource = { readonly [K in 'messageType' | 'metadata' | 'systemEvent' | 'encryptionMode' | 'encryptionMetadata' | 'deletedAt']?: unknown };

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
  if (message.deletedAt !== undefined && message.deletedAt !== null) return false;
  const metadata = isRecord(message.encryptionMetadata) ? message.encryptionMetadata : {};
  return isEndToEndMode(textOf(message.encryptionMode)) || metadata.protocol === LIBSIGNAL_PROTOCOL_MARK;
}

/**
 * Le fil chargé montre-t-il le bout en bout ? L'avis d'activation, ou un
 * message chiffré de bout en bout (#12986). Un avis de désactivation n'y retire rien.
 */
export function threadShowsEndToEnd(messages: readonly SignalSource[]): boolean {
  return messages.some((message) => announcesEndToEnd(message) || carriesEndToEnd(message));
}
