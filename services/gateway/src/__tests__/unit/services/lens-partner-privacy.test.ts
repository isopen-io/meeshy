/**
 * #11327 (S26) — l'identité partenaire et l'usage des lens suivent le compte
 * dans l'export et la purge RGPD.
 *
 *  - le profil partenaire s'exporte (nom, site, logo par son adresse, état de
 *    vérification), jamais les octets du logo ni rien du voisin ;
 *  - la purge efface le profil — le crédit « Lens par X » s'éteint avec lui ;
 *  - l'usage agrégé d'une lens que la purge efface part avec elle ; celui d'une
 *    lens publiée (anonymisée) reste : il ne porte aucune identité.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { exportPackData, measurePackData, purgePackData } from '../../../services/packs/PackPrivacy';
import { fakeFileStore, fakePackDb, type Row } from './pack-privacy.fakes';

const PARTI = '507f1f77bcf86cd799439011';
const VOISIN = '507f1f77bcf86cd799439022';
const ADMIN = '507f1f77bcf86cd799439033';
const AT = new Date('2026-10-01T10:00:00.000Z');
const PAGE = { limit: 500, offset: 0 };

const profile = (id: string, userId: string, displayName: string): Row => ({
  id, userId, displayName, website: 'https://studio.example', logoSrc: 'aaaaaaaaaaaaaaaa.png', logoSha256: 'f'.repeat(64),
  logoMime: 'image/png', logoBytes: Buffer.from('octets-secrets'), logoSize: 14, verifiedAt: AT, verifiedBy: ADMIN, createdAt: AT, updatedAt: AT,
});

const lens = (id: string, submitterId: string, status: string): Row => ({
  id, slug: `lens-${id}`, name: 'Aurore', author: 'Studio', submitterId, status, reviewNote: null, reviewedAt: null, installCount: 0,
  cost: 'light', createdAt: AT, documentJson: '{"schema":1,"credits":{"author":"Studio"}}', documentSha256: `sha-${id}`,
});

const usage = (lensId: string): Row => ({ id: `u-${lensId}`, lensId, day: '2026-10-01', surface: 'camera', devices: 25, uses: 40 });

function seeded() {
  return fakePackDb({
    partnerProfile: [profile('p1', PARTI, 'Studio Lumière'), profile('p2', VOISIN, 'Voisin Studio')],
    lensPack: [lens('l1', PARTI, 'pending'), lens('l2', PARTI, 'approved'), lens('l3', VOISIN, 'pending')],
    lensUsageDaily: [usage('l1'), usage('l2'), usage('l3')],
  });
}

describe('exportPackData — le profil partenaire (#11327)', () => {
  it('exporte le profil du compte : nom, site, adresse du logo, état de vérification — sans les octets du logo', async () => {
    const data = await exportPackData(seeded() as never, PARTI, PAGE);

    expect(data.partnerProfile.total).toBe(1);
    expect(data.partnerProfile.items).toEqual([
      { displayName: 'Studio Lumière', website: 'https://studio.example', logoSrc: 'aaaaaaaaaaaaaaaa.png', logoSize: 14, verifiedAt: AT, createdAt: AT, updatedAt: AT },
    ]);
    expect(JSON.stringify(data)).not.toContain('Voisin');
    expect(JSON.stringify(data)).not.toContain(ADMIN);
  });

  it('un compte sans profil exporte une section vide', async () => {
    const data = await exportPackData(fakePackDb({}) as never, PARTI, PAGE);
    expect(data.partnerProfile).toEqual({ items: [], total: 0 });
  });
});

describe('purgePackData — le profil et l’usage (#11327)', () => {
  it('efface le profil du compte, et lui seul', async () => {
    const db = seeded();
    const summary = await purgePackData(db as never, PARTI, { files: fakeFileStore([]).store });

    expect(db.tables.partnerProfile.rows.map((row) => row.userId)).toEqual([VOISIN]);
    expect(summary).toMatchObject({ partnerProfilesDeleted: 1 });
  });

  it('l’usage d’une lens effacée part avec elle ; celui d’une lens publiée et celui du voisin restent', async () => {
    const db = seeded();
    await purgePackData(db as never, PARTI, { files: fakeFileStore([]).store });

    expect(db.tables.lensUsageDaily.rows.map((row) => row.lensId).sort()).toEqual(['l2', 'l3']);
  });

  it('la mesure à blanc compte le profil sans rien toucher', async () => {
    const db = seeded();
    const measured = await measurePackData(db as never, PARTI, { files: fakeFileStore([]).store });

    expect(measured).toMatchObject({ partnerProfilesDeleted: 1 });
    expect(db.tables.partnerProfile.rows).toHaveLength(2);
    expect(db.writes).toEqual([]);
  });
});
