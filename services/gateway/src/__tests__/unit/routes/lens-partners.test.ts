/**
 * #11327 (S26) — UN PARTENAIRE A UNE IDENTITÉ VÉRIFIÉE, SON CRÉDIT VOYAGE AVEC
 * LE MÉDIA, ET L'USAGE D'UNE LENS SE COMPTE SANS IDENTIFIER PERSONNE.
 *
 *   - `GET|PUT /lens/partners/me`                le profil du partenaire ; le changer RETIRE la vérification ;
 *   - `GET /lens/partners/pending`               la file de vérification (BIGBOSS/ADMIN) ;
 *   - `POST /lens/partners/:userId/verify|revoke` vérifier ou retirer, JOURNALISÉ avant d'agir ;
 *   - `GET /lens/partners/:userId/logo`          le logo du filigrane, servi une fois vérifié ;
 *   - `GET /lens/credits?slugs=`                 « Lens par X » pour les médias reçus ;
 *   - `POST|GET /lens/usage/:slug`               compter un usage ; lire l'agrégat k-anonyme.
 *
 * Décisions #11251 (2026-11-01) : gratuit des deux côtés, vérification par
 * BIGBOSS/ADMIN, filigrane Meeshy ET logo partenaire.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { lensPartnerRoutes } from '../../../routes/lens-partners';
import { LensPartners } from '../../../services/packs/LensPartners';
import { matches, type Row } from './sticker-packs.harness';

const ALICE = '68b0000000000000000000a1';
const BOB = '68b0000000000000000000b2';
const MODO = '68b0000000000000000000c3';
const ADMIN = '68b0000000000000000000d4';
const LENS_ID = '68d000000000000000000001';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const ROLES: Record<string, string> = { [MODO]: 'MODERATOR', [ADMIN]: 'ADMIN' };

type Select = Record<string, boolean> | undefined;

function table(rows: Row[] = []) {
  let seq = 0;
  const pick = (row: Row | undefined, select: Select) =>
    row === undefined ? null : select === undefined ? { ...row } : Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
  const apply = (row: Row, data: Record<string, unknown>) =>
    Object.entries(data).forEach(([key, value]) => {
      row[key] = value !== null && typeof value === 'object' && 'increment' in (value as object) ? (row[key] as number) + (value as { increment: number }).increment : value;
    });
  return {
    rows,
    findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Select }) => {
      const key = Object.values(where)[0];
      const flat = key !== null && typeof key === 'object' && !(key instanceof Date) ? (key as Record<string, unknown>) : where;
      return pick(rows.find((row) => matches(row, flat)), select);
    },
    findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Select }) => pick(rows.find((row) => matches(row, where)), select),
    findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Select } = {}) => rows.filter((row) => matches(row, where ?? {})).map((row) => pick(row, select)),
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Select }) => {
      const row = { id: `68e0000000000000000000${String((seq += 1)).padStart(2, '0')}`, ...data } as Row;
      rows.push(row);
      return pick(row, select);
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => apply(row, data));
      return { count: hit.length };
    },
    upsert: async ({ where, create, update }: { where: Record<string, Record<string, unknown>>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const flat = Object.values(where)[0]!;
      const found = rows.find((row) => matches(row, flat));
      if (found) {
        apply(found, update);
        return found;
      }
      const row = { id: `68f0000000000000000000${String((seq += 1)).padStart(2, '0')}`, ...create } as Row;
      rows.push(row);
      return row;
    },
  };
}

type Options = {
  auditDown?: boolean;
  dedupDown?: boolean;
  installed?: boolean;
  lensStatus?: string;
  /** Le partenaire renomme son profil ENTRE la relecture de `verify` et son écriture. */
  renameDuringVerify?: boolean;
  /** Un autre appareil du partenaire écrit son profil ENTRE la relecture de `saveOwnProfile` et son écriture. */
  concurrentSave?: boolean;
};

const START = new Date('2026-11-01T12:00:00Z').getTime();

