/**
 * #17142 (revue de sécurité du lot iOS) — un jeton PushToTalk vit et meurt avec la
 * session qui l'a enregistré : resté après une déconnexion, il réveillerait l'appareil
 * pour le compte précédent.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { retireOrphanPushToTalkTokens, retirePushToTalkTokensAfterSessionEnd } from '../../../../services/talkie/pushToTalkTokens';
import { talkieWakeChannel } from '../../../../services/talkie/talkiePush';

const NOW = new Date('2026-11-08T10:00:00Z');
const U = 'u-1';

type Token = { id: string; userId: string; type: string; sessionId: string | null; isActive: boolean };
type Session = { id: string; userId: string; sessionToken: string; isValid: boolean; expiresAt: Date };

function store(tokens: Token[], sessions: Session[]) {
  let rows = [...tokens];
  const matches = (t: Token, where: Record<string, any>) =>
    (where.userId === undefined || (typeof where.userId === 'string' ? t.userId === where.userId : true))
    && (where.type === undefined || (typeof where.type === 'string' ? t.type === where.type : where.type.in.includes(t.type)))
    && (where.isActive === undefined || t.isActive === where.isActive)
    && (where.id === undefined || where.id.in.includes(t.id))
    && (where.sessionId === undefined || where.sessionId.in.includes(t.sessionId));
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
      },
      userSession: {
        findMany: async (args: { where: Record<string, any> }) => sessions.filter((s) =>
          (args.where.sessionToken === undefined || s.sessionToken === args.where.sessionToken)
          && (args.where.id === undefined || args.where.id.in.includes(s.id))
          && (args.where.isValid === undefined || s.isValid === args.where.isValid)
          && (args.where.expiresAt === undefined || s.expiresAt > args.where.expiresAt.gt)),
      },
    },
  };
}

const later = new Date(NOW.getTime() + 86_400_000);
const ptt = (id: string, sessionId: string | null, userId = U): Token => ({ id, userId, type: 'pushtotalk', sessionId, isActive: true });

describe('#17142 — le jeton PushToTalk suit sa session', () => {
  it('la fermeture d’UNE session retire ses jetons PushToTalk, pas ceux d’une autre session ni les autres jetons', async () => {
    const s = store([ptt('a', 's1'), ptt('b', 's2'), { ...ptt('c', 's1'), type: 'apns' }], []);
    await retirePushToTalkTokensAfterSessionEnd(s.prisma as never, { sessionId: 's1' }, () => undefined);

    expect(s.rows.map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('une déconnexion par jeton de session (condensat) retire aussi', async () => {
    const s = store([ptt('a', 's1')], [{ id: 's1', userId: U, sessionToken: 'hash-1', isValid: false, expiresAt: later }]);
    await retirePushToTalkTokensAfterSessionEnd(s.prisma as never, { sessionToken: 'hash-1' }, () => undefined);

    expect(s.rows).toEqual([]);
  });

  it('« partout » / suppression du compte : chaque jeton dont la session n’est plus valide, ou sans session, part', async () => {
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
    const broken = { pushToken: { deleteMany: async () => { throw new Error('mongo'); } }, userSession: { findMany: async () => [] } };
    await expect(retirePushToTalkTokensAfterSessionEnd(broken as never, { sessionId: 's1' }, (e) => errors.push(e))).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('la porte du réveil ignore — et retire — un jeton PushToTalk dont la session est close : repli sur le push ordinaire', async () => {
    const s = store([ptt('ferme', 's-ko'), { ...ptt('apns', null), type: 'apns' }], [{ id: 's-ko', userId: U, sessionToken: 'y', isValid: false, expiresAt: later }]);

    expect(await talkieWakeChannel(s.prisma as never, U, NOW)).toBe('push');
    expect(s.rows.map((t) => t.id)).toEqual(['apns']);
  });
});
