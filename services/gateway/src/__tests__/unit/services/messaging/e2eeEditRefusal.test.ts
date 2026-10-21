/**
 * Une édition n'écrit jamais de clair dans une conversation chiffrée de bout
 * en bout (directive #9224, #11216).
 *
 * Aucun des quatre transports d'édition (socket `message:edit`, `PUT` scopé,
 * `PUT /messages/:id`, `PATCH`) ne porte de chiffré : ils écrivent `content`.
 * Admettre une édition dans une conversation `e2ee` remplaçait donc un message
 * chiffré par du texte lisible par le serveur. `admitMessageEdit` est l'unique
 * énoncé de l'édition : la règle y vit une fois, après la décision
 * d'autorisation (aucun oracle d'existence pour qui n'aurait pas été admis).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitMessageEdit,
  describeEditRefusalForSocket,
  editRefusalCode,
  isEditRefused,
} from '../../../../services/messaging/messageEditAdmission';
import {
  E2EE_PLAINTEXT_REFUSAL_MESSAGE,
  E2EE_PLAINTEXT_REFUSED,
  plaintextRefusedIn,
} from '../../../../services/messaging/e2eePlaintextAdmission';

const AUTHOR = 'user-author';
const CONV = 'conv-e2ee';
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

function buildPrisma(globalRole = 'USER', member = true) {
  return {
    user: { findUnique: jest.fn(async () => ({ role: globalRole })) },
    participant: { findFirst: jest.fn(async () => (member ? { id: 'part-1', user: { role: globalRole } } : null)) },
  };
}

const edit = (params: { encryptionMode: string | null; editor?: string; globalRole?: string; member?: boolean }) =>
  admitMessageEdit({
    prisma: buildPrisma(params.globalRole, params.member) as never,
    editorUserId: params.editor ?? AUTHOR,
    message: {
      authorUserId: AUTHOR,
      conversationId: CONV,
      conversation: { isActive: true, closedAt: null, type: 'direct', encryptionMode: params.encryptionMode },
      createdAt: new Date(NOW - 60_000),
      messageType: 'text',
      metadata: null,
    },
    now: NOW,
  });

describe('admitMessageEdit — aucune édition en clair dans une conversation e2ee (#11216)', () => {
  it('l’auteur, dans sa fenêtre, est refusé — motif end-to-end-encrypted', async () => {
    const admission = await edit({ encryptionMode: 'e2ee' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('la casse du mode ne contourne pas la règle (iOS émet « E2EE »)', async () => {
    const admission = await edit({ encryptionMode: 'E2EE' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('un modérateur plateforme n’en est pas dispensé', async () => {
    const admission = await edit({ encryptionMode: 'e2ee', editor: 'user-mod', globalRole: 'ADMIN' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('un non-membre garde son refus d’autorisation — le chiffrement ne se révèle pas', async () => {
    const admission = await edit({ encryptionMode: 'e2ee', editor: 'user-stranger', member: false });
    expect(isEditRefused(admission) && admission.reason).toBe('not-a-member');
  });

  it.each([null, 'server', 'hybrid'])('mode %s : l’édition reste admise (le serveur lit déjà le clair)', async (mode) => {
    const admission = await edit({ encryptionMode: mode });
    expect(admission.admitted).toBe(true);
  });

  it('le socket dit la phrase claire et porte le code stable', () => {
    expect(describeEditRefusalForSocket('end-to-end-encrypted')).toBe(E2EE_PLAINTEXT_REFUSAL_MESSAGE);
    expect(editRefusalCode('end-to-end-encrypted')).toBe(E2EE_PLAINTEXT_REFUSED);
    expect(editRefusalCode('edit-window-expired')).toBeUndefined();
  });
});

describe('plaintextRefusedIn — la règle elle-même (#11216)', () => {
  it.each([
    ['e2ee', 'Bonjour', true],
    ['E2EE', 'Bonjour', true],
    ['e2ee', '   ', false],
    ['e2ee', '', false],
    ['server', 'Bonjour', false],
    ['hybrid', 'Bonjour', false],
    [null, 'Bonjour', false],
  ])('mode %s, texte %j ⇒ refusé : %s', (encryptionMode, plaintext, refused) => {
    expect(plaintextRefusedIn({ encryptionMode, plaintext })).toBe(refused);
  });
});

describe('plaintextRefusedIn — la règle elle-même (#11216)', () => {
  it.each([
    ['e2ee', 'Bonjour', true],
    ['E2EE', 'Bonjour', true],
    ['e2ee', '   ', false],
    ['e2ee', '', false],
    ['server', 'Bonjour', false],
    ['hybrid', 'Bonjour', false],
    [null, 'Bonjour', false],
  ])('mode %s, texte %j ⇒ refusé : %s', (encryptionMode, plaintext, refused) => {
    expect(plaintextRefusedIn({ encryptionMode, plaintext })).toBe(refused);
  });
});