async function harness(options: Options = {}) {
  const audit: Row[] = [];
  const profiles = table();
  const rawUpdateMany = profiles.updateMany;
  profiles.updateMany = async (args) => {
    const [row] = profiles.rows;
    if (options.renameDuringVerify && args.data.verifiedBy && row) row.displayName = 'Nike';
    if (options.concurrentSave && 'displayName' in args.data && row) row.updatedAt = new Date(START - 60_000);
    return rawUpdateMany(args);
  };
  const txClient: { current: unknown } = { current: null };
  let tick = 0;
  const now = () => new Date(START + (tick += 1));
  const prisma = {
    partnerProfile: profiles,
    lensPack: table([{ id: LENS_ID, slug: 'aurore', name: 'Aurore', submitterId: ALICE, status: options.lensStatus ?? 'approved' }]),
    lensUsageDaily: table(),
    userStickerPack: table(options.installed === false ? [] : [{ id: 'c1', userId: BOB, packSlug: 'lens.aurore', installedAt: new Date('2026-11-01T00:00:00Z') }]),
    adminAuditLog: {
      create: async ({ data }: { data: Row }) => {
        if (options.auditDown) throw new Error('audit store down');
        audit.push(data);
        return data;
      },
    },
    $transaction: async <T,>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const savedProfiles = profiles.rows.map((row) => ({ ...row }));
      const savedAudit = [...audit];
      try {
        return await work(txClient.current);
      } catch (error) {
        profiles.rows.splice(0, profiles.rows.length, ...savedProfiles);
        audit.splice(0, audit.length, ...savedAudit);
        throw error;
      }
    },
  };
  txClient.current = prisma;
  const cache = new Map<string, string>();
  const dedup = {
    setnx: async (key: string, value: string) => {
      if (options.dedupDown) throw new Error('cache down');
      if (cache.has(key)) return false;
      cache.set(key, value);
      return true;
    },
    get: async (key: string) => {
      if (options.dedupDown) throw new Error('cache down');
      return cache.get(key) ?? null;
    },
  };
  const partners = new LensPartners({
    prisma: prisma as never,
    dedup,
    now,
    normalizeLogo: async (bytes) =>
      bytes.subarray(0, 8).equals(PNG.subarray(0, 8))
        ? { ok: true as const, image: { bytes, mimeType: 'image/png' as const, width: 128, height: 128, animated: false } }
        : { ok: false as const, reason: 'not-an-image' as const },
  });
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: any) => {
    const userId = String(request.headers['x-user'] ?? ALICE);
    request.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role: ROLES[userId] ?? 'USER' } };
  });
  await app.register(lensPartnerRoutes, { partners });
  await app.ready();
  return { app, prisma, audit, cache };
}

type H = Awaited<ReturnType<typeof harness>>;
const call = (h: H, method: 'GET' | 'PUT' | 'POST', url: string, user = ALICE, payload?: object) =>
  h.app.inject({ method, url, headers: { 'x-user': user }, ...(payload === undefined ? {} : { payload }) });
const saveProfile = (h: H, body: object = { displayName: 'Studio Lumière', website: 'https://lumiere.example', logo: PNG.toString('base64') }) =>
  call(h, 'PUT', '/partners/me', ALICE, body);
const credits = async (h: H, user = BOB) => (await call(h, 'GET', '/credits?slugs=aurore', user)).json().data;
const pendingOf = async (h: H, target = ALICE) =>
  ((await call(h, 'GET', '/partners/pending', ADMIN)).json().data as Array<{ userId: string; version: string; id: string }>).find((row) => row.userId === target);
const verifyAs = async (h: H, admin = ADMIN, target = ALICE) => {
  const seen = await pendingOf(h, target);
  return call(h, 'POST', `/partners/${target}/verify`, admin, { expected: { version: seen?.version ?? 'unknown' } });
};

