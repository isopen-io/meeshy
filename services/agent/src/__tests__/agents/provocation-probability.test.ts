process.env.DATABASE_URL = 'mongodb://mock';
process.env.OPENAI_API_KEY = 'mock-key';
import { computeProvocationProbability } from '../../agents/strategist';

/**
 * L'Animateur doit RÉVEILLER les conversations mortes : moins il y a
 * d'activité humaine, plus l'agent doit proposer/lancer des sujets (incarner
 * d'autres utilisateurs) plutôt que de se contenter de réactions. La
 * probabilité de provocation monte donc avec l'inactivité, en gardant le
 * réglage admin `freshTopicProbability` comme PLANCHER.
 */
describe('computeProvocationProbability', () => {
  it('provoque quasi-certainement une conversation morte (activity=0)', () => {
    expect(computeProvocationProbability(0.2, 0)).toBe(1);
  });

  it('respecte le réglage admin comme plancher quand la conv est active', () => {
    // activity 0.9 → boost 0.1, mais l'admin a fixé 0.5 → 0.5 gagne
    expect(computeProvocationProbability(0.5, 0.9)).toBeCloseTo(0.5, 5);
  });

  it('monte avec l’inactivité quand l’admin laisse le défaut bas', () => {
    expect(computeProvocationProbability(0.2, 0.3)).toBeCloseTo(0.7, 5);
    expect(computeProvocationProbability(0.2, 0.6)).toBeCloseTo(0.4, 5);
  });

  it('reste borné dans [0, 1]', () => {
    expect(computeProvocationProbability(0, 1)).toBe(0);
    expect(computeProvocationProbability(1, 0)).toBe(1);
    expect(computeProvocationProbability(1.5 as number, 0)).toBe(1);
  });

  it('ignore une activité négative ou >1 (clamp défensif)', () => {
    expect(computeProvocationProbability(0.2, -0.5)).toBe(1);
    expect(computeProvocationProbability(0.2, 2)).toBe(0.2);
  });
});
