/**
 * PARITÉ (#11205) — les vecteurs de la loi des actions partagée
 * (`packages/shared/fixtures/action-policy/`) rejoués contre ce qui fait foi :
 * `admitMessageEdit`, `admitMessageDelete`, `ReactionService.addReaction`, les
 * gardes de `messages-pin.ts` (`refusesMinorInConversationOfType`,
 * `refusesContentGesture`) et `actorHasMinimumRole`, avec des doubles qui rendent
 * les lignes du vecteur. INCLUSION toujours (le client n'offre jamais ce que la
 * passerelle refuse) ; ÉGALITÉ pour modifier, supprimer et réagir sauf où le
 * vecteur déclare `clientStricter`. L'épingle n'est tenue qu'en inclusion : la
 * loi la refuse en plus sur les avis, la vue unique et les invités. Aucun code
 * de production n'est touché.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { ReactionService } from '../../../../services/ReactionService';
import { refusesContentGesture } from '../../../../services/messaging/captureNoticeVisibility';
import { refusesMinorInConversationOfType } from '../../../../services/messaging/globalMinorGate';
import { admitMessageDelete, type DeleteAdmissionReader } from '../../../../services/messaging/messageDeleteAdmission';
import { admitMessageEdit, type EditAdmissionReader } from '../../../../services/messaging/messageEditAdmission';
import { mayMintShareLink } from '../../../../routes/links/utils/share-link-mint';
import { actorHasMinimumRole } from '../../../../utils/conversation-authority';
import type { ConversationActionInput, ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';
import type { ActionViewer, MessageActionInput, MessageActions } from '@meeshy/shared/utils/message-action-policy';

type MessageVector = { readonly _label: string; readonly clientStricter?: readonly ('edit' | 'delete' | 'react')[]; readonly input: MessageActionInput; readonly expected: MessageActions };

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
        conversation: { isActive: conversation.isActive, closedAt: conversation.closedAt == null ? null : new Date(conversation.closedAt), type: conversation.type },
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
  it('les vecteurs couvrent une réaction sans droit d’écrire et une épingle refusée au mineur de Global', () => {
    expect(messageVectors.some((vector) => vector.expected.verdicts.canReact && !vector.expected.verdicts.canReply)).toBe(true);
    expect(messageVectors.some((vector) => vector.input.conversation.type === 'global' && vector.input.viewer.isDeclaredMinor && vector.expected.verdicts.pin === null)).toBe(true);
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
    const { message, conversation, viewer, now } = vector.input;
    if (vector.expected.verdicts.pin === null) return;
    const minorRefused = await refusesMinorInConversationOfType(
      { user: { findUnique: async () => ({ birthDate: birthDateOf(viewer, now) }) } } as never,
      { conversationType: conversation.type, userId: viewer.hasAccount ? viewer.id : null, now: new Date(now) },
    );

    expect([message.deletedAt ?? null, minorRefused, refusesContentGesture({ messageType: message.messageType ?? null, metadata: message.metadata })]).toEqual([null, false, false]);
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
});
