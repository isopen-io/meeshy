// LA SEULE DÉFINITION du script d'amorçage synchrone du schéma clair/sombre.
//
// POURQUOI UN FICHIER .js SÉPARÉ, ET PAS UNE CONSTANTE DANS scheme.ts
//
// `INLINE_SCHEME_BOOTSTRAP` doit être lu par TROIS sites qui ne partagent pas
// le même runtime au moment où ils le lisent :
//   - `vite.config.ts` (le greffon qui l'injecte dans index.html) tourne dans
//     le processus qui a lancé `vite build`/`vite` — Node ou Bun selon qui
//     invoque le script `build` du paquet ;
//   - `scripts/prerender-institutional.tsx` tourne toujours sous Bun
//     (`spawnSync('bun', …)`, câblé en dur dans le greffon ci-dessus) ;
//   - `src/lib/scheme.ts` est du code applicatif, empaqueté par Vite/Rollup
//     pour le navigateur.
// Un fichier `.js` sans aucune syntaxe TypeScript s'importe à l'identique dans
// les trois : aucun des trois consommateurs n'a besoin d'un transpileur TS
// pour l'atteindre. Le mettre dans `scheme.ts` (un module TS) aurait remis en
// jeu exactement le risque que ce fichier existe pour éliminer.
//
// La clé et le texte du script SONT le contrat : `scheme.ts` importe
// `SCHEME_KEY` plutôt que de la recopier, donc les deux ne peuvent plus
// diverger — un changement de clé ici se propage aux DEUX lecteurs (le script
// inline et le module applicatif) sans second commit.

export const SCHEME_KEY = 'meeshy.scheme';

/**
 * Le script bloquant : lit `SCHEME_KEY`, retombe sur `prefers-color-scheme`
 * si rien n'est stocké, et ne lève jamais (mode privé, stockage refusé — le
 * schéma sombre du HTML reste alors, sans qu'aucun consommateur ait à le
 * savoir).
 */
export const INLINE_SCHEME_BOOTSTRAP =
  `(function(){try{` +
  `var c=localStorage.getItem('${SCHEME_KEY}');` +
  `var l=c?c==='light':window.matchMedia('(prefers-color-scheme: light)').matches;` +
  `document.documentElement.classList.toggle('light',l);` +
  `document.documentElement.classList.toggle('dark',!l);` +
  `}catch(e){}})();`;
