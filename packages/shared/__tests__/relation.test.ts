import { describe, it, expect } from 'vitest';
import {
  RELATION_LEVELS,
  RELATION_LEVEL_ATOM,
  compareRelationLevel,
  isRelationDrop,
  maxRelationLevel,
  minRelationLevel,
  parseRelationLevel,
  relationPairKey,
  relationSideOf,
  visibleRelationTransitions,
  type RelationLevel,
  type RelationTransition,
} from '../types/relation';

const LOW = '5f0000000000000000000001';
const HIGH = '5f0000000000000000000002';

const transition = (overrides: Partial<RelationTransition> = {}): RelationTransition => ({
  actorId: LOW,
  from: 'PUBLIC',
  to: 'FRIEND',
  at: new Date('2026-10-31T10:00:00Z'),
  ...overrides,
});

describe('RELATION_LEVELS — l’échelle du lien (#13926)', () => {
  it('va de PUBLIC à BLOOD dans cet ordre, ATOM restant hors échelle', () => {
    expect([...RELATION_LEVELS]).toEqual(['PUBLIC', 'COMMUNITY', 'ACQUAINTANCE', 'FRIEND', 'CLOSE', 'BLOOD']);
    expect(RELATION_LEVEL_ATOM).toBe('ATOM');
    expect((RELATION_LEVELS as readonly string[]).includes(RELATION_LEVEL_ATOM)).toBe(false);
  });

  it('compare deux niveaux selon leur rang, pas selon l’alphabet', () => {
    expect(compareRelationLevel('BLOOD', 'CLOSE')).toBeGreaterThan(0);
    expect(compareRelationLevel('ACQUAINTANCE', 'FRIEND')).toBeLessThan(0);
    expect(compareRelationLevel('FRIEND', 'FRIEND')).toBe(0);
    expect(compareRelationLevel('COMMUNITY', 'CLOSE')).toBeLessThan(0);
  });

  it('rend le minimum et le maximum de deux niveaux (RG-01 : aucun accès à sens unique)', () => {
    expect(minRelationLevel('BLOOD', 'FRIEND')).toBe('FRIEND');
    expect(minRelationLevel('FRIEND', 'BLOOD')).toBe('FRIEND');
    expect(minRelationLevel('PUBLIC', 'BLOOD')).toBe('PUBLIC');
    expect(maxRelationLevel('CLOSE', 'FRIEND')).toBe('CLOSE');
  });

  it('relit une valeur stockée inconnue, absente ou réservée comme PUBLIC (fail-closed)', () => {
    expect(parseRelationLevel('CLOSE')).toBe('CLOSE');
    expect(parseRelationLevel('ATOM')).toBe('PUBLIC');
    expect(parseRelationLevel('friend')).toBe('PUBLIC');
    expect(parseRelationLevel(undefined)).toBe('PUBLIC');
    expect(parseRelationLevel(null)).toBe('PUBLIC');
    expect(parseRelationLevel(3)).toBe('PUBLIC');
  });
});

describe('relationPairKey — une ligne par paire non orientée', () => {
  it('range le plus petit identifiant en low, quel que soit l’ordre d’appel', () => {
    expect(relationPairKey(HIGH, LOW)).toEqual({ userLowId: LOW, userHighId: HIGH });
    expect(relationPairKey(LOW, HIGH)).toEqual({ userLowId: LOW, userHighId: HIGH });
  });

  it('refuse un lien d’une personne avec elle-même', () => {
    expect(() => relationPairKey(LOW, LOW)).toThrow();
  });

  it('dit de quel côté de la paire se tient une personne', () => {
    const pair = relationPairKey(HIGH, LOW);
    expect(relationSideOf(pair, LOW)).toBe('low');
    expect(relationSideOf(pair, HIGH)).toBe('high');
    expect(relationSideOf(pair, '5f0000000000000000000003')).toBeNull();
  });
});

describe('historique des passages — une baisse n’est jamais exposée', () => {
  it('reconnaît une baisse à ce que le niveau d’arrivée est inférieur', () => {
    expect(isRelationDrop(transition({ from: 'CLOSE', to: 'FRIEND' }))).toBe(true);
    expect(isRelationDrop(transition({ from: 'FRIEND', to: 'PUBLIC' }))).toBe(true);
    expect(isRelationDrop(transition({ from: 'FRIEND', to: 'CLOSE' }))).toBe(false);
  });

  it('ne sert que les montées, de la plus ancienne à la plus récente', () => {
    const served = visibleRelationTransitions([
      transition({ from: 'FRIEND', to: 'CLOSE', at: new Date('2026-12-01T00:00:00Z') }),
      transition({ from: 'CLOSE', to: 'FRIEND', at: new Date('2027-01-01T00:00:00Z') }),
      transition({ from: 'PUBLIC', to: 'FRIEND', at: new Date('2026-10-31T00:00:00Z') }),
    ]);
    expect(served.map((t) => `${t.from}>${t.to}`)).toEqual(['PUBLIC>FRIEND', 'FRIEND>CLOSE']);
  });

  it('ne laisse fuir aucun niveau inconnu : un passage illisible est écarté', () => {
    const served = visibleRelationTransitions([
      { ...transition(), to: 'MARTIAN' as unknown as RelationLevel },
    ]);
    expect(served).toEqual([]);
  });
});

describe('[audit #13926] l’historique servi ne trahit pas une baisse par sa discontinuité', () => {
  it('une baisse puis une remontée : la suite servie de chaque acteur reste continue (to précédent = from suivant)', () => {
    const served = visibleRelationTransitions([
      transition({ from: 'PUBLIC', to: 'FRIEND', at: new Date('2026-10-01T00:00:00Z') }),
      transition({ from: 'FRIEND', to: 'CLOSE', at: new Date('2026-11-01T00:00:00Z') }),
      transition({ from: 'CLOSE', to: 'ACQUAINTANCE', at: new Date('2026-12-01T00:00:00Z') }),
      transition({ from: 'ACQUAINTANCE', to: 'FRIEND', at: new Date('2027-01-01T00:00:00Z') }),
    ]);
    const breaks = served.slice(1).filter((t, i) => t.actorId === served[i].actorId && t.from !== served[i].to);
    expect(breaks).toEqual([]);
  });
});