describe('l’identité d’un partenaire est VÉRIFIÉE par BIGBOSS/ADMIN', () => {
  it('un profil déclaré naît NON vérifié, et ne crédite encore personne', async () => {
    const h = await harness();
    const saved = await saveProfile(h);

    expect(saved.statusCode).toBe(200);
    expect(saved.json().data).toMatchObject({ displayName: 'Studio Lumière', website: 'https://lumiere.example', verified: false, verifiedAt: null });
    expect(await credits(h)).toEqual([{ slug: 'aurore', name: 'Aurore', partner: null, watermark: { meeshy: true, partnerLogo: null } }]);
  });

  it('vérifié par un ADMIN, il crédite « Lens par X » avec son logo pour le filigrane, À CÔTÉ de celui de Meeshy', async () => {
    const h = await harness();
    await saveProfile(h);
    const verified = await verifyAs(h);

    expect(verified.statusCode).toBe(200);
    const [credit] = await credits(h);
    expect(credit.partner).toMatchObject({ name: 'Studio Lumière' });
    expect(credit.partner.logo).toMatch(/^[0-9a-f]{16}\.png$/);
    expect(credit.watermark).toEqual({ meeshy: true, partnerLogo: credit.partner.logo });
  });

  it('un MODÉRATEUR ne vérifie pas (403), un utilisateur non plus — fail-closed', async () => {
    const h = await harness();
    await saveProfile(h);

    expect((await call(h, 'POST', `/partners/${ALICE}/verify`, MODO)).statusCode).toBe(403);
    expect((await call(h, 'POST', `/partners/${ALICE}/verify`, BOB)).statusCode).toBe(403);
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
  });

  it('un ADMIN ne vérifie pas sa PROPRE identité de partenaire', async () => {
    const h = await harness();
    await call(h, 'PUT', '/partners/me', ADMIN, { displayName: 'Moi-même' });

    const res = await verifyAs(h, ADMIN, ADMIN);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PARTNER_SELF_VERIFY');
  });

  it('la vérification s’écrit au journal AVANT d’agir : journal indisponible ⇒ 500, rien n’a bougé', async () => {
    const h = await harness({ auditDown: true });
    await saveProfile(h);

    const res = await verifyAs(h);
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe('PARTNER_AUDIT_UNAVAILABLE');
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
  });

  it('le journal garde CE qui a été vérifié : le nom et l’empreinte du logo', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);

    expect(h.audit).toEqual([expect.objectContaining({ adminId: ADMIN, userId: ALICE, action: 'PARTNER_PROFILE_VERIFY', entity: 'PartnerProfile', entityId: ALICE })]);
    expect(JSON.parse(String(h.audit[0]!.metadata))).toMatchObject({ displayName: 'Studio Lumière', logoSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it('changer son NOM ou son LOGO après vérification la RETIRE : une identité vérifiée ne se remplace pas après coup', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);

    const renamed = await saveProfile(h, { displayName: 'Nike', website: 'https://lumiere.example' });
    expect(renamed.json().data).toMatchObject({ displayName: 'Nike', verified: false });
    expect((await credits(h))[0].partner).toBeNull();
  });

  it('changer seulement son site garde la vérification', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);

    const moved = await saveProfile(h, { displayName: 'Studio Lumière', website: 'https://autre.example' });
    expect(moved.json().data).toMatchObject({ website: 'https://autre.example', verified: true });
  });

  it('un ADMIN retire une vérification, journalisé ; le crédit s’éteint', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);

    expect((await call(h, 'POST', `/partners/${ALICE}/revoke`, ADMIN, { note: 'usurpation' })).statusCode).toBe(200);
    expect(h.audit.map((row) => row.action)).toEqual(['PARTNER_PROFILE_VERIFY', 'PARTNER_PROFILE_REVOKE']);
    expect((await credits(h))[0].partner).toBeNull();
  });

  it('la file de vérification liste les profils non vérifiés, pour BIGBOSS/ADMIN seulement', async () => {
    const h = await harness();
    await saveProfile(h);

    expect((await call(h, 'GET', '/partners/pending', MODO)).statusCode).toBe(403);
    const pending = await call(h, 'GET', '/partners/pending', ADMIN);
    expect(pending.json().data).toEqual([expect.objectContaining({ userId: ALICE, displayName: 'Studio Lumière', verified: false })]);
  });

  it('un nom vide ou un site non https est refusé (400) ; un logo illisible est refusé (422), un logo trop lourd aussi (413)', async () => {
    const h = await harness();
    expect((await saveProfile(h, { displayName: '' })).statusCode).toBe(400);
    expect((await saveProfile(h, { displayName: 'Studio', website: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await saveProfile(h, { displayName: 'Studio', logo: Buffer.from('pas une image').toString('base64') })).json()).toMatchObject({ code: 'PARTNER_LOGO_REFUSED', reason: 'not-an-image' });
    expect((await saveProfile(h, { displayName: 'Studio', logo: Buffer.alloc(300_000, 1).toString('base64') })).statusCode).toBe(413);
    expect(h.prisma.partnerProfile.rows).toEqual([]);
  });
});

