/**
 * Un message envoyé sous le régime e2ee reste chiffré « à jamais » (spec E2EE
 * libsignal § 5.2), même après la désactivation du chiffrement de sa
 * conversation (#12522, #12881).
 *
 * Le régime COURANT de la conversation ne suffit plus à dire ce qu'une ligne
 * porte : depuis que la désactivation existe, un message e2ee d'hier vit dans
 * une conversation repassée en clair. L'admission lit donc AUSSI la ligne du
 * message, sur les quatre transports d'édition.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { admitMessageEdit, isEditRefused } from '../../../../services/messaging/messageEditAdmission';

const AUTHOR = 'user-author';
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

const buildPrisma = (globalRole = 'USER') => ({
  user: { findUnique: jest.fn(async () => ({ role: globalRole })) },
  participant: { findFirst: jest.fn(async () => ({ id: 'part-1', user: { role: globalRole } })) },
});

const editRow = (params: {
  readonly isEncrypted: boolean;
  readonly encryptionMode: string | null;
  readonly editor?: string;
  readonly globalRole?: string;
}) =>
  admitMessageEdit({
    prisma: buildPrisma(params.globalRole) as never,
    editorUserId: params.editor ?? AUTHOR,
    message: {
      authorUserId: AUTHOR,
      conversationId: 'conv-switched',
      conversation: { isActive: true, closedAt: null, type: 'direct', encryptionMode: null },
      createdAt: new Date(NOW - 60_000),
      messageType: 'text',
      metadata: null,
      isEncrypted: params.isEncrypted,
      encryptionMode: params.encryptionMode,
    },
    now: NOW,
  });

describe('#12881 — un message e2ee ne s’édite jamais en clair, même après la désactivation', () => {
  it('le message scellé sous e2ee reste refusé quand la conversation est repassée en clair', async () => {
    const admission = await editRow({ isEncrypted: true, encryptionMode: 'e2ee' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('la casse du mode de la ligne ne contourne pas la règle', async () => {
    const admission = await editRow({ isEncrypted: true, encryptionMode: 'E2EE' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('une ligne chiffrée sans mode déclaré (forme héritée d’iOS) reste refusée', async () => {
    const admission = await editRow({ isEncrypted: true, encryptionMode: null });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('un mode inconnu sur la ligne échoue fermé', async () => {
    const admission = await editRow({ isEncrypted: false, encryptionMode: 'signal-v9' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('un modérateur plateforme n’en est pas dispensé', async () => {
    const admission = await editRow({ isEncrypted: true, encryptionMode: 'e2ee', editor: 'user-mod', globalRole: 'ADMIN' });
    expect(isEditRefused(admission) && admission.reason).toBe('end-to-end-encrypted');
  });

  it('un message en clair écrit après la désactivation reste éditable', async () => {
    const admission = await editRow({ isEncrypted: false, encryptionMode: null });
    expect(admission.admitted).toBe(true);
  });

  it.each(['server', 'hybrid'])('une ligne %s reste éditable : le serveur la lit déjà', async (mode) => {
    const admission = await editRow({ isEncrypted: true, encryptionMode: mode });
    expect(admission.admitted).toBe(true);
  });
});
