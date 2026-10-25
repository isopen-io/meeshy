/**
 * #11375 — un modérateur qui modifie le message d'un autre le fait à visage
 * découvert. L'admission dit AU TITRE DE QUOI on édite ; `editAttributionOf`
 * en tire ce que l'écriture enregistre (`thirdPartyEditorId`,
 * `thirdPartyEditorRole`) ; `message:edited`, qui part à une room, n'en diffuse
 * que la mention. L'auteur qui réécrit son message efface la
 * mention : la dernière modification est la sienne.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import type { Message } from '@meeshy/shared/types/index';
import {
  admitMessageEdit,
  editAttributionOf,
  MESSAGE_EDIT_WINDOW_MS,
} from '../../../../services/messaging/messageEditAdmission';
import { buildMessageEditedCore } from '../../../../socketio/messageEditedPayload';
import { MASKED_MODERATOR_EDITOR } from '@meeshy/shared/utils/message-edit-attribution';

const AUTHOR = 'user-author';
const MODERATOR = 'user-moderator';
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

const prismaWith = (globalRole: string) => ({
  user: { findUnique: jest.fn(async () => ({ role: globalRole })) },
  participant: { findFirst: jest.fn(async () => ({ id: 'part-1', user: { role: globalRole } })) },
});

const admit = (params: { editor: string; globalRole: string; createdAt?: Date }) =>
  admitMessageEdit({
    prisma: prismaWith(params.globalRole) as never,
    editorUserId: params.editor,
    message: {
      authorUserId: AUTHOR,
      conversationId: 'conv-1',
      conversation: { isActive: true, closedAt: null, type: 'group', encryptionMode: null },
      createdAt: params.createdAt ?? new Date(NOW - 60_000),
      messageType: 'text',
      metadata: null,
    },
    now: NOW,
  });

describe('editAttributionOf — qui l’écriture enregistre comme auteur de la modification', () => {
  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])('un %s de plateforme sur le message d’autrui est enregistré, avec son rôle', async (role) => {
    const admission = await admit({ editor: MODERATOR, globalRole: role });

    expect(editAttributionOf(admission, MODERATOR)).toEqual({ thirdPartyEditorId: MODERATOR, thirdPartyEditorRole: role });
  });

  it('l’auteur dans sa fenêtre remet les deux colonnes à null', async () => {
    const admission = await admit({ editor: AUTHOR, globalRole: 'USER' });

    expect(editAttributionOf(admission, AUTHOR)).toEqual({ thirdPartyEditorId: null, thirdPartyEditorRole: null });
  });

  it('l’auteur modérateur au-delà de 24 h modifie SON message : aucune mention', async () => {
    const admission = await admit({
      editor: AUTHOR,
      globalRole: 'MODERATOR',
      createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS - 1),
    });

    expect(editAttributionOf(admission, AUTHOR)).toEqual({ thirdPartyEditorId: null, thirdPartyEditorRole: null });
  });

  it('un refus n’enregistre personne', async () => {
    const admission = await admit({ editor: MODERATOR, globalRole: 'USER' });

    expect(admission.admitted).toBe(false);
    expect(editAttributionOf(admission, MODERATOR)).toEqual({ thirdPartyEditorId: null, thirdPartyEditorRole: null });
  });
});

describe('buildMessageEditedCore — `message:edited` porte l’auteur de la modification', () => {
  const row = {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'part-author',
    content: 'avant',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date(NOW - 60_000),
  } as unknown as Message;

  it('diffuse la MENTION de la modification que le transport vient d’écrire, jamais l’identité ni le rang', () => {
    const core = buildMessageEditedCore(row, {
      conversationId: 'conv-1',
      content: 'après',
      isEdited: true,
      editedAt: new Date(NOW),
      editedBy: { thirdPartyEditorId: MODERATOR, thirdPartyEditorRole: 'BIGBOSS' },
    });

    expect(core).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
    expect(JSON.stringify(core)).not.toContain(MODERATOR);
  });

  it('sans attribution déclarée, relit celle de la ligne (transport REST, résumés d’appel), masquée', () => {
    const edited = { ...row, thirdPartyEditorId: MODERATOR, thirdPartyEditorRole: 'ADMIN' } as unknown as Message;

    const core = buildMessageEditedCore(edited, { conversationId: 'conv-1', content: 'après', isEdited: true, editedAt: new Date(NOW) });

    expect(core).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
  });

  it('une déclaration de l’auteur efface la mention que la ligne d’avant portait', () => {
    const before = { ...row, thirdPartyEditorId: MODERATOR, thirdPartyEditorRole: 'ADMIN' } as unknown as Message;

    const core = buildMessageEditedCore(before, {
      conversationId: 'conv-1',
      content: 'après',
      isEdited: true,
      editedAt: new Date(NOW),
      editedBy: { thirdPartyEditorId: null, thirdPartyEditorRole: null },
    });

    expect(core).toMatchObject({ editedById: null, editedByRole: null });
  });

  it('une ligne sans attribution diffuse null, jamais une clé absente', () => {
    const core = buildMessageEditedCore(row, { conversationId: 'conv-1', content: 'après', isEdited: true, editedAt: new Date(NOW) });

    expect(core.editedById).toBeNull();
    expect(core.editedByRole).toBeNull();
  });
});
