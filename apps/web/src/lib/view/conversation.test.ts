import { describe, expect, test } from 'bun:test';

import { avatarOf, initialsOf, participantAvatarOf, presenceOf, previewKindOf, titleOf } from './conversation';
import type { Conversation, Message, Participant } from '@/lib/api/types';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const minutesAgo = (minutes: number): Date => new Date(NOW - minutes * 60_000);

const participant = (partial: Partial<Participant>): Participant =>
  ({
    id: 'p1',
    conversationId: 'c1',
    userId: 'u1',
    type: 'user',
    role: 'member',
    displayName: 'Fatou Bâ',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: minutesAgo(60),
    ...partial,
  }) as Participant;

describe('presenceOf — les fenêtres 1/3/5, `now` INJECTÉ (#5559 T10)', () => {
  test('30 s ⇒ online', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(0.5) });
    expect(presenceOf(p, NOW)).toBe('online');
  });

  test('2 min ⇒ away', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(2) });
    expect(presenceOf(p, NOW)).toBe('away');
  });

  test('4 min ⇒ idle (le rang que la fixture ne couvrait pas)', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(4) });
    expect(presenceOf(p, NOW)).toBe('idle');
  });

  test('6 min ⇒ offline', () => {
    const p = participant({ isOnline: false, lastActiveAt: minutesAgo(6) });
    expect(presenceOf(p, NOW)).toBe('offline');
  });

  test('isOnline: true mais 10 min ⇒ décroissance anti-stale, PAS online', () => {
    const p = participant({ isOnline: true, lastActiveAt: minutesAgo(10) });
    expect(presenceOf(p, NOW)).toBe('offline');
  });

  test('participant undefined ⇒ offline', () => {
    expect(presenceOf(undefined, NOW)).toBe('offline');
  });
});

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: minutesAgo(60),
    updatedAt: minutesAgo(0),
    ...partial,
  }) as Conversation;

describe('titleOf — customName PRIME (#5559 T11)', () => {
  test('customName présent ⇒ prime sur title et sur le pair', () => {
    const c = conversation({
      title: 'Ancien titre',
      userPreferences: [{ customName: 'Sany' }],
      participants: [participant({ userId: 'u-viewer', displayName: 'Vous' }), participant({ userId: 'u1', displayName: 'Fatou Bâ' })],
    });
    expect(titleOf(c, 'u-viewer')).toBe('Sany');
  });

  test('customName absent ⇒ comportement inchangé (title, puis pair, puis identifier)', () => {
    const withTitle = conversation({ title: 'Équipe déploiement' });
    expect(titleOf(withTitle, 'u-viewer')).toBe('Équipe déploiement');

    const withPeer = conversation({
      participants: [participant({ userId: 'u-viewer', displayName: 'Vous' }), participant({ userId: 'u1', displayName: 'Fatou Bâ' })],
    });
    expect(titleOf(withPeer, 'u-viewer')).toBe('Fatou Bâ');
  });

  test('customName chaîne vide ⇒ ignoré, comportement inchangé', () => {
    const c = conversation({ title: 'Équipe déploiement', userPreferences: [{ customName: '' }] });
    expect(titleOf(c, 'u-viewer')).toBe('Équipe déploiement');
  });
});

/**
 * **UN DIRECT PORTE LE NOM DE L'AUTRE, MÊME S'IL A UN TITRE STOCKÉ** (#6790).
 *
 * Le legacy composait un titre CÔTÉ CLIENT et l'envoyait
 * (`apps/web/components/conversations/create-conversation-modal.tsx:102-130`,
 * chaîne `« {user1} et {user2} »`) : des milliers de directs portent en base un
 * titre qui n'est pas un nom de conversation, mais la liste de ses deux
 * membres. La v2 n'en écrit aucun, et doit maintenant les IGNORER.
 *
 * Le témoin porte sur la PRÉCÉDENCE, pas sur la chaîne : il ne cherche pas
 * « et », il vérifie que le nom du pair GAGNE. Chercher la chaîne verdirait sur
 * un titre stocké d'une autre forme (« X and Y », « X y Y ») que le même défaut
 * produit dans les quatre langues du legacy.
 */
