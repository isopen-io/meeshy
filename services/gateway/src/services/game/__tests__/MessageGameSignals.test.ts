/**
 * LES SIGNAUX D'UN MESSAGE (#9375, #9377) — ce que le jeu observe À L'ÉCRITURE :
 * une réponse dans une conversation distincte, un message dans une autre langue,
 * une réponse reçue d'un auteur distinct, et les +3 points de l'auteur répondu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MessageGameSignals } from '../MessageGameSignals';
import { REPLY_RECEIVED_DAILY_CAP } from '@meeshy/shared/utils/game/boosts';
import { GAME_BONUS_AXIS } from '../MissionService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T12:00:00Z');
const CONV = '68b000000000000000000001';

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, { systemLanguage: 'fr', engagementScore: 4000, levelRecord: 20 });
  seedUser(db, { systemLanguage: 'en', engagementScore: 4000, levelRecord: 20 }, OTHER);
  const onSignal = jest.fn<(userId: string, signal: string, options: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined);
  const creditPoints = jest.fn<(userId: string, points: number, axisKey: string) => Promise<void>>().mockResolvedValue(undefined);
  db.message.rows.push({ id: 'msg-1', createdAt: new Date('2026-10-05T11:30:00Z') });
  db.participant.rows.push(
    { id: 'p-1', conversationId: CONV, userId: USER, isActive: true },
    { id: 'p-2', conversationId: CONV, userId: OTHER, isActive: true },
  );
  const detect = jest.fn<(text: string) => Promise<string | null>>().mockResolvedValue('es');
  const signals = new MessageGameSignals(db.prisma, { missions: { onSignal }, creditPoints, detectLanguage: detect });
  return { db, signals, onSignal, creditPoints, detect };
};

/** Une mission du jour en attente de ce signal : c'est elle qui ouvre la détection de langue et les lectures de pair. */
const pendingMission = (db: FakeGameDb, signal: string) =>
  db.dailyMission.rows.push({
    id: `pending-${signal}`, userId: USER, dayKey: '2026-10-05', slot: 1, templateKey: 't', difficulty: 'medium', signal,
    prism: false, target: 3, progress: 0, reward: 60, glory: 0, seen: [], completedAt: null, paidPoints: null, rerolledAt: null,
  });

const reply = (overrides: Record<string, unknown> = {}) => ({
  senderUserId: USER,
  conversationId: CONV,
  messageId: 'msg-2',
  replyToId: 'msg-1' as string | null,
  quotedAuthorUserId: OTHER as string | null,
  originalLanguage: 'fr',
  content: 'Hola amigo, cómo estás hoy?',
  now: NOW,
  ...overrides,
});

const signalsOf = (onSignal: jest.Mock<any>, signal: string) => onSignal.mock.calls.filter((c) => c[1] === signal);

