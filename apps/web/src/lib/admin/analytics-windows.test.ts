import { describe, expect, test } from 'bun:test';

import {
  ACTIVITY_PERIODS,
  CALLS_PERIODS,
  LANGUAGES_PERIODS,
  MESSAGES_PERIODS,
  callsWindowOf,
  engagementPeriodOf,
  timelinePeriodOf,
  typesPeriodOf,
} from './analytics-windows';

describe('les fenêtres que chaque route de la passerelle comprend', () => {
  test('les périodes offertes par onglet sont celles des routes principales', () => {
    expect(ACTIVITY_PERIODS).toEqual(['7d', '30d', '90d']);
    expect(MESSAGES_PERIODS).toEqual(['24h', '7d', '30d', '90d']);
    expect(CALLS_PERIODS).toEqual(['7d', '30d', '90d']);
    expect(LANGUAGES_PERIODS).toEqual(['7d', '30d', '90d']);
  });

  test('les types de messages : 90 jours retombe sur 30, le reste passe tel quel', () => {
    expect(ACTIVITY_PERIODS.map(typesPeriodOf)).toEqual(['7d', '30d', '30d']);
  });

  test('l’engagement : 24 h retombe sur 7 jours, 90 jours sur 30 jours', () => {
    expect(MESSAGES_PERIODS.map(engagementPeriodOf)).toEqual(['7d', '7d', '30d', '30d']);
  });

  test('les appels se demandent en jours', () => {
    expect(CALLS_PERIODS.map(callsWindowOf)).toEqual([7, 30, 90]);
  });

  test('la chronologie des langues : 90 jours retombe sur 30', () => {
    expect(LANGUAGES_PERIODS.map(timelinePeriodOf)).toEqual(['7d', '30d', '30d']);
  });
});
