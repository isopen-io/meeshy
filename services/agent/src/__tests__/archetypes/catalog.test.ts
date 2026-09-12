import { getArchetype, listArchetypes } from '../../archetypes/catalog';
import { enrichArchetypeWithProfile } from '../../archetypes/enrichment';

const ORIGINAL_IDS = ['curious', 'enthusiast', 'skeptic', 'pragmatic', 'social', 'expert', 'moderator'];
const GOSSIP_IDS = ['gossip', 'chronicler', 'joker', 'diaspora', 'elder', 'hustler'];

describe('Archetypes Catalog', () => {
  it('returns the 7 original archetypes and the 6 gossip-oriented ones', () => {
    const archetypes = listArchetypes();
    expect(archetypes).toHaveLength(ORIGINAL_IDS.length + GOSSIP_IDS.length);
    expect(archetypes.map((a) => a.id)).toEqual(expect.arrayContaining([...ORIGINAL_IDS, ...GOSSIP_IDS]));
  });

  it('never declares the same id twice', () => {
    const ids = listArchetypes().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every gossip-oriented archetype topics of expertise the strategist can match', () => {
    for (const id of GOSSIP_IDS) {
      const archetype = getArchetype(id);
      expect(archetype).toBeDefined();
      expect(archetype!.topicsOfExpertise.length).toBeGreaterThan(0);
      expect(archetype!.catchphrases.length).toBeGreaterThan(0);
      expect(archetype!.minWords).toBeGreaterThanOrEqual(1);
      expect(archetype!.maxWords).toBeGreaterThan(archetype!.minWords);
    }
  });

  it('anchors the gossip archetype on faits divers and the target countries', () => {
    const gossip = getArchetype('gossip')!;
    expect(gossip.topicsOfExpertise).toEqual(expect.arrayContaining(['faits divers', 'kongossa', 'Cameroun']));
    expect(gossip.emojiUsage).toBe('abondant');
    expect(gossip.vocabularyLevel).toBe('familier');
  });

  it('anchors the diaspora archetype on France, USA and Canada', () => {
    const diaspora = getArchetype('diaspora')!;
    expect(diaspora.topicsOfExpertise).toEqual(expect.arrayContaining(['France', 'USA', 'Canada']));
  });

  it('keeps the chronicler on sourced, medium-length messages', () => {
    const chronicler = getArchetype('chronicler')!;
    expect(chronicler.typicalLength).toBe('moyen');
    expect(chronicler.maxWords).toBeGreaterThanOrEqual(80);
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

  it('keeps the archetype own topics when enriching a gossip persona', () => {
    const archetype = getArchetype('gossip')!;
    const enriched = enrichArchetypeWithProfile(archetype, { communities: ['douala-life'] });
    expect(enriched.topicsOfExpertise).toEqual(expect.arrayContaining([...archetype.topicsOfExpertise, 'douala-life']));
  });

  it('caps confidence at 0.6', () => {
    const archetype = { ...getArchetype('curious')!, confidence: 0.55 };
    const enriched = enrichArchetypeWithProfile(archetype, { bio: 'test' });
    expect(enriched.confidence).toBeLessThanOrEqual(0.6);
  });
});
