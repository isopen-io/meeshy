/**
 * Ce que l'état de la CONVERSATION interdit à ses membres d'y écrire.
 *
 * La règle existait — `MessageValidator.checkPermissions` la portait en entier,
 * hiérarchie de rôles et échappatoire staff comprises — mais AUCUN appelant de
 * production ne l'invoquait : le seul chemin d'envoi (`handleMessage`) vérifie
 * l'appartenance du participant et rien de l'état du conteneur. Un canal
 * d'annonces acceptait donc les messages de n'importe quel membre, et une
 * conversation FERMÉE acceptait encore des messages.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  admitConversationWrite,
  isConversationWriteRefused,
} from '../../../../services/messaging/conversationWriteAdmission';

const CONV = 'conv-1';
const SENDER = 'participant-1';

type PolicyOverrides = {
  type?: string | null;
  isActive?: boolean | null;
  isAnnouncementChannel?: boolean | null;
  defaultWriteRole?: string | null;
};

function buildPrisma(overrides: {
  policy?: PolicyOverrides | null;
  policyThrows?: boolean;
  participantRole?: string | null;
  globalRole?: string | null;
  participantMissing?: boolean;
  participantThrows?: boolean;
} = {}) {
  const conversationFindUnique = jest.fn<any>(async () => {
    if (overrides.policyThrows) throw new Error('db down');
    if (overrides.policy === null) return null;
    return {
      type: 'group',
      isActive: true,
      isAnnouncementChannel: false,
      defaultWriteRole: 'everyone',
      ...(overrides.policy ?? {}),
    };
  });

  const participantFindUnique = jest.fn<any>(async () => {
    if (overrides.participantThrows) throw new Error('db down');
    if (overrides.participantMissing) return null;
    // `in` plutôt que `??` : un `role: null` explicite (invité anonyme) est un
    // cas de test à part entière, qu'un repli sur 'member' effacerait.
    return {
      role: 'participantRole' in overrides ? overrides.participantRole : 'member',
      user: { role: 'globalRole' in overrides ? overrides.globalRole : 'USER' },
    };
  });

  return {
    conversation: { findUnique: conversationFindUnique },
    participant: { findUnique: participantFindUnique },
  };
}

const admit = (
  prisma: ReturnType<typeof buildPrisma>,
  params: { conversationId?: string; senderParticipantId?: string; onError?: (e: unknown) => void } = {}
) =>
  admitConversationWrite({
    prisma: prisma as never,
    conversationId: params.conversationId ?? CONV,
    senderParticipantId: params.senderParticipantId ?? SENDER,
    onError: params.onError,
  });

// ── Conversation ouverte, sans restriction : le chemin nominal ───────────────

describe('admitConversationWrite — conversation ordinaire', () => {
  it('admet un membre dans une conversation ouverte sans restriction', async () => {
    const prisma = buildPrisma();
    const decision = await admit(prisma);

    expect(isConversationWriteRefused(decision)).toBe(false);
  });

  it("ne lit JAMAIS le participant quand la conversation n'impose aucun rôle", async () => {
    const prisma = buildPrisma();
    await admit(prisma);

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('admet quand la conversation est introuvable — la porte appartient au garde d\'appartenance', async () => {
    const prisma = buildPrisma({ policy: null });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });

  it('traite un `defaultWriteRole` absent comme « everyone »', async () => {
    const prisma = buildPrisma({ policy: { defaultWriteRole: null } });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('traite un `defaultWriteRole` inconnu comme permissif plutôt que bloquant', async () => {
    const prisma = buildPrisma({ policy: { defaultWriteRole: 'wat' } });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });
});

// ── État TERMINAL du conteneur ──────────────────────────────────────────────

describe('admitConversationWrite — conversation fermée', () => {
  it('refuse un envoi dans une conversation clôturée', async () => {
    const prisma = buildPrisma({ policy: { isActive: false } });
    const decision = await admit(prisma);

    expect(decision).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('refuse AVANT toute question de rôle — une conversation fermée ne se rouvre pour personne', async () => {
    const prisma = buildPrisma({
      policy: { isActive: false, isAnnouncementChannel: true },
      participantRole: 'creator',
      globalRole: 'BIGBOSS',
    });
    const decision = await admit(prisma);

    expect(decision).toEqual({ admitted: false, reason: 'conversation-closed' });
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('refuse la conversation globale si elle est fermée — la dispense de rôle n\'est pas une dispense d\'existence', async () => {
    const prisma = buildPrisma({ policy: { type: 'global', isActive: false } });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('admet quand `isActive` est absent du document (legacy) plutôt que de bloquer', async () => {
    const prisma = buildPrisma({ policy: { isActive: null } });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });
});

// ── Canal d'annonces ────────────────────────────────────────────────────────

describe('admitConversationWrite — canal d\'annonces', () => {
  it('refuse un simple membre dans un canal d\'annonces', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'member',
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('refuse un modérateur — le canal d\'annonces exige le rang admin', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'moderator',
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('admet un admin de conversation', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'admin',
    });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });

  it('admet le créateur', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'creator',
    });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });

  it('prime sur un `defaultWriteRole` plus permissif', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true, defaultWriteRole: 'everyone' },
      participantRole: 'member',
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });
});

// ── `defaultWriteRole` seul ─────────────────────────────────────────────────

describe('admitConversationWrite — defaultWriteRole', () => {
  it('refuse un membre quand la conversation exige le rang modérateur', async () => {
    const prisma = buildPrisma({
      policy: { defaultWriteRole: 'moderator' },
      participantRole: 'member',
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('admet le rang exactement requis', async () => {
    const prisma = buildPrisma({
      policy: { defaultWriteRole: 'moderator' },
      participantRole: 'moderator',
    });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });

  it('admet un rang supérieur au rang requis', async () => {
    const prisma = buildPrisma({
      policy: { defaultWriteRole: 'moderator' },
      participantRole: 'admin',
    });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
  });

  it('refuse un participant sans rôle lisible (invité anonyme) sur un canal restreint', async () => {
    const prisma = buildPrisma({
      policy: { defaultWriteRole: 'member' },
      participantRole: null,
      globalRole: null,
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('refuse quand la ligne du participant est introuvable', async () => {
    const prisma = buildPrisma({
      policy: { defaultWriteRole: 'admin' },
      participantMissing: true,
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });
});

// ── Échappatoire staff plateforme ───────────────────────────────────────────

describe('admitConversationWrite — staff plateforme', () => {
  it.each(['ADMIN', 'BIGBOSS', 'MODERATOR'])(
    'admet un %s de la plateforme malgré un rang de conversation insuffisant',
    async (globalRole) => {
      const prisma = buildPrisma({
        policy: { isAnnouncementChannel: true },
        participantRole: 'member',
        globalRole,
      });

      expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
    }
  );

  it('ne dispense PAS un rôle global ordinaire', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'member',
      globalRole: 'USER',
    });

    expect(await admit(prisma)).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('lit le rang de conversation ET le rôle global en UNE lecture', async () => {
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantRole: 'member',
      globalRole: 'BIGBOSS',
    });
    await admit(prisma);

    expect(prisma.participant.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ── Conversation globale ────────────────────────────────────────────────────

describe('admitConversationWrite — conversation globale', () => {
  it('n\'impose aucune hiérarchie d\'écriture dans la conversation globale', async () => {
    const prisma = buildPrisma({
      policy: { type: 'global', isAnnouncementChannel: true, defaultWriteRole: 'admin' },
      participantRole: 'member',
    });

    expect(isConversationWriteRefused(await admit(prisma))).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });
});

// ── Modes de défaillance : l'asymétrie est la règle ─────────────────────────

describe('admitConversationWrite — lectures en échec', () => {
  it('ADMET quand la police est illisible — le garde ajoute une restriction, il ne la fabrique pas', async () => {
    const onError = jest.fn();
    const prisma = buildPrisma({ policyThrows: true });

    expect(isConversationWriteRefused(await admit(prisma, { onError }))).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('REFUSE quand la restriction est connue mais le rang illisible', async () => {
    const onError = jest.fn();
    const prisma = buildPrisma({
      policy: { isAnnouncementChannel: true },
      participantThrows: true,
    });

    expect(await admit(prisma, { onError })).toEqual({
      admitted: false,
      reason: 'write-role-insufficient',
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
