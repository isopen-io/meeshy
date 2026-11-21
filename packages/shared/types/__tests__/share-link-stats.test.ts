import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_TYPES,
  SHARE_LINK_ARRIVALS_PAGE_DEFAULT,
  SHARE_LINK_ARRIVALS_PAGE_MAX,
  SHARE_LINK_RECENT_ARRIVALS_CAP,
  shareLinkArrivalsPageJsonSchema,
  shareLinkArrivalsPageSchema,
  shareLinkPreviewConversationJsonSchema,
  shareLinkPreviewConversationSchema,
  shareLinkStatsJsonSchema,
  shareLinkStatsSchema,
  maskGuestEmail,
} from '../share-link-stats';

const arrival = (overrides: Record<string, unknown> = {}) => ({
  participantId: '68a000000000000000000001',
  displayName: 'Nova',
  avatar: null,
  isAnonymous: true,
  country: 'FR',
  language: 'fr',
  joinedAt: '2026-09-24T10:00:00.000Z',
  userId: null,
  emailMasked: 'b•••@•••.sn',
  ...overrides,
});

const stats = (overrides: Record<string, unknown> = {}) => ({
  visits: 12,
  arrivals: 3,
  anonymousArrivals: 2,
  arrivalsByLanguage: [{ language: 'fr', count: 2 }, { language: 'en', count: 1 }],
  arrivalsByCountry: [{ country: 'FR', count: 2 }],
  recentArrivals: [arrival()],
  ...overrides,
});

