/**
 * Ce que l'état de la CONVERSATION interdit à ses membres d'y écrire.
 *
 * Deux règles réunies, découvertes par deux passes du cycle 31.
 *
 * 1. **L'état terminal.** `schema.prisma` documente `Conversation.closedAt` par
 *    « Conversation closed for all — **no one can write**, messages stay
 *    readable ». Le recensement n'a trouvé AUCUNE lecture de
 *    `Conversation.isActive` / `closedAt` comme garde : les deux champs sont
 *    écrits (clôture), diffusés (`conversation:closed`) et lus par le flux de
 *    rattrapage (`delta-tombstones`), jamais opposés à un écrivain.
 * 2. **Le rang d'écriture.** La règle existait — `MessageValidator.checkPermissions`
 *    la portait en entier, hiérarchie de rôles et échappatoire staff comprises
 *    — mais AUCUN appelant de production ne l'invoquait. Un canal d'annonces
 *    acceptait donc les messages de n'importe quel membre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  admitConversationWrite,
  admitConversationWriteFor,
  describeConversationWriteRefusal,
  isConversationClosed,
  isConversationWriteRefused
} from '../../../../services/messaging/conversationWriteAdmission';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const SENDER = 'participant-1';

// ── Le prédicat d'état terminal, pur ───────────────────────────────────────

describe('isConversationClosed — le prédicat, sur une ligne déjà chargée', () => {
  it('dit close une conversation dont `isActive` est faux', () => {
    expect(isConversationClosed({ isActive: false, closedAt: null })).toBe(true);
  });

  // `leave.ts` (créateur dernier membre) ferme en n'écrivant QUE `isActive`,
  // constat latent nº 2 du cycle 30 : un prédicat qui ne lirait que `closedAt`
  // laisserait ce quatrième écrivain de clôture hors de la règle.
  it('dit close une conversation fermée SANS `closedAt`', () => {
    expect(isConversationClosed({ isActive: false })).toBe(true);
  });

  // ... et réciproquement : un futur écrivain qui n'estampillerait que la date
  // ne doit pas pouvoir contourner la règle par omission d'un booléen.
  it('dit close une conversation estampillée `closedAt` sans `isActive` faux', () => {
    expect(isConversationClosed({ isActive: true, closedAt: new Date() })).toBe(true);
  });

  it('dit ouverte une conversation active et non estampillée', () => {
    expect(isConversationClosed({ isActive: true, closedAt: null })).toBe(false);
  });

  // L'unité n'est PAS l'autorité d'appartenance — celle-là est le
  // `Participant`, vérifié juste avant par chaque appelant. « Inconnu » n'est
  // pas « terminal » : une ligne absente ne fabrique pas un refus.
  it('n’invente pas un refus sur une ligne absente', () => {
    expect(isConversationClosed(null)).toBe(false);
    expect(isConversationClosed(undefined)).toBe(false);
  });
});

// ── La règle entière, sur une ligne déjà chargée ───────────────────────────

type PolicyOverrides = {
  type?: string | null;
  isActive?: boolean | null;
  closedAt?: Date | null;
  isAnnouncementChannel?: boolean | null;
  defaultWriteRole?: string | null;
  slowModeSeconds?: number | null;
};

function buildPolicy(overrides: PolicyOverrides = {}) {
  return {
    type: 'group',
    isActive: true,
    closedAt: null,
    isAnnouncementChannel: false,
    defaultWriteRole: 'everyone',
    slowModeSeconds: 0,
    ...overrides
  };
}

/** Instant de référence figé — le mode lent est une règle de TEMPS. */
const NOW = Date.UTC(2026, 7, 17, 12, 0, 0);
const secondsAgo = (seconds: number) => new Date(NOW - seconds * 1000);

