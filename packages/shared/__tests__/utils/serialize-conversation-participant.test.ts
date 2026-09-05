/**
 * `serializeConversationParticipant` — la SEULE fabrique de la forme de fil
 * déclarée par `conversationParticipantSchema`.
 *
 * Elle existe parce que trois surfaces la réécrivaient à la main en gardant la
 * présence, et deux passaient le rang Prisma BRUT sans la garder (cycle 92 bis).
 * Les témoins ci-dessous tiennent donc DEUX propriétés, pas une : la forme, et
 * le fait que la présence ne sort jamais sans qu'on l'ait autorisée.
 */
import { describe, it, expect } from 'vitest';
import { serializeConversationParticipant } from '../../utils/participant-helpers.js';

const JOINED = new Date('2026-08-01T10:00:00.000Z');
const SEEN = new Date('2026-08-22T09:00:00.000Z');
const USER_CREATED = new Date('2025-01-01T00:00:00.000Z');
const USER_UPDATED = new Date('2026-06-01T00:00:00.000Z');

const registeredRow = () => ({
  id: 'part-1',
  conversationId: 'conv-1',
  userId: 'usr-1',
  type: 'user',
  displayName: 'Alice B.',
  avatar: null,
  role: 'admin',
  language: 'fr',
  isActive: true,
  isOnline: true,
  lastActiveAt: SEEN,
  joinedAt: JOINED,
  permissions: {
    canSendMessages: true,
    canSendFiles: false,
    canSendImages: true,
  },
  user: {
    id: 'usr-1',
    username: 'alice',
    firstName: 'Alice',
    lastName: 'Bernard',
    displayName: 'Alice B.',
    avatar: 'https://cdn/alice.png',
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: 'es',
    createdAt: USER_CREATED,
    updatedAt: USER_UPDATED,
  },
});

const anonymousRow = () => ({
  id: 'part-2',
  conversationId: 'conv-1',
  userId: null,
  type: 'anonymous',
  displayName: 'ano_bob',
  avatar: 'https://cdn/local.png',
  role: 'member',
  language: 'de',
  isActive: true,
  isOnline: true,
  lastActiveAt: SEEN,
  joinedAt: JOINED,
  permissions: null,
  user: null,
});

describe('serializeConversationParticipant — la forme de fil', () => {
  it('sépare les deux rangs que le rang Prisma confond : global vs conversation', () => {
    const wire = serializeConversationParticipant(registeredRow());

    expect(wire.role).toBe('USER');
    expect(wire.conversationRole).toBe('admin');
  });

  it('expose participantId, que le rang brut ne porte pas', () => {
    const wire = serializeConversationParticipant(registeredRow());

    expect(wire.participantId).toBe('part-1');
    expect(wire.userId).toBe('usr-1');
  });

  it('aplatit l\'identité du compte lié — username, prénom, nom', () => {
    const wire = serializeConversationParticipant(registeredRow());

    expect(wire.username).toBe('alice');
    expect(wire.firstName).toBe('Alice');
    expect(wire.lastName).toBe('Bernard');
  });

  it('retombe sur le displayName local quand aucun compte n\'est lié', () => {
    const wire = serializeConversationParticipant(anonymousRow());

    expect(wire.username).toBe('ano_bob');
    expect(wire.firstName).toBe('ano_bob');
    expect(wire.lastName).toBe('');
    expect(wire.isAnonymous).toBe(true);
  });

  it('résout l\'avatar par la source unique : local d\'abord, compte ensuite', () => {
    expect(serializeConversationParticipant(registeredRow()).avatar).toBe('https://cdn/alice.png');
    expect(serializeConversationParticipant(anonymousRow()).avatar).toBe('https://cdn/local.png');
  });

  it('retombe sur la langue du participant quand le compte n\'en déclare pas', () => {
    expect(serializeConversationParticipant(registeredRow()).systemLanguage).toBe('fr');
    expect(serializeConversationParticipant(anonymousRow()).systemLanguage).toBe('de');
    expect(serializeConversationParticipant(anonymousRow()).regionalLanguage).toBe('de');
  });

  it('date le participant sur son compte, et sur son entrée à défaut', () => {
    expect(serializeConversationParticipant(registeredRow()).createdAt).toBe(USER_CREATED);
    expect(serializeConversationParticipant(anonymousRow()).createdAt).toBe(JOINED);
    expect(serializeConversationParticipant(anonymousRow()).updatedAt).toBe(JOINED);
  });
});