describe('titleOf — un DIRECT ignore son titre stocké (#6790)', () => {
  const withPeer = (partial: Partial<Conversation>): Conversation =>
    conversation({
      participants: [participant({ userId: 'u-viewer', displayName: 'Vous' }), participant({ userId: 'u1', displayName: 'Fatou Bâ' })],
      ...partial,
    });

  test('direct + titre stocké + pair ⇒ le NOM DU PAIR, jamais le titre', () => {
    expect(titleOf(withPeer({ type: 'direct', title: 'J. Charles et Fatou Bâ' }), 'u-viewer')).toBe('Fatou Bâ');
  });

  test('un GROUPE garde son titre — la règle dépend du type, pas du hasard', () => {
    expect(titleOf(withPeer({ type: 'group', title: 'Équipe déploiement' }), 'u-viewer')).toBe('Équipe déploiement');
  });

  test('customName PRIME toujours, y compris sur le nom du pair d’un direct', () => {
    const c = withPeer({ type: 'direct', title: 'J. Charles et Fatou Bâ', userPreferences: [{ customName: 'Sany' }] });
    expect(titleOf(c, 'u-viewer')).toBe('Sany');
  });

  test('direct SANS pair servi ⇒ le titre stocké reste un dernier recours, jamais une ligne vide', () => {
    expect(titleOf(conversation({ type: 'direct', title: 'J. Charles et Fatou Bâ' }), 'u-viewer')).toBe('J. Charles et Fatou Bâ');
  });

  test('direct sans pair ni titre ⇒ l’identifiant ferme la marche', () => {
    expect(titleOf(conversation({ type: 'direct', identifier: 'mshy_duo' }), 'u-viewer')).toBe('mshy_duo');
  });

  /**
   * `peerOf` ne résout QUE les directs, délibérément : `participants` est
   * tronqué à cinq par la passerelle, donc « un membre servi » n'est pas « le
   * membre » d'un groupe — s'en servir comme nom afficherait la première des
   * cinq lignes reçues, au hasard de l'ordre. Un groupe sans titre retombe donc
   * sur son identifiant, et c'est la règle d'avant ce lot, inchangée.
   */
  test('un GROUPE sans titre retombe sur son IDENTIFIANT, jamais sur un membre pris au hasard', () => {
    expect(titleOf(withPeer({ type: 'group', identifier: 'mshy_equipe' }), 'u-viewer')).toBe('mshy_equipe');
  });
});

/**
 * `previewKindOf` — miroir de `LastMessageSummaryKind.swift:22-36` (D-23,
 * #5676) : l'ordre expired → hidden → view-once → ephemeral → standard.
 */
const lastMessage = (partial: Partial<Message>): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'contenu',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: minutesAgo(1),
    timestamp: minutesAgo(1),
    translations: [],
    ...partial,
  }) as Message;

describe('previewKindOf — la forme de l’aperçu de liste (D-23, #5676)', () => {
  test('lastMessage absent ⇒ standard', () => {
    expect(previewKindOf(conversation({}), NOW)).toBe('standard');
  });

  test('expiresAt <= now ⇒ expired, AVANT tout', () => {
    const c = conversation({ lastMessage: lastMessage({ expiresAt: minutesAgo(0) }) });
    expect(previewKindOf(c, NOW)).toBe('expired');
  });

  test('isBlurred ⇒ hidden', () => {
    const c = conversation({ lastMessage: lastMessage({ isBlurred: true }) });
    expect(previewKindOf(c, NOW)).toBe('hidden');
  });

  test('isViewOnce ⇒ view-once', () => {
    const c = conversation({ lastMessage: lastMessage({ isViewOnce: true }) });
    expect(previewKindOf(c, NOW)).toBe('view-once');
  });

  test('expiresAt > now ⇒ ephemeral', () => {
    const c = conversation({ lastMessage: lastMessage({ expiresAt: new Date(NOW + 120_000) }) });
    expect(previewKindOf(c, NOW)).toBe('ephemeral');
  });

  test('rien de protégé ⇒ standard', () => {
    const c = conversation({ lastMessage: lastMessage({}) });
    expect(previewKindOf(c, NOW)).toBe('standard');
  });
});

/**
 * **LA PHOTO A DEUX RANGS, ET LE SECOND EST CELUI QU'ON RATE** (#6975).
 *
 * `resolveParticipantAvatar` (`packages/shared/utils/participant-helpers.ts`)
 * est la loi PARTAGÉE : avatar LOCAL du participant, puis avatar du COMPTE
 * lié. Un client qui n'écrirait que `participant.avatar` raterait la photo de
 * compte de tout participant sans surcharge locale — et la passerelle sert
 * bien les DEUX champs (`core-list.ts:699` sérialise par `{...m}` sans
 * appliquer la loi).
 *
 * LES TÉMOINS PORTENT DONC SUR LE RANG 2 ET SUR LE REPLI, jamais seulement
 * sur le rang 1 : au rang 1, la boucle naïve et la loi juste rendent le MÊME
 * verdict, donc un témoin écrit là ne peut pas tomber (leçon 261).
 */
