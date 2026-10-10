/**
 * #9641 — un avis de capture ne peut pas être retiré par celui qui a capturé.
 *
 * Un avis que celui qui capture peut effacer ne protège personne. Le retirent :
 * l'auteur du message capturé, les modérateurs et administrateurs de la
 * conversation, les rôles globaux privilégiés. Celui qui capture ne le retire
 * ni ne l'édite, quel que soit son rang : l'avis porte SA capture.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { admitMessageDelete } from '../../../../services/messaging/messageDeleteAdmission';
import { admitMessageEdit } from '../../../../services/messaging/messageEditAdmission';

const CAPTURER_USER = 'user-capturer';
const AUTHOR_USER = 'user-author';
const OTHER_USER = 'user-other';
const CONV = 'conv-1';
const AUTHOR_PARTICIPANT = 'participant-author';
const CAPTURED = 'message-captured';

const NOTICE = { messageType: 'system', metadata: { kind: 'content-capture', capturedMessageId: CAPTURED } };

function buildPrisma(members: Record<string, { id: string; role: string; globalRole?: string }>, globalRoles: Record<string, string> = {}) {
  return {
    user: {
      findUnique: jest.fn<any>(async ({ where }: { where: { id: string } }) => ({ role: globalRoles[where.id] ?? 'USER' })),
    },
    participant: {
      findFirst: jest.fn<any>(async ({ where }: { where: { userId: string } }) => {
        const member = members[where.userId];
        return member ? { id: member.id, role: member.role, user: { role: member.globalRole ?? 'USER' } } : null;
      }),
    },
    message: {
      findUnique: jest.fn<any>(async ({ where }: { where: { id: string } }) =>
        where.id === CAPTURED ? { senderId: AUTHOR_PARTICIPANT } : null,
      ),
    },
  };
}

const MEMBERS = {
  [CAPTURER_USER]: { id: 'participant-capturer', role: 'member' },
  [AUTHOR_USER]: { id: AUTHOR_PARTICIPANT, role: 'member' },
  [OTHER_USER]: { id: 'participant-other', role: 'member' },
};

const deleteNotice = (prisma: ReturnType<typeof buildPrisma>, deleterUserId: string, notice: { messageType: string; metadata: unknown } = NOTICE) =>
  admitMessageDelete({
    prisma: prisma as never,
    deleterUserId,
    message: { authorUserId: CAPTURER_USER, conversationId: CONV, ...notice },
  });

describe('admitMessageDelete — l’avis de capture (#9641)', () => {
  it('refuse celui qui a capturé, auteur de l’avis', async () => {
    expect((await deleteNotice(buildPrisma(MEMBERS), CAPTURER_USER)).admitted).toBe(false);
  });

  it('refuse celui qui a capturé même administrateur de la conversation ou de la plateforme', async () => {
    const admin = buildPrisma({ ...MEMBERS, [CAPTURER_USER]: { id: 'participant-capturer', role: 'admin', globalRole: 'BIGBOSS' } });
    expect((await deleteNotice(admin, CAPTURER_USER)).admitted).toBe(false);
  });

  it('refuse celui qui a capturé quand la métadonnée est abîmée — l’échec est fermé', async () => {
    const broken = { messageType: 'system', metadata: { kind: 'content-capture' } };
    expect((await deleteNotice(buildPrisma(MEMBERS), CAPTURER_USER, broken)).admitted).toBe(false);
  });

  it('admet l’auteur du message capturé, membre actif', async () => {
    expect((await deleteNotice(buildPrisma(MEMBERS), AUTHOR_USER)).admitted).toBe(true);
  });

  it('refuse l’auteur du message capturé qui a quitté la conversation', async () => {
    const { [AUTHOR_USER]: _gone, ...stayed } = MEMBERS;
    expect((await deleteNotice(buildPrisma(stayed), AUTHOR_USER)).admitted).toBe(false);
  });

  it('admet un modérateur ou un administrateur de la conversation', async () => {
    for (const role of ['moderator', 'admin']) {
      const prisma = buildPrisma({ ...MEMBERS, [OTHER_USER]: { id: 'participant-other', role } });
      expect((await deleteNotice(prisma, OTHER_USER)).admitted).toBe(true);
    }
  });

  it('admet un rôle global privilégié, membre ou non', async () => {
    const { [OTHER_USER]: _absent, ...withoutOther } = MEMBERS;
    expect((await deleteNotice(buildPrisma(withoutOther, { [OTHER_USER]: 'ADMIN' }), OTHER_USER)).admitted).toBe(true);
  });

  it('refuse un membre ordinaire', async () => {
    expect((await deleteNotice(buildPrisma(MEMBERS), OTHER_USER)).admitted).toBe(false);
  });

  it('refuse l’auteur quand la lecture du message capturé lève', async () => {
    const prisma = buildPrisma(MEMBERS);
    prisma.message.findUnique.mockRejectedValue(new Error('db down'));
    const onError = jest.fn();
    const decision = await admitMessageDelete({
      prisma: prisma as never,
      deleterUserId: AUTHOR_USER,
      message: { authorUserId: CAPTURER_USER, conversationId: CONV, ...NOTICE },
      onError,
    });
    expect(decision.admitted).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('laisse un message ordinaire et un autre avis système à leur auteur', async () => {
    const prisma = buildPrisma(MEMBERS);
    expect((await deleteNotice(prisma, CAPTURER_USER, { messageType: 'text', metadata: null })).admitted).toBe(true);
    expect((await deleteNotice(prisma, CAPTURER_USER, { messageType: 'system', metadata: { kind: 'member-left' } })).admitted).toBe(true);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });
});

describe('admitMessageEdit — l’avis de capture (#9641)', () => {
  const editNotice = (editorUserId: string, notice: { messageType: string; metadata: unknown } = NOTICE) =>
    admitMessageEdit({
      prisma: buildPrisma(MEMBERS) as never,
      editorUserId,
      message: { authorUserId: CAPTURER_USER, conversationId: CONV, conversation: null, createdAt: new Date(), ...notice },
    });

  it('refuse celui qui a capturé', async () => {
    expect(await editNotice(CAPTURER_USER)).toEqual({ admitted: false, reason: 'not-author' });
  });

  it('laisse son auteur éditer un message ordinaire', async () => {
    expect((await editNotice(CAPTURER_USER, { messageType: 'text', metadata: null })).admitted).toBe(true);
  });
});
