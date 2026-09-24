import { describe, it, expect } from 'vitest';
import {
  CONVERSATION_TYPES,
  SHARE_LINK_RECENT_ARRIVALS_CAP,
  shareLinkPreviewConversationJsonSchema,
  shareLinkPreviewConversationSchema,
  shareLinkStatsJsonSchema,
  shareLinkStatsSchema,
} from '../share-link-stats';

const arrival = (overrides: Record<string, unknown> = {}) => ({
  participantId: '68a000000000000000000001',
  displayName: 'Nova',
  avatar: null,
  isAnonymous: true,
  country: 'FR',
  language: 'fr',
  joinedAt: '2026-09-24T10:00:00.000Z',
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