describe('avatarOf — la loi PARTAGÉE de l’avatar, jamais une boucle locale (#6975)', () => {
  const direct = (peer: Partial<Participant>, rest: Partial<Conversation> = {}): Conversation =>
    conversation({
      type: 'direct',
      participants: [participant({ id: 'p-viewer', userId: 'u-viewer', displayName: 'Vous' }), participant({ id: 'p-peer', userId: 'u1', ...peer })],
      ...rest,
    });

  test('rang 1 — l’avatar LOCAL du pair', () => {
    expect(avatarOf(direct({ avatar: 'local.png' }), 'u-viewer')).toBe('local.png');
  });

  test('rang 2 — l’avatar du COMPTE quand le pair n’a pas de surcharge locale', () => {
    expect(avatarOf(direct({ user: { id: 'u1', avatar: 'compte.png' } }), 'u-viewer')).toBe('compte.png');
  });

  test('rang 1 PRIME sur rang 2', () => {
    expect(avatarOf(direct({ avatar: 'local.png', user: { id: 'u1', avatar: 'compte.png' } }), 'u-viewer')).toBe('local.png');
  });

  test('un avatar local BLANC retombe sur le compte — jamais un `src=""` parasite', () => {
    expect(avatarOf(direct({ avatar: '   ', user: { id: 'u1', avatar: 'compte.png' } }), 'u-viewer')).toBe('compte.png');
  });

  test('aucun avatar de pair ⇒ repli sur `conversation.avatar`', () => {
    expect(avatarOf(direct({}, { avatar: 'salon.png' }), 'u-viewer')).toBe('salon.png');
  });

  test('un GROUPE n’a pas de pair : il porte sa propre photo', () => {
    const groupe = conversation({ type: 'group', avatar: 'equipe.png', participants: [participant({ userId: 'u-viewer' })] });
    expect(avatarOf(groupe, 'u-viewer')).toBe('equipe.png');
  });

  test('aucune photo NULLE PART ⇒ `undefined`, jamais une chaîne vide', () => {
    expect(avatarOf(direct({}), 'u-viewer')).toBeUndefined();
    expect(avatarOf(conversation({ type: 'group', avatar: '' }), 'u-viewer')).toBeUndefined();
  });
});

/**
 * `participantAvatarOf` — la MÊME loi, appliquée à un participant SEUL : le
 * `sender` d'un message (rangée Focal, bulle), le frappeur d'un roster, un
 * membre d'un rail. Elle existe pour que ces surfaces n'aient pas à
 * reconstruire `[avatar, user.avatar]` chacune de leur côté, ce qui est
 * exactement le motif qui a produit trois familles divergentes de Prisme en
 * trois cycles (`CLAUDE.md` § Prisme Linguistique).
 */
describe('participantAvatarOf — la loi partagée sur un participant seul (#6975)', () => {
  test('rang 2 servi quand le rang 1 manque', () => {
    expect(participantAvatarOf(participant({ user: { id: 'u1', avatar: 'compte.png' } }))).toBe('compte.png');
  });

  test('participant ABSENT ⇒ `undefined`', () => {
    expect(participantAvatarOf(undefined)).toBeUndefined();
  });
});

describe('initialsOf — des LETTRES, jamais la ponctuation d’un nom de carnet (#8131, #8143)', () => {
  test('« Théo (foot) » donne « TF », jamais « T( »', () => {
    expect(initialsOf('Théo (foot)')).toBe('TF');
  });

  test('la ponctuation, les emojis et les chiffres autour des mots sont sautés', () => {
    expect(initialsOf('« Maman » ❤️')).toBe('MA');
    expect(initialsOf('Nadia 🎉 - Boulot')).toBe('NB');
    expect(initialsOf('(Théo)')).toBe('TH');
    expect(initialsOf('.Zoé 2024')).toBe('ZO');
  });

  test('un mot seul garde ses deux premières lettres, deux mots leurs initiales', () => {
    expect(initialsOf('Alice')).toBe('AL');
    expect(initialsOf('Fatou Bâ')).toBe('FB');
  });

  test('les écritures non latines restent des lettres', () => {
    expect(initialsOf('سارة أحمد')).toBe('سأ');
    expect(initialsOf('王小明')).toBe('王小');
    expect(initialsOf('élodie écrit')).toBe('ÉÉ');
  });

  test('un nom sans aucune lettre rend « ? », jamais un signe', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('(🎉) !!')).toBe('?');
  });
});
