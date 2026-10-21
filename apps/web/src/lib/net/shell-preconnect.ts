/**
 * LA COQUE OUVRE LA CONNEXION À LA PASSERELLE DÈS LE HTML (#10534).
 *
 * Dans la coque, le document et ses morceaux viennent du disque local : le
 * seul réseau du démarrage est la passerelle, une AUTRE origine. Sans
 * annonce, DNS, TCP et TLS n'y partent qu'au premier `fetch`, une fois le
 * JavaScript évalué — trois allers-retours à vide sur le chemin critique.
 * Chrome les amortit par son prédicteur de chargement ; la WebView n'en a pas.
 *
 * L'origine est celle que `resolveBase` donne à une coque : une base ABSOLUE
 * déclarée à la construction, sinon la production — une surcharge relative
 * n'y mène nulle part. `crossorigin` : les `fetch` de `http.ts` partent sans
 * identifiants, donc par le pool de connexions anonymes.
 *
 * Module PUR, importé par `vite.config.ts` : il n'importe que l'origine de
 * production, jamais `config.ts`, qui s'évalue sous `__SHELL__`.
 */

import { PRODUCTION_ORIGIN } from '../api/production-origin.js';

export function shellApiOrigin(declared: string | undefined): string {
  const base = declared?.trim() ?? '';
  return /^https?:\/\//i.test(base) ? new URL(base).origin : PRODUCTION_ORIGIN;
}

export function withApiPreconnect(html: string, origin: string): string {
  return html.replace('</head>', `<link rel="preconnect" href="${origin}" crossorigin /></head>`);
}
