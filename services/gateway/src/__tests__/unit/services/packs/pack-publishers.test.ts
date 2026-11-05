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
import { NEUTRAL_PUBLISHER, PackPublishers, officialPublisherAccountFrom, servedAuthor, withPublishers } from '../../../../services/packs/PackPublishers';
import { memoryPublisherDb, type PublisherUserSeed } from './pack-publishers.fakes';

const OFFICIAL = '68d0000000000000000000a0';
const AWA = '68d0000000000000000000a1';
const BINTA = '68d0000000000000000000a2';
const PURGED = '68d0000000000000000000a9';
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
    expect((outcome as { publisher: { slug: string } }).publisher.slug).toMatch(/^editeur-[a-z0-9]{4}$/);
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

  it('départage par un suffixe deux noms distincts qui donnent la même adresse, sans supposer d’index unique', async () => {
    const { db, publishers } = setup();
    const first = await publishers.authorizePublication(AWA, { author: 'Stickers', claimed: null });
    const second = await publishers.authorizePublication(BINTA, { author: '日本 Stickers', claimed: null });
    expect(first).toMatchObject({ publisher: { slug: 'stickers' } });
    expect(second).toMatchObject({ kind: 'allowed', publisher: { name: '日本 Stickers' } });
    expect((second as { publisher: { slug: string } }).publisher.slug).toMatch(/^stickers-[a-z0-9]{4}$/);
    expect(new Set(db.profiles.map((row) => row.slug)).size).toBe(2);
  });

  it('refuse un nom qu’un autre éditeur porte déjà, à la casse, aux accents et aux confusables près (audit #16274, constat 7)', async () => {
    const { db, publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    for (const author of ['Studio Lumière', 'studio lumiere', 'Studio Lurnière', 'STUDIO-LUMIERE']) {
      expect(await publishers.authorizePublication(BINTA, { author, claimed: null })).toEqual({ kind: 'refused', reason: 'name-taken' });
    }
    expect(db.profiles).toHaveLength(1);
  });

  it('un compte ne reçoit jamais deux éditeurs, même par deux propositions simultanées', async () => {
    const { db, publishers } = setup();
    await Promise.all([
      publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null }),
      publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null }),
    ]);
    expect(db.profiles.filter((row) => row.userId === AWA)).toHaveLength(1);
  });

  it('résorbe les éditeurs en double d’un compte (base sans index) en gardant le plus ancien', async () => {
    const { db, publishers } = setup();
    db.profiles.push(
      { id: '68e000000000000000000001', userId: AWA, slug: 'awa', displayName: 'Awa', verifiedAt: null, createdAt: new Date('2026-11-01T00:00:00Z') },
      { id: '68e000000000000000000002', userId: AWA, slug: 'awa-x1y2', displayName: 'Awa', verifiedAt: null, createdAt: new Date('2026-11-02T00:00:00Z') },
    );
    const outcome = await publishers.authorizePublication(AWA, { author: 'Awa', claimed: null });
    expect(outcome).toMatchObject({ kind: 'allowed', publisher: { slug: 'awa' } });
    expect(db.profiles.filter((row) => row.userId === AWA).map((row) => row.id)).toEqual(['68e000000000000000000001']);
  });

  it('laisse publier un auteur au nom latin légitime (audit #16274, A3)', async () => {
    const { publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'Søren Studio', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Søren Studio' } });
  });

  it('un auteur mêlant le latin et l’arabe est un nom valide (re-audit #16274, N3)', async () => {
    const { publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'Ahmed \u0623\u062D\u0645\u062F', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Ahmed \u0623\u062D\u0645\u062F' } });
  });

  it('un auteur mal formé est refusé : le texte libre est soumis à la réserve (re-audit #16274, N5)', async () => {
    const { db, publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'Studio \u0421\u0442\u0443\u0434\u0438\u044F', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
    expect(db.profiles).toEqual([]);
  });

  it('refuse le sosie « rneeshy » comme Meeshy (audit #16274, A1)', async () => {
    const { publishers } = setup();
    expect(await publishers.authorizePublication(AWA, { author: 'rneeshy', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
  });
});

describe('servedFor — l’éditeur que la boutique sert pour chaque pack, en LECTURE SEULE', () => {
  it('sert l’éditeur de chaque proposant qui en a un', async () => {
    const { publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Awa Créations', claimed: null });
    const served = await publishers.servedFor([{ submitterId: AWA, author: 'Awa Créations' }, { submitterId: AWA, author: 'Awa Créations' }]);
    expect(served.get(AWA)).toEqual({ slug: 'awa-creations', name: 'Awa Créations', verified: false, official: false });
  });

  it('ne crée AUCUN éditeur : un proposant d’avant les éditeurs est servi sous un nom neutre (audit #16274, constats 5 et 6)', async () => {
    const { db, publishers } = setup();
    const served = await publishers.servedFor([{ submitterId: AWA, author: 'Awa Créations' }]);
    expect(served.get(AWA)).toEqual(NEUTRAL_PUBLISHER);
    expect(db.profiles).toEqual([]);
  });

  it('n’écrit rien sur un profil de partenaire d’avant #16274 sans adresse : il est servi neutre jusqu’au rattrapage', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    const before = JSON.stringify(db.profiles);
    expect((await publishers.servedFor([{ submitterId: BINTA, author: 'autre' }])).get(BINTA)).toEqual(NEUTRAL_PUBLISHER);
    expect(JSON.stringify(db.profiles)).toBe(before);
  });

  it('après la purge RGPD, une lecture de la boutique ne recrée pas de profil pour le compte purgé (audit #16274, A4)', async () => {
    const { db, publishers } = setup({ [PURGED]: VERIFIED });
    await publishers.authorizePublication(PURGED, { author: 'Awa Diallo', claimed: null });
    db.profiles.splice(0);
    await publishers.servedFor([{ submitterId: PURGED, author: 'Compte supprimé' }]);
    expect(db.profiles).toHaveLength(0);
  });

  it('une base en défaut dégrade la ligne au nom neutre, jamais tout le catalogue', async () => {
    const { db, publishers } = setup();
    db.partnerProfile.findMany = async () => {
      throw new Error('mongo down');
    };
    const served = await publishers.servedFor([{ submitterId: AWA, author: 'Awa' }, { submitterId: OFFICIAL, author: 'x' }]);
    expect(served.get(AWA)).toEqual(NEUTRAL_PUBLISHER);
    expect(served.get(OFFICIAL)).toEqual(MEESHY_PUBLISHER);
  });

  it('ne sert jamais un nom réservé porté par un ancien profil tiers', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-squat', userId: BINTA, slug: 'lens-lab', displayName: 'Meeshy', verifiedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const served = await publishers.servedFor([{ submitterId: BINTA, author: 'Meeshy' }]);
    expect(served.get(BINTA)).toEqual({ slug: 'lens-lab', name: 'Éditeur', verified: false, official: false });
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
  it('le crée vérifié pour le compte configuré, une seule fois, et l’écrit au journal d’audit une seule fois', async () => {
    const { db, publishers } = setup();
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(db.profiles).toEqual([expect.objectContaining({ userId: OFFICIAL, slug: 'meeshy', displayName: 'Meeshy', verifiedAt: expect.any(Date) })]);
    expect(db.audit).toEqual([expect.objectContaining({ action: 'PACK_PUBLISHER_OFFICIAL_LINK', userId: OFFICIAL, entity: 'PartnerProfile', entityId: OFFICIAL })]);
  });

  it('journal indisponible : rien n’est lié (fail-closed)', async () => {
    const { db, publishers } = setup();
    db.auditState.down = true;
    expect(await publishers.ensureOfficial()).toBe('audit-unavailable');
    expect(db.profiles).toEqual([]);
  });

  it('refuse de lier un compte désactivé ou supprimé', async () => {
    const { db, publishers } = setup({ [OFFICIAL]: { username: 'off', emailVerifiedAt: new Date(), deletedAt: new Date() } });
    expect(await publishers.ensureOfficial()).toBe('inactive-account');
    expect(db.profiles).toEqual([]);
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

  it('servedFor : l’ancien compte officiel est servi neutre, sans rien écrire', async () => {
    const { db, publishers } = formerOfficial();
    expect((await publishers.servedFor([{ submitterId: OFFICIAL, author: 'Meeshy' }])).get(OFFICIAL)).toEqual(NEUTRAL_PUBLISHER);
    expect(db.profiles[0]).toMatchObject({ slug: 'meeshy' });
  });

  it('authorizePublication : l’ancien compte officiel reçoit une adresse neutre et est SERVI neutre, non vérifié — sa ligne garde son nom et sa vérification, à arbitrer (re-audit #16274, N2)', async () => {
    const { db, publishers } = formerOfficial();
    expect(await publishers.authorizePublication(OFFICIAL, { author: 'Studio', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Éditeur', verified: false } });
    expect(db.profiles[0]!.slug).toMatch(/^editeur-[a-z0-9]{4}$/);
    expect(db.profiles[0]).toMatchObject({ displayName: 'Meeshy', verifiedAt: new Date('2026-10-01T00:00:00Z'), nameDisputedAt: expect.any(Date) });
  });

  it('authorizePublication : l’ancien compte officiel ne publie plus sous « meeshy »', async () => {
    const { publishers } = formerOfficial();
    expect(await publishers.authorizePublication(OFFICIAL, { author: 'Studio', claimed: 'meeshy' })).toEqual({ kind: 'refused', reason: 'not-owner' });
  });

  it('bySlug : « meeshy » ne désigne que l’éditeur officiel, et l’adresse neutre ne désigne personne', async () => {
    const { publishers } = formerOfficial();
    expect(await publishers.bySlug('meeshy')).toEqual(MEESHY_PUBLISHER);
    expect(await publishers.bySlug('editeur')).toBeNull();
  });

  it('ensureOfficial retire « meeshy » à son ancien détenteur avant de lier le compte configuré', async () => {
    const { db, publishers } = formerOfficial();
    expect(await publishers.ensureOfficial()).toBe('linked');
    expect(db.profiles.find((row) => row.userId === OFFICIAL)!.slug).toMatch(/^editeur-[a-z0-9]{4}$/);
    expect(db.profiles.find((row) => row.userId === OFFICIAL)).toMatchObject({ verifiedAt: null });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ slug: 'meeshy', displayName: 'Meeshy' });
    expect(db.audit).toEqual([expect.objectContaining({ action: 'PACK_PUBLISHER_OFFICIAL_LINK', metadata: expect.stringContaining(OFFICIAL) })]);
  });

  it('un slug réservé stocké sur un compte tiers est traité comme absent', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-squat', userId: AWA, slug: 'team-meeshy', displayName: 'Awa', verifiedAt: null, createdAt: new Date(), updatedAt: new Date() });
    const outcome = await publishers.authorizePublication(AWA, { author: 'Awa', claimed: null });
    expect(outcome).toEqual({ kind: 'allowed', publisher: { slug: 'awa', name: 'Awa', verified: false, official: false } });
  });
});

describe('backfill — le rattrapage qui crée les éditeurs des propositions d’avant #16274', () => {
  it('crée l’éditeur d’un proposant actif, pose l’adresse d’un ancien partenaire, saute un compte supprimé, et se rejoue sans rien changer', async () => {
    const { db, publishers } = setup({ [AWA]: { username: 'awa' }, [BINTA]: VERIFIED, [PURGED]: { username: 'gone', deletedAt: new Date() } });
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    const packs = [{ submitterId: AWA, author: 'Awa Créations' }, { submitterId: BINTA, author: 'autre' }, { submitterId: PURGED, author: 'Compte supprimé' }];
    expect(await publishers.backfill(packs)).toMatchObject({ created: 1, addressed: 1, kept: 0, skipped: 1, deferred: 0 });
    expect((await publishers.servedFor(packs)).get(BINTA)).toEqual({ slug: 'lens-lab', name: 'Lens Lab', verified: true, official: false });
    expect(db.profiles.some((row) => row.userId === PURGED)).toBe(false);
    expect(await publishers.backfill(packs)).toMatchObject({ created: 0, addressed: 0, kept: 2, skipped: 1, deferred: 0 });
  });

  it('un auteur dont le nom est déjà pris reçoit un éditeur neutre plutôt que rien', async () => {
    const { db, publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    await publishers.backfill([{ submitterId: BINTA, author: 'Studio Lumière' }]);
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ displayName: 'Éditeur' });
  });
});

describe('le nom d’un éditeur : un seul site d’écriture, unique même sous la course (revue de sécurité #16274)', () => {
  it('deux créations simultanées du même nom par deux comptes laissent un seul gagnant', async () => {
    const { db, publishers } = setup();
    const outcomes = await Promise.all([
      publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null }),
      publishers.authorizePublication(BINTA, { author: 'Studio Lumière', claimed: null }),
    ]);
    expect(outcomes.filter((outcome) => outcome.kind === 'allowed')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === 'refused' && outcome.reason === 'name-taken')).toHaveLength(1);
    expect(db.profiles.filter((row) => row.nameKey === 'studioiumiere')).toHaveLength(1);
  });

  it('une violation de l’index unique de nameKey (P2002) se lit name-taken', async () => {
    const { db, publishers } = setup();
    db.partnerProfile.upsert = async () => {
      throw Object.assign(new Error('Unique constraint failed on the constraint: `PartnerProfile_nameKey_key`'), { code: 'P2002', meta: { target: 'PartnerProfile_nameKey_key' } });
    };
    expect(await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null })).toEqual({ kind: 'refused', reason: 'name-taken' });
  });

  it('un ancien profil sans clé de nom, dont le nom est déjà porté, GARDE son nom et sa vérification, sans clé, à arbitrer (re-audit #16274, N2)', async () => {
    const { db, publishers } = setup();
    await publishers.authorizePublication(AWA, { author: 'Lens Lab', claimed: null });
    const verifiedAt = new Date('2026-10-01T00:00:00Z');
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Lens Lab', verifiedAt, createdAt: new Date(), updatedAt: new Date() });
    expect(await publishers.authorizePublication(BINTA, { author: 'Lens Lab', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Lens Lab', verified: true } });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ displayName: 'Lens Lab', nameKey: null, verifiedAt, nameDisputedAt: expect.any(Date) });
  });

  it('un ancien profil au nom libre reçoit sa clé de nom en devenant servable', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    await publishers.authorizePublication(BINTA, { author: 'x', claimed: null });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ slug: 'lens-lab', nameKey: 'iensiab' });
  });

  it('backfillNameKeys pose la clé des profils existants ; un homonyme et un nom qui se lit comme Meeshy gardent nom et vérification, à arbitrer ; rejouable (re-audit #16274, N2)', async () => {
    const { db, publishers } = setup();
    db.profiles.push(
      { id: '68e000000000000000000001', userId: AWA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date('2026-10-01T00:00:00Z') },
      { id: '68e000000000000000000002', userId: BINTA, displayName: 'lens-lab', verifiedAt: new Date(), createdAt: new Date('2026-10-02T00:00:00Z') },
      { id: '68e000000000000000000003', userId: PURGED, displayName: 'Meeshy Partner', verifiedAt: new Date(), createdAt: new Date('2026-10-03T00:00:00Z') },
    );
    expect(await publishers.backfillNameKeys()).toMatchObject({
      keyed: 1,
      disputed: 2,
      entries: [
        { id: '68e000000000000000000001', outcome: 'keyed' },
        { id: '68e000000000000000000002', outcome: 'disputed', reason: 'name-taken', heldBy: '68e000000000000000000001' },
        { id: '68e000000000000000000003', outcome: 'disputed', reason: 'reserved' },
      ],
    });
    expect(db.profiles.map((row) => [row.displayName, row.nameKey ?? null, row.verifiedAt instanceof Date, row.nameDisputedAt instanceof Date])).toEqual([
      ['Lens Lab', 'iensiab', true, false],
      ['lens-lab', null, true, true],
      ['Meeshy Partner', null, true, true],
    ]);
    expect(await publishers.backfillNameKeys()).toEqual({ keyed: 0, disputed: 0, entries: [] });
  });
});

describe('un ancien profil sans clé de nom détient son nom dès avant le rattrapage (revue de sécurité #16274)', () => {
  it('une nouvelle revendication du nom d’un ancien profil « Studio Lumière » sans clé est refusée', async () => {
    const { db, publishers } = setup();
    db.profiles.push({ id: 'p-legacy', userId: BINTA, displayName: 'Studio Lumière', verifiedAt: new Date(), createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date() });
    expect(await publishers.authorizePublication(AWA, { author: 'studio lumiere', claimed: null })).toEqual({ kind: 'refused', reason: 'name-taken' });
    expect(db.profiles.filter((row) => row.userId === AWA)).toEqual([]);
  });

  it('entre deux anciens profils au même nom, la clé va au plus ancien ; l’autre garde son nom, à arbitrer', async () => {
    const { db, publishers } = setup();
    db.profiles.push(
      { id: '68e000000000000000000009', userId: BINTA, displayName: 'lens-lab', verifiedAt: new Date(), createdAt: new Date('2026-10-02T00:00:00Z') },
      { id: '68e000000000000000000008', userId: AWA, displayName: 'Lens Lab', verifiedAt: new Date(), createdAt: new Date('2026-10-01T00:00:00Z') },
    );
    await publishers.authorizePublication(BINTA, { author: 'lens-lab', claimed: null });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ displayName: 'lens-lab', nameKey: null, verifiedAt: expect.any(Date), nameDisputedAt: expect.any(Date) });
  });
});

