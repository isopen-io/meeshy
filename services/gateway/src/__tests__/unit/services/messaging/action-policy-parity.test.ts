/**
 * PARITÉ (#11205) — les vecteurs de la loi des actions partagée
 * (`packages/shared/fixtures/action-policy/`) rejoués contre ce qui fait foi :
 * `admitMessageEdit`, `admitMessageDelete`, `ReactionService.addReaction`, la
 * chaîne de `messages-pin.ts` (accès, `admitMessagePin`,
 * `refusesMinorInConversationOfType`, `refusesContentGesture` — #11219) et
 * `verifierCible` (signaler — #11220) et `actorHasMinimumRole`, avec des
 * doubles qui rendent les lignes du vecteur.
 * INCLUSION toujours (le client n'offre jamais ce que la passerelle refuse) ;
 * ÉGALITÉ pour modifier, supprimer, réagir et épingler sauf où le vecteur
 * déclare `clientStricter`. Aucun code de production n'est touché.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../../services/messaging/messageReadAccess', () => ({
  ...(jest.requireActual('../../../../services/messaging/messageReadAccess') as object),
  loadMessageReadableByParticipant: async () => ({ id: 'source', conversationId: 'conv-source' }),
}));

import { serverReadsAttachmentCarrier } from '../../../../services/attachments/attachmentCarrierServerReadable';
import { admitMessageForward } from '../../../../services/messaging/forwardAdmission';
import { ReactionService } from '../../../../services/ReactionService';
import { refusesContentGesture } from '../../../../services/messaging/captureNoticeVisibility';
import { refusesMinorInConversationOfType } from '../../../../services/messaging/globalMinorGate';
import { admitMessagePin, type MessagePinReader } from '../../../../services/messaging/messagePinAdmission';
import { verifierCible } from '../../../../routes/reports/target';
import { admitMessageDelete, type DeleteAdmissionReader } from '../../../../services/messaging/messageDeleteAdmission';
import { admitMessageEdit, type EditAdmissionReader } from '../../../../services/messaging/messageEditAdmission';
import { mayMintShareLink } from '../../../../routes/links/utils/share-link-mint';
import { actorHasMinimumRole } from '../../../../utils/conversation-authority';
import type { ConversationActionInput, ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';
import type { ActionViewer, MessageActionInput, MessageActions } from '@meeshy/shared/utils/message-action-policy';

type MessageVector = { readonly _label: string; readonly clientStricter?: readonly ('edit' | 'delete' | 'react' | 'pin')[]; readonly input: MessageActionInput; readonly expected: MessageActions };

type ConversationVector = { readonly _label: string; readonly input: ConversationActionInput; readonly expected: ConversationActions };

const FIXTURES = resolve(__dirname, '../../../../../../../packages/shared/fixtures/action-policy');

const vectorsOf = <T>(name: string): readonly T[] =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${name}.vectors.json`), 'utf-8')).vectors;

const CONVERSATION_ID = '65f0000000000000000000c1';
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const birthDateOf = (viewer: ActionViewer, now: number): Date | null => (viewer.isDeclaredMinor ? new Date(now - 15 * YEAR_MS) : null);

/** Les lignes que la base rendrait pour ce lecteur : un invité n'a pas de `User`, donc aucune ligne par `userId`. */
function membershipOf(viewer: ActionViewer) {
  return viewer.hasAccount && viewer.isActiveMember
    ? { id: viewer.participantId ?? 'part-viewer', role: viewer.conversationRole, user: { role: viewer.platformRole } }
    : null;
}

function editReader(vector: MessageVector): EditAdmissionReader {
  const { viewer, now } = vector.input;
  return {
    user: { findUnique: async () => (viewer.hasAccount ? { role: viewer.platformRole, birthDate: birthDateOf(viewer, now) } : null) },
    participant: { findFirst: async () => membershipOf(viewer) },
  };
}

