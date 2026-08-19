/**
 * Règle produit (spec 2026-08-19, Volet C) : le nom de la conversation source
 * s'affiche pour tout GROUPE, jamais pour un tête-à-tête.
 * Miroir exact des cas de `ForwardBadgePolicyTests` iOS
 * (apps/ios/MeeshyTests/Unit/Views/ForwardBadgePolicyTests.swift).
 */

import { forwardBadgeConversationName } from '@/lib/forward-badge';

describe('forwardBadgeConversationName', () => {
  const groupTypes = ['group', 'public', 'global', 'community', 'channel', 'broadcast'] as const;

  it.each(groupTypes)('affiche le nom pour le type de groupe %s', (type) => {
    expect(forwardBadgeConversationName({ title: 'Équipe', type })).toBe('Équipe');
  });

  it.each(['direct', 'bot'] as const)('masque le nom pour le type tête-à-tête %s', (type) => {
    expect(forwardBadgeConversationName({ title: 'Alice', type })).toBeNull();
  });

  it('affiche le nom quand le type est absent (statu quo cache ancien)', () => {
    expect(forwardBadgeConversationName({ title: 'Équipe' })).toBe('Équipe');
    expect(forwardBadgeConversationName({ title: 'Équipe', type: null })).toBe('Équipe');
  });

  it('retombe sur identifier quand title est absent', () => {
    expect(forwardBadgeConversationName({ identifier: 'meeshy-public', type: 'public' })).toBe(
      'meeshy-public',
    );
    expect(
      forwardBadgeConversationName({ title: null, identifier: 'meeshy-public', type: 'group' }),
    ).toBe('meeshy-public');
  });

  it('rend null pour une conversation absente', () => {
    expect(forwardBadgeConversationName(undefined)).toBeNull();
    expect(forwardBadgeConversationName(null)).toBeNull();
  });

  it('rend null quand aucun nom exploitable', () => {
    expect(forwardBadgeConversationName({ type: 'group' })).toBeNull();
    expect(forwardBadgeConversationName({ title: null, identifier: null, type: 'group' })).toBeNull();
    expect(forwardBadgeConversationName({ title: '', type: 'group' })).toBeNull();
  });
});
