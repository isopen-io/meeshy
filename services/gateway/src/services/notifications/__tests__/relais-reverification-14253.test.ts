/**
 * #14253 — le relais d'une activité revérifie, avant chaque lot, que les
 * publications qu'il annonce existent encore : un original (ou une
 * republication) supprimé, rendu privé ou expiré entre l'admission et l'envoi
 * ne laisse aucune ligne `friend_content_*` orpheline, que plus rien ne
 * retirerait.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { relayActivityToEntourage, relayRepostToEntourage, RELAY_BATCH_SIZE } from '../fanout/activity-relay';
import { AUTEUR, COMMENTATEUR as ACTEUR, POST, SANG, monde, type Link, type World } from '../../../__tests__/helpers/circle-world';

const REPOST = 'ffffffffffffffffffffffff';
const LIEN_COMMUN: Link = [ACTEUR, SANG, 'BLOOD'];

type Etat = { readonly gone: Set<string>; readonly privates: Set<string>; readonly expired: Set<string> };
type Change = (etat: Etat) => void;

/**
 * Les publications lues dans leur état VIVANT. `pendantLEnvoi` s'applique au
 * moment où le relais prend sa clé « une fois », c'est-à-dire APRÈS l'admission
 * et AVANT le premier lot : la fenêtre que la revérification doit couvrir.
 */
const relais = (world: World = {}, pendantLEnvoi: Change = () => undefined) => {
  const etat: Etat = { gone: new Set(), privates: new Set(), expired: new Set() };
  const original = { id: POST, authorId: AUTEUR, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', expiresAt: null };
  const repost = { ...original, id: REPOST, authorId: ACTEUR, isQuote: false, repostOfId: POST };
  const m = monde({ ...world, extraLinks: [LIEN_COMMUN, ...(world.extraLinks ?? [])], post: original });
  const posts: Record<string, typeof original> = { [POST]: original, [REPOST]: repost };
  m.prisma.post.findFirst = (async (args?: { where?: { id?: string } }) => {
    const id = args?.where?.id ?? '';
    if (posts[id] === undefined || etat.gone.has(id)) return null;
    return {
      ...posts[id],
      visibility: etat.privates.has(id) ? 'PRIVATE' : posts[id].visibility,
      expiresAt: etat.expired.has(id) ? new Date(0) : posts[id].expiresAt,
    };
  }) as unknown as typeof m.prisma.post.findFirst;
  const throttle = (m.deps as unknown as { relayThrottle: { setnx: (key: string, value: string, ttl?: number) => Promise<boolean> } }).relayThrottle;
  const setnx = throttle.setnx;
  throttle.setnx = async (key, value, ttl) => {
    if (key.startsWith('notif:relay:')) pendantLEnvoi(etat);
    return setnx(key, value, ttl);
  };
  return { m, etat };
};

const republier = (m: ReturnType<typeof relais>['m']) =>
  relayRepostToEntourage(m.deps, { originalPostId: POST, repostId: REPOST, actorId: ACTEUR, reposterEntourageNotified: false });

describe('le relais revérifie les publications avant chaque lot (#14253)', () => {
  it('témoin : rien ne change pendant le relais ⇒ la republication est relayée', async () => {
    const { m } = relais();
    await republier(m);
    expect(m.notified('friend_content_repost')).toContain(SANG);
  });

  it.each<[string, Change]>([
    ['l’original supprimé', (e) => e.gone.add(POST)],
    ['la republication supprimée', (e) => e.gone.add(REPOST)],
    ['l’original rendu privé', (e) => e.privates.add(POST)],
  ])('%s entre l’admission et l’envoi ⇒ aucune ligne', async (_label, change) => {
    const { m } = relais({}, change);
    await republier(m);
    expect(m.notified()).toEqual([]);
  });

  it('un partage : témoin relayé, puis supprimé entre l’admission et l’envoi ⇒ aucune ligne', async () => {
    const reglages: World = { settings: { [ACTEUR]: { circleElsewhereShare: 'BLOOD' }, [AUTEUR]: { circleOnMyContentShare: 'BLOOD' } } };
    const temoin = relais(reglages);
    await relayActivityToEntourage(temoin.m.deps, { activity: 'share', postId: POST, actorId: ACTEUR });
    expect(temoin.m.notified('friend_content_share')).toContain(SANG);

    const { m } = relais(reglages, (e) => e.gone.add(POST));
    await relayActivityToEntourage(m.deps, { activity: 'share', postId: POST, actorId: ACTEUR });
    expect(m.notified()).toEqual([]);
  });

  it('l’original expiré entre l’admission et l’envoi ⇒ aucune ligne', async () => {
    const { m } = relais({}, (e) => e.expired.add(POST));
    await republier(m);
    expect(m.notified()).toEqual([]);
  });

  it('supprimée PENDANT un lot ⇒ le lot retire ses propres lignes, les annonce, et le suivant ne part pas', async () => {
    const proches = Array.from({ length: RELAY_BATCH_SIZE + 5 }, (_, i) => `8${String(i).padStart(23, '0')}`);
    const { m, etat } = relais({ extraLinks: proches.map((id): Link => [AUTEUR, id, 'BLOOD']) });
    const base = new Map<string, { id: string; userId: string }>();
    const autre = { id: 'n-autre', userId: AUTEUR };
    base.set(autre.id, autre);
    m.createNotification.mockImplementation((async (params: { userId: string }) => {
      etat.gone.add(POST);
      const row = { id: `n-${base.size}`, userId: params.userId };
      base.set(row.id, row);
      return row;
    }) as never);
    (m.prisma as unknown as { notification: unknown }).notification = {
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        args.where.id.in.forEach((id) => base.delete(id));
        return { count: args.where.id.in.length };
      },
    };
    const announce = jest.fn(async (_rows: readonly { id: string; pushSent: boolean }[]) => undefined);
    (m.deps as unknown as { announcer: unknown }).announcer = { announceNotificationsRetracted: announce };

    await republier(m);

    expect(m.createNotification.mock.calls.length).toBe(RELAY_BATCH_SIZE);
    expect([...base.keys()]).toEqual([autre.id]);
    expect(announce.mock.calls[0]?.[0]).toHaveLength(RELAY_BATCH_SIZE);
    expect(announce.mock.calls[0]?.[0].every((row) => row.pushSent)).toBe(true);
  });
});
