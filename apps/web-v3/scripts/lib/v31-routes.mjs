/**
 * LES ADRESSES QUE LA v3.1 SERT, lues à leur source.
 *
 * L'inventaire de parité (#5492) énumérait `apps/web` et `apps/web-old-version3`
 * par la convention Next.js — un fichier `page.tsx` par adresse — et rendait
 * donc **zéro** pour la v3.1, qui n'a pas cette convention : ses adresses sont
 * écrites à la main dans `src/routes/route-table.tsx`, précisément pour que
 * chaque `import()` soit un arbitrage visible (D-3). Un inventaire aveugle à
 * une application ne dit pas « elle ne sert rien » : il ne dit RIEN, et son
 * silence se lit comme un zéro (#5669).
 *
 * DEUX FAMILLES, et il faut les deux — la seconde n'est dans aucune table :
 *
 *   1. les ÉCRANS de `ROUTES`, servis par le routeur de l'application ;
 *   2. les cinq DOCUMENTS institutionnels, PRÉ-RENDUS à la construction et
 *      servis en dehors du routeur (`INSTITUTIONAL_ROUTES`) — ils portent
 *      l'essentiel des adresses publiques d'aujourd'hui, et les compter avec
 *      les écrans est le seul moyen de comparer la v3.1 au legacy, dont
 *      l'inventaire compte ses propres pages statiques sans les distinguer.
 *
 * POURQUOI ON ANALYSE LE TEXTE plutôt que d'importer le module : `route-table
 * .tsx` importe `@/lib/router` et du JSX — un script Node ne peut pas le
 * charger, et le transpiler ici ferait de cet inventaire un second bundler.
 * L'analyse textuelle a le défaut de sa nature : elle peut se désaccorder de
 * ce que le module déclare vraiment. C'est pourquoi elle ne voyage pas seule —
 * `src/routes/route-inventory.test.ts` EXÉCUTE les deux (il importe `ROUTES`
 * sous bun et rejoue cette extraction) et rougit à la première divergence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { INSTITUTIONAL_ROUTES } from './institutional-routes.mjs';

const V31 = new URL('../..', import.meta.url).pathname;

/**
 * `$conversation` (la forme du routeur maison) devient `:conversation` (la
 * forme de Next.js et celle du legacy). Sans cette normalisation, `/c/$x` et
 * `/c/:x` seraient deux adresses distinctes de l'union — et la comparaison qui
 * est la RAISON D'ÊTRE de l'inventaire ne rapprocherait jamais rien.
 */
export const normalizePattern = (pattern) => pattern.replace(/\$([A-Za-z0-9_]+)/g, ':$1');

/**
 * Les `pattern:` déclarés dans l'objet `ROUTES`, et eux seuls : l'extraction
 * est bornée au littéral pour qu'une chaîne `pattern:` écrite ailleurs dans le
 * fichier — un exemple en commentaire, une redirection — n'entre pas dans
 * l'inventaire au titre d'une adresse servie.
 */
export function screenRoutes(source = readFileSync(join(V31, 'src/routes/route-table.tsx'), 'utf8')) {
  const literal = source.match(/export const ROUTES = \{([\s\S]*?)\n\} as const;/);
  if (literal === null) {
    throw new Error(
      "src/routes/route-table.tsx ne déclare plus `export const ROUTES = { … } as const;` sous la " +
        "forme attendue — l'inventaire de parité rendrait 0 écran sans qu'aucun témoin ne rougisse",
    );
  }
  return [...literal[1].matchAll(/pattern:\s*'([^']+)'/g)].map(([, p]) => normalizePattern(p));
}

/** Les cinq documents pré-rendus, sous la forme sans barre finale que l'inventaire compare. */
export const institutionalRoutes = () => INSTITUTIONAL_ROUTES.map((r) => `/${r}`);

/**
 * L'inventaire de la v3.1 : écrans et documents, triés, sans doublon.
 * `kind` distingue ce que le routeur sert de ce que la construction a écrit —
 * la bascule ne se joue pas de la même façon sur les deux.
 */
export function v31Routes() {
  const screens = screenRoutes().map((url) => ({ url, kind: 'écran' }));
  const documents = institutionalRoutes().map((url) => ({ url, kind: 'document' }));
  return [...screens, ...documents].sort((a, b) => a.url.localeCompare(b.url));
}