function buildParticipantReader(overrides: {
  participantRole?: string | null;
  globalRole?: string | null;
  participantMissing?: boolean;
  lastUserMessageAt?: Date | null;
} = {}) {
  const findUnique = jest.fn<any>(async () => {
    if (overrides.participantMissing) return null;
    // `in` plutôt que `??` : un `role: null` explicite (invité anonyme) est un
    // cas de test à part entière, qu'un repli sur 'member' effacerait.
    return {
      role: 'participantRole' in overrides ? overrides.participantRole : 'member',
      user: { role: 'globalRole' in overrides ? overrides.globalRole : 'USER' }
    };
  });
  // La fenêtre est bornée à la LECTURE (`createdAt > now - slowMode`) : le faux
  // rend donc la ligne seulement si elle tombe DANS la fenêtre demandée, comme
  // le ferait Mongo. Un faux qui rendrait toujours la ligne laisserait passer
  // une règle qui aurait oublié de comparer les dates.
  const findFirst = jest.fn<any>(async (args: any) => {
    const last = overrides.lastUserMessageAt;
    if (!last) return null;
    const after = args?.where?.createdAt?.gt as Date | undefined;
    if (after && last.getTime() <= after.getTime()) return null;
    return { createdAt: last };
  });
  return { participant: { findUnique }, message: { findFirst } };
}

const admitFor = (
  policy: PolicyOverrides | null,
  readerOverrides: Parameters<typeof buildParticipantReader>[0] = {}
) => {
  const prisma = buildParticipantReader(readerOverrides);
  return {
    prisma,
    result: admitConversationWriteFor(prisma as never, {
      conversation: policy === null ? null : buildPolicy(policy),
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER,
      now: NOW
    })
  };
};