describe('B1 — l’ADMIN vérifie l’état qu’il a VU, jamais celui qui est là au clic', () => {
  it('la file sert une version opaque de chaque profil, et vérifier sans elle est refusé (400)', async () => {
    const h = await harness();
    await saveProfile(h);

    const seen = await pendingOf(h);
    expect(seen?.version).toMatch(/^[0-9a-f]{32}$/);
    const blind = await call(h, 'POST', `/partners/${ALICE}/verify`, ADMIN, {});
    expect(blind.statusCode).toBe(400);
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
    expect(h.audit).toEqual([]);
  });

  it('un profil renommé entre la file et le clic ⇒ 409 PARTNER_PROFILE_CHANGED, rien de vérifié, rien au journal', async () => {
    const h = await harness();
    await saveProfile(h);
    const seen = await pendingOf(h);
    await saveProfile(h, { displayName: 'Nike', website: 'https://lumiere.example' });

    const res = await call(h, 'POST', `/partners/${ALICE}/verify`, ADMIN, { expected: { version: seen!.version } });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PARTNER_PROFILE_CHANGED');
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
    expect(h.audit).toEqual([]);
    expect((await credits(h))[0].partner).toBeNull();
  });

  it('un logo remplacé entre la file et le clic ⇒ 409, même nom', async () => {
    const h = await harness();
    await saveProfile(h);
    const seen = await pendingOf(h);
    const other = Buffer.concat([PNG, Buffer.from('ff', 'hex')]);
    await saveProfile(h, { displayName: 'Studio Lumière', website: 'https://lumiere.example', logo: other.toString('base64') });

    const res = await call(h, 'POST', `/partners/${ALICE}/verify`, ADMIN, { expected: { version: seen!.version } });
    expect(res.statusCode).toBe(409);
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
  });

  it('N6 — un renommage qui tombe ENTRE la relecture et l’écriture : 409, et le journal n’écrit pas un VERIFY qui n’a pas eu lieu', async () => {
    const h = await harness({ renameDuringVerify: true });
    await saveProfile(h);

    const res = await verifyAs(h);
    expect(res.statusCode).toBe(409);
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
    expect(h.audit).toEqual([]);
  });
});

describe('N7 — le partenaire écrit son profil sur l’état qu’il a lu', () => {
  it('une écriture concurrente entre la relecture et l’écriture ⇒ 409 PARTNER_PROFILE_CHANGED, la ligne n’est pas écrasée', async () => {
    const concurrent = await harness({ concurrentSave: true });
    await saveProfile(concurrent);

    const res = await saveProfile(concurrent, { displayName: 'Autre nom' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('PARTNER_PROFILE_CHANGED');
    expect(concurrent.prisma.partnerProfile.rows[0]!.displayName).toBe('Studio Lumière');
  });

  it('deux créations simultanées : ni 500, ni deux profils pour un compte', async () => {
    const h = await harness();
    const [first, second] = await Promise.all([saveProfile(h), saveProfile(h, { displayName: 'Studio Lumière bis' })]);

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(h.prisma.partnerProfile.rows).toHaveLength(1);
    expect(h.prisma.partnerProfile.rows[0]!.verifiedAt).toBeNull();
  });
});

describe('B2 — le logo d’un profil non vérifié se VOIT par qui doit le vérifier', () => {
  const partnerIdOf = (h: H) => String(h.prisma.partnerProfile.rows[0]!.id);

  it('non vérifié : servi à BIGBOSS/ADMIN et au propriétaire, `no-store` ; 404 pour tout autre', async () => {
    const h = await harness();
    await saveProfile(h);
    const id = partnerIdOf(h);

    const admin = await call(h, 'GET', `/partners/${id}/logo`, ADMIN);
    expect(admin.statusCode).toBe(200);
    expect(admin.headers['cache-control']).toBe('no-store');
    expect(admin.rawPayload.equals(PNG)).toBe(true);
    const owner = await call(h, 'GET', `/partners/${id}/logo`, ALICE);
    expect(owner.statusCode).toBe(200);
    expect(owner.headers['cache-control']).toBe('no-store');
    expect((await call(h, 'GET', `/partners/${id}/logo`, BOB)).statusCode).toBe(404);
    expect((await call(h, 'GET', `/partners/${id}/logo`, MODO)).statusCode).toBe(404);
  });

  it('vérifié : servi à tous, revalidé à chaque fois (no-cache + ETag, 304 sur If-None-Match)', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);
    const id = partnerIdOf(h);

    const logo = await call(h, 'GET', `/partners/${id}/logo`, BOB);
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['cache-control']).toBe('private, no-cache');
    expect(logo.rawPayload.equals(PNG)).toBe(true);
    const etag = String(logo.headers.etag);
    const again = await h.app.inject({ method: 'GET', url: `/partners/${id}/logo`, headers: { 'x-user': BOB, 'if-none-match': etag } });
    expect(again.statusCode).toBe(304);
  });

  it('une vérification retirée éteint le logo public dès la requête suivante', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);
    await call(h, 'POST', `/partners/${ALICE}/revoke`, ADMIN, {});

    expect((await call(h, 'GET', `/partners/${partnerIdOf(h)}/logo`, BOB)).statusCode).toBe(404);
  });
});

