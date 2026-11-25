import { beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { flamePauseAction, flamePauseLine, flamePauseNextLine, flamePauseRefusal, readFlamePause, readNextPauseFrom } from './flame-pause-copy';
import { gameErrorMessage } from './game-copy';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

const NAMED = (text: string): boolean => text.trim().length > 0 && !text.startsWith('game.') && !text.includes('{') && !text.includes('undefined');

describe('la Flamme en veille se dit (#20509)', () => {
  test('la veille servie se lit ; absente ou illisible, la carte d’avant', () => {
    expect(readFlamePause({ from: '2026-10-06', until: '2026-10-12' })).toEqual({ from: '2026-10-06', until: '2026-10-12' });
    expect(readFlamePause(undefined)).toBeNull();
    expect(readFlamePause({ from: '2026-10-06' })).toBeNull();
    expect(readFlamePause({ from: '6 octobre', until: '2026-10-12' })).toBeNull();
    expect(readFlamePause('2026-10-06')).toBeNull();
  });

  test('en cours, la carte dit jusqu’à quand ; annoncée, elle dit qu’elle commence demain', () => {
    expect(flamePauseLine({ from: '2026-10-06', until: '2026-10-12' }, '2026-10-08', 'fr')).toBe('Ta Flamme est en veille jusqu’au lundi 12 octobre.');
    expect(flamePauseLine({ from: '2026-10-06', until: '2026-10-12' }, '2026-10-05', 'fr')).toBe('Ta Flamme se met en veille demain, jusqu’au lundi 12 octobre.');
    expect(flamePauseLine({ from: '2026-10-06', until: '2026-10-12' }, '2026-10-08', 'en')).toContain('Monday, October 12');
    expect(flamePauseLine({ from: '2026-10-06', until: '2026-10-12' }, '2026-10-08', 'de')).toContain('Montag, 12. Oktober');
  });

  test('dans chaque langue, chaque refus de la veille a sa phrase, distincte de la phrase générale', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const general = gameErrorMessage('FLAME_PAUSE_NOT_ALLOWED', language);
      const phrases = (['quarterly-limit', 'already-paused', 'no-flame'] as const).map((reason) => flamePauseRefusal(reason, language));
      expect(new Set([general, ...phrases]).size).toBe(4);
      for (const phrase of phrases) expect(NAMED(phrase)).toBe(true);
      expect(flamePauseRefusal('invalid-days', language)).toBe(general);
      expect(flamePauseRefusal(undefined, language)).toBe(general);
    }
  });

  test('le bouton dit la durée choisie, au pluriel juste', () => {
    expect(flamePauseAction(1, 'fr')).toBe('Mettre en veille · 1 jour');
    expect(flamePauseAction(7, 'fr')).toBe('Mettre en veille · 7 jours');
  });

  test('le trimestre pris, la carte dit dès quand la prochaine veille sera possible (#20517)', () => {
    expect(readNextPauseFrom('2027-01-01')).toBe('2027-01-01');
    expect(readNextPauseFrom(undefined)).toBeNull();
    expect(readNextPauseFrom('janvier')).toBeNull();
    expect(flamePauseNextLine('2027-01-01', 'fr')).toBe('Ta prochaine veille sera possible dès le 1 janvier.');
    expect(flamePauseNextLine('2027-01-01', 'en')).toContain('January 1');
    expect(flamePauseNextLine('2027-01-01', 'de')).toContain('1. Januar');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const line = flamePauseNextLine('2027-04-01', language);
      expect(NAMED(line)).toBe(true);
      expect(line).not.toBe(flamePauseRefusal('quarterly-limit', language));
    }
  });
});
