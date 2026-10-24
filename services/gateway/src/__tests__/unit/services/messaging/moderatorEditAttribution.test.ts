/**
 * #11375 — un modérateur qui modifie le message d'un autre le fait à visage
 * découvert. L'admission dit AU TITRE DE QUOI on édite ; `editAttributionOf`
 * en tire ce que l'écriture enregistre (`editedById`, `editedByRole`) et ce
 * que `message:edited` diffuse. L'auteur qui réécrit son message efface la
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

    expect(editAttributionOf(admission, MODERATOR)).toEqual({ editedById: MODERATOR, editedByRole: role });
  });

  it('l’auteur dans sa fenêtre remet les deux colonnes à null', async () => {
    const admission = await admit({ editor: AUTHOR, globalRole: 'USER' });

    expect(editAttributionOf(admission, AUTHOR)).toEqual({ editedById: null, editedByRole: null });
  });

  it('l’auteur modérateur au-delà de 24 h modifie SON message : aucune mention', async () => {
    const admission = await admit({
      editor: AUTHOR,
      globalRole: 'MODERATOR',
      createdAt: new Date(NOW - MESSAGE_EDIT_WINDOW_MS - 1),
    });

    expect(editAttributionOf(admission, AUTHOR)).toEqual({ editedById: null, editedByRole: null });
  });

  it('un refus n’enregistre personne', async () => {
    const admission = await admit({ editor: MODERATOR, globalRole: 'USER' });

    expect(admission.admitted).toBe(false);
    expect(editAttributionOf(admission, MODERATOR)).toEqual({ editedById: null, editedByRole: null });
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

  it('diffuse l’attribution que le transport vient d’écrire', () => {
    const core = buildMessageEditedCore(row, {
      conversationId: 'conv-1',
      content: 'après',
      isEdited: true,
      editedAt: new Date(NOW),
      editedBy: { editedById: MODERATOR, editedByRole: 'MODERATOR' },
    });

    expect(core).toMatchObject({ editedById: MODERATOR, editedByRole: 'MODERATOR' });
  });

  it('sans attribution déclarée, relit celle de la ligne (transport REST, résumés d’appel)', () => {
    const edited = { ...row, editedById: MODERATOR, editedByRole: 'ADMIN' } as unknown as Message;

    const core = buildMessageEditedCore(edited, { conversationId: 'conv-1', content: 'après', isEdited: true, editedAt: new Date(NOW) });

    expect(core).toMatchObject({ editedById: MODERATOR, editedByRole: 'ADMIN' });
  });

  it('une ligne sans attribution diffuse null, jamais une clé absente', () => {
    const core = buildMessageEditedCore(row, { conversationId: 'conv-1', content: 'après', isEdited: true, editedAt: new Date(NOW) });

    expect(core.editedById).toBeNull();
    expect(core.editedByRole).toBeNull();
  });
});
