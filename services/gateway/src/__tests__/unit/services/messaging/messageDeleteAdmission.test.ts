/**
 * Qui a le droit de supprimer un message.
 *
 * La règle vivait recopiée à TROIS endroits — le handler socket `message:delete`,
 * `DELETE /messages/:messageId` (Android) et
 * `DELETE /conversations/:id/messages/:messageId` (iOS + web) — et les trois
 * copies avaient divergé : une ignorait le rôle de CONVERSATION tout en
 * affirmant le contraire dans son commentaire, une admettait un membre INACTIF,
 * une testait un rôle `CREATOR` que l'enum `UserRole` ne contient pas. Jumeau
 * d'`admitMessageEdit`, qui a fermé la même divergence sur l'édition.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { admitMessageDelete } from '../../../../services/messaging/messageDeleteAdmission';

const AUTHOR = 'user-author';
const OTHER = 'user-other';
const CONV = 'conv-1';
const PART_ID = 'participant-actor';

function buildPrisma(
  overrides: {
    /** `Participant.role` — 'admin' | 'moderator' | 'member'. `null` = pas membre actif. */
    conversationRole?: string | null;
    /** `User.role` porté par la ligne participant (lecture jointe). */
    memberGlobalRole?: string;
    /** `User.role` lu séparément quand l'acteur n'est pas membre. */
    globalRole?: string | null;
    userThrows?: boolean;
    participantThrows?: boolean;
  } = {}
) {
  const findUnique = jest.fn<any>(async () => {
    if (overrides.userThrows) throw new Error('db down');
    return overrides.globalRole === undefined ? { role: 'USER' } : { role: overrides.globalRole };
  });
  const findFirst = jest.fn<any>(async () => {
    if (overrides.participantThrows) throw new Error('db down');
    if (overrides.conversationRole === null || overrides.conversationRole === undefined) return null;
    return {
      id: PART_ID,
      role: overrides.conversationRole,
      user: { role: overrides.memberGlobalRole ?? 'USER' },
    };
  });
  return { user: { findUnique }, participant: { findFirst } };
}

const admit = (params: {
  prisma: ReturnType<typeof buildPrisma>;
  deleterUserId: string;
  authorUserId?: string | null;
  onError?: (error: unknown) => void;
}) =>
  admitMessageDelete({
    prisma: params.prisma as never,
    deleterUserId: params.deleterUserId,
    message: {
      authorUserId: params.authorUserId === undefined ? AUTHOR : params.authorUserId,
      conversationId: CONV,
    },
    onError: params.onError,
  });

describe("admitMessageDelete — l'auteur", () => {
  it('supprime son propre message', async () => {
    const prisma = buildPrisma();

    await expect(admit({ prisma, deleterUserId: AUTHOR })).resolves.toMatchObject({ admitted: true });
  });

  it('ne coûte AUCUNE lecture — le chemin nominal ne touche pas la base', async () => {
    const prisma = buildPrisma();

    await admit({ prisma, deleterUserId: AUTHOR });

    expect(prisma.participant.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("n'est pas l'auteur quand le message est ANONYME (aucun `User.id` porté par l'expéditeur)", async () => {
    // `sender.userId` vaut `null` pour un expéditeur anonyme. Sans la garde,
    // `null == undefined` ou une comparaison laxiste ferait de n'importe quel
    // lecteur l'auteur d'un message anonyme.
    const prisma = buildPrisma({ conversationRole: 'member' });

    await expect(admit({ prisma, deleterUserId: OTHER, authorUserId: null })).resolves.toMatchObject({ admitted: false });
  });
});

describe('admitMessageDelete — le rôle de CONVERSATION (`Participant.role`, minuscules)', () => {
  it("admet l'admin de conversation, même sans aucun rôle global privilégié", async () => {
    const prisma = buildPrisma({ conversationRole: 'admin', memberGlobalRole: 'USER' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: true });
  });

  it('admet le modérateur de conversation, même sans aucun rôle global privilégié', async () => {
    const prisma = buildPrisma({ conversationRole: 'moderator', memberGlobalRole: 'USER' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: true });
  });

  it("refuse le simple membre", async () => {
    const prisma = buildPrisma({ conversationRole: 'member', memberGlobalRole: 'USER' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: false });
  });

  it("ne lit l'appartenance qu'avec `isActive: true` — un admin qui a QUITTÉ ne supprime plus", async () => {
    // `DELETE /messages/:messageId` joignait les participants sans ce filtre :
    // une ligne inactive gardée après un départ conservait le droit de
    // supprimer indéfiniment.
    const prisma = buildPrisma({ conversationRole: 'admin' });

    await admit({ prisma, deleterUserId: OTHER });

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: CONV, userId: OTHER, isActive: true },
      })
    );
  });

  it("ne relit PAS `User` quand la ligne participant a déjà répondu", async () => {
    const prisma = buildPrisma({ conversationRole: 'admin' });

    await admit({ prisma, deleterUserId: OTHER });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('admitMessageDelete — le rôle GLOBAL (`User.role`, majuscules)', () => {
  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])('admet le %s global membre de la conversation', async (role) => {
    const prisma = buildPrisma({ conversationRole: 'member', memberGlobalRole: role });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])(
    "admet le %s global qui n'est PAS participant — parité avec le socket et la route Android",
    async (role) => {
      const prisma = buildPrisma({ conversationRole: null, globalRole: role });

      await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: true });
    }
  );

  it.each(['USER', 'AUDIT', 'ANALYST', 'AGENT'])('refuse le rôle global %s', async (role) => {
    const prisma = buildPrisma({ conversationRole: null, globalRole: role });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: false });
  });

  it("refuse `CREATOR`, qui n'existe pas dans l'enum `UserRole`", async () => {
    // `DELETE /messages/:messageId` le testait : une branche qui ne pouvait
    // JAMAIS être vraie, et qui donnait à lire une permission inexistante.
    const prisma = buildPrisma({ conversationRole: null, globalRole: 'CREATOR' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: false });
  });
});