describe('N4 — le crédit nomme le partenaire par un identifiant OPAQUE, jamais par son compte', () => {
  it('`partner.id` est l’identifiant du profil, et le logo se lit par lui — pas par le userId', async () => {
    const h = await harness();
    await saveProfile(h);
    await verifyAs(h);

    const [credit] = await credits(h);
    expect(credit.partner.id).not.toBe(ALICE);
    expect(credit.partner.id).toBe(h.prisma.partnerProfile.rows[0]!.id);
    expect(JSON.stringify(credit)).not.toContain(ALICE);
    expect((await call(h, 'GET', `/partners/${credit.partner.id}/logo`, BOB)).statusCode).toBe(200);
    expect((await call(h, 'GET', `/partners/${ALICE}/logo`, BOB)).statusCode).toBe(404);
  });

  it('N9 — le crédit se met en cache peu de temps (une vérification retirée s’éteint vite)', async () => {
    const h = await harness();
    const res = await call(h, 'GET', '/credits?slugs=aurore', BOB);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
  });
});

describe('le crédit d’une lens', () => {
  it('une lens qui n’est pas publiée ne rend aucun crédit', async () => {
    const h = await harness({ lensStatus: 'withdrawn' });
    expect(await credits(h)).toEqual([]);
  });

  it('refuse une liste de slugs malformée ou trop longue (400)', async () => {
    const h = await harness();
    expect((await call(h, 'GET', '/credits?slugs=../etc', BOB)).statusCode).toBe(400);
    const many = Array.from({ length: 51 }, (_, index) => `l${index}`).join(',');
    expect((await call(h, 'GET', `/credits?slugs=${many}`, BOB)).statusCode).toBe(400);
  });
});

describe('l’usage d’une lens se compte sans identifier personne', () => {
  it('un usage compte un appareil ; le même compte le même jour ne compte qu’un appareil, mais deux usages', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/usage/aurore', BOB, { surface: 'camera' })).json().data).toEqual({ counted: true });
    await call(h, 'POST', '/usage/aurore', BOB, { surface: 'camera' });

    expect(h.prisma.lensUsageDaily.rows).toEqual([expect.objectContaining({ lensId: LENS_ID, day: '2026-11-01', surface: 'camera', devices: 1, uses: 2 })]);
  });

  it('rien de ce qui est gardé ne nomme le compte : ni la ligne d’usage, ni la clé de dédoublonnage', async () => {
    const h = await harness();
    await call(h, 'POST', '/usage/aurore', BOB, { surface: 'story' });

    expect(JSON.stringify(h.prisma.lensUsageDaily.rows)).not.toContain(BOB);
    expect([...h.cache.keys()].join(' ')).not.toContain(BOB);
  });

  it('dédoublonnage indisponible ⇒ rien n’est compté (un compte non dédoublonné casserait le k-anonymat)', async () => {
    const h = await harness({ dedupDown: true });
    const res = await call(h, 'POST', '/usage/aurore', BOB, { surface: 'camera' });

    expect(res.json().data).toEqual({ counted: false });
    expect(h.prisma.lensUsageDaily.rows).toEqual([]);
  });

  it('une lens non installée par l’appelant, ou non publiée, ne se compte pas (404)', async () => {
    expect((await call(await harness({ installed: false }), 'POST', '/usage/aurore', BOB, { surface: 'camera' })).statusCode).toBe(404);
    expect((await call(await harness({ lensStatus: 'pending' }), 'POST', '/usage/aurore', BOB, { surface: 'camera' })).statusCode).toBe(404);
  });

  it('une surface inconnue est refusée (400)', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/usage/aurore', BOB, { surface: 'billboard' })).statusCode).toBe(400);
  });

  it('l’auteur lit l’agrégat, et AUCUNE ligne sous 20 appareils', async () => {
    const h = await harness();
    h.prisma.lensUsageDaily.rows.push(
      { id: 'u1', lensId: LENS_ID, day: '2026-10-30', surface: 'camera', devices: 19, uses: 300 },
      { id: 'u2', lensId: LENS_ID, day: '2026-10-31', surface: 'call', devices: 42, uses: 57 },
    );

    const res = await call(h, 'GET', '/usage/aurore', ALICE);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ k: 20, rows: [{ day: '2026-10-31', surface: 'call', devices: 42, uses: 57 }] });
  });

  it('un tiers ne lit pas l’usage d’une lens qui n’est pas la sienne (404) ; un modérateur la lit', async () => {
    const h = await harness();
    expect((await call(h, 'GET', '/usage/aurore', BOB)).statusCode).toBe(404);
    expect((await call(h, 'GET', '/usage/aurore', MODO)).statusCode).toBe(200);
  });
});