function deleteReader(vector: MessageVector): DeleteAdmissionReader {
  const { viewer, conversation, message } = vector.input;
  return {
    user: { findUnique: async () => (viewer.hasAccount ? { role: viewer.platformRole } : null) },
    participant: { findFirst: async () => membershipOf(viewer) },
    conversation: { findUnique: async () => ({ type: conversation.type }) },
    message: { findUnique: async () => ({ senderId: message.capturedMessageIsMine === true ? (viewer.participantId ?? 'part-viewer') : 'part-someone-else' }) },
  };
}

/** La ligne que `addReaction` relit, et une réaction déjà posée : la passerelle juge, puis rend sans rien écrire. */
function reactionReader(vector: MessageVector) {
  const { message, conversation, viewer } = vector.input;
  const participantId = viewer.participantId ?? viewer.id;
  const row = {
    id: message.id,
    conversationId: CONVERSATION_ID,
    senderId: message.senderId ?? null,
    deletedAt: message.deletedAt == null ? null : new Date(message.deletedAt),
    messageType: message.messageType ?? 'text',
    sender: { userId: message.authorUserId ?? null },
    conversation: {
      isActive: conversation.isActive,
      closedAt: conversation.closedAt == null ? null : new Date(conversation.closedAt),
      participants: viewer.isActiveMember ? [{ id: participantId, userId: viewer.hasAccount ? viewer.id : null }] : [],
    },
  };
  const posted = { id: 'reaction-1', messageId: message.id, participantId, emoji: '👍', createdAt: new Date(0), updatedAt: new Date(0) };
  return { participantId, prisma: { message: { findUnique: async () => row }, reaction: { findFirst: async () => posted } } };
}

const messageVectors = vectorsOf<MessageVector>('message-actions');
const conversationVectors = vectorsOf<ConversationVector>('conversation-actions');

