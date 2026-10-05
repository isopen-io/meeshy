/**
 * LES SIGNAUX D'UN MESSAGE (#9375, #9377) — ce que le jeu observe À L'ÉCRITURE :
 * une réponse dans une conversation distincte, un message dans une autre langue,
 * une réponse reçue d'un auteur distinct, et les +3 points de l'auteur répondu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MessageGameSignals } from '../MessageGameSignals';
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
  const signals = new MessageGameSignals(db.prisma, { missions: { onSignal }, creditPoints });
  return { db, signals, onSignal, creditPoints };
};

const reply = (overrides: Record<string, unknown> = {}) => ({
  senderUserId: USER,
  conversationId: CONV,
  messageId: 'msg-2',
  replyToId: 'msg-1' as string | null,
  quotedAuthorUserId: OTHER as string | null,
  originalLanguage: 'fr',
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

  it('un message qui n’est pas une réponse ne compte pas comme réponse', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null }));

    expect(signalsOf(onSignal, 'reply-distinct-conversations')).toHaveLength(0);
  });

  it('se répondre à soi-même ne compte pas', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ quotedAuthorUserId: USER }));

    expect(signalsOf(onSignal, 'reply-distinct-conversations')).toHaveLength(0);
  });

  it('un message dans une autre langue que la langue système de l’expéditeur est un message du Prisme', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'es' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(1);
  });

  it('la même langue, ou une variante régionale d’elle, n’en est pas un', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'fr' }));
    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'fr-CA', messageId: 'msg-3' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
  });

  it('une langue détectée « inconnue » ne compte pas', async () => {
    const { signals, onSignal } = setup();

    await signals.record(reply({ replyToId: null, quotedAuthorUserId: null, originalLanguage: 'unknown' }));

    expect(signalsOf(onSignal, 'foreign-language-message')).toHaveLength(0);
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
