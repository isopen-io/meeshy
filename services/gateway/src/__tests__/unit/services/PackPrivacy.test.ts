/**
 * Les données de packs d'un compte s'exportent et se purgent (#10151, LP3).
 *
 * Ce que le compte a fait des packs : ses CHOIX d'installation (trois
 * domaines), sa BIBLIOTHÈQUE de stickers et ses fichiers `stickers/<userId>/`,
 * et les packs qu'il a PROPOSÉS avec leurs fichiers. Les témoins portent sur
 * les VALEURS exportées et effacées, fichiers compris, et sur le voisin, qui
 * ne perd rien.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import {
  DELETED_ACCOUNT_PACK_AUTHOR,
  exportPackData,
  measurePackData,
  purgePackData,
} from '../../../services/packs/PackPrivacy';
import { fakeFileStore, fakePackDb, type Row } from './pack-privacy.fakes';

const PARTI = '507f1f77bcf86cd799439011';
const VOISIN = '507f1f77bcf86cd799439022';
const AT = new Date('2026-10-01T10:00:00.000Z');
const LATER = new Date('2026-10-05T10:00:00.000Z');

function seed() {
  const userStickerPack: Row[] = [
    { id: 'c1', userId: PARTI, packSlug: 'mee', installedAt: null, updatedAt: AT },
    { id: 'c2', userId: PARTI, packSlug: 'glory-frame.afrique', installedAt: AT, updatedAt: AT },
    { id: 'c3', userId: PARTI, packSlug: 'capture-frame.corporate', installedAt: LATER, updatedAt: LATER },
    { id: 'c4', userId: VOISIN, packSlug: 'mee', installedAt: AT, updatedAt: AT },
  ];
  const userSticker: Row[] = [
    {
      id: 's1', userId: PARTI, name: 'Mon chat', origin: 'upload', mimeType: 'image/webp',
      filePath: `stickers/${PARTI}/a.webp`, width: 512, height: 512, sizeBytes: 2048,
      animated: false, contentHash: 'h1', createdAt: AT, lastUsedAt: LATER,
    },
    {
      id: 's2', userId: VOISIN, name: null, origin: 'paste', mimeType: 'image/png',
      filePath: `stickers/${VOISIN}/b.png`, width: 256, height: 256, sizeBytes: 1024,
      animated: false, contentHash: 'h2', createdAt: AT, lastUsedAt: AT,
    },
  ];
  const pack = (id: string, slug: string, submitterId: string, status: string, extra: Partial<Row> = {}): Row => ({
    id, slug, name: `Pack ${slug}`, description: `Le pack ${slug}`, author: `Auteur ${slug}`, submitterId,
    status, reviewNote: null, reviewerId: null, reviewedAt: null, installCount: 0, createdAt: AT, ...extra,
  });
  const stickerPack: Row[] = [
    pack('p1', 'en-attente', PARTI, 'pending'),
    pack('p2', 'refuse', PARTI, 'rejected', { reviewNote: 'Images floues', reviewedAt: LATER }),
    pack('p3', 'publie', PARTI, 'approved', { installCount: 7, reviewedAt: LATER }),
    pack('p4', 'du-voisin', VOISIN, 'pending'),
  ];
  const item = (id: string, packId: string, key: string, position: number): Row => ({
    id, packId, key, title: `Titre ${key}`, emoji: '🙂', kind: 'static', mimeType: 'image/webp',
    filePath: `sticker-packs/${packId}-dir/${key}.webp`, width: 512, height: 512, sizeBytes: 4096, zones: null, position,
  });
  const stickerPackItem: Row[] = [
    item('i1', 'p1', 'un', 0),
    item('i2', 'p2', 'deux', 0),
    item('i3', 'p3', 'trois', 0),
    item('i4', 'p4', 'quatre', 0),
  ];
  const files = fakeFileStore([
    `stickers/${PARTI}/a.webp`,
    `stickers/${PARTI}/orphelin.png`,
    `stickers/${VOISIN}/b.png`,
    'sticker-packs/p1-dir/un.webp',
    'sticker-packs/p2-dir/deux.webp',
    'sticker-packs/p3-dir/trois.webp',
    'sticker-packs/p4-dir/quatre.webp',
  ]);
  const userPackOwnership: Row[] = [
    { id: 'o1', userId: PARTI, packKey: 'wallpaper.echantillon', priceMeeshes: 40, requestId: 'achat-0001', acquiredAt: LATER },
    { id: 'o2', userId: VOISIN, packKey: 'banner.echantillon', priceMeeshes: 25, requestId: 'achat-0002', acquiredAt: AT },
    { id: 'o3', userId: PARTI, packKey: 'banner.coupe', source: 'game', reference: 'trophy:season-cup:3', acquiredAt: AT },
    { id: 'o4', userId: VOISIN, packKey: 'banner.fete', source: 'event', reference: 'fete-2026', acquiredAt: AT },
  ];
  const db = fakePackDb({ userStickerPack, userSticker, stickerPack, stickerPackItem, userPackOwnership });
  return { db, files };
}

const PAGE = { limit: 500, offset: 0 };

describe('exportPackData — ce que le compte a fait des packs (#10151)', () => {
  it('exporte ses choix des trois domaines, avec le domaine et le slug séparés', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);

    expect(data.choices.total).toBe(3);
    expect(data.choices.items).toEqual(
      expect.arrayContaining([
        { domain: 'sticker', slug: 'mee', installed: false, installedAt: null, updatedAt: AT },
        { domain: 'glory-frame', slug: 'afrique', installed: true, installedAt: AT, updatedAt: AT },
        { domain: 'capture-frame', slug: 'corporate', installed: true, installedAt: LATER, updatedAt: LATER },
      ]),
    );
  });

  it('exporte sa bibliothèque, chaque sticker avec l’adresse de son fichier', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);

    expect(data.library.total).toBe(1);
    expect(data.library.items).toEqual([
      expect.objectContaining({
        id: 's1', name: 'Mon chat', origin: 'upload', mimeType: 'image/webp', width: 512, height: 512,
        sizeBytes: 2048, animated: false, createdAt: AT, lastUsedAt: LATER,
        filePath: `stickers/${PARTI}/a.webp`,
        fileUrl: expect.stringMatching(new RegExp(`/api/v1/attachments/file/stickers%2F${PARTI}%2Fa\\.webp$`)),
      }),
    ]);
    expect(data.library.items[0]).not.toHaveProperty('contentHash');
  });

  it('exporte ses propositions — manifeste, statut, note — publiées comprises', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);

    expect(data.submissions.total).toBe(3);
    const refuse = data.submissions.items.find((pack) => pack.slug === 'refuse');
    expect(refuse).toEqual(
      expect.objectContaining({
        slug: 'refuse', name: 'Pack refuse', description: 'Le pack refuse', author: 'Auteur refuse',
        status: 'rejected', reviewNote: 'Images floues', reviewedAt: LATER, createdAt: AT,
        items: [
          expect.objectContaining({
            key: 'deux', title: 'Titre deux', emoji: '🙂', kind: 'static', mimeType: 'image/webp',
            filePath: 'sticker-packs/p2-dir/deux.webp',
            fileUrl: expect.stringMatching(/\/api\/v1\/attachments\/file\/sticker-packs%2Fp2-dir%2Fdeux\.webp$/),
          }),
        ],
      }),
    );
    expect(refuse).not.toHaveProperty('reviewerId');
    expect(data.submissions.items.map((pack) => pack.slug).sort()).toEqual(['en-attente', 'publie', 'refuse']);
  });

  it('exporte ses ACHATS de packs (#10632) : domaine, slug, prix payé et date, sans l’identifiant technique de la dépense', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);

    expect(data.ownerships.total).toBe(2);
    expect(data.ownerships.items[0]).toEqual({ domain: 'wallpaper', slug: 'echantillon', source: 'purchase', reference: null, priceMeeshes: 40, acquiredAt: LATER });
  });

  it('exporte aussi ses packs GAGNÉS, OCTROYÉS ou d’ÉVÉNEMENT (#11272) : la voie et la raison, aucun prix payé', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);

    expect(data.ownerships.items[1]).toEqual({ domain: 'banner', slug: 'coupe', source: 'game', reference: 'trophy:season-cup:3', priceMeeshes: 0, acquiredAt: AT });
    expect(data.ownerships.items.map((item) => item.slug)).not.toContain('fete');
  });

  it('ne sort rien du voisin', async () => {
    const { db } = seed();

    const data = await exportPackData(db as never, PARTI, PAGE);
    const text = JSON.stringify(data);

    expect(text).not.toContain(VOISIN);
    expect(text).not.toContain('du-voisin');
    expect(text).not.toContain('banner.echantillon');
  });
});

describe('purgePackData — la purge à l’expiration de la grâce (#10151)', () => {
  it('efface ses choix, sa bibliothèque et ses propositions non publiées, fichiers compris', async () => {
    const { db, files } = seed();

    const summary = await purgePackData(db as never, PARTI, { files: files.store });

    expect(db.tables.userStickerPack.rows.map((row) => row.id)).toEqual(['c4']);
    expect(db.tables.userSticker.rows.map((row) => row.id)).toEqual(['s2']);
    expect(db.tables.stickerPack.rows.map((row) => row.id).sort()).toEqual(['p3', 'p4']);
    expect(db.tables.stickerPackItem.rows.map((row) => row.id).sort()).toEqual(['i3', 'i4']);
    expect(db.tables.userPackOwnership.rows.map((row) => row.id)).toEqual(['o2', 'o4']);
    expect([...files.files].sort()).toEqual([
      'sticker-packs/p3-dir/trois.webp',
      'sticker-packs/p4-dir/quatre.webp',
      `stickers/${VOISIN}/b.png`,
    ]);
    expect(summary).toEqual({
      choicesDeleted: 3,
      libraryDeleted: 1,
      submissionsDeleted: 2,
      publishedAnonymized: 1,
      filesDeleted: 4,
      ownershipsDeleted: 2,
    });
  });

  it('laisse en place le pack PUBLIÉ, son auteur anonymisé (PP8)', async () => {
    const { db, files } = seed();

    await purgePackData(db as never, PARTI, { files: files.store });

    const publie = db.tables.stickerPack.rows.find((row) => row.id === 'p3');
    expect(publie).toEqual(expect.objectContaining({ slug: 'publie', status: 'approved', installCount: 7, author: DELETED_ACCOUNT_PACK_AUTHOR }));
    expect(db.tables.stickerPack.rows.find((row) => row.id === 'p4')?.author).toBe('Auteur du-voisin');
  });

  it('rejouée, ne trouve plus rien et n’écrit rien de neuf', async () => {
    const { db, files } = seed();
    await purgePackData(db as never, PARTI, { files: files.store });
    const after = JSON.stringify(db.tables);

    const second = await purgePackData(db as never, PARTI, { files: files.store });

    expect(second).toEqual({ choicesDeleted: 0, libraryDeleted: 0, submissionsDeleted: 0, publishedAnonymized: 0, filesDeleted: 0, ownershipsDeleted: 0 });
    expect(JSON.stringify(db.tables)).toBe(after);
  });

  it('mesure, sans rien toucher, exactement ce que la purge effacerait', async () => {
    const { db, files } = seed();
    const before = JSON.stringify(db.tables);

    const measured = await measurePackData(db as never, PARTI, { files: files.store });

    expect(measured).toEqual({ choicesDeleted: 3, libraryDeleted: 1, submissionsDeleted: 2, publishedAnonymized: 1, filesDeleted: 4, ownershipsDeleted: 2 });
    expect(JSON.stringify(db.tables)).toBe(before);
    expect(db.writes).toEqual([]);
    expect(files.removed).toEqual([]);
  });

  it('ne liste jamais un répertoire hors de la forme d’un identifiant de compte', async () => {
    const { db, files } = seed();

    const summary = await purgePackData(db as never, '../stickers', { files: files.store });

    expect(summary.filesDeleted).toBe(0);
    expect(files.removed).toEqual([]);
  });
});

describe('les propositions d’apparence d’un tiers suivent le compte (#10709)', () => {
  const appearance = (id: string, submitterId: string, status: string, author = 'Awa'): Row => ({
    id, domain: 'wallpaper', slug: `pack-${id}`, name: 'Dunes', description: '', author, submitterId, status, reviewNote: null, reviewedAt: null, price: null, installCount: 3, createdAt: AT, contractJson: '{"domain":"wallpaper","designs":[]}',
  });
  const rows = (): Row[] => [appearance('a1', PARTI, 'pending'), appearance('a2', PARTI, 'rejected'), appearance('a3', PARTI, 'approved'), appearance('a4', VOISIN, 'pending', 'Voisin')];

  it('les exporte, contrat compris, sans rien du voisin', async () => {
    const db = fakePackDb({ communityAppearancePack: rows() });
    const data = await exportPackData(db as never, PARTI, PAGE);
    expect(data.appearanceSubmissions.total).toBe(3);
    expect(data.appearanceSubmissions.items.map((row) => row.slug).sort()).toEqual(['pack-a1', 'pack-a2', 'pack-a3']);
    expect(data.appearanceSubmissions.items[0]).toHaveProperty('contractJson');
    expect(JSON.stringify(data)).not.toContain('Voisin');
  });

  it('efface les non publiées, anonymise la publiée, laisse le voisin', async () => {
    const db = fakePackDb({ communityAppearancePack: rows() });
    const { files } = { files: fakeFileStore([]) };
    const summary = await purgePackData(db as never, PARTI, { files: files.store });
    expect(db.tables.communityAppearancePack.rows.map((row) => [row.id, row.author])).toEqual([
      ['a3', DELETED_ACCOUNT_PACK_AUTHOR],
      ['a4', 'Voisin'],
    ]);
    expect(summary).toMatchObject({ submissionsDeleted: 2, publishedAnonymized: 1 });
    const again = await purgePackData(db as never, PARTI, { files: files.store });
    expect(again).toMatchObject({ submissionsDeleted: 0, publishedAnonymized: 0 });
  });

  it('mesure à blanc ce que la purge effacerait', async () => {
    const db = fakePackDb({ communityAppearancePack: rows() });
    const measured = await measurePackData(db as never, PARTI, { files: fakeFileStore([]).store });
    expect(measured).toMatchObject({ submissionsDeleted: 2, publishedAnonymized: 1 });
    expect(db.tables.communityAppearancePack.rows).toHaveLength(4);
  });
});

describe('les lens proposées suivent le compte (#11271)', () => {
  const lens = (id: string, submitterId: string, status: string, author = 'Studio Nord'): Row => ({
    id, slug: `lens-${id}`, name: 'Aurore', author, submitterId, status, reviewNote: null, reviewedAt: null, installCount: 2, cost: 'standard', createdAt: AT, documentJson: '{"schema":1}',
  });
  const publishedDocument = JSON.stringify({ schema: 1, id: 'lens-l3', credits: { author: 'Studio Nord', createdAt: '2026-10-01' } });
  const packs = (): Row[] => [
    lens('l1', PARTI, 'pending'),
    lens('l2', PARTI, 'rejected'),
    { ...lens('l3', PARTI, 'approved'), documentJson: publishedDocument, documentSha256: 'old', documentSrc: 'old0000000000000.json' },
    lens('l4', VOISIN, 'pending', 'Voisin'),
  ];
  const assets = (): Row[] => ['l1', 'l2', 'l3', 'l4'].map((packId) => ({ id: `f-${packId}`, packId, src: `${packId.padEnd(16, '0')}.png` }));

  it('les exporte, document compris, sans rien du voisin', async () => {
    const db = fakePackDb({ lensPack: packs(), lensPackAsset: assets() });
    const data = await exportPackData(db as never, PARTI, PAGE);
    expect(data.lensSubmissions.total).toBe(3);
    expect(data.lensSubmissions.items.map((row) => row.slug).sort()).toEqual(['lens-l1', 'lens-l2', 'lens-l3']);
    expect(data.lensSubmissions.items[0]).toHaveProperty('documentJson');
    expect(JSON.stringify(data)).not.toContain('Voisin');
  });

  it('efface les non publiées et leurs fichiers, anonymise la publiée, laisse le voisin', async () => {
    const db = fakePackDb({ lensPack: packs(), lensPackAsset: assets() });
    const summary = await purgePackData(db as never, PARTI, { files: fakeFileStore([]).store });
    expect(db.tables.lensPack.rows.map((row) => [row.id, row.author])).toEqual([
      ['l3', DELETED_ACCOUNT_PACK_AUTHOR],
      ['l4', 'Voisin'],
    ]);
    expect(db.tables.lensPackAsset.rows.map((row) => row.packId).sort()).toEqual(['l3', 'l4']);
    expect(summary).toMatchObject({ submissionsDeleted: 2, publishedAnonymized: 1 });
    expect(await measurePackData(db as never, PARTI, { files: fakeFileStore([]).store })).toMatchObject({ submissionsDeleted: 0, publishedAnonymized: 0 });
  });

  it('réécrit le document publié sans le nom de l’auteur, ré-adressé par sa nouvelle empreinte', async () => {
    const db = fakePackDb({ lensPack: packs(), lensPackAsset: assets() });
    await purgePackData(db as never, PARTI, { files: fakeFileStore([]).store });

    const published = db.tables.lensPack.rows.find((row) => row.id === 'l3')!;
    const json = String(published.documentJson);
    const sha = createHash('sha256').update(json, 'utf8').digest('hex');
    expect(json).not.toContain('Studio Nord');
    expect(JSON.parse(json).credits).toEqual({ author: DELETED_ACCOUNT_PACK_AUTHOR, createdAt: '2026-10-01' });
    expect(published).toMatchObject({ documentSha256: sha, documentSrc: `${sha.slice(0, 16)}.json`, documentBytes: Buffer.byteLength(json, 'utf8') });
  });

  it('une lens retirée par la modération part avec le compte, fichiers compris', async () => {
    const db = fakePackDb({ lensPack: [lens('l5', PARTI, 'withdrawn')], lensPackAsset: [{ id: 'f-l5', packId: 'l5', src: 'l500000000000000.png' }] });
    const summary = await purgePackData(db as never, PARTI, { files: fakeFileStore([]).store });
    expect(db.tables.lensPack.rows).toEqual([]);
    expect(db.tables.lensPackAsset.rows).toEqual([]);
    expect(summary).toMatchObject({ submissionsDeleted: 1 });
  });
});
