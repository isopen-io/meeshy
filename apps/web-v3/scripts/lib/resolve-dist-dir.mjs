import { resolve } from 'node:path';

/**
 * LE RÉPERTOIRE DE SORTIE DU PRÉCHAUFFAGE — jamais devinable, toujours REÇU
 * (#5812, revue-correction, élargit #5821).
 *
 * `prerender-institutional.tsx` lisait `join(HERE, '../dist')` EN DUR, quel
 * que soit `--outDir` passé à `vite build`. Le greffon qui l'invoque
 * (`vite.config.ts`) tourne pour LES DEUX variantes — la A (`dist/`, par
 * défaut) et la B (`dist-capacitor/`, sous `MEESHY_TARGET=capacitor` ou tout
 * `--outDir` explicite) — et une construction de l'une écrivait donc ses
 * cinq pages institutionnelles dans la sortie de l'AUTRE : `dist-capacitor/`
 * ne recevait jamais `about/`, `contact/`, etc., et `dist/` recevait des
 * pages écrites par une construction qui ne le visait pas. Mesuré : `MEESHY_
 * TARGET=capacitor bunx vite build --outDir dist-probe-review` produit un
 * `dist-probe-review/` SANS `about/` ni `privacy/`, pendant que `dist/`
 * (l'autre variante, jamais reconstruite dans ce build) les acquiert.
 *
 * Fonction PURE, exportée pour un témoin sans build : `resolveDistDir(here,
 * argv)` ne lit ni le disque ni l'environnement, seulement ce qu'on lui
 * donne. `here` est le répertoire du script appelant (`prerender-
 * institutional.tsx`, pour le repli `../dist`) ; `argv` est
 * `process.argv` — l'ABSENT d'un troisième élément (`argv[2]`) est le SEUL
 * cas qui retombe sur le repli, jamais une chaîne vide qui le déguiserait.
 */
export function resolveDistDir(here, argv) {
  const explicit = argv[2];
  if (typeof explicit === 'string' && explicit.length > 0) {
    return resolve(explicit);
  }
  return resolve(here, '../dist');
}