describe('MessageGameSignals — les signaux de mission', () => {
  it('une réponse à un autre compte compte pour sa conversation (signal distinct)', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply());

    expect(onSignal).toHaveBeenCalledWith(USER, 'reply-distinct-conversations', expect.objectContaining({ key: CONV }));
  });

  it('tout message compte pour sa conversation : écrire dans N conversations ne demande plus de citer (#9635)', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null }));
    await signals.record(reply({ quotedAuthorUserId: USER, messageId: 'msg-3' }));

    expect(signalsOf(onSignal, 'reply-distinct-conversations').map((c) => c[2].key)).toEqual([CONV, CONV]);
  });

  it('la langue est celle que le SERVEUR établit, jamais la déclaration du client (#9635)', async () => {
    const { db, signals, onSignal, detect } = setup();
    pendingMission(db, 'foreign-language-message');

    detect.mockResolvedValue('es');
    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'fr' }));
    detect.mockResolvedValue('fr');
    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es', messageId: 'msg-3' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(1);
  });

  it('une langue que le serveur ne sait pas établir ne compte pas (fail-closed)', async () => {
    const { db, signals, onSignal, detect } = setup();
    pendingMission(db, 'foreign-language-message');
    detect.mockResolvedValue(null);

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
  });

  it('sans défi de langue en attente, aucune détection ne part', async () => {
    const { signals, detect } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null }));

    expect(detect).not.toHaveBeenCalled();
  });

  it('répondre dans la langue de l’auteur cité, quand elle n’est pas la sienne (#9635)', async () => {
    const { db, signals, onSignal, detect } = setup();
    pendingMission(db, 'reply-in-their-language');
    detect.mockResolvedValue('en');

    await signals.record(reply());

    expect(signalsOf(onSignal, 'reply-in-their-language')).toHaveLength(1);
  });

  it('échanger, à deux, avec quelqu’un dont la langue principale diffère ; clé = le pair (#9635)', async () => {
    const { db, signals, onSignal } = setup();
    pendingMission(db, 'cross-language-exchange');

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null }));

    expect(signalsOf(onSignal, 'cross-language-exchange').map((c) => c[2].key)).toEqual([OTHER]);
  });

  it('répondre à une story, clé = la story (#9635)', async () => {
    const { db, signals, onSignal } = setup();
    pendingMission(db, 'story-reply');

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, storyReplyToId: 'story-1' }));

    expect(signalsOf(onSignal, 'story-reply').map((c) => c[2].key)).toEqual(['story-1']);
  });

  it('l’auteur répondu reçoit le signal « réponse d’un auteur distinct », clé = le répondant', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply());

    expect(onSignal).toHaveBeenCalledWith(OTHER, 'replies-received-distinct-authors', expect.objectContaining({ key: USER }));
  });

  it('un compte de moins de 24 h ne fait avancer la mission de personne', async () => {
    const { db, signals, onSignal } = setup();
    db.user.rows[0]!.createdAt = new Date('2026-10-05T10:00:00Z');

    await signals.record(reply());

    expect(signalsOf(onSignal, 'replies-received-distinct-authors')).toHaveLength(0);
  });
});

