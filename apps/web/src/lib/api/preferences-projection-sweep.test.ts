import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

import { MY_PREFERENCES_QUERY_KEYS } from './me-keys';

/**
 * **LE CLIQUET DES PROJECTIONS DE `UserPreferences`** (#20349).
 *
 * Le défaut que ce fichier garde n'était pas un oubli de routage : l'événement
 * `user:preferences-updated { userId, category }` était bien reçu, bien routé,
 * et périmait UNE clé pour un document qui a sept catégories et DEUX
 * projections. `['me','circle-notify']` étant un FRÈRE de
 * `['me','app-preferences']` et non un descendant, aucune invalidation de
 * préfixe ne pouvait l'atteindre.
 *
 * **Un témoin de comportement ne peut pas garder ça.** Il atteste les clés
 * qu'il NOMME ; une TROISIÈME projection ajoutée demain, par un lot qui parlera
 * d'autre chose, ne serait nommée nulle part et ne ferait rougir personne —
 * elle rendrait un écran périmé. C'est la leçon 261 : l'affirmation « ce sont
 * les seules » est celle que personne ne vérifie.
 *
 * Le discriminant est donc la SOURCE SERVANTE, pas la clé : tout module qui lit
 * `GET /me/preferences` sert une projection du document, et la clé sous
 * laquelle il la met en cache doit appartenir à l'ensemble.
 */
describe('#20349 — toute requête servie par `GET /me/preferences` est une projection déclarée', () => {
  const DIR = new URL('.', import.meta.url);

  const productionFiles = readdirSync(DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.startsWith('fixtures-'),
  );

  /** Les modules qui LISENT le document — un `PATCH` seul ne met rien en cache. */
  const servingModules = productionFiles.filter((name) => {
    const source = readFileSync(new URL(name, DIR), 'utf8');
    return source.includes('meEndpoints.preferences') && source.includes("method: 'GET'");
  });

  /** Les identifiants que l'ensemble déclare, lus dans `me-keys.ts`. */
  const declaredNames = (): readonly string[] => {
    const source = readFileSync(new URL('me-keys.ts', DIR), 'utf8');
    const start = source.indexOf('export const MY_PREFERENCES_QUERY_KEYS');
    const body = source.slice(source.indexOf('[', start) + 1, source.indexOf(']', start));
    return body
      .split(',')
      .map((part) => part.trim())
      .filter((part) => /^[A-Z][A-Z0-9_]*$/.test(part));
  };

  test('le balayage trouve bien les modules servants — une garde négative qui ne balaie rien reste verte', () => {
    expect(servingModules.length).toBeGreaterThanOrEqual(2);
    expect(servingModules).toContain('app-preferences.ts');
    expect(servingModules).toContain('circle-notify-preferences.ts');
  });

  test('l’ensemble déclare autant de clés qu’il nomme d’identifiants', () => {
    expect(declaredNames()).toEqual(['APP_PREFERENCES_QUERY_KEY', 'CIRCLE_NOTIFY_QUERY_KEY']);
    expect(MY_PREFERENCES_QUERY_KEYS).toHaveLength(declaredNames().length);
  });

  /**
   * Le cœur du cliquet. Un module servant qui met en cache sous une clé que
   * l'ensemble ne porte pas est le défaut de #20349, rejoué : il est périmé par
   * l'événement chez personne, et absent du rattrapage de reconnexion.
   */
  test('aucun module servant ne met en cache sous une clé hors de l’ensemble', () => {
    const declared = new Set(declaredNames());
    const strays = servingModules.flatMap((name) => {
      const source = readFileSync(new URL(name, DIR), 'utf8');
      return [...source.matchAll(/queryKey:\s*([A-Z][A-Z0-9_]*)/g)]
        .map((match) => match[1] as string)
        .filter((identifier) => !declared.has(identifier))
        .map((identifier) => `${name} → ${identifier}`);
    });

    expect(strays).toEqual([]);
  });

  /**
   * LA SENTINELLE DE SITE : l'ensemble vit dans `me-keys.ts`, le module SANS
   * dépendance (#18914). Le déclarer chez son écran tirerait son décodeur et
   * `zod` dans le morceau `realtime`, qui doit seulement NOMMER ces requêtes
   * (`budgets.json › realtime`) — c'est la raison d'être de ce module, et un
   * budget qui casse est un rouge beaucoup plus difficile à lire que celui-ci.
   */
  test('l’ensemble est déclaré dans `me-keys.ts`, et le gestionnaire l’ITÈRE', () => {
    const keys = readFileSync(new URL('me-keys.ts', DIR), 'utf8');
    expect(keys).toContain('export const MY_PREFERENCES_QUERY_KEYS');

    const sync = readFileSync(new URL('conversation-preferences-sync.ts', DIR), 'utf8');
    expect(sync).toContain('for (const queryKey of MY_PREFERENCES_QUERY_KEYS)');
    expect(sync).not.toContain('queryKey: APP_PREFERENCES_QUERY_KEY');
  });
});