describe('serializeConversationParticipant — la présence ne sort pas toute seule', () => {
  it('sert la présence quand la visibilité fournie l\'autorise', () => {
    const wire = serializeConversationParticipant(registeredRow(), {
      presence: { showOnline: true, showLastSeenTimestamp: true },
    });

    expect(wire.isOnline).toBe(true);
    expect(wire.lastActiveAt).toBe(SEEN);
  });

  it('masque isOnline quand la cible refuse de montrer son statut', () => {
    const wire = serializeConversationParticipant(registeredRow(), {
      presence: { showOnline: false, showLastSeenTimestamp: false },
    });

    expect(wire.isOnline).toBe(false);
    expect(wire.lastActiveAt).toBeNull();
  });

  it('masque la seule dernière vue quand c\'est la seule préférence refusée', () => {
    const wire = serializeConversationParticipant(registeredRow(), {
      presence: { showOnline: true, showLastSeenTimestamp: false },
    });

    expect(wire.isOnline).toBe(true);
    expect(wire.lastActiveAt).toBeNull();
  });

  // Le défaut FERME. La fabrique ne sait rien du viewer : c'est l'appelant qui
  // résout la visibilité (`resolveForTarget(s)` + `presenceFor`, qui traite
  // l'entrée absente — cible sans compte — comme masquée sauf ADMIN+). Sans
  // visibilité fournie, elle ne peut donc que masquer : révéler ici, ce serait
  // révéler à l'appelant qui a OUBLIÉ l'option, jamais à celui qui a établi un
  // droit.
  it('masque quand aucune visibilité n\'est fournie', () => {
    const wire = serializeConversationParticipant(anonymousRow());

    expect(wire.isOnline).toBe(false);
    expect(wire.lastActiveAt).toBeNull();
  });

  it('masque aussi un rang inscrit, colonne « en ligne » comprise, sans visibilité', () => {
    const wire = serializeConversationParticipant(registeredRow());

    expect(wire.isOnline).toBe(false);
    expect(wire.lastActiveAt).toBeNull();
  });

  it('préfère la présence VIVE du socket au champ de base, quand elle est fournie', () => {
    const reveal = { showOnline: true, showLastSeenTimestamp: true };
    const staleOnline = { ...registeredRow(), isOnline: true };
    const staleOffline = { ...registeredRow(), isOnline: false };

    expect(serializeConversationParticipant(staleOnline, { liveOnline: false, presence: reveal }).isOnline).toBe(false);
    expect(serializeConversationParticipant(staleOffline, { liveOnline: true, presence: reveal }).isOnline).toBe(true);
  });

  it('ne laisse pas la présence VIVE sortir sans visibilité', () => {
    const wire = serializeConversationParticipant(registeredRow(), { liveOnline: true });

    expect(wire.isOnline).toBe(false);
  });

  it('laisse la préférence l\'emporter sur la présence vive', () => {
    const wire = serializeConversationParticipant(registeredRow(), {
      liveOnline: true,
      presence: { showOnline: false, showLastSeenTimestamp: false },
    });

    expect(wire.isOnline).toBe(false);
  });
});

describe('serializeConversationParticipant — ce qui ne doit PAS sortir', () => {
  // Le rang Prisma porte de l'état privé par paire (conversation, personne) :
  // aucune surface ne le sert, et la diffusion Socket.IO n'a pas de sérialiseur
  // pour l'arrêter. La fabrique ne le recopie donc jamais.
  it.each([
    'bannedAt',
    'leftAt',
    'deletedForMe',
    'nickname',
    'shareLinkId',
    'sessionTokenHash',
    'anonymousSession',
    'conversationId',
  ])('ne recopie pas %s', (field) => {
    const row = {
      ...registeredRow(),
      bannedAt: new Date(),
      leftAt: new Date(),
      deletedForMe: new Date(),
      nickname: 'surnom privé',
      shareLinkId: 'lnk-1',
      sessionTokenHash: 'sha256-secret',
      anonymousSession: { profile: { firstName: 'Bob' } },
    };

    expect(serializeConversationParticipant(row)).not.toHaveProperty(field);
  });

  // #4643 — `autoTranslateEnabled: true` était un littéral, jamais lu depuis
  // aucun magasin (`User` ne porte pas cette colonne ; le magasin réel est
  // `UserPreferences.application`, jamais chargé ici). Même défaut, même
  // correctif que #4161 sur le profil public : retiré plutôt que servi, la
  // co-participation à une conversation ne donnant accès à aucune préférence
  // personnelle d'un tiers. Un retour du littéral doit faire tomber ce témoin.
  it('ne sert jamais autoTranslateEnabled — plus de littéral fabriqué', () => {
    expect(serializeConversationParticipant(registeredRow())).not.toHaveProperty('autoTranslateEnabled');
    expect(serializeConversationParticipant(anonymousRow())).not.toHaveProperty('autoTranslateEnabled');
  });
});
