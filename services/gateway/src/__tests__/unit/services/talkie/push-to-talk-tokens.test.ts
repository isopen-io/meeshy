/**
 * #17142 (revue de sécurité du lot iOS) — un jeton PushToTalk vit et meurt avec la
 * session qui l'a enregistré : resté après une déconnexion, il réveillerait l'appareil
 * pour le compte précédent.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { retireOrphanPushToTalkTokens, retirePushTokensAfterSessionEnd } from '../../../../services/pushTokenSessions';
import { talkieWakeChannel } from '../../../../services/talkie/talkiePush';

const NOW = new Date('2026-11-08T10:00:00Z');
const U = 'u-1';

type Token = { id: string; userId: string; type: string; sessionId: string | null; isActive: boolean };
type Session = { id: string; userId: string; sessionToken: string; isValid: boolean; expiresAt: Date };

function store(tokens: Token[], sessions: Session[]) {
  let rows = [...tokens];
  const matches = (t: Token, where: Record<string, any>) =>
    (where.userId === undefined || (typeof where.userId === 'string' ? t.userId === where.userId : where.userId.in.includes(t.userId)))
    && (where.type === undefined || (typeof where.type === 'string' ? t.type === where.type : where.type.in ? where.type.in.includes(t.type) : t.type !== where.type.not))
    && (where.isActive === undefined || t.isActive === where.isActive)
    && (where.id === undefined || where.id.in.includes(t.id))
    && (where.sessionId === undefined || (typeof where.sessionId === 'string' ? t.sessionId === where.sessionId : where.sessionId.in.includes(t.sessionId)));
  return {
    get rows() { return rows; },
    prisma: {
      pushToken: {
        findMany: async (args: { where: Record<string, any> }) => rows.filter((t) => matches(t, args.where)),
        deleteMany: async (args: { where: Record<string, any> }) => {
          const before = rows.length;
          rows = rows.filter((t) => !matches(t, args.where));
          return { count: before - rows.length };
        },
        updateMany: async (args: { where: Record<string, any>; data: Partial<Token> }) => {
          const touched = rows.filter((t) => matches(t, args.where));
          touched.forEach((t) => Object.assign(t, args.data));
          return { count: touched.length };
        },
      },
      userSession: {
        findMany: async (args: { where: Record<string, any> }) => sessions.filter((s) =>
          (args.where.sessionToken === undefined || s.sessionToken === args.where.sessionToken)
          && (args.where.id === undefined || (typeof args.where.id === 'string' ? s.id === args.where.id : args.where.id.in.includes(s.id)))
          && (args.where.isValid === undefined || s.isValid === args.where.isValid)
          && (args.where.expiresAt === undefined || s.expiresAt > args.where.expiresAt.gt)),
      },
    },
  };
}

const later = new Date(NOW.getTime() + 86_400_000);
const ptt = (id: string, sessionId: string | null, userId = U): Token => ({ id, userId, type: 'pushtotalk', sessionId, isActive: true });

describe('#17142 — le jeton PushToTalk suit sa session', () => {
  it('la fermeture d’UNE session supprime ses jetons PushToTalk et désactive ses autres jetons (#9616), pas ceux d’une autre session', async () => {
    const s = store([ptt('a', 's1'), ptt('b', 's2'), { ...ptt('c', 's1'), type: 'apns' }, { ...ptt('d', 's2'), type: 'apns' }], [{ id: 's1', userId: U, sessionToken: 'h', isValid: false, expiresAt: later }]);
    await retirePushTokensAfterSessionEnd(s.prisma as never, { sessionId: 's1' }, () => undefined);

    expect(s.rows.map((t) => `${t.id}:${t.isActive}`)).toEqual(['b:true', 'c:false', 'd:true']);
  });

  it('une déconnexion par jeton de session (condensat) retire aussi', async () => {
    const s = store([ptt('a', 's1')], [{ id: 's1', userId: U, sessionToken: 'hash-1', isValid: false, expiresAt: later }]);
    await retirePushTokensAfterSessionEnd(s.prisma as never, { sessionToken: 'hash-1' }, () => undefined);

    expect(s.rows).toEqual([]);
  });

  it('« partout » / suppression du compte : chaque jeton PushToTalk dont la session n’est plus valide, ou sans session, part', async () => {
    const s = store(
      [ptt('vivant', 's-ok'), ptt('ferme', 's-ko'), ptt('expire', 's-old'), ptt('orphelin', null), ptt('autre-compte', 's-ko', 'u-2')],
      [
        { id: 's-ok', userId: U, sessionToken: 'x', isValid: true, expiresAt: later },
        { id: 's-ko', userId: U, sessionToken: 'y', isValid: false, expiresAt: later },
        { id: 's-old', userId: U, sessionToken: 'z', isValid: true, expiresAt: new Date(NOW.getTime() - 1) },
      ],
    );
    await retireOrphanPushToTalkTokens(s.prisma as never, U, NOW);

    expect(s.rows.map((t) => t.id).sort()).toEqual(['autre-compte', 'vivant']);
  });

  it('un retrait qui échoue ne fait jamais échouer la fermeture de session', async () => {
    const errors: unknown[] = [];
    const broken = { pushToken: { findMany: async () => { throw new Error('mongo'); }, deleteMany: async () => { throw new Error('mongo'); } }, userSession: { findMany: async () => [{ id: 's1', userId: U }] } };
    await expect(retirePushTokensAfterSessionEnd(broken as never, { sessionId: 's1' }, (e) => errors.push(e))).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('la porte du réveil ignore — et retire — un jeton PushToTalk dont la session est close ; un appareil qui ne sait pas router le réveil ne compte pas', async () => {
    const s = store([ptt('ferme', 's-ko'), { ...ptt('apns', null), type: 'apns' }], [{ id: 's-ko', userId: U, sessionToken: 'y', isValid: false, expiresAt: later }]);

    expect(await talkieWakeChannel(s.prisma as never, U, NOW)).toBeNull();
    expect(s.rows.map((t) => t.id)).toEqual(['apns']);
  });

  it('un jeton PushToTalk dont la session vit : canal pushtotalk', async () => {
    const s = store([ptt('vivant', 's-ok')], [{ id: 's-ok', userId: U, sessionToken: 'x', isValid: true, expiresAt: later }]);

    expect(await talkieWakeChannel(s.prisma as never, U, NOW)).toBe('pushtotalk');
  });
});
