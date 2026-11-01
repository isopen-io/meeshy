/**
 * #11327 (S26) — un partenaire a une identité VÉRIFIÉE, son crédit voyage avec
 * le média, et l'usage d'une lens se compte sans identifier personne.
 *
 * Décisions du porteur (#11251, 2026-11-01) : gratuit des deux côtés, profil
 * vérifié par BIGBOSS/ADMIN, crédit « Lens par X » affiché, identifiant de la
 * lens EN CLAIR partout (E2EE compris), filigrane Meeshy ET logo du partenaire.
 */
import { describe, expect, it } from 'vitest';
import {
  LENS_USAGE_K_ANONYMITY,
  LENS_USAGE_SURFACES,
  PARTNER_PROFILE_LIMITS,
  declaredLensSlug,
  lensCreditOf,
  lensUsageDay,
  parsePartnerProfileInput,
  servedLensUsage,
} from '../lens-partner';

describe('declaredLensSlug — l’identifiant de lens qu’un média déclare', () => {
  it('garde un identifiant de lens bien formé', () => {
    expect(declaredLensSlug('fete-de-la-musique')).toBe('fete-de-la-musique');
  });

  it('refuse tout le reste, fail-closed : rien n’est crédité sur une valeur douteuse', () => {
    [undefined, null, 42, '', 'Majuscule', 'a/b', '../x', ' espace', 'x'.repeat(200), { slug: 'x' }, ['x']].forEach((raw) =>
      expect(declaredLensSlug(raw)).toBeNull(),
    );
  });
});

describe('parsePartnerProfileInput — ce qu’un partenaire déclare de lui', () => {
  it('nettoie le nom et accepte un site https', () => {
    expect(parsePartnerProfileInput({ displayName: '  Studio Lumière  ', website: 'https://lumiere.example' })).toEqual({
      ok: true,
      profile: { displayName: 'Studio Lumière', website: 'https://lumiere.example' },
    });
  });

  it('un site absent vaut null — retirer son site est un geste', () => {
    expect(parsePartnerProfileInput({ displayName: 'Studio' })).toEqual({ ok: true, profile: { displayName: 'Studio', website: null } });
  });

  it('refuse un nom vide, trop long, ou porteur de caractères de contrôle', () => {
    ['', ' ', 'x'.repeat(PARTNER_PROFILE_LIMITS.maxDisplayNameLength + 1), 'Stu\u0000dio', 'Stu‮dio'].forEach((displayName) =>
      expect(parsePartnerProfileInput({ displayName }).ok).toBe(false),
    );
  });

  it('refuse un site qui n’est pas https (javascript:, http:, texte libre)', () => {
    ['javascript:alert(1)', 'http://lumiere.example', 'lumiere', 'https://'].forEach((website) =>
      expect(parsePartnerProfileInput({ displayName: 'Studio', website }).ok).toBe(false),
    );
  });
});

describe('lensCreditOf — « Lens par X »', () => {
  const lens = { slug: 'noel', name: 'Noël', status: 'approved' };
  const verified = { userId: 'u1', displayName: 'Studio Lumière', verifiedAt: new Date('2026-10-01T00:00:00Z'), logoSrc: 'aaaaaaaaaaaaaaaa.png' };

  it('crédite le partenaire VÉRIFIÉ, avec l’adresse de son logo pour le filigrane', () => {
    expect(lensCreditOf(lens, verified)).toEqual({
      slug: 'noel',
      name: 'Noël',
      partner: { id: 'u1', name: 'Studio Lumière', logo: 'aaaaaaaaaaaaaaaa.png' },
      watermark: { meeshy: true, partnerLogo: 'aaaaaaaaaaaaaaaa.png' },
    });
  });

  it('un profil NON vérifié ne crédite personne : le nom déclaré n’est jamais servi comme identité', () => {
    expect(lensCreditOf(lens, { ...verified, verifiedAt: null })).toEqual({
      slug: 'noel',
      name: 'Noël',
      partner: null,
      watermark: { meeshy: true, partnerLogo: null },
    });
  });

  it('une lens qui n’est pas publiée n’a pas de crédit (refusée, en attente, retirée)', () => {
    ['pending', 'rejected', 'withdrawn'].forEach((status) => expect(lensCreditOf({ ...lens, status }, verified)).toBeNull());
  });

  it('le filigrane Meeshy est TOUJOURS là, logo partenaire ou non', () => {
    expect(lensCreditOf(lens, null)?.watermark.meeshy).toBe(true);
    expect(lensCreditOf(lens, { ...verified, logoSrc: null })?.watermark).toEqual({ meeshy: true, partnerLogo: null });
  });
});

describe('servedLensUsage — k-anonymat', () => {
  it('le seuil est de 20 appareils', () => {
    expect(LENS_USAGE_K_ANONYMITY).toBe(20);
  });

  it('ne sert AUCUNE ligne sous 20 appareils — ni son nombre d’usages, ni sa présence', () => {
    const rows = [
      { day: '2026-11-01', surface: 'camera' as const, devices: 19, uses: 400 },
      { day: '2026-11-01', surface: 'story' as const, devices: 20, uses: 31 },
      { day: '2026-11-02', surface: 'call' as const, devices: 1, uses: 1 },
    ];
    expect(servedLensUsage(rows)).toEqual([{ day: '2026-11-01', surface: 'story', devices: 20, uses: 31 }]);
  });

  it('les surfaces sont celles où une lens se joue', () => {
    expect([...LENS_USAGE_SURFACES]).toEqual(['camera', 'story', 'message', 'call']);
  });
});

describe('lensUsageDay — le jour UTC d’un usage', () => {
  it('rend AAAA-MM-JJ en UTC, quelle que soit l’heure', () => {
    expect(lensUsageDay(new Date('2026-11-01T23:59:59.999Z'))).toBe('2026-11-01');
    expect(lensUsageDay(new Date('2026-11-02T00:00:00Z'))).toBe('2026-11-02');
  });
});
