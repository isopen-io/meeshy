/**
 * PARITÉ (#11205) — les vecteurs de la loi des actions partagée
 * (`packages/shared/fixtures/action-policy/`) rejoués contre `admitMessageEdit`,
 * `admitMessageDelete` et `actorHasMinimumRole`, qui font foi, avec des doubles
 * qui rendent les lignes du vecteur. INCLUSION toujours (le client n'offre
 * jamais ce que la passerelle refuse) ; ÉGALITÉ sauf où le vecteur déclare
 * `clientStricter`. Aucun code de production n'est touché.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { admitMessageDelete, type DeleteAdmissionReader } from '../../../../services/messaging/messageDeleteAdmission';
import { admitMessageEdit, type EditAdmissionReader } from '../../../../services/messaging/messageEditAdmission';
import { actorHasMinimumRole } from '../../../../utils/conversation-authority';
import type { ConversationActionInput, ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';
import type { ActionViewer, MessageActionInput, MessageActions } from '@meeshy/shared/utils/message-action-policy';

type MessageVector = { readonly _label: string; readonly clientStricter?: readonly ('edit' | 'delete')[]; readonly input: MessageActionInput; readonly expected: MessageActions };

type ConversationVector = { readonly _label: string; readonly input: ConversationActionInput; readonly expected: ConversationActions };

const FIXTURES = resolve(__dirname, '../../../../../../../packages/shared/fixtures/action-policy');

const vectorsOf = <T>(name: string): readonly T[] =>
  JSON.parse(readFileSync(resolve(FIXTURES, `${name}.vectors.json`), 'utf-8')).vectors;

const CONVERSATION_ID = '65f0000000000000000000c1';
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Les lignes que la base rendrait pour ce lecteur : un invité n'a pas de `User`, donc aucune ligne par `userId`. */
function membershipOf(viewer: ActionViewer) {
  return viewer.hasAccount && viewer.isActiveMember
    ? { id: viewer.participantId ?? 'part-viewer', role: viewer.conversationRole, user: { role: viewer.platformRole } }
    : null;
}

function editReader(vector: MessageVector): EditAdmissionReader {
  const { viewer, now } = vector.input;
  return {
    user: { findUnique: async () => (viewer.hasAccount ? { role: viewer.platformRole, birthDate: viewer.isDeclaredMinor ? new Date(now - 15 * YEAR_MS) : null } : null) },
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

describe('parité des actions sur une conversation — actorHasMinimumRole', () => {
  it.each(conversationVectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    const { conversation, viewer } = vector.input;
    const actor = { conversationRole: viewer.conversationRole, platformRole: viewer.platformRole };
    const moderates = actorHasMinimumRole(actor, 'moderator');
    const administers = actorHasMinimumRole(actor, 'admin');
    const governed = viewer.isActiveMember && conversation.isActive !== false && !conversation.closedAt;
    const authority = ['group', 'public', 'broadcast'].includes(conversation.type);

    if (vector.expected.rename || vector.expected.manageMembers) expect(moderates).toBe(true);
    if (vector.expected.deleteForAll) expect(administers).toBe(true);
    if (vector.expected.invite && conversation.type !== 'global') expect(moderates).toBe(true);
    if (governed && authority) expect([vector.expected.rename, vector.expected.deleteForAll]).toEqual([moderates, administers]);
  });
});