describe('admitConversationWriteFor — conversation ordinaire', () => {
  it('admet un membre dans une conversation ouverte sans restriction', async () => {
    const { result } = admitFor({});

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it("ne lit JAMAIS le participant quand la conversation n'impose aucun rôle", async () => {
    const { prisma, result } = admitFor({});
    await result;

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('admet quand la conversation est absente — la porte appartient au garde d’appartenance', async () => {
    const { result } = admitFor(null);

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('traite un `defaultWriteRole` absent comme « everyone »', async () => {
    const { prisma, result } = admitFor({ defaultWriteRole: null });

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('traite un `defaultWriteRole` inconnu comme permissif plutôt que bloquant', async () => {
    const { result } = admitFor({ defaultWriteRole: 'wat' });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });
});

describe('admitConversationWriteFor — conversation fermée', () => {
  it('refuse un envoi dans une conversation clôturée', async () => {
    const { result } = admitFor({ isActive: false });

    expect(await result).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('refuse AVANT toute question de rôle — une conversation fermée ne se rouvre pour personne', async () => {
    const { prisma, result } = admitFor(
      { isActive: false, isAnnouncementChannel: true },
      { participantRole: 'creator', globalRole: 'BIGBOSS' }
    );

    expect(await result).toEqual({ admitted: false, reason: 'conversation-closed' });
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('refuse la conversation globale si elle est fermée — la dispense de rang n’est pas une dispense d’existence', async () => {
    const { result } = admitFor({ type: 'global', isActive: false });

    expect(await result).toEqual({ admitted: false, reason: 'conversation-closed' });
  });
});

describe('admitConversationWriteFor — canal d’annonces', () => {
  it('refuse un simple membre', async () => {
    const { result } = admitFor({ isAnnouncementChannel: true }, { participantRole: 'member' });

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('refuse un modérateur — le canal d’annonces exige le rang admin', async () => {
    const { result } = admitFor({ isAnnouncementChannel: true }, { participantRole: 'moderator' });

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('admet un admin de conversation', async () => {
    const { result } = admitFor({ isAnnouncementChannel: true }, { participantRole: 'admin' });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('admet le créateur', async () => {
    const { result } = admitFor({ isAnnouncementChannel: true }, { participantRole: 'creator' });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('prime sur un `defaultWriteRole` plus permissif', async () => {
    const { result } = admitFor(
      { isAnnouncementChannel: true, defaultWriteRole: 'everyone' },
      { participantRole: 'member' }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });
});

describe('admitConversationWriteFor — defaultWriteRole', () => {
  it('refuse un membre quand la conversation exige le rang modérateur', async () => {
    const { result } = admitFor({ defaultWriteRole: 'moderator' }, { participantRole: 'member' });

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('admet le rang exactement requis', async () => {
    const { result } = admitFor({ defaultWriteRole: 'moderator' }, { participantRole: 'moderator' });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('admet un rang supérieur au rang requis', async () => {
    const { result } = admitFor({ defaultWriteRole: 'moderator' }, { participantRole: 'admin' });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('refuse un participant sans rôle lisible (invité anonyme) sur un canal restreint', async () => {
    const { result } = admitFor(
      { defaultWriteRole: 'member' },
      { participantRole: null, globalRole: null }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('refuse quand la ligne du participant est introuvable', async () => {
    const { result } = admitFor({ defaultWriteRole: 'admin' }, { participantMissing: true });

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });
});

describe('admitConversationWriteFor — staff plateforme', () => {
  it.each(['ADMIN', 'BIGBOSS', 'MODERATOR'])(
    'admet un %s de la plateforme malgré un rang de conversation insuffisant',
    async (globalRole) => {
      const { result } = admitFor(
        { isAnnouncementChannel: true },
        { participantRole: 'member', globalRole }
      );

      expect(isConversationWriteRefused(await result)).toBe(false);
    }
  );

  it('ne dispense PAS un rôle global ordinaire', async () => {
    const { result } = admitFor(
      { isAnnouncementChannel: true },
      { participantRole: 'member', globalRole: 'USER' }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  it('lit le rang de conversation ET le rôle global en UNE lecture', async () => {
    const { prisma, result } = admitFor(
      { isAnnouncementChannel: true },
      { participantRole: 'member', globalRole: 'BIGBOSS' }
    );
    await result;

    expect(prisma.participant.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('admitConversationWriteFor — conversation globale', () => {
  it('n’impose aucune hiérarchie d’écriture dans la conversation globale', async () => {
    const { prisma, result } = admitFor(
      { type: 'global', isAnnouncementChannel: true, defaultWriteRole: 'admin' },
      { participantRole: 'member' }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });
});

describe('admitConversationWriteFor — tête-à-tête', () => {
  // Dans un `direct`, l'initiateur reçoit `role: 'creator'` et l'autre
  // `role: 'member'` (`routes/conversations/core.ts`, création). Cette asymétrie
  // nomme qui a ouvert le fil, PAS une autorité sur l'autre partie. Sans cette
  // dispense, le `creator` posait `isAnnouncementChannel` sur le tête-à-tête et
  // le rang (member 1 < admin 3) refusait durablement les messages du pair.
  it('n’impose aucune hiérarchie d’écriture dans un tête-à-tête marqué canal d’annonces', async () => {
    const { prisma, result } = admitFor(
      { type: 'direct', isAnnouncementChannel: true },
      { participantRole: 'member' }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  it('ignore un `defaultWriteRole` posé sur un tête-à-tête', async () => {
    const { prisma, result } = admitFor(
      { type: 'direct', defaultWriteRole: 'admin' },
      { participantRole: 'member' }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
  });

  // La borne, jumelle de celle de la conversation globale : la dispense porte
  // sur le RANG, jamais sur l'existence.
  it('refuse le tête-à-tête fermé — la dispense de rang n’est pas une dispense d’existence', async () => {
    const { result } = admitFor({ type: 'direct', isActive: false });

    expect(await result).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  // La borne de l'autre côté : un groupe garde sa hiérarchie. La dispense ne
  // doit pas se lire « tout type nommé est dispensé ».
  it('laisse un groupe canal d’annonces refuser un simple membre', async () => {
    const { result } = admitFor(
      { type: 'group', isAnnouncementChannel: true },
      { participantRole: 'member' }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });
});

// ── Le mode lent ───────────────────────────────────────────────────────────

describe('admitConversationWriteFor — mode lent', () => {
  it('refuse un membre qui vient d’écrire, et dit COMBIEN de temps attendre', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: secondsAgo(10) }
    );

    expect(await result).toEqual({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 20
    });
  });

  // Le décompte est ARRONDI AU-DESSUS : un client qui réessaie à la seconde
  // annoncée doit passer, jamais retomber sur un refus d'un dixième de seconde.
  it('arrondit le décompte au-dessus', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: new Date(NOW - 10_400) }
    );

    expect(await result).toEqual({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 20
    });
  });

  // La borne exacte : le délai ÉCOULÉ ouvre le droit d'écrire. `30 s` veut dire
  // « une fois les 30 secondes passées », pas « après la 31e ».
  it('admet quand le délai est exactement écoulé', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: secondsAgo(30) }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('admet un membre dont le dernier envoi précède la fenêtre', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: secondsAgo(90) }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  it('admet un membre qui n’a jamais écrit dans la conversation', async () => {
    const { result } = admitFor({ slowModeSeconds: 30 }, { lastUserMessageAt: null });

    expect(isConversationWriteRefused(await result)).toBe(false);
  });

  // Le chemin nominal — l'écrasante majorité du trafic — ne paie RIEN : ni la
  // lecture du rôle, ni celle du dernier message.
  it('ne lit personne quand le mode lent est désactivé', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: 0 },
      { lastUserMessageAt: secondsAgo(1) }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  // Le champ est ABSENT de toute conversation créée avant sa migration : un
  // `undefined` doit dégénérer en « aucune restriction », l'état d'avant.
  it('ne restreint rien quand le champ est absent', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: undefined },
      { lastUserMessageAt: secondsAgo(1) }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  // `PUT /conversations/:id` ne borne PAS la valeur (`type: 'number'` au schéma,
  // sans minimum) : une valeur négative est écrivable, et doit se lire
  // « désactivé » plutôt que produire un décompte négatif.
  it('lit une valeur négative comme désactivée', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: -30 },
      { lastUserMessageAt: secondsAgo(1) }
    );

    expect(isConversationWriteRefused(await result)).toBe(false);
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it.each(['moderator', 'admin', 'creator'])(
    'laisse un %s écrire sans attendre',
    async (participantRole) => {
      const { prisma, result } = admitFor(
        { slowModeSeconds: 30 },
        { participantRole, lastUserMessageAt: secondsAgo(1) }
      );

      expect(isConversationWriteRefused(await result)).toBe(false);
      // Le contournement est tranché sur le RANG seul : inutile d'aller
      // chercher un dernier envoi dont la réponse ne changera rien.
      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    }
  );

  it.each(['ADMIN', 'BIGBOSS', 'MODERATOR'])(
    'laisse le staff plateforme %s écrire sans attendre',
    async (globalRole) => {
      const { result } = admitFor(
        { slowModeSeconds: 30 },
        { participantRole: 'member', globalRole, lastUserMessageAt: secondsAgo(1) }
      );

      expect(isConversationWriteRefused(await result)).toBe(false);
    }
  );

  // La borne du contournement : `member` est SOUS le rang de modération, et
  // `everyone` aussi. Sans elle, « le rang contourne » se lirait « tout rôle
  // nommé contourne ».
  it.each(['member', 'everyone', null])(
    'ne laisse pas le rôle %s contourner le mode lent',
    async (participantRole) => {
      const { result } = admitFor(
        { slowModeSeconds: 30 },
        { participantRole, lastUserMessageAt: secondsAgo(10) }
      );

      expect(await result).toEqual({
        admitted: false,
        reason: 'slow-mode-active',
        retryAfterSeconds: 20
      });
    }
  );

  // Les résumés d'appel sont attribués au participant de l'INITIATEUR
  // (`CallService.postCallSummary`), qui ne les a pas tapés. Sans ce filtre,
  // raccrocher ferait taire l'initiateur pendant toute la fenêtre.
  it('ne compte que les messages que l’utilisateur a lui-même envoyés', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: secondsAgo(10) }
    );
    await result;

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: CONVERSATION_ID,
        senderId: SENDER,
        messageSource: 'user',
        createdAt: { gt: secondsAgo(30) }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });
  });

  // L'état terminal ne connaît AUCUNE dispense, et il passe AVANT : on ne
  // répond pas « revenez dans 20 secondes » sur un fil définitivement clos.
  it('refuse la conversation close plutôt que d’annoncer une attente', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30, isActive: false },
      { lastUserMessageAt: secondsAgo(10) }
    );

    expect(await result).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  // Le RANG passe avant le débit : « vous n'avez pas le droit d'écrire ici »
  // est un refus absolu, et l'annoncer comme un « pas encore » ferait attendre
  // un client qui ne passera jamais.
  it('refuse sur le rang plutôt que sur le débit quand les deux s’appliquent', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: 30, isAnnouncementChannel: true },
      { participantRole: 'member', lastUserMessageAt: secondsAgo(10) }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  // Les deux règles ont besoin du même rôle. Le lire deux fois serait une
  // lecture gratuite sur le seul chemin qui en paie déjà une.
  it('ne lit le participant qu’UNE fois quand le rang et le débit s’appliquent', async () => {
    const { prisma, result } = admitFor(
      { slowModeSeconds: 30, defaultWriteRole: 'member' },
      { participantRole: 'member', lastUserMessageAt: secondsAgo(10) }
    );
    await result;

    expect(prisma.participant.findUnique).toHaveBeenCalledTimes(1);
  });

  // Même arbitrage que le rang : la restriction est CONNUE, seule l'identité
  // manque, et on n'admet pas ce qu'on ne peut pas prouver. Le refus est celui
  // de l'autorisation, pas du débit — aucune attente ne rendrait ce compte
  // capable d'écrire.
  it('refuse quand le participant est introuvable sous mode lent', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { participantMissing: true, lastUserMessageAt: secondsAgo(10) }
    );

    expect(await result).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  // Le contournement du mode lent EST une hiérarchie (`moderator` et au-delà).
  // Un tête-à-tête n'en a pas : son `creator` — qui n'est que celui qui a ouvert
  // le fil — contournerait en imposant l'attente à son pair `member`. C'est
  // l'attaque du cycle 56-bis, au ralenti. La route refuse désormais d'écrire ce
  // champ sur un `direct` ; cette dispense-ci GUÉRIT les fils déjà empoisonnés.
  it.each(['direct', 'global'])(
    'n’impose aucun mode lent dans un conteneur %s sans hiérarchie',
    async (type) => {
      const { prisma, result } = admitFor(
        { type, slowModeSeconds: 30 },
        { participantRole: 'member', lastUserMessageAt: secondsAgo(1) }
      );

      expect(isConversationWriteRefused(await result)).toBe(false);
      expect(prisma.message.findFirst).not.toHaveBeenCalled();
    }
  );

  // La borne de l'autre côté : un groupe garde son mode lent.
  it('impose le mode lent dans un groupe', async () => {
    const { result } = admitFor(
      { type: 'group', slowModeSeconds: 30 },
      { participantRole: 'member', lastUserMessageAt: secondsAgo(5) }
    );

    expect(await result).toEqual({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 25
    });
  });

  // Horloges désaccordées : une ligne DANS LE FUTUR ne doit pas produire une
  // attente plus longue que le réglage lui-même.
  it('ne promet jamais une attente plus longue que le réglage', async () => {
    const { result } = admitFor(
      { slowModeSeconds: 30 },
      { lastUserMessageAt: new Date(NOW + 60_000) }
    );

    expect(await result).toEqual({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 30
    });
  });
});

// ── Ce qu'on dit à l'expéditeur ────────────────────────────────────────────

describe('describeConversationWriteRefusal — le message, en un seul exemplaire', () => {
  it('dit la clôture', () => {
    expect(describeConversationWriteRefusal({ admitted: false, reason: 'conversation-closed' }))
      .toBe('Cette conversation est fermée : elle n’accepte plus de messages');
  });

  it('dit le rang insuffisant', () => {
    expect(describeConversationWriteRefusal({ admitted: false, reason: 'write-role-insufficient' }))
      .toBe('Vous n’avez pas le droit d’écrire dans cette conversation');
  });

  // Le seul message dont le TEXTE dépend de la décision : le décompte doit y
  // apparaître, sinon le client n'a plus qu'à deviner quand réessayer.
  it('dit le mode lent AVEC son décompte', () => {
    expect(describeConversationWriteRefusal({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 12
    })).toBe('Mode lent actif : réessayez dans 12 s');
  });

  // Un refus de mode lent porte toujours son décompte ; le repli évite
  // d'afficher « réessayez dans undefined s » si un appelant l'omettait.
  it('ne dit jamais « undefined » quand le décompte manque', () => {
    expect(describeConversationWriteRefusal({ admitted: false, reason: 'slow-mode-active' }))
      .toBe('Mode lent actif : réessayez dans 1 s');
  });
});

// ── La lecture, pour le point de convergence ───────────────────────────────

const readerReturning = (row: unknown, participant: unknown = { role: 'member', user: null }) =>
  ({
    conversation: { findUnique: jest.fn(async () => row) },
    participant: { findUnique: jest.fn(async () => participant) },
    message: { findFirst: jest.fn(async () => null) }
  }) as any;

describe('admitConversationWrite — la lecture, pour le point de convergence', () => {
  it('refuse l’écriture dans une conversation close', async () => {
    const prisma = readerReturning({ isActive: false, closedAt: new Date() });

    const admission = await admitConversationWrite(prisma, {
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER
    });

    expect(isConversationWriteRefused(admission)).toBe(true);
    expect(admission).toEqual({ admitted: false, reason: 'conversation-closed' });
  });

  it('admet l’écriture dans une conversation active', async () => {
    const prisma = readerReturning({ isActive: true, closedAt: null });

    const admission = await admitConversationWrite(prisma, {
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER
    });

    expect(isConversationWriteRefused(admission)).toBe(false);
  });

  it('refuse un membre dans un canal d’annonces atteint par la lecture', async () => {
    const prisma = readerReturning(
      { type: 'group', isActive: true, closedAt: null, isAnnouncementChannel: true },
      { role: 'member', user: { role: 'USER' } }
    );

    const admission = await admitConversationWrite(prisma, {
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER
    });

    expect(admission).toEqual({ admitted: false, reason: 'write-role-insufficient' });
  });

  // La projection est load-bearing : la garde de l'état terminal ET celle du
  // rang lisent ce que ce `select` ramène, et rien d'autre. Un champ retiré
  // ici rend la règle correspondante inerte SANS rougir aucun autre témoin —
  // c'est très exactement ce qui était arrivé à la branche `mshy_` de la route
  // de lien authentifiée.
  it('ramène l’état terminal ET la police d’écriture, et rien de plus', async () => {
    const prisma = readerReturning({ isActive: true, closedAt: null });

    await admitConversationWrite(prisma, {
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER
    });

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID },
      select: {
        type: true,
        isActive: true,
        closedAt: true,
        isAnnouncementChannel: true,
        defaultWriteRole: true,
        slowModeSeconds: true
      }
    });
  });

  it('applique le mode lent atteint par la lecture', async () => {
    const prisma = readerReturning(
      { type: 'group', isActive: true, closedAt: null, slowModeSeconds: 30 },
      { role: 'member', user: { role: 'USER' } }
    );
    prisma.message.findFirst = jest.fn(async () => ({ createdAt: secondsAgo(10) }));

    const admission = await admitConversationWrite(prisma, {
      conversationId: CONVERSATION_ID,
      senderParticipantId: SENDER,
      now: NOW
    });

    expect(admission).toEqual({
      admitted: false,
      reason: 'slow-mode-active',
      retryAfterSeconds: 20
    });
  });
});
