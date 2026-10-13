import { describe, expect, it } from 'vitest';
import {
  PROVEN_ADOPTION_CLIENT_FALLBACK_MS,
  PROVEN_ADOPTION_CLIENT_MARGIN_MS,
  provenAdoptionClientWindowMs,
} from './proven-session-adoption';

const MINUTE = 60 * 1000;

describe('la fenêtre d’adoption qu’un client applique à une preuve (#10518)', () => {
  it('servie par la passerelle : le délai servi, moins la marge du trajet', () => {
    expect(provenAdoptionClientWindowMs('session', 600)).toBe(9 * MINUTE);
    expect(provenAdoptionClientWindowMs('second-factor', 300)).toBe(4 * MINUTE);
  });

  it('une passerelle qui RACCOURCIT sa fenêtre est suivie sans nouvelle version du client', () => {
    expect(provenAdoptionClientWindowMs('session', 180)).toBe(2 * MINUTE);
  });

  it('une passerelle qui l’allonge est suivie aussi : c’est elle qui décide', () => {
    expect(provenAdoptionClientWindowMs('session', 1800)).toBe(29 * MINUTE);
  });

  it('un délai servi plus court que la marge ferme la fenêtre, il ne l’ouvre jamais en négatif', () => {
    expect(provenAdoptionClientWindowMs('session', 30)).toBe(0);
    expect(provenAdoptionClientWindowMs('session', 0)).toBe(0);
  });

  it.each([undefined, null, '600', Number.NaN, Number.POSITIVE_INFINITY, -1, {}, true])(
    'non servie ou illisible (%p) : le repli, plus court que toute fenêtre de passerelle connue',
    (served) => {
      expect(provenAdoptionClientWindowMs('session', served)).toBe(PROVEN_ADOPTION_CLIENT_FALLBACK_MS.session);
      expect(provenAdoptionClientWindowMs('second-factor', served)).toBe(PROVEN_ADOPTION_CLIENT_FALLBACK_MS['second-factor']);
    }
  );

  it('le repli est celui de #10513 : neuf minutes pour une session, quatre pour un défi', () => {
    expect(PROVEN_ADOPTION_CLIENT_FALLBACK_MS).toEqual({ session: 9 * MINUTE, 'second-factor': 4 * MINUTE });
    expect(PROVEN_ADOPTION_CLIENT_MARGIN_MS).toBe(MINUTE);
  });
});