describe('le balayage des anciens profils ne se contourne pas, et ne neutralise jamais sur un doute (revue de sécurité #16274)', () => {
  const legacyRows = (count: number, name: (index: number) => string) =>
    Array.from({ length: count }, (_, index) => ({ id: `68f0${String(index).padStart(20, '0')}`, userId: `68f1${String(index).padStart(20, '0')}`, displayName: name(index), verifiedAt: null, createdAt: new Date('2026-09-01T00:00:00Z') }));

  it('des milliers de profils neutres ou officiels sans clé ne bloquent aucun nom', async () => {
    const { db, publishers } = setup();
    db.profiles.push(...legacyRows(2_000, () => 'Éditeur'), { id: 'p-off', userId: OFFICIAL, displayName: 'Meeshy', verifiedAt: new Date(), createdAt: new Date() });
    expect(await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Studio Lumière' } });
  });

  it('un balayage inconcluant laisse l’ancien profil tel quel au rattrapage : ni nom neutre, ni vérification perdue', async () => {
    const { db, publishers } = setup();
    db.profiles.push(...legacyRows(2_000, (index) => `Studio ${index}`));
    db.profiles.push({ id: '68e0000000000000000000ff', userId: AWA, displayName: 'Lens Lab', verifiedAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z') });
    await publishers.backfillNameKeys();
    expect(db.profiles.find((row) => row.userId === AWA)).toMatchObject({ displayName: 'Lens Lab', verifiedAt: new Date('2026-10-01T00:00:00Z') });
  });
});

describe('re-audit #16274 — aucun profil existant renommé, aucun nom pris sans publier, aucun auteur trompeur', () => {
  const V: PublisherUserSeed = { username: 'x', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') };
  const two = () => setup({ [AWA]: V, [BINTA]: V, [OFFICIAL]: V });

  it('B3 — un auteur en alphabet non admis qui se LIT « MEESHY » (cherokee) est refusé comme auteur', async () => {
    const { publishers } = two();
    expect(await publishers.authorizePublication(AWA, { author: 'ᎷᎬᎬSHY', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
  });

  it('B4 — un ancien client dont l’auteur est déjà pris est refusé sous un code que les clients publiés rendent comme un échec générique, sans éditeur créé', async () => {
    const { db, publishers } = two();
    await publishers.authorizePublication(AWA, { author: 'Awa', claimed: null });
    expect(await publishers.authorizePublication(BINTA, { author: 'awa', claimed: null })).toEqual({ kind: 'refused', reason: 'name-taken' });
    expect(db.profiles.filter((row) => row.userId === BINTA)).toEqual([]);
  });

  it('B5 — au rattrapage, un profil VÉRIFIÉ garde son nom, sa vérification ET la clé face à un homonyme plus ancien non vérifié, qui garde aussi son nom', async () => {
    const { db, publishers } = two();
    db.profiles.push(
      { id: '68e000000000000000000001', userId: AWA, displayName: 'studio lumiere', verifiedAt: null, createdAt: new Date('2025-01-01T00:00:00Z') },
      { id: '68e000000000000000000002', userId: BINTA, displayName: 'Studio Lumière', verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-02-01T00:00:00Z') },
    );
    await publishers.backfillNameKeys();
    const binta = db.profiles.find((row) => row.userId === BINTA)!;
    const awa = db.profiles.find((row) => row.userId === AWA)!;
    expect([binta.displayName, binta.verifiedAt !== null, binta.nameKey]).toEqual(['Studio Lumière', true, 'studioiumiere']);
    expect([awa.displayName, awa.nameKey ?? null, awa.nameDisputedAt instanceof Date]).toEqual(['studio lumiere', null, true]);
  });

  it('B5 bis — par le chemin de publication aussi, le vérifié plus récent garde la clé et l’ancien non vérifié reste nommé', async () => {
    const { db, publishers } = two();
    db.profiles.push(
      { id: '68e000000000000000000001', userId: AWA, displayName: 'studio lumiere', verifiedAt: null, createdAt: new Date('2025-01-01T00:00:00Z') },
      { id: '68e000000000000000000002', userId: BINTA, displayName: 'Studio Lumière', verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-02-01T00:00:00Z') },
    );
    await publishers.authorizePublication(AWA, { author: 'studio lumiere', claimed: null });
    expect(db.profiles.find((row) => row.userId === AWA)).toMatchObject({ displayName: 'studio lumiere', nameDisputedAt: expect.any(Date) });
    await publishers.authorizePublication(BINTA, { author: 'Studio Lumière', claimed: null });
    expect(db.profiles.find((row) => row.userId === BINTA)).toMatchObject({ displayName: 'Studio Lumière', nameKey: 'studioiumiere', verifiedAt: new Date('2025-06-01T00:00:00Z') });
  });

  it('B6 — un auteur au nom d’un tiers, sur la 2e proposition, est refusé', async () => {
    const { publishers } = two();
    await publishers.authorizePublication(AWA, { author: 'Studio Lumière', claimed: null });
    await publishers.authorizePublication(BINTA, { author: 'Bob', claimed: null });
    expect(await publishers.authorizePublication(BINTA, { author: 'Studio Lumière', claimed: null })).toEqual({ kind: 'refused', reason: 'name-taken' });
  });

  it('N1 — vérifier une proposition n’écrit rien : le nom ne se prend qu’au commit', async () => {
    const { db, publishers } = two();
    const vetting = await publishers.vetPublication(AWA, { author: 'Studio Lumière', claimed: null });
    expect(vetting.kind).toBe('vetted');
    expect(db.profiles).toEqual([]);
    if (vetting.kind !== 'vetted') return;
    expect(await vetting.commit()).toMatchObject({ kind: 'allowed', publisher: { name: 'Studio Lumière' } });
    expect(db.profiles).toHaveLength(1);
  });

  it('N2 — un ancien partenaire au nom qui se lit comme Meeshy n’est jamais renommé : servi neutre et non vérifié, sa ligne intacte', async () => {
    const { db, publishers } = two();
    const verifiedAt = new Date('2026-10-01T00:00:00Z');
    db.profiles.push({ id: 'p-legacy', userId: AWA, slug: 'fan', displayName: 'Meeshy Fan', verifiedAt, createdAt: new Date('2026-09-01T00:00:00Z') });
    expect(await publishers.authorizePublication(AWA, { author: 'Studio', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Éditeur', verified: false } });
    expect(db.profiles[0]).toMatchObject({ displayName: 'Meeshy Fan', verifiedAt, nameDisputedAt: expect.any(Date) });
  });

  it('N2 — le DRY_RUN des clés liste tout ce qu’il ferait, sans rien écrire', async () => {
    const { db, publishers } = two();
    db.profiles.push(
      { id: '68e000000000000000000001', userId: AWA, displayName: 'Lens Lab', verifiedAt: null, createdAt: new Date('2026-10-01T00:00:00Z') },
      { id: '68e000000000000000000002', userId: BINTA, displayName: 'lens lab', verifiedAt: null, createdAt: new Date('2026-10-02T00:00:00Z') },
    );
    const before = JSON.stringify(db.profiles);
    expect(await publishers.backfillNameKeys({ dryRun: true })).toMatchObject({
      keyed: 1,
      disputed: 1,
      entries: [
        { id: '68e000000000000000000001', displayName: 'Lens Lab', outcome: 'keyed' },
        { id: '68e000000000000000000002', displayName: 'lens lab', outcome: 'disputed', reason: 'name-taken', heldBy: '68e000000000000000000001' },
      ],
    });
    expect(JSON.stringify(db.profiles)).toBe(before);
  });

  it('N2 — le DRY_RUN du rattrapage des éditeurs liste chaque proposant sans rien écrire', async () => {
    const { db, publishers } = setup({ [AWA]: V, [BINTA]: V, [PURGED]: { username: 'gone', deletedAt: new Date() } });
    const report = await publishers.backfill(
      [{ submitterId: AWA, author: 'Awa Créations' }, { submitterId: PURGED, author: 'x' }],
      { dryRun: true },
    );
    expect(report).toMatchObject({ created: 1, skipped: 1, entries: [{ userId: AWA, outcome: 'created', name: 'Awa Créations' }, { userId: PURGED, outcome: 'skipped' }] });
    expect(db.profiles).toEqual([]);
  });

  it('N5 — l’auteur servi aux anciens clients est le nom de l’éditeur, jamais le texte libre', async () => {
    const { publishers } = two();
    await publishers.authorizePublication(BINTA, { author: 'Bob', claimed: null });
    const [served] = await withPublishers(publishers, [{ submitterId: BINTA, author: 'Studio Lumière' }], (row) => ({ author: row.author }));
    expect(served).toMatchObject({ author: 'Bob', publisher: { name: 'Bob' } });
  });

  it('N5 — sans éditeur réel, un auteur réservé est servi sous le nom neutre', () => {
    expect(servedAuthor('ᎷᎬᎬSHY', NEUTRAL_PUBLISHER)).toBe('Éditeur');
    expect(servedAuthor('Studio Minou', NEUTRAL_PUBLISHER)).toBe('Studio Minou');
    expect(servedAuthor('Studio Minou', MEESHY_PUBLISHER)).toBe('Meeshy');
  });

  it('N6 — un balayage inconcluant à la proposition se lit « réessayer plus tard », jamais « nom pris »', async () => {
    const { db, publishers } = two();
    db.profiles.push(
      ...Array.from({ length: 2_000 }, (_, index) => ({ id: `68f0${String(index).padStart(20, '0')}`, userId: `68f1${String(index).padStart(20, '0')}`, displayName: `Studio ${index}`, verifiedAt: null, createdAt: new Date('2026-09-01T00:00:00Z') })),
    );
    expect(await publishers.authorizePublication(AWA, { author: 'Kɔfi Art', claimed: null })).toEqual({ kind: 'refused', reason: 'retry-later' });
  });

  it('N3 — « Kɔfi Art » publie sous son nom', async () => {
    const { publishers } = two();
    expect(await publishers.authorizePublication(AWA, { author: 'Kɔfi Art', claimed: null })).toMatchObject({ kind: 'allowed', publisher: { name: 'Kɔfi Art' } });
  });
});

describe('re-audit 3 #16274 — un alphabet absent n’est pas une imitation', () => {
  const V: PublisherUserSeed = { username: 'x', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') };

  it('C1 — « Mɇɇʂhy » est refusé comme auteur', async () => {
    const { publishers } = setup({ [AWA]: V });
    expect(await publishers.authorizePublication(AWA, { author: 'Mɇɇʂhy', claimed: null })).toEqual({ kind: 'refused', reason: 'reserved' });
  });

  it('C3 — un ancien partenaire VÉRIFIÉ au nom gujarati est servi sous son nom, vérifié', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    db.profiles.push({ id: '68e000000000000000000011', userId: AWA, displayName: 'ગુજરાત સ્ટુડિયો', slug: 'gujarat', nameKey: null, verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') });
    const served = (await publishers.servedFor([{ submitterId: AWA, author: 'x' }])).get(AWA);
    expect([served?.name, served?.verified]).toEqual(['ગુજરાત સ્ટુડિયો', true]);
  });

  it('N7 — un ancien nom hors liste reçoit sa clé au rattrapage, signalé « hors liste », jamais « se lit comme Meeshy », vérification gardée', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    const verifiedAt = new Date('2025-06-01T00:00:00Z');
    db.profiles.push({ id: '68e000000000000000000012', userId: AWA, displayName: 'Café Москва', slug: 'cafe', verifiedAt, createdAt: new Date('2025-01-01T00:00:00Z') });
    expect(await publishers.backfillNameKeys()).toMatchObject({ keyed: 1, disputed: 0, entries: [{ id: '68e000000000000000000012', outcome: 'keyed', offList: true }] });
    expect(db.profiles[0]).toMatchObject({ displayName: 'Café Москва', verifiedAt, nameKey: expect.any(String), nameOffListAt: new Date('2026-11-05T10:00:00.000Z') });
    expect((await publishers.servedFor([{ submitterId: AWA, author: 'x' }])).get(AWA)).toMatchObject({ name: 'Café Москва', verified: true });
  });

  it('C3 avec la marque — un ancien nom gujarati marqué au rattrapage reste servi sous son nom, vérifié', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    db.profiles.push({ id: '68e000000000000000000013', userId: AWA, displayName: 'ગુજરાત સ્ટુડિયો', slug: 'gujarat', nameKey: 'k', nameOffListAt: new Date('2026-11-05T10:00:00Z'), verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') });
    expect((await publishers.servedFor([{ submitterId: AWA, author: 'x' }])).get(AWA)).toMatchObject({ name: 'ગુજરાત સ્ટુડિયો', verified: true });
  });

  it('un nom hors liste SANS marque qui se lit comme Meeshy par trois jokers est servi sous le nom neutre, non vérifié — la marque se lit sur la ligne', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    db.profiles.push({ id: '68e000000000000000000014', userId: AWA, displayName: 'Mꯃꯃꯇhy', slug: 'mhy', nameKey: 'mhy', verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') });
    expect((await publishers.servedFor([{ submitterId: AWA, author: 'x' }])).get(AWA)).toMatchObject({ name: NEUTRAL_PUBLISHER.name, verified: false });
  });

  it('le même nom sur un profil hérité MARQUÉ est servi tel quel, vérifié', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    db.profiles.push({ id: '68e000000000000000000015', userId: AWA, displayName: 'Mꯃꯃꯇhy', slug: 'mhy', nameKey: 'mhy', nameOffListAt: new Date('2026-11-05T10:00:00Z'), verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') });
    expect((await publishers.servedFor([{ submitterId: AWA, author: 'x' }])).get(AWA)).toMatchObject({ name: 'Mꯃꯃꯇhy', verified: true });
  });

  it('une proposition qui nomme « Mꯃꯃꯇhy » (hors liste, trois jokers) est REFUSÉE et ne crée aucun éditeur', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    const outcome = await publishers.authorizePublication(AWA, { author: 'Mꯃꯃꯇhy', claimed: null });
    expect(outcome).toMatchObject({ kind: 'refused' });
    expect(db.profiles.map((row) => row.displayName)).not.toContain('Mꯃꯃꯇhy');
  });

  it('un ancien profil SANS clé et sans marque qui se lit comme Meeshy par trois jokers est marqué à arbitrer à la publication, servi neutre', async () => {
    const { db, publishers } = setup({ [AWA]: V });
    db.profiles.push({ id: '68e000000000000000000016', userId: AWA, displayName: 'Mꯃꯃꯇhy', slug: 'mhy', verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') });
    const outcome = await publishers.authorizePublication(AWA, { author: 'x', claimed: null });
    expect(outcome).toMatchObject({ kind: 'allowed', publisher: { name: NEUTRAL_PUBLISHER.name } });
    expect(db.profiles[0]).toMatchObject({ displayName: 'Mꯃꯃꯇhy', nameDisputedAt: expect.any(Date) });
  });

  it('N10 — l’administration voit les profils à arbitrer', async () => {
    const { db, publishers } = setup({ [AWA]: V, [BINTA]: V });
    db.profiles.push(
      { id: '68e000000000000000000021', userId: AWA, displayName: 'Studio Lumière', slug: 'studio-lumiere', verifiedAt: new Date('2025-06-01T00:00:00Z'), createdAt: new Date('2025-01-01T00:00:00Z') },
      { id: '68e000000000000000000022', userId: BINTA, displayName: 'studio lumiere', slug: 'studio-lumiere-2', verifiedAt: null, createdAt: new Date('2025-02-01T00:00:00Z') },
    );
    await publishers.backfillNameKeys();
    const listed = await publishers.adminList();
    expect(listed.find((row) => row.owner.id === AWA)?.nameDisputedAt).toBeNull();
    expect(listed.find((row) => row.owner.id === BINTA)?.nameDisputedAt).toEqual('2026-11-05T10:00:00.000Z');
  });
});
