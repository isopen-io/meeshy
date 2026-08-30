import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROUTER_EMPTY =
  "next build n'a émis AUCUNE route d'App Router : app/layout.tsx et son ThemeScript ne sont PAS " +
  "dans l'artefact de production, et c'est le 404 anglais du routeur Pages qui est servi. " +
  'Un fichier layout.tsx ou not-found.tsx SEUL ne suffit pas — il faut au moins une route.';

// Ce constat ne peut PAS être bloquant ici : aucune page n'existe encore, et
// faire échouer `next build` fermerait le lot L-0.5 avant qu'il ne livre quoi
// que ce soit. Ce qui le date n'est donc pas ce `!`, mais un gate qui, lui, est
// bloquant AUJOURD'HUI : `scripts/check-v3-pipeline.mjs` refuse que la règle du
// routeur `frontend-v3` réclame un chemin que la zone ne sert pas — `/__v3` nu
// compris. Tant que cette limite n'existe pas, la zone n'est publiquement
// joignable QUE sur `/__v3/_next` (ses bundles), et personne ne peut recevoir
// le 404 anglais décrit ci-dessous. Le jour où la première page du lot L1
// arrive, la limite apparaît, ce `!` s'éteint, et la règle peut s'élargir au
// chemin de cette page — les trois dans le même commit.
const NO_APP_PAGE =
  "aucune page d'App Router n'est émise : la limite /_not-found n'existe pas et le 404 global " +
  'reste celui du routeur Pages (sans lang, sans ThemeScript). Sans conséquence publique tant que ' +
  'la règle du routeur frontend-v3 se limite à /__v3/_next (gardé par scripts/check-v3-pipeline.mjs). ' +
  'Fermé par la première page du lot L1.';

export const readEmittedAppRoutes = (manifestSource) => {
  const parsed = JSON.parse(manifestSource);
  const pages = parsed?.pages;
  return pages && typeof pages === 'object' ? Object.keys(pages) : [];
};

export const inspectAppRouterBuild = (routes) => ({
  built: routes.length > 0,
  servesAppNotFound: routes.some((route) => route.startsWith('/_not-found')),
  routes,
});

const main = () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = join(root, '.next', 'app-build-manifest.json');

  const report = inspectAppRouterBuild(readEmittedAppRoutes(readFileSync(manifest, 'utf8')));

  if (!report.built) {
    process.stderr.write(`✗ ${APP_ROUTER_EMPTY}\n`);
    process.exit(1);
  }

  process.stdout.write(`✓ App Router émis : ${report.routes.join(', ')}\n`);

  if (!report.servesAppNotFound) {
    process.stdout.write(`! ${NO_APP_PAGE}\n`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
