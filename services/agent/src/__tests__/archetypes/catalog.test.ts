import { getArchetype, listArchetypes } from '../../archetypes/catalog';
import { enrichArchetypeWithProfile } from '../../archetypes/enrichment';

describe('Archetypes Catalog', () => {
  it('returns all 5 archetypes', () => {
    const archetypes = listArchetypes();
    expect(archetypes).toHaveLength(5);
    expect(archetypes.map((a) => a.id)).toEqual(
      expect.arrayContaining(['curious', 'enthusiast', 'skeptic', 'pragmatic', 'social']),
    );
  });

  it('returns a specific archetype by id', () => {
    const archetype = getArchetype('skeptic');
    expect(archetype).toBeDefined();
    expect(archetype!.tone).toBe('analytique');
    expect(archetype!.vocabularyLevel).toBe('soutenu');
  });

  it('returns undefined for unknown archetype', () => {
    expect(getArchetype('nonexistent')).toBeUndefined();
  });

  it('returns copies, not references', () => {
    const a = listArchetypes();
    const b = listArchetypes();
    expect(a).not.toBe(b);
  });
});

describe('Archetype Enrichment', () => {
  it('enriches archetype with bio keywords', () => {
    const archetype = getArchetype('curious')!;
    const enriched = enrichArchetypeWithProfile(archetype, {
      bio: 'Développeur iOS passionné par Swift et SwiftUI',
    });
    expect(enriched.topicsOfExpertise.length).toBeGreaterThan(0);
    expect(enriched.topicsOfExpertise).toEqual(
      expect.arrayContaining(['développeur', 'passionné', 'swift', 'swiftui']),
    );
    expect(enriched.confidence).toBe(0.5); // 0.4 + 0.1
  });

  it('enriches with communities', () => {
    const archetype = getArchetype('pragmatic')!;
    const enriched = enrichArchetypeWithProfile(archetype, {
      communities: ['ios-dev', 'react-native'],
    });
    expect(enriched.topicsOfExpertise).toContain('ios-dev');
    expect(enriched.topicsOfExpertise).toContain('react-native');
  });

  it('deduplicates topics', () => {
    const archetype = getArchetype('social')!;
    const enriched = enrichArchetypeWithProfile(archetype, {
      communities: ['tech', 'tech', 'design'],
    });
    const techCount = enriched.topicsOfExpertise.filter((t) => t === 'tech').length;
    expect(techCount).toBe(1);
  });

  it('caps confidence at 0.6', () => {
    const archetype = { ...getArchetype('curious')!, confidence: 0.55 };
    const enriched = enrichArchetypeWithProfile(archetype, { bio: 'test' });
    expect(enriched.confidence).toBeLessThanOrEqual(0.6);
  });
});
