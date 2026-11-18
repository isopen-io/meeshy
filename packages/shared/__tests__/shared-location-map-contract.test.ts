import { describe, expect, it } from 'vitest';
import {
  SHARED_LOCATION_ENDED_WINDOW_HOURS,
  SHARED_LOCATION_SNAPSHOT_INCLUDES,
  parseSharedLocationIncludes,
} from '../types/shared-location';
import { BLOOD_MAP_CONSULTATION_WINDOW_MINUTES } from '../types/blood-location';

describe('la carte de tous mes proches se charge d\'un appel (#19202)', () => {
  it('nomme les deux ajouts que `include` peut demander, et eux seuls', () => {
    expect(SHARED_LOCATION_SNAPSHOT_INCLUDES).toEqual(['blood', 'ended']);
  });

  it('sans `include`, rien ne s\'ajoute : un ancien client reçoit la même réponse', () => {
    expect(parseSharedLocationIncludes(undefined)).toEqual({ blood: false, ended: false });
    expect(parseSharedLocationIncludes('')).toEqual({ blood: false, ended: false });
    expect(parseSharedLocationIncludes(42)).toEqual({ blood: false, ended: false });
  });

  it('lit une liste séparée par des virgules, sans casse ni espaces, et ignore ce qu\'elle ne connaît pas', () => {
    expect(parseSharedLocationIncludes('blood,ended')).toEqual({ blood: true, ended: true });
    expect(parseSharedLocationIncludes(' Ended , inconnu ')).toEqual({ blood: false, ended: true });
    expect(parseSharedLocationIncludes('blood')).toEqual({ blood: true, ended: false });
  });

  it('garde un partage terminé un jour, et note une consultation de carte au plus une fois par quart d\'heure et par Sang', () => {
    expect(SHARED_LOCATION_ENDED_WINDOW_HOURS).toBe(24);
    expect(BLOOD_MAP_CONSULTATION_WINDOW_MINUTES).toBe(15);
  });
});
