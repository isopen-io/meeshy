/**
 * Les visites de mon lien de profil (#19206, chantier #18857) — l'enregistreur.
 *
 * Ce qui part en base est un AGRÉGAT par jour UTC : ni IP, ni identifiant de visiteur, ni
 * ville. Le propriétaire ne gonfle pas son compteur, un robot d'aperçu non plus, et une même
 * personne qui rouvre la fiche dans la demi-heure ne compte qu'une fois — sans que rien ne
 * permette de la reconnaître ensuite.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }) },
}));

import {
  countProfileLinkVisit,
  recordProfileLinkVisit,
  readProfileLinkVisitStats,
  exportProfileLinkVisitsOf,
  eraseProfileLinkVisitsOf,
} from '../../../../services/profile-link-visits/profileLinkVisits';
import { isPreviewRobot } from '../../../../services/profile-link-visits/previewRobots';

const OWNER = '507f1f77bcf86cd799439011';
const VISITOR = '507f1f77bcf86cd799439022';
const AT = new Date('2026-11-17T15:42:00.000Z');
const DAY = new Date('2026-11-17T00:00:00.000Z');
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const SECRET = 'x'.repeat(64);

const prismaError = (code: string) => Object.assign(new Error(code), { code });

function store() {
  const rows = new Map<string, number>();
  const update = jest.fn(async (args: any) => {
    const key = `${args.where.userId_day.userId}|${args.where.userId_day.day.toISOString()}`;
    if (!rows.has(key)) throw prismaError('P2025');
    rows.set(key, (rows.get(key) ?? 0) + args.data.visits.increment);
    return {};
  });
  const create = jest.fn(async (args: any) => {
    const key = `${args.data.userId}|${args.data.day.toISOString()}`;
    if (rows.has(key)) throw prismaError('P2002');
    rows.set(key, args.data.visits);
    return {};
  });
  return { rows, db: { profileLinkVisitDay: { update, create } } };
}

function seenStore() {
  const keys = new Map<string, string>();
  const set = jest.fn(async (key: string, value: string, _ex: 'EX', _seconds: number, _nx: 'NX') => {
    if (keys.has(key)) return null;
    keys.set(key, value);
    return 'OK' as const;
  });
  return { keys, seen: { set } };
}

const visit = (over: Record<string, unknown> = {}) => ({
  ownerId: OWNER,
  viewerId: VISITOR,
  ip: '203.0.113.7',
  userAgent: BROWSER,
  at: AT,
  ...over,
});

describe('recordProfileLinkVisit — un incrément atomique sans lecture', () => {
  it('crée la ligne du jour UTC avec son expiration, puis incrémente la suivante', async () => {
    const { db, rows } = store();
    await recordProfileLinkVisit(db, { ownerId: OWNER, at: AT });
    await recordProfileLinkVisit(db, { ownerId: OWNER, at: AT });
    expect(rows.get(`${OWNER}|${DAY.toISOString()}`)).toBe(2);
    expect(db.profileLinkVisitDay.create).toHaveBeenCalledTimes(1);
    const [{ data }] = db.profileLinkVisitDay.create.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(Object.keys(data).sort()).toEqual(['day', 'expiresAt', 'userId', 'visits']);
    expect(data.expiresAt).toEqual(new Date('2026-12-27T00:00:00.000Z'));
  });

  it("deux écrivains qui créent la même ligne se reprennent en incrément : aucune visite n'est perdue", async () => {
    const { db, rows } = store();
    rows.set(`${OWNER}|${DAY.toISOString()}`, 5);
    db.profileLinkVisitDay.update.mockRejectedValueOnce(prismaError('P2025'));
    await recordProfileLinkVisit(db, { ownerId: OWNER, at: AT });
    expect(rows.get(`${OWNER}|${DAY.toISOString()}`)).toBe(6);
  });
});

describe('countProfileLinkVisit — qui compte, qui ne compte pas', () => {
  it("compte la visite d'un autre lecteur", async () => {
    const { db, rows } = store();
    expect(await countProfileLinkVisit({ db, seen: null, secret: SECRET }, visit())).toBe('counted');
    expect(rows.get(`${OWNER}|${DAY.toISOString()}`)).toBe(1);
  });

  it('le propriétaire ne gonfle pas son compteur', async () => {
    const { db } = store();
    expect(await countProfileLinkVisit({ db, seen: null, secret: SECRET }, visit({ viewerId: OWNER }))).toBe('ignored');
    expect(db.profileLinkVisitDay.update).not.toHaveBeenCalled();
    expect(db.profileLinkVisitDay.create).not.toHaveBeenCalled();
  });

  it("un robot d'aperçu ou une requête sans agent ne compte pas", async () => {
    const { db } = store();
    const deps = { db, seen: null, secret: SECRET };
    expect(await countProfileLinkVisit(deps, visit({ userAgent: 'WhatsApp/2.23.20.0 A', viewerId: undefined }))).toBe('ignored');
    expect(await countProfileLinkVisit(deps, visit({ userAgent: 'facebookexternalhit/1.1' }))).toBe('ignored');
    expect(await countProfileLinkVisit(deps, visit({ userAgent: undefined }))).toBe('ignored');
    expect(db.profileLinkVisitDay.update).not.toHaveBeenCalled();
  });

  it('la même personne qui rouvre la fiche dans la fenêtre ne compte qu’une fois ; une autre compte', async () => {
    const { db, rows } = store();
    const { seen } = seenStore();
    const deps = { db, seen, secret: SECRET };
    expect(await countProfileLinkVisit(deps, visit())).toBe('counted');
    expect(await countProfileLinkVisit(deps, visit())).toBe('ignored');
    expect(await countProfileLinkVisit(deps, visit({ viewerId: '507f1f77bcf86cd799439033' }))).toBe('counted');
    expect(rows.get(`${OWNER}|${DAY.toISOString()}`)).toBe(2);
    expect(seen.set).toHaveBeenCalledWith(expect.any(String), '1', 'EX', 1800, 'NX');
  });

  it("un visiteur sans compte se dédoublonne sur son adresse sans qu'elle soit gardée en clair", async () => {
    const { db } = store();
    const { seen, keys } = seenStore();
    const deps = { db, seen, secret: SECRET };
    expect(await countProfileLinkVisit(deps, visit({ viewerId: undefined }))).toBe('counted');
    expect(await countProfileLinkVisit(deps, visit({ viewerId: undefined }))).toBe('ignored');
    expect(await countProfileLinkVisit(deps, visit({ viewerId: undefined, ip: '198.51.100.9' }))).toBe('counted');
    const written = [...keys.keys()].join(' ');
    expect(written).not.toContain('203.0.113.7');
    expect(written).not.toContain(VISITOR);
    expect(written).not.toContain(OWNER);
  });
});

describe('isPreviewRobot', () => {
  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'LinkedInBot/1.0',
    'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'curl/8.4.0',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Facebot',
    'Mozilla/5.0 (compatible; Snap URL Preview Service; bot; snapchat_preview@snap.com)',
    'Pinterest/0.2 (+http://www.pinterest.com/bot.html)',
    'Slack-ImgProxy (+https://api.slack.com/robots)',
    '',
  ])('reconnaît %s', (ua) => {
    expect(isPreviewRobot(ua)).toBe(true);
  });

  it.each([
    BROWSER,
    'Meeshy/1.42 (iPhone; iOS 26.0) CFNetwork/1568 Darwin/25.0.0',
    'okhttp/4.12.0',
    'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    // Le navigateur INTÉGRÉ d'une messagerie ou d'un réseau : une personne qui a touché le lien, pas l'aperçu.
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Telegram-Android/11.2.2 (Google Pixel 8; Android 14; SDK 34; HIGH)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.12.0.34 (like Safari/8617.2.4.10.8, panda)',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Slack/4.41.97 Chrome/130.0 Electron/33.0 Safari/537.36 Sonic Slack_SSB/4.41.97',
  ])("laisse passer l'application et les navigateurs : %s", (ua) => {
    expect(isPreviewRobot(ua)).toBe(false);
  });
});

describe('lecture, export et purge — le propriétaire seul', () => {
  it('lit ses lignes depuis le début de la fenêtre et les résume', async () => {
    const findMany = jest.fn(async (_args: unknown) => [{ day: DAY, visits: 57 }, { day: new Date('2026-11-02T00:00:00.000Z'), visits: 3 }]);
    const stats = await readProfileLinkVisitStats({ profileLinkVisitDay: { findMany } } as never, OWNER, AT);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: OWNER, day: { gte: new Date('2026-10-19T00:00:00.000Z') } },
    }));
    expect(stats).toMatchObject({ today: 57, month: 60 });
    expect(stats.series).toHaveLength(30);
  });

  it("exporte toutes ses lignes, jour et nombre, rien d'autre", async () => {
    const findMany = jest.fn(async (_args: unknown) => [{ day: DAY, visits: 57 }]);
    const rows = await exportProfileLinkVisitsOf({ profileLinkVisitDay: { findMany } } as never, OWNER);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER } }));
    expect(rows).toEqual([{ day: '2026-11-17', visits: 57 }]);
  });

  it('efface toutes ses lignes avec le compte', async () => {
    const deleteMany = jest.fn(async (_args: unknown) => ({ count: 4 }));
    expect(await eraseProfileLinkVisitsOf({ profileLinkVisitDay: { deleteMany } } as never, OWNER)).toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: OWNER } });
  });
});
