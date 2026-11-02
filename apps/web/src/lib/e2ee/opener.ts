/**
 * L'OUVERTURE des enveloppes de CE navigateur (spec § 4.1 et § 4.3, #14592),
 * miroir de `E2EEEnvelopeOpener.swift`, par la socket (`e2ee:envelope`) ou par
 * le rattrapage `GET /e2ee/envelopes`. Le clair est rangé, scellé, DANS la
 * transaction du déchiffrement, puis l'enveloppe est acquittée — effacée du
 * serveur. Une enveloppe déjà ouverte (la socket et le rattrapage se croisent)
 * n'est pas redéchiffrée : un second déchiffrement échouerait (clé de message
 * consommée) et effacerait le clair.
 *
 * Le clair ne va QUE dans les enregistrements scellés : ni localStorage, ni
 * journal, ni cache de requêtes persistant.
 */
import type { E2EEServedEnvelope } from '@meeshy/shared/types/e2ee-directory';

import { Base64Error, fromBase64 } from './bytes';
import { belongsTo, decodeContent, E2EEContentError, isAuthoredBy, payloadKindOf, type E2EEContent } from './content';
import { E2EEEngineVerdict, RECORD_KINDS, type EngineAddress } from './engine';
import type { E2EEDirectoryClient } from './directory';
import type { RecordTransaction, RecordVault } from './record-vault';
import type { SessionCipher } from './session-cipher';

export type PlaintextEntry =
  | { readonly state: 'readable'; readonly content: E2EEContent; readonly senderUserId: string; readonly senderDeviceId: number }
  | { readonly state: 'undecryptable' }
  | { readonly state: 'signal'; readonly conversationId: string };

export type OpenOutcome =
  | { readonly kind: 'opened'; readonly messageId: string; readonly conversationId: string; readonly entry: Extract<PlaintextEntry, { state: 'readable' }> }
  | { readonly kind: 'undecryptable'; readonly messageId: string; readonly conversationId: string }
  /** Un signal (#13142) authentifié et rangé ; le navigateur ne l'applique pas encore (suivi consigné). */
  | { readonly kind: 'signal'; readonly messageId: string; readonly conversationId: string }
  | { readonly kind: 'not-for-this-device'; readonly envelopeId: string }
  | { readonly kind: 'deferred'; readonly envelopeId: string };

export const E2EE_ENVELOPE_PAGE_SIZE = 100;

class UnapprovedOwnDevice extends Error {}