describe('MessageGameSignals — +3 points à l’auteur répondu', () => {
  it('une réponse dans l’heure rapporte 3 points à l’auteur du message', async () => {
    const { signals, creditPoints } = setup();

    await signals.record(reply());

    expect(creditPoints).toHaveBeenCalledWith(OTHER, 3, GAME_BONUS_AXIS);
  });

  it('au plus 20 réponses récompensées par auteur et par jour (REPLY_RECEIVED_DAILY_CAP)', async () => {
    const { db, signals, creditPoints } = setup();
    const originals = Array.from({ length: REPLY_RECEIVED_DAILY_CAP + 1 }, (_, i) => `orig-${i}`);
    db.message.rows.push(...originals.map((id) => ({ id, createdAt: new Date('2026-10-05T11:30:00Z') })));

    for (const [i, id] of originals.entries()) {
      await signals.record(reply({ replyToId: id, messageId: `rep-${i}` }));
    }

    expect(creditPoints).toHaveBeenCalledTimes(REPLY_RECEIVED_DAILY_CAP);
  });

  it('le plafond quotidien se réarme le lendemain, dans le fuseau de l’auteur', async () => {
    const { db, signals, creditPoints } = setup();
    const originals = Array.from({ length: REPLY_RECEIVED_DAILY_CAP }, (_, i) => `orig-${i}`);
    db.message.rows.push(...originals.map((id) => ({ id, createdAt: new Date('2026-10-05T11:30:00Z') })));
    for (const [i, id] of originals.entries()) await signals.record(reply({ replyToId: id, messageId: `rep-${i}` }));
    const tomorrow = new Date('2026-10-06T12:00:00Z');
    db.message.rows.push({ id: 'orig-demain', createdAt: new Date('2026-10-06T11:30:00Z') });

    await signals.record(reply({ replyToId: 'orig-demain', messageId: 'rep-demain', now: tomorrow }));

    expect(creditPoints).toHaveBeenCalledTimes(REPLY_RECEIVED_DAILY_CAP + 1);
  });

  it('une seule fois par message : une seconde réponse au même message ne rapporte rien', async () => {
    const { signals, creditPoints } = setup();

    await signals.record(reply());
    await signals.record(reply({ messageId: 'msg-3' }));

    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('deux réponses concurrentes au même message ne paient qu’une fois', async () => {
    const { signals, creditPoints } = setup();

    await Promise.all([signals.record(reply()), signals.record(reply({ messageId: 'msg-3' }))]);

    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('au-delà d’une heure, rien', async () => {
    const { signals, creditPoints } = setup();

    await signals.record(reply({ now: new Date('2026-10-05T12:45:00Z') }));

    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('rien pour une réponse à soi-même', async () => {
    const { signals, creditPoints } = setup();

    await signals.record(reply({ quotedAuthorUserId: USER }));

    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('rien d’un compte bloqué', async () => {
    const { db, signals, creditPoints } = setup();
    db.user.rows[1]!.blockedUserIds = [USER];

    await signals.record(reply());

    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('rien d’un compte de moins de 24 h', async () => {
    const { db, signals, creditPoints } = setup();
    db.user.rows[0]!.createdAt = new Date('2026-10-05T10:00:00Z');

    await signals.record(reply());

    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('un message d’origine introuvable ne rapporte rien et ne casse rien', async () => {
    const { signals, creditPoints } = setup();

    await signals.record(reply({ replyToId: 'msg-inconnu' }));

    expect(creditPoints).not.toHaveBeenCalled();
  });
});

describe('MessageGameSignals — l’entre-soi ne fait avancer aucune mission (#9377)', () => {
  const alone = (db: FakeGameDb) => {
    db.participant.rows = db.participant.rows.filter((p) => p.userId === USER);
  };

  it('écrire SEUL dans une autre langue ne fait pas avancer une mission du Prisme', async () => {
    const { db, signals, onSignal } = setup();
    pendingMission(db, 'foreign-language-message');
    alone(db);

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
  });

  it('répondre à un compte de moins de 24 h ne compte pas pour une conversation distincte', async () => {
    const { db, signals, onSignal } = setup();
    db.user.rows[1]!.createdAt = new Date('2026-10-05T10:00:00Z');

    await signals.record(reply());

    expect(signalsOf(onSignal, 'reply-distinct-conversations')).toHaveLength(0);
  });

  it('écrire dans une autre langue à un compte bloqué ne compte pas', async () => {
    const { db, signals, onSignal } = setup();
    pendingMission(db, 'foreign-language-message');
    db.user.rows[1]!.blockedUserIds = [USER];

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
  });

  it('au-delà de 50 messages du jour entre deux comptes seuls, la réponse reçue rapporte 3 ÷ 4 (1 point)', async () => {
    const { db, signals, creditPoints } = setup();
    db.conversationEngagement.rows.push({
      id: 'ce-1',
      userId: USER,
      conversationId: CONV,
      day: new Date('2026-10-05T00:00:00Z'),
      dayCounts: { 'content.text_message': 50 },
    });

    await signals.record(reply());

    expect(creditPoints).toHaveBeenCalledWith(OTHER, 1, GAME_BONUS_AXIS);
  });

  it('sous le seuil, la réponse reçue rapporte ses 3 points', async () => {
    const { db, signals, creditPoints } = setup();
    db.conversationEngagement.rows.push({
      id: 'ce-1',
      userId: USER,
      conversationId: CONV,
      day: new Date('2026-10-05T00:00:00Z'),
      dayCounts: { 'content.text_message': 49 },
    });

    await signals.record(reply());

    expect(creditPoints).toHaveBeenCalledWith(OTHER, 3, GAME_BONUS_AXIS);
  });
});

describe('MessageGameSignals — l’Atlas et le chiffrement de bout en bout (#9388, E-3)', () => {
  it('un message nourrit l’Atlas : envoyé pour l’expéditeur, reçu pour l’autre', async () => {
    const { db, signals } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(db.atlasStamp.rows.map((r) => [r.userId, r.language, r.sentAt != null, r.receivedAt != null])).toEqual([
      [USER, 'es', true, false],
      [OTHER, 'es', false, true],
    ]);
  });

  it('une conversation chiffrée ne produit ni mission de langue ni tampon', async () => {
    const { db, signals, onSignal, detect } = setup();
    pendingMission(db, 'foreign-language-message');
    db.conversation.rows.push({ id: CONV, encryptionEnabledAt: new Date('2026-10-01T00:00:00Z') });

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
    expect(detect).not.toHaveBeenCalled();
    expect(db.atlasStamp.rows).toHaveLength(0);
  });

  it('en conversation chiffrée, les signaux qui ne parlent pas de langue continuent', async () => {
    const { db, signals, onSignal } = setup();
    db.conversation.rows.push({ id: CONV, encryptionEnabledAt: new Date('2026-10-01T00:00:00Z') });

    await signals.record(reply({ originalLanguage: 'es' }));

    expect(onSignal).toHaveBeenCalledWith(USER, 'reply-distinct-conversations', expect.objectContaining({ key: CONV }));
  });
});

describe('MessageGameSignals — les défis ne se farment pas (#9635, revue de sécurité)', () => {
  it('« conversation démarrée » : clé = l’ensemble des personnes, pas la conversation jetable', async () => {
    const { db, signals, onSignal } = setup();
    db.participant.rows.push(
      { id: 'p-3', conversationId: 'conv-bis', userId: USER, isActive: true },
      { id: 'p-4', conversationId: 'conv-bis', userId: OTHER, isActive: true },
    );

    await signals.recordConversationStarted({ senderUserId: USER, conversationId: CONV, now: NOW });
    await signals.recordConversationStarted({ senderUserId: USER, conversationId: 'conv-bis', now: NOW });

    expect(signalsOf(onSignal, 'conversation-started').map((c) => c[2].key)).toEqual([OTHER, OTHER]);
  });

  it('« conversation démarrée » : rien seul, rien face à un compte de moins de 24 h, rien face à un compte bloqué', async () => {
    const solo = setup();
    solo.db.participant.rows = solo.db.participant.rows.filter((p) => p.userId === USER);
    await solo.signals.recordConversationStarted({ senderUserId: USER, conversationId: CONV, now: NOW });
    expect(signalsOf(solo.onSignal, 'conversation-started')).toHaveLength(0);

    const ghost = setup();
    ghost.db.user.rows[1]!.createdAt = new Date('2026-10-05T10:00:00Z');
    await ghost.signals.recordConversationStarted({ senderUserId: USER, conversationId: CONV, now: NOW });
    expect(signalsOf(ghost.onSignal, 'conversation-started')).toHaveLength(0);

    const blocked = setup();
    blocked.db.user.rows[1]!.blockedUserIds = [USER];
    await blocked.signals.recordConversationStarted({ senderUserId: USER, conversationId: CONV, now: NOW });
    expect(signalsOf(blocked.onSignal, 'conversation-started')).toHaveLength(0);
  });

  it('face à un compte fantôme (moins de 24 h), aucun fait de l’expéditeur ne part — ni langue, ni pair, ni story', async () => {
    const { db, signals, onSignal, detect } = setup();
    for (const signal of ['foreign-language-message', 'cross-language-exchange', 'story-reply', 'reply-in-their-language']) pendingMission(db, signal);
    db.user.rows[1]!.createdAt = new Date('2026-10-05T10:00:00Z');

    await signals.record(reply({ storyReplyToId: 'story-1' }));

    expect(onSignal.mock.calls.filter((c) => c[0] === USER)).toHaveLength(0);
    expect(detect).not.toHaveBeenCalled();
  });

  it('se citer soi-même ne fait jamais « répondre dans la langue de l’autre »', async () => {
    const { db, signals, onSignal, detect } = setup();
    pendingMission(db, 'reply-in-their-language');
    detect.mockResolvedValue('fr');

    await signals.record(reply({ quotedAuthorUserId: USER }));

    expect(signalsOf(onSignal, 'reply-in-their-language')).toHaveLength(0);
  });
});

