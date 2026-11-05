/**
 * #16274 — L'ÉDITEUR d'un pack est un compte Meeshy : la publication exige un
 * compte VÉRIFIÉ et propriétaire de l'éditeur qu'elle nomme ; l'éditeur
 * « Meeshy » n'appartient qu'au compte officiel désigné par la configuration ;
 * la boutique ne sert que le nom de boutique, jamais le compte propriétaire.
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { MEESHY_PUBLISHER } from '@meeshy/shared/types/pack-publisher';
import { PackPublishers, officialPublisherAccountFrom } from '../../../../services/packs/PackPublishers';
import { memoryPublisherDb, type PublisherUserSeed } from './pack-publishers.fakes';

const OFFICIAL = '68d0000000000000000000a0';
const AWA = '68d0000000000000000000a1';
const BINTA = '68d0000000000000000000a2';
const VERIFIED: PublisherUserSeed = { username: 'awa_k', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') };

function setup(users: Readonly<Record<string, PublisherUserSeed>> = { [AWA]: VERIFIED, [BINTA]: { username: 'binta', phoneVerifiedAt: new Date('2026-01-02T00:00:00Z') }, [OFFICIAL]: { username: 'meeshy_officiel', emailVerifiedAt: new Date() } }, official: string | null = OFFICIAL) {
  const db = memoryPublisherDb(users);
  const publishers = new PackPublishers({ prisma: db.prisma, officialAccountId: official, now: () => new Date('2026-11-05T10:00:00Z') });
  return { db, publishers };
}

describe('officialPublisherAccountFrom — le compte officiel vient de la CONFIGURATION', () => {
  it('lit MEESHY_OFFICIAL_ACCOUNT_ID', () => {
    expect(officialPublisherAccountFrom({ MEESHY_OFFICIAL_ACCOUNT_ID: OFFICIAL })).toBe(OFFICIAL);
  });

  it('rend `null` pour une valeur absente ou qui n’est pas un identifiant (fail-closed)', () => {
    [{}, { MEESHY_OFFICIAL_ACCOUNT_ID: '' }, { MEESHY_OFFICIAL_ACCOUNT_ID: 'meeshy' }, { MEESHY_OFFICIAL_ACCOUNT_ID: `${OFFICIAL} ` }].forEach((env) =>
      expect(officialPublisherAccountFrom(env)).toBeNull(),
    );
  });
});

describe('authorizePublication — qui peut publier', () => {
  it('rattache la première proposition d’un compte vérifié à un éditeur créé à la volée, nommé par la proposition', async () => {
    const { db, publishers } = setup();
    const outcome = await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    expect(outcome).toEqual({ kind: 'allowed', publisher: { slug: 'studio-lumiere', name: 'Studio Lumière', verified: false, official: false } });
    expect(db.profiles).toHaveLength(1);
    expect(db.profiles[0]).toMatchObject({ userId: AWA, slug: 'studio-lumiere', displayName: 'Studio Lumière', verifiedAt: null });
  });

  it('ne dérive JAMAIS le nom de boutique du nom d’utilisateur', async () => {
    const { publishers } = setup();
    const outcome = await publishers.authorizePublication(AWA, { author: '', claimed: null });
    expect(outcome).toMatchObject({ kind: 'allowed', publisher: { name: 'Éditeur' } });
    expect(JSON.stringify(outcome)).not.toContain('awa_k');
  });

  it('garde l’éditeur existant : un second nom d’auteur ne crée ni ne renomme rien', async () => {
    const { db, publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    const second = await publishers.authorizePublication(AWA, { author: 'Autre nom', claimed: 'studio-lumiere' });
    expect(second).toMatchObject({ kind: 'allowed', publisher: { slug: 'studio-lumiere', name: 'Studio Lumière' } });
    expect(db.profiles).toHaveLength(1);
  });

  it('refuse un compte qui n’a vérifié ni son adresse ni son numéro', async () => {
    const { db, publishers } = setup({ [AWA]: { username: 'awa_k' } });
    expect(await publishers.authorizePublication(AWA, { author: 'Studio', claimed: null })).toEqual({ kind: 'refused', reason: 'account-unverified' });
    expect(db.profiles).toEqual([]);
  });

  it('refuse un compte désactivé, supprimé ou inconnu', async () => {
    const cases: readonly PublisherUserSeed[] = [
      { ...VERIFIED, isActive: false },
      { ...VERIFIED, deactivatedAt: new Date() },
      { ...VERIFIED, deletedAt: new Date() },
    ];
    for (const seed of cases) {
      const { publishers } = setup({ [AWA]: seed });
      expect(await publishers.authorizePublication(AWA, { author: 'Studio', claimed: null })).toEqual({ kind: 'refused', reason: 'account-unverified' });
    }
    const { publishers } = setup({});
    expect(await publishers.authorizePublication(AWA, { author: 'Studio', claimed: null })).toEqual({ kind: 'refused', reason: 'account-unverified' });
  });

  it('refuse de publier sous un éditeur que le compte ne possède pas', async () => {
    const { publishers } = setup();
    await publishers.authorizePublication(BINTA, { author: 'Binta Studio', claimed: null });
    expect(await publishers.authorizePublication(AWA, { author: 'Awa', claimed: 'binta-studio' })).toEqual({ kind: 'refused', reason: 'not-owner' });
  });

  it('refuse une revendication illisible (fail-closed)', async () => {
    const { publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'Awa', claimed: '' })).toEqual({ kind: 'refused', reason: 'not-owner' });
  });

  it('refuse à un tiers l’identité de Meeshy, par l’auteur comme par l’éditeur nommé', async () => {
    const { db, publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'Meeshy Officiel', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
    expect(await publishers.authorizePublication(AWA, { author: 'Awa', claimed: 'meeshy' })).toEqual({ kind: 'refused', reason: 'not-owner' });
    expect(db.profiles.some((row) => row.slug === 'meeshy')).toBe(false);
  });

  it('laisse le compte officiel publier sous l’éditeur Meeshy, qu’il possède', async () => {
    const { db, publishers } = setup();
    expect(await publishers.authorizePublication(OFFICIAL, { author: 'Meeshy', claimed: 'meeshy' })).toEqual({ kind: 'allowed', publisher: MEESHY_PUBLISHER });
    expect(db.profiles).toEqual([expect.objectContaining({ userId: OFFICIAL, slug: 'meeshy', displayName: 'Meeshy' })]);
  });

  it('ne reconnaît aucun compte officiel sans configuration : Meeshy reste réservé', async () => {
    const { publishers } = setup(undefined, null);
    expect(await publishers.authorizePublication(OFFICIAL, { author: 'Meeshy', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
  });

  it('départage deux éditeurs au même nom par un suffixe', async () => {
    const { publishers } = setup();
    const first = await publishers.authorizePublication(AWA, { author: 'Studio', claimed: null });
    const second = await publishers.authorizePublication(BINTA, { author: 'Studio', claimed: null });
    expect(first).toMatchObject({ publisher: { slug: 'studio' } });
    expect(second).toMatchObject({ kind: 'allowed', publisher: { name: 'Studio' } });
    expect((second as { publisher: { slug: string } }).publisher.slug).toMatch(/^studio-[a-z0-9]{4}$/);
  });
});

describe('servedFor — l’éditeur que la boutique sert pour chaque pack', () => {
  it('rattache à la volée les propositions d’avant les éditeurs, sous le nom d’auteur qu’elles portaient', async () => {
    const { db, publishers } = setup();
    const served = await publishers.servedFor([{ submitterId: AWA, author: 'Awa Créations' }, { submitterId: AWA, author: 'Awa Créations' }]);
    expect(served.get(AWA)).toEqual({ slug: 'awa-creations', name: 'Awa Créations', verified: false, official: false });
    expect(db.profiles).toHaveLength(1);
  });

  it('pose son adresse à un profil de partenaire d’avant #16274, sans en changer le nom', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    const served = await publishers.servedFor([{ submitterId: BINTA, author: 'autre' }]);
    expect(served.get(BINTA)).toEqual({ slug: 'lens-lab', name: 'Lens Lab', verified: true, official: false });
    expect(db.profiles).toHaveLength(1);
  });

  it('ne sert jamais un nom réservé porté par un ancien profil tiers', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-squat', userId: BINTA, displayName: 'Meeshy', verifiedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const served = await publishers.servedFor([{ submitterId: BINTA, author: 'Meeshy' }]);
    expect(served.get(BINTA)).toEqual({ slug: 'editeur', name: 'Éditeur', verified: false, official: false });
  });

  it('sert Meeshy pour les packs du compte officiel', async () => {
    const { publishers } = setup();
    expect((await publishers.servedFor([{ submitterId: OFFICIAL, author: 'x' }])).get(OFFICIAL)).toEqual(MEESHY_PUBLISHER);
  });

  it('ne porte ni l’identifiant ni le nom d’utilisateur du propriétaire', async () => {
    const { publishers } = setup();
    const served = await publishers.servedFor([{ submitterId: AWA, author: 'Awa Créations' }]);
    const text = JSON.stringify([...served.values()]);
    expect(text).not.toContain(AWA);
    expect(text).not.toContain('awa_k');
  });
});

describe('ensureOfficial — l’éditeur Meeshy appartient au compte officiel', () => {
  it('le crée vérifié pour le compte configuré, une seule fois', async () => {
    const { db, publishers } = setup();
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(db.profiles).toEqual([expect.objectContaining({ userId: OFFICIAL, slug: 'meeshy', displayName: 'Meeshy', verifiedAt: expect.any(Date) })]);
  });

  it('ne fait rien sans configuration', async () => {
    const { db, publishers } = setup(undefined, null);
    expect(await publishers.ensureOfficial()).toBe('unconfigured');
    expect(db.profiles).toEqual([]);
  });

  it('refuse de lier un compte officiel inconnu', async () => {
    const { db, publishers } = setup({});
    expect(await publishers.ensureOfficial()).toBe('unknown-account');
    expect(db.profiles).toEqual([]);
  });
});

describe('adminList et bySlug — ce que voit l’administration, ce que voit la boutique', () => {
  it('l’administration voit le compte propriétaire et son nom d’utilisateur', async () => {
    const { publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    expect(await publishers.adminList()).toEqual([
      expect.objectContaining({ slug: 'studio-lumiere', displayName: 'Studio Lumière', verified: false, official: false, owner: { id: AWA, username: 'awa_k' } }),
    ]);
  });

  it('la boutique lit un éditeur par son adresse, sans son propriétaire', async () => {
    const { publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    expect(await publishers.bySlug('studio-lumiere')).toEqual({ slug: 'studio-lumiere', name: 'Studio Lumière', verified: false, official: false });
    expect(await publishers.bySlug('meeshy')).toEqual(MEESHY_PUBLISHER);
    expect(await publishers.bySlug('inconnu')).toBeNull();
  });
});

describe('une identité Meeshy ne survit pas à la fin du statut officiel', () => {
  const formerOfficial = () => {
    const { db, publishers } = setup(undefined, BINTA);
    db.profiles.push({ id: 'p-old', userId: OFFICIAL, slug: 'meeshy', displayName: 'Meeshy', verifiedAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date(), updatedAt: new Date() });
    return { db, publishers };
  };

  it('servedFor : l’ancien compte officiel reçoit une adresse et un nom neutres, et perd la vérification accordée', async () => {
    const { db, publishers } = formerOfficial();
    const served = (await publishers.servedFor([{ submitterId: OFFICIAL, author: 'Meeshy' }])).get(OFFICIAL);
    expect(served).toEqual({ slug: 'editeur', name: 'Éditeur', verified: false, official: false });
    expect(db.profiles[0]).toMatchObject({ slug: 'editeur', verifiedAt: null });
  });

  it('authorizePublication : l’ancien compte officiel ne publie plus sous « meeshy »', async () => {
    const { publishers } = formerOfficial();
    expect(await publishers.authorizePublication(OFFICIAL, { author: 'Studio', claimed: 'meeshy' })).toEqual({ kind: 'refused', reason: 'not-owner' });
  });

  it('bySlug : « meeshy » ne désigne que l’éditeur officiel, jamais l’ancienne ligne', async () => {
    const { publishers } = formerOfficial();
    await publishers.servedFor([{ submitterId: OFFICIAL, author: 'x' }]);
    expect(await publishers.bySlug('editeur')).toEqual({ slug: 'editeur', name: 'Éditeur', verified: false, official: false });
  });

  it('ensureOfficial retire « meeshy » à son ancien détenteur avant de lier le compte configuré', async () => {
    const { db, publishers } = formerOfficial();
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(db.profiles.find((row) => row.userId === OFFICIAL)).toMatchObject({ slug: 'editeur', verifiedAt: null });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ slug: 'meeshy', displayName: 'Meeshy' });
  });

  it('un slug réservé stocké sur un compte tiers est traité comme absent', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-squat', userId: AWA, slug: 'team-meeshy', displayName: 'Awa', verifiedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const outcome = await publishers.authorizePublication(AWA, { author: 'Awa', claimed: null });
    expect(outcome).toEqual({ kind: 'allowed', publisher: { slug: 'awa', name: 'Awa', verified: false, official: false } });
  });
});