describe('aperçu du groupe servi par un lien d’invitation', () => {
  it('accepte chacun des types réels de conversation', () => {
    for (const type of CONVERSATION_TYPES) {
      const parsed = shareLinkPreviewConversationSchema.safeParse({
        id: 'c', title: 'Équipe', description: null, type, avatar: null, banner: null, createdAt: '2026-09-24T10:00:00.000Z',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('déclare au schéma de réponse le logo, la bannière et tous les types', () => {
    expect(Object.keys(shareLinkPreviewConversationJsonSchema.properties)).toEqual(
      expect.arrayContaining(['avatar', 'banner']),
    );
    expect(shareLinkPreviewConversationJsonSchema.properties.type.enum).toEqual([...CONVERSATION_TYPES]);
    expect(CONVERSATION_TYPES).toEqual(expect.arrayContaining(['public', 'global', 'broadcast']));
  });
});

describe('statistiques d’un lien d’invitation', () => {
  it('accepte une charge complète', () => {
    expect(shareLinkStatsSchema.safeParse(stats()).success).toBe(true);
  });

  it('refuse plus de vingt arrivées récentes', () => {
    const trop = Array.from({ length: SHARE_LINK_RECENT_ARRIVALS_CAP + 1 }, (_, i) => arrival({ participantId: `p${i}` }));
    expect(shareLinkStatsSchema.safeParse(stats({ recentArrivals: trop })).success).toBe(false);
  });

  it('le schéma JSON nomme chaque champ que le schéma Zod porte', () => {
    expect(Object.keys(shareLinkStatsJsonSchema.properties).sort()).toEqual(Object.keys(shareLinkStatsSchema.shape).sort());
    expect(Object.keys(shareLinkStatsJsonSchema.properties.recentArrivals.items.properties).sort()).toEqual(
      Object.keys(arrival()).sort(),
    );
  });
});

describe('page des arrivées d’un lien d’invitation (#7813)', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    displayName: 'Nova',
    avatar: null,
    isAnonymous: true,
    country: 'FR',
    language: 'fr',
    joinedAt: '2026-09-24T10:00:00.000Z',
    ...overrides,
  });

  it('accepte une page et sa suite', () => {
    expect(shareLinkArrivalsPageSchema.safeParse({ arrivals: [entry()], nextCursor: 'abc' }).success).toBe(true);
    expect(shareLinkArrivalsPageSchema.safeParse({ arrivals: [], nextCursor: null }).success).toBe(true);
  });

  it('une arrivée ne porte QUE nom, visage, badge sans compte, pays, langue, date, compte et e-mail masqué', () => {
    const fields = ['avatar', 'country', 'displayName', 'emailMasked', 'isAnonymous', 'joinedAt', 'language', 'userId'];
    expect(Object.keys(shareLinkArrivalsPageSchema.shape.arrivals.element.shape).sort()).toEqual(fields);
    expect(Object.keys(shareLinkArrivalsPageJsonSchema.properties.arrivals.items.properties).sort()).toEqual(fields);
    expect(shareLinkArrivalsPageJsonSchema.properties.arrivals.items.additionalProperties).toBe(false);
  });

  it('le visage d’une arrivée est une référence de média ou null (#12571)', () => {
    expect(shareLinkArrivalsPageSchema.safeParse({ arrivals: [entry({ avatar: '2026/09/u1/photo.png' })], nextCursor: null }).success).toBe(true);
    expect(shareLinkArrivalsPageSchema.safeParse({ arrivals: [entry({ avatar: 3 })], nextCursor: null }).success).toBe(false);
  });

  it('le schéma JSON nomme chaque champ de la page', () => {
    expect(Object.keys(shareLinkArrivalsPageJsonSchema.properties).sort()).toEqual(Object.keys(shareLinkArrivalsPageSchema.shape).sort());
  });

  it('une page par défaut tient entre la vingtaine des récentes et le plafond', () => {
    expect(SHARE_LINK_ARRIVALS_PAGE_DEFAULT).toBeGreaterThan(SHARE_LINK_RECENT_ARRIVALS_CAP);
    expect(SHARE_LINK_ARRIVALS_PAGE_MAX).toBeGreaterThanOrEqual(SHARE_LINK_ARRIVALS_PAGE_DEFAULT);
  });
});

describe('l’arrivant d’un lien : de quoi ouvrir sa fiche et son e-mail masqué (#19283)', () => {
  it('un serveur qui ne les sert pas encore reste lisible', () => {
    const { userId: _u, emailMasked: _e, ...ancienne } = arrival();
    expect(shareLinkStatsSchema.safeParse(stats({ recentArrivals: [ancienne] })).success).toBe(true);
  });

  it('le compte d’un inscrit est une chaîne, celui d’un invité est null', () => {
    expect(shareLinkStatsSchema.safeParse(stats({ recentArrivals: [arrival({ userId: '68a000000000000000000009', isAnonymous: false, emailMasked: null })] })).success).toBe(true);
    expect(shareLinkStatsSchema.safeParse(stats({ recentArrivals: [arrival({ userId: 9 })] })).success).toBe(false);
  });

  it('les schémas JSON déclarent les deux champs, nullables', () => {
    const recent = shareLinkStatsJsonSchema.properties.recentArrivals.items.properties;
    const page = shareLinkArrivalsPageJsonSchema.properties.arrivals.items.properties;
    for (const props of [recent, page]) {
      expect(props.userId).toEqual(expect.objectContaining({ type: 'string', nullable: true }));
      expect(props.emailMasked).toEqual(expect.objectContaining({ type: 'string', nullable: true }));
    }
  });
});

describe('maskGuestEmail — l’e-mail d’un invité ne part que masqué (#19283)', () => {
  it('garde la première lettre et l’extension, masque le reste du nom et tout le domaine', () => {
    expect(maskGuestEmail('Binta.Diallo@orange.sn')).toBe('b•••@•••.sn');
    expect(maskGuestEmail('lea@free.fr')).toBe('l•••@•••.fr');
  });

  it('ne trahit ni la longueur du nom ni celle du domaine', () => {
    expect(maskGuestEmail('a@x.fr')).toBe(maskGuestEmail('alexandrine@tres-long-domaine.fr'));
  });

  it('un domaine de plusieurs niveaux ne garde que sa dernière extension', () => {
    expect(maskGuestEmail('kofi@mail.univ.ac.uk')).toBe('k•••@•••.uk');
  });

  it('aucune partie du nom ni du domaine au-delà de la première lettre et de l’extension', () => {
    const masked = maskGuestEmail('secretname@companyinc.com') ?? '';
    expect(masked).not.toContain('ecret');
    expect(masked).not.toContain('company');
  });

  it('une adresse absente rend null, une adresse illisible rend un masque sans rien d’elle', () => {
    expect(maskGuestEmail(null)).toBeNull();
    expect(maskGuestEmail('   ')).toBeNull();
    expect(maskGuestEmail('pas-une-adresse')).toBe('•••');
    expect(maskGuestEmail('nom@sansextension')).toBe('n•••@•••');
  });
});