const encoder = new TextEncoder();

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function decodePlaintextEntry(raw: Uint8Array | undefined): PlaintextEntry | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (!isRecord(value)) return null;
    if (value.state === 'undecryptable') return { state: 'undecryptable' };
    if (value.state === 'signal' && typeof value.conversationId === 'string') return { state: 'signal', conversationId: value.conversationId };
    if (value.state === 'readable' && typeof value.senderUserId === 'string' && typeof value.senderDeviceId === 'number' && isRecord(value.content)) {
      return {
        state: 'readable',
        content: decodeContent(encoder.encode(JSON.stringify(value.content))),
        senderUserId: value.senderUserId,
        senderDeviceId: value.senderDeviceId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const entryWrite = (messageId: string, entry: PlaintextEntry) => ({ kind: RECORD_KINDS.plaintext, key: messageId, value: encoder.encode(JSON.stringify(entry)) });

/** Une erreur qui JUGE l'enveloppe — par opposition au stockage, qui refuse « pas maintenant ». */
const isVerdict = (error: unknown): boolean => error instanceof E2EEEngineVerdict || error instanceof E2EEContentError || error instanceof Base64Error;

/** Un signal ne se range que s'il est à SA place : la conversation de l'enveloppe, et l'auteur que libsignal a authentifié. */
function checkSignal(plaintext: Uint8Array, envelope: E2EEServedEnvelope): void {
  const raw: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!isRecord(raw) || raw.conversationId !== envelope.conversationId) throw new E2EEContentError('misattributed');
  if (raw.authorUserId !== envelope.senderUserId || raw.authorDeviceId !== envelope.senderDeviceId) throw new E2EEContentError('misattributed-author');
}

export function createEnvelopeOpener(params: {
  readonly local: EngineAddress & { readonly registrationId: number };
  readonly cipher: SessionCipher;
  readonly vault: RecordVault;
  readonly directory: E2EEDirectoryClient;
  readonly warn?: (message: string) => void;
}) {
  const { local, cipher, vault, directory } = params;
  const warn = params.warn ?? (() => undefined);

  const outcomeOf = (envelope: E2EEServedEnvelope, entry: PlaintextEntry): OpenOutcome => {
    if (entry.state === 'readable') return { kind: 'opened', messageId: envelope.messageId, conversationId: envelope.conversationId, entry };
    if (entry.state === 'signal') return { kind: 'signal', messageId: envelope.messageId, conversationId: envelope.conversationId };
    return { kind: 'undecryptable', messageId: envelope.messageId, conversationId: envelope.conversationId };
  };

  const known = async (envelope: E2EEServedEnvelope): Promise<OpenOutcome | null> => {
    const entry = decodePlaintextEntry(await vault.read(RECORD_KINDS.plaintext, envelope.messageId));
    return entry ? outcomeOf(envelope, entry) : null;
  };

  const persist = (envelope: E2EEServedEnvelope) => (plaintext: Uint8Array, transaction: RecordTransaction): PlaintextEntry => {
    if (envelope.senderUserId === local.userId) {
      const pin = transaction.read(RECORD_KINDS.ownDevicePin, String(envelope.senderDeviceId));
      const identity = transaction.read(RECORD_KINDS.remoteIdentity, `${envelope.senderUserId}.${envelope.senderDeviceId}`);
      if (!pin || !identity || pin.length !== identity.length || !pin.every((byte, index) => byte === identity[index])) throw new UnapprovedOwnDevice();
    }
    if (payloadKindOf(plaintext) === 'signal') {
      checkSignal(plaintext, envelope);
      const entry: PlaintextEntry = { state: 'signal', conversationId: envelope.conversationId };
      transaction.stage([entryWrite(envelope.messageId, entry)]);
      return entry;
    }
    const content = decodeContent(plaintext);
    if (!belongsTo(content, envelope.conversationId)) throw new E2EEContentError('misattributed');
    if (!isAuthoredBy(content, envelope.senderUserId, envelope.senderDeviceId)) throw new E2EEContentError('misattributed-author');
    const entry: PlaintextEntry = { state: 'readable', content, senderUserId: envelope.senderUserId, senderDeviceId: envelope.senderDeviceId };
    transaction.stage([entryWrite(envelope.messageId, entry)]);
    return entry;
  };

  const open = async (envelope: E2EEServedEnvelope): Promise<OpenOutcome> => {
    if (envelope.recipientRegistrationId !== 0 && envelope.recipientRegistrationId !== local.registrationId) {
      return { kind: 'not-for-this-device', envelopeId: envelope.id };
    }
    const already = await known(envelope);
    if (already) return already;
    if (envelope.senderUserId === local.userId && !(await vault.read(RECORD_KINDS.ownDevicePin, String(envelope.senderDeviceId)))) {
      return { kind: 'deferred', envelopeId: envelope.id };
    }
    try {
      const entry = await cipher.decrypt(
        { type: envelope.type, body: fromBase64(envelope.body) },
        { userId: envelope.senderUserId, deviceId: envelope.senderDeviceId },
        persist(envelope),
      );
      return outcomeOf(envelope, entry);
    } catch (error) {
      const raced = await known(envelope);
      if (raced) return raced;
      if (error instanceof UnapprovedOwnDevice) return { kind: 'deferred', envelopeId: envelope.id };
      if (!isVerdict(error)) {
        warn(`e2ee envelope deferred id=${envelope.id}: storage refused`);
        return { kind: 'deferred', envelopeId: envelope.id };
      }
      warn(`e2ee envelope undecryptable id=${envelope.id} type=${envelope.type}`);
      await vault.transact(({ stage }) => stage([entryWrite(envelope.messageId, { state: 'undecryptable' })]));
      return { kind: 'undecryptable', messageId: envelope.messageId, conversationId: envelope.conversationId };
    }
  };

  /** Une enveloppe ouverte, ou définitivement illisible, s'efface du serveur ; celle d'une autre génération reste. */
  const acknowledge = async (opened: readonly (readonly [E2EEServedEnvelope, OpenOutcome])[]) => {
    const ids = opened.flatMap(([envelope, outcome]) => (outcome.kind === 'deferred' || outcome.kind === 'not-for-this-device' ? [] : [envelope.id]));
    if (ids.length === 0) return;
    try {
      await directory.acknowledge(ids);
    } catch {
      warn(`e2ee envelope ack failed count=${ids.length}; retried at the next catch-up`);
    }
  };

  return {
    open,
    async receive(envelope: E2EEServedEnvelope): Promise<OpenOutcome> {
      const outcome = await open(envelope);
      await acknowledge([[envelope, outcome]]);
      return outcome;
    },
    async catchUp(): Promise<readonly OpenOutcome[]> {
      const outcomes: OpenOutcome[] = [];
      let cursor: string | null = null;
      do {
        const page = await directory.envelopes(cursor, E2EE_ENVELOPE_PAGE_SIZE);
        const opened: (readonly [E2EEServedEnvelope, OpenOutcome])[] = [];
        for (const envelope of page.envelopes) opened.push([envelope, await open(envelope)] as const);
        await acknowledge(opened);
        outcomes.push(...opened.map(([, outcome]) => outcome));
        cursor = page.envelopes.length === 0 ? null : page.nextCursor;
      } while (cursor !== null);
      return outcomes;
    },
    /** Le clair rangé d'un message, s'il a été ouvert sur cet appareil. */
    entry: async (messageId: string): Promise<PlaintextEntry | null> => decodePlaintextEntry(await vault.read(RECORD_KINDS.plaintext, messageId)),
  };
}

export type EnvelopeOpener = ReturnType<typeof createEnvelopeOpener>;