describe("admitMessageDelete — le `Participant.id` de l'ACTEUR", () => {
  // La file de rejeu hors ligne exclut l'acteur dans les deux monnaies
  // d'identité (cycle 37). Le rendre ici évite à l'appelant de refaire la
  // lecture — ou de retomber sur `message.senderId`, qui désigne l'AUTEUR.

  it("est rendu quand l'admission a lu la ligne participant de l'acteur", async () => {
    const prisma = buildPrisma({ conversationRole: 'moderator' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toEqual({
      admitted: true,
      actorParticipantId: PART_ID,
    });
  });

  it("est rendu quand c'est le rôle GLOBAL du membre qui admet", async () => {
    const prisma = buildPrisma({ conversationRole: 'member', memberGlobalRole: 'ADMIN' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toEqual({
      admitted: true,
      actorParticipantId: PART_ID,
    });
  });

  it("est absent pour l'auteur — son `Participant.id` est `message.senderId`, que l'appelant tient déjà", async () => {
    const prisma = buildPrisma();

    await expect(admit({ prisma, deleterUserId: AUTHOR })).resolves.toEqual({ admitted: true });
  });

  it("est absent pour l'admin GLOBAL non participant — il n'a aucune ligne à lire", async () => {
    const prisma = buildPrisma({ conversationRole: null, globalRole: 'ADMIN' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toEqual({ admitted: true });
  });

  it("n'est jamais rendu avec un REFUS — rien ne doit pouvoir l'employer sans avoir lu `admitted`", async () => {
    const prisma = buildPrisma({ conversationRole: 'member', memberGlobalRole: 'USER' });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toEqual({ admitted: false });
  });
});

describe('admitMessageDelete — toute lecture échoue FERMÉE', () => {
  let onError: jest.Mock<any>;

  beforeEach(() => {
    onError = jest.fn();
  });

  it("refuse quand la lecture d'appartenance lève", async () => {
    const prisma = buildPrisma({ participantThrows: true, globalRole: 'ADMIN' });

    await expect(admit({ prisma, deleterUserId: OTHER, onError })).resolves.toMatchObject({ admitted: false });
    expect(onError).toHaveBeenCalled();
  });

  it('refuse quand la lecture du rôle global lève', async () => {
    const prisma = buildPrisma({ conversationRole: null, userThrows: true });

    await expect(admit({ prisma, deleterUserId: OTHER, onError })).resolves.toMatchObject({ admitted: false });
    expect(onError).toHaveBeenCalled();
  });

  it("refuse quand l'utilisateur n'existe plus", async () => {
    const prisma = buildPrisma({ conversationRole: null, globalRole: null });

    await expect(admit({ prisma, deleterUserId: OTHER })).resolves.toMatchObject({ admitted: false });
  });

  it("une lecture d'appartenance en échec n'ouvre pas la porte au rôle global", async () => {
    // Fermer signifie fermer : une base illisible ne doit pas dégrader vers un
    // second chemin qui, lui, répondrait.
    const prisma = buildPrisma({ participantThrows: true, globalRole: 'BIGBOSS' });

    await expect(admit({ prisma, deleterUserId: OTHER, onError })).resolves.toMatchObject({ admitted: false });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