describe('parité des actions sur un message — admitMessageEdit / admitMessageDelete', () => {
  it('les vecteurs sont chargés, et certains déclarent un client plus strict', () => {
    expect(messageVectors.length).toBeGreaterThan(20);
    expect(messageVectors.some((vector) => vector.clientStricter?.includes('edit'))).toBe(true);
    expect(messageVectors.some((vector) => vector.expected.verdicts.edit !== null)).toBe(true);
    expect(messageVectors.some((vector) => vector.expected.verdicts.remove !== null)).toBe(true);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('modifier : %s', async (_label, vector) => {
    const { message, conversation, viewer, now } = vector.input;
    const admission = await admitMessageEdit({
      prisma: editReader(vector),
      editorUserId: viewer.id,
      message: {
        authorUserId: message.authorUserId,
        conversationId: CONVERSATION_ID,
        // Le régime de la conversation voyage aussi : sans lui, la passerelle ne refusait jamais
        // l'édition d'un message server/hybrid ici, et la divergence de la loi restait verte (#11381).
        conversation: {
          isActive: conversation.isActive,
          closedAt: conversation.closedAt == null ? null : new Date(conversation.closedAt),
          type: conversation.type,
          encryptionMode: conversation.encryptionMode ?? null,
        },
        createdAt: message.createdAt == null ? null : new Date(message.createdAt),
        messageType: message.messageType,
        metadata: message.metadata,
      },
      now,
    });
    const offered = vector.expected.verdicts.edit;

    if (offered !== null) expect(admission).toEqual(expect.objectContaining({ admitted: true, asModerator: offered.asModerator }));
    if (!vector.clientStricter?.includes('edit')) expect(admission.admitted).toBe(offered !== null);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('supprimer : %s', async (_label, vector) => {
    const { message, viewer } = vector.input;
    const admission = await admitMessageDelete({
      prisma: deleteReader(vector),
      deleterUserId: viewer.id,
      message: { authorUserId: message.authorUserId, conversationId: CONVERSATION_ID, messageType: message.messageType, metadata: message.metadata },
    });
    const { deleteForEveryone, remove } = vector.expected.verdicts;
    const removes = remove !== null;

    if (deleteForEveryone) expect([admission.admitted, admission.byModeration === true]).toEqual([true, false]);
    if (removes) expect([admission.admitted, admission.byModeration === true]).toEqual([true, true]);
    if (!vector.clientStricter?.includes('delete')) expect(admission.admitted).toBe(deleteForEveryone || removes);
  });
});

describe('parité des actions sur un message — ReactionService.addReaction et les gardes de l’épingle', () => {
  it('les vecteurs couvrent une réaction sans droit d’écrire, une épingle refusée au mineur de Global et à l’abonné d’un canal d’annonces', () => {
    expect(messageVectors.some((vector) => vector.expected.verdicts.canReact && !vector.expected.verdicts.canReply)).toBe(true);
    expect(messageVectors.some((vector) => vector.input.conversation.type === 'global' && vector.input.viewer.isDeclaredMinor && vector.expected.verdicts.pin === null)).toBe(true);
    expect(messageVectors.some((vector) => vector.input.conversation.isAnnouncementChannel === true && vector.expected.verdicts.pin === null && !vector.clientStricter?.includes('pin'))).toBe(true);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('réagir : %s', async (_label, vector) => {
    const { participantId, prisma } = reactionReader(vector);
    const admitted = await new ReactionService(prisma as never, null)
      .addReaction({ messageId: vector.input.message.id, participantId, emoji: '👍' })
      .then(() => true, () => false);
    const offered = vector.expected.verdicts.canReact;

    if (offered) expect(admitted).toBe(true);
    if (!vector.clientStricter?.includes('react')) expect(admitted).toBe(offered);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('épingler : %s', async (_label, vector) => {
    const offered = vector.expected.verdicts.pin !== null;
    const admitted = await gatewayPins(vector);

    if (offered) expect(admitted).toBe(true);
    if (!vector.clientStricter?.includes('pin')) expect(admitted).toBe(offered);
  });
});

/** La ligne de participation que `admitMessagePin` relit : rang, permission d'envoi de l'invité, rôle de plateforme. */
function pinReader(vector: MessageVector): MessagePinReader {
  const { viewer } = vector.input;
  const row = {
    role: viewer.conversationRole,
    permissions: viewer.canSendMessages ? null : ({ canSendMessages: false } as never),
    anonymousSession: null,
    user: viewer.hasAccount ? { role: viewer.platformRole } : null,
  };
  return { participant: { findFirst: async () => (viewer.isActiveMember ? row : null) } };
}

/** `PUT`/`DELETE …/pin`, dans l'ordre de la route : existence, accès, porte d'écriture, mineur de Global, avis de capture (épingler seulement). */
async function gatewayPins(vector: MessageVector): Promise<boolean> {
  const { message, conversation, viewer, now } = vector.input;
  if (message.deletedAt != null || !viewer.isActiveMember) return false;
  const guest = !viewer.hasAccount || viewer.isAnonymous;
  const admission = await admitMessagePin(pinReader(vector), {
    conversation: {
      type: conversation.type,
      isActive: conversation.isActive ?? null,
      closedAt: conversation.closedAt == null ? null : new Date(conversation.closedAt),
      isAnnouncementChannel: conversation.isAnnouncementChannel ?? null,
      defaultWriteRole: conversation.defaultWriteRole ?? null,
    },
    conversationId: CONVERSATION_ID,
    caller: { userId: viewer.id, participantId: guest ? viewer.participantId ?? viewer.id : undefined, isAnonymous: guest },
    now: new Date(now),
  });
  if (!admission.admitted) return false;
  const minorRefused = await refusesMinorInConversationOfType(
    { user: { findUnique: async () => ({ birthDate: birthDateOf(viewer, now) }) } } as never,
    { conversationType: conversation.type, userId: viewer.hasAccount ? viewer.id : null, now: new Date(now) },
  );
  const pinning = message.pinnedAt == null;
  return !minorRefused && !(pinning && refusesContentGesture({ messageType: message.messageType ?? null, metadata: message.metadata }));
}

/** `POST /reports` sur un message : la cible existe, le signalant participe, et ce n'est pas le sien. */
async function gatewayAcceptsReport(vector: MessageVector): Promise<boolean> {
  const { message, viewer } = vector.input;
  const registered = viewer.hasAccount && !viewer.isAnonymous;
  const prisma = {
    message: { findUnique: async () => ({ conversationId: CONVERSATION_ID, senderId: message.senderId ?? null, sender: { userId: message.authorUserId ?? null } }) },
    participant: { findFirst: async () => (viewer.isActiveMember ? { id: viewer.participantId ?? viewer.id } : null) },
  };
  const verdict = await verifierCible({
    prisma: prisma as never,
    signalant: registered ? { userId: viewer.id } : { participantId: viewer.participantId ?? viewer.id },
    type: 'message',
    entityId: '65f0000000000000000000d1',
  });
  return verdict.atteignable;
}

describe('parité des actions sur un message — signaler (verifierCible)', () => {
  it('les vecteurs couvrent un message du lecteur que la loi ne propose pas de signaler', () => {
    expect(messageVectors.some((vector) => vector.input.message.authorUserId === vector.input.viewer.id && !vector.expected.verdicts.report)).toBe(true);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('signaler : %s', async (_label, vector) => {
    const { message, viewer } = vector.input;
    const accepted = await gatewayAcceptsReport(vector);
    const authored = (viewer.hasAccount && !viewer.isAnonymous && message.authorUserId === viewer.id) || message.senderId === (viewer.participantId ?? viewer.id);

    if (vector.expected.verdicts.report) expect(accepted).toBe(true);
    if (authored) expect([accepted, vector.expected.verdicts.report]).toEqual([false, false]);
  });
});

/** La ligne que `admitReadableSource` relit pour juger le transfert de cette source. */
function forwardSourceReader(vector: MessageVector) {
  const { message, conversation } = vector.input;
  const pieces = (message.attachments ?? []).filter((piece) => piece != null);
  const row = {
    isViewOnce: message.isViewOnce ?? false,
    isBlurred: message.isBlurred ?? false,
    effectFlags: message.effectFlags ?? 0,
    ephemeralDuration: message.ephemeralDuration ?? null,
    expiresAt: message.expiresAt == null ? null : new Date(message.expiresAt),
    isEncrypted: message.isEncrypted ?? false,
    encryptionMode: message.encryptionMode ?? null,
    conversation: { encryptionEnabledAt: null, encryptionMode: conversation.encryptionMode ?? null },
    attachments: pieces.map((piece, index) => ({
      id: `att-${index}`, isViewOnce: piece.isViewOnce ?? false, isBlurred: piece.isBlurred ?? false,
      effectFlags: piece.effectFlags ?? 0, isEncrypted: false, encryptionMode: null,
    })),
    _count: { attachments: pieces.length },
    messageType: message.messageType ?? null,
    metadata: message.metadata ?? null,
  };
  return { message: { findUnique: async () => row } };
}

/** Une source sans texte ni pièces (sticker, lieu, sondage) se renvoie avec son propre corps ; une source de pièces seules n'existe que par la copie serveur. */
async function gatewayForwards(vector: MessageVector): Promise<boolean> {
  const { message, now } = vector.input;
  const admission = await admitMessageForward(forwardSourceReader(vector) as never, {
    forwardedFromId: message.id,
    senderParticipantId: 'part-viewer',
    at: new Date(now),
    bodyOnlyFromSource: (message.content ?? '').trim() === '' && (message.attachments ?? []).length > 0,
    bringsOwnPieces: false,
  });
  return admission.admitted && !admission.sourceUnavailable;
}

const SERVER_READABLE_MODES: readonly string[] = ['server', 'hybrid'];

describe('parité des actions sur un message — transférer (admitMessageForward)', () => {
  it('les vecteurs couvrent des pièces sous régime server et hybrid, que la passerelle ne recopie pas', () => {
    const refused = messageVectors.filter((vector) => SERVER_READABLE_MODES.includes(vector.input.conversation.encryptionMode ?? '') && (vector.input.message.attachments ?? []).length > 0);
    expect(refused.map((vector) => vector.input.conversation.encryptionMode)).toEqual(expect.arrayContaining(['server', 'hybrid']));
    expect(refused.every((vector) => !vector.expected.verdicts.forward)).toBe(true);
  });

  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('transférer : %s', async (_label, vector) => {
    const admitted = await gatewayForwards(vector);
    const offered = vector.expected.verdicts.forward;
    const live = !vector.expected.content.flags.optimistic && !vector.expected.content.flags.failed && vector.expected.content.kind !== 'deleted';

    if (offered) expect(admitted).toBe(true);
    if (live && SERVER_READABLE_MODES.includes(vector.input.conversation.encryptionMode ?? '') && vector.expected.content.kind !== 'system') expect(admitted).toBe(offered);
  });
});

describe('parité des actions sur un message — transcrire (serverReadsAttachmentCarrier)', () => {
  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('transcrire : %s', async (_label, vector) => {
    const { message, conversation } = vector.input;
    const carrier = { message: { findUnique: async () => ({ isEncrypted: message.isEncrypted ?? null, encryptionMode: message.encryptionMode ?? null, conversation: { encryptionMode: conversation.encryptionMode ?? null } }) } };
    const serverReads = await serverReadsAttachmentCarrier(carrier as never, message.id);
    const { transcribe } = vector.expected.verdicts;

    expect(transcribe === null).toBe(!serverReads);
    if (transcribe === true) expect(vector.expected.content.kind).toBe('audio');
  });
});

describe('parité des actions sur une conversation — actorHasMinimumRole, mayMintShareLink, POST /leave', () => {
  it.each(conversationVectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    const { conversation, viewer } = vector.input;
    const actor = { conversationRole: viewer.conversationRole, platformRole: viewer.platformRole };
    const moderates = actorHasMinimumRole(actor, 'moderator');
    const administers = actorHasMinimumRole(actor, 'admin');
    const governed = viewer.isActiveMember && conversation.isActive !== false && !conversation.closedAt;
    const authority = ['group', 'public', 'broadcast'].includes(conversation.type);
    const registered = viewer.hasAccount && !viewer.isAnonymous;
    const mints = registered && conversation.type !== 'direct' && mayMintShareLink(actor, conversation);

    if (vector.expected.rename || vector.expected.manageMembers) expect(moderates).toBe(true);
    if (vector.expected.deleteForAll) expect(administers).toBe(true);
    if (vector.expected.invite) expect(viewer.isActiveMember && mints).toBe(true);
    if (governed && (authority || conversation.type === 'global')) expect(vector.expected.invite).toBe(mints);
    if (vector.expected.leave) expect(registered).toBe(true);
    if (governed && authority) expect([vector.expected.rename, vector.expected.deleteForAll]).toEqual([moderates, administers]);
  });

  it('les vecteurs couvrent un non-membre à qui la loi ne propose ni de masquer ni de signaler', () => {
    expect(conversationVectors.some((vector) => !vector.input.viewer.isActiveMember && !vector.expected.report && !vector.expected.hide)).toBe(true);
  });

  it.each(conversationVectors.map((vector) => [vector._label, vector] as const))('signaler : %s', async (_label, vector) => {
    const { viewer } = vector.input;
    const registered = viewer.hasAccount && !viewer.isAnonymous;
    const prisma = {
      conversation: { findUnique: async () => ({ id: CONVERSATION_ID }) },
      participant: { findFirst: async () => (viewer.isActiveMember ? { id: viewer.participantId ?? viewer.id } : null) },
    };
    const verdict = await verifierCible({
      prisma: prisma as never,
      signalant: registered ? { userId: viewer.id } : { participantId: viewer.participantId ?? viewer.id },
      type: 'conversation',
      entityId: CONVERSATION_ID,
    });

    if (vector.expected.report) expect(verdict.atteignable).toBe(true);
    if (registered) expect(verdict.atteignable).toBe(vector.expected.report);
  });
});
