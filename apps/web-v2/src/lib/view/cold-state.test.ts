import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { coldStateOf } from './cold-state';

/**
 * CE QU'UN ÉCRAN PEINT AVANT SA PREMIÈRE PAGE (#6419). TanStack Query ne fait pas
 * ÉCHOUER une requête hors ligne : il la met EN PAUSE (`onlineManager`), sans
 * données ni erreur. Lire ce couple comme « chargement » dessinait un squelette
 * sans fin — mesuré sur `/calls` et `/discover` › Bloqués.
 */

const result = (overrides: Partial<Parameters<typeof coldStateOf>[0]> = {}): Parameters<typeof coldStateOf>[0] => ({
  data: undefined,
  isError: false,
  isPaused: false,
  ...overrides,
});

describe('coldStateOf', () => {
  test('des données en cache se peignent, même en pause ou en erreur', () => {
    expect(coldStateOf(result({ data: { pages: [] }, isPaused: true, isError: true }))).toBe('ready');
  });

  test('à cache vide, une erreur se dit', () => {
    expect(coldStateOf(result({ isError: true }))).toBe('error');
  });

  test('à cache vide, une requête EN PAUSE dit la coupure, pas un chargement', () => {
    expect(coldStateOf(result({ isPaused: true }))).toBe('offline');
  });

  test('à cache vide, une requête qui part est un chargement', () => {
    expect(coldStateOf(result())).toBe('loading');
  });

  test('hors ligne, une vraie requête TanStack à cache vide se lit « offline »', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    onlineManager.setOnline(false);
    try {
      const observer = new QueryObserver(queryClient, { queryKey: ['cold-state', 'offline'], queryFn: async () => 'jamais' });
      const unsubscribe = observer.subscribe(() => undefined);
      expect(coldStateOf(observer.getCurrentResult())).toBe('offline');
      unsubscribe();
    } finally {
      onlineManager.setOnline(true);
      queryClient.clear();
    }
  });
});
