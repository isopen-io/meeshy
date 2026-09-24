#!/usr/bin/env node
// Ce que le changement TOUCHE, dit à `.github/workflows/ci.yml` [#7711].
//
// POURQUOI CE SCRIPT EXISTE
//
// `ci.yml` lançait ses seize jobs à chaque poussée, quel que soit le fichier
// changé. Mesuré le 2026-09-24 : une PR qui ne touchait que `apps/ios` coûtait
// 76 minutes-job Linux, dont ~20 pour les quatre jobs du traducteur (Python,
// pipeline audio, TTS/STT, API vocale) — qui ne lisent RIEN de l'iOS.
//
// CE QU'IL DÉCIDE, ET CE QU'IL NE DÉCIDE PAS
//
// Un DOMAINE n'est sauté que si AUCUN fichier changé n'appartient à ses
// chemins. Les chemins d'un domaine sont ceux que ses tests LISENT, pas
// seulement son répertoire : `test_marketing_language_count_consistency.py`
// lit `docs/marketing/` et `apps/web/src/institutional/`, donc le domaine les
// porte. Un domaine absent de `DOMAINES` tourne toujours — c'est le cas de la
// passerelle et du web, dont les gardes lisent des dizaines de fichiers iOS,
// Android et `tasks/` : les sauter exige d'abord une carte de ce qu'ils
// lisent, tenue par un cliquet (suivi de #7711).
//
// En cas de doute, TOUT tourne : `workflow_dispatch`, un push sans parent
// connu (branche neuve, force-push), un diff illisible, ou un fichier
// GLOBAL (ce workflow, ce script, un manifeste ou un lockfile de la racine).
//
// Usage :
//   node scripts/ci-affected.mjs --self-test
//   CI_EVENT=… CI_BASE=… CI_HEAD=… node scripts/ci-affected.mjs >> "$GITHUB_OUTPUT"
import { execFileSync } from 'node:child_process';

export const GLOBAUX = [
  '.github/workflows/ci.yml',
  '.github/workflows/_setup.yml',
  'scripts/ci-affected.mjs',
  'package.json',
  'bun.lock',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
];

export const DOMAINES = {
  translator: [
    'services/translator/',
    'services/gateway/',
    'packages/shared/',
    'docs/marketing/',
    'apps/web/src/institutional/',
  ],
};

const toutVrai = () => Object.fromEntries(Object.keys(DOMAINES).map((domaine) => [domaine, true]));

const couvre = (chemins, fichier) =>
  chemins.some((chemin) => (chemin.endsWith('/') ? fichier.startsWith(chemin) : fichier === chemin));

export const domainesTouches = (fichiers) => {
  if (fichiers === null || fichiers.length === 0 || fichiers.some((f) => couvre(GLOBAUX, f))) {
    return toutVrai();
  }
  return Object.fromEntries(
    Object.entries(DOMAINES).map(([domaine, chemins]) => [
      domaine,
      fichiers.some((fichier) => couvre(chemins, fichier)),
    ]),
  );
};

const SANS_PARENT = /^0+$/;

const fichiersChanges = ({ event, base, head }) => {
  if (event === 'workflow_dispatch' || !base || !head || SANS_PARENT.test(base)) return null;
  const plage = event === 'pull_request' ? `${base}...${head}` : `${base}..${head}`;
  try {
    return execFileSync('git', ['diff', '--name-only', plage], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null;
  }
};

const CAS = [
  ['iOS seul', ['apps/ios/Meeshy/App.swift', 'packages/MeeshySDK/Package.swift'], { translator: false }],
  ['traducteur', ['services/translator/src/main.py'], { translator: true }],
  ['passerelle (tests vocaux)', ['services/gateway/src/voice.ts'], { translator: true }],
  ['schéma partagé', ['packages/shared/prisma/schema.prisma'], { translator: true }],
  ['fiche marketing', ['docs/marketing/app-store-fiche-2026-08.md'], { translator: true }],
  ['pages institutionnelles', ['apps/web/src/institutional/faq.ts'], { translator: true }],
  ['web hors institutionnel', ['apps/web/src/routes/thread.tsx'], { translator: false }],
  ['docs hors marketing', ['docs/product/roadmap.md', 'tasks/lessons.md'], { translator: false }],
  ['ce workflow', ['apps/ios/x.swift', '.github/workflows/ci.yml'], { translator: true }],
  ['lockfile', ['bun.lock'], { translator: true }],
  ['diff illisible', null, { translator: true }],
  ['diff vide', [], { translator: true }],
  ['préfixe trompeur', ['services/translator-old/x.py', 'packages/shared-legacy/x.ts'], { translator: false }],
];

const selfTest = () => {
  const echecs = CAS.filter(([, fichiers, attendu]) =>
    Object.entries(attendu).some(([domaine, valeur]) => domainesTouches(fichiers)[domaine] !== valeur),
  );
  echecs.forEach(([titre, fichiers]) =>
    console.error(`ÉCHEC : « ${titre} » rend ${JSON.stringify(domainesTouches(fichiers))}`),
  );
  const nonDispatch = fichiersChanges({ event: 'workflow_dispatch', base: 'a', head: 'b' }) === null;
  const nouvelleBranche = fichiersChanges({ event: 'push', base: '0'.repeat(40), head: 'b' }) === null;
  if (!nonDispatch || !nouvelleBranche) console.error('ÉCHEC : un dispatch ou une branche neuve ne fait pas tout tourner');
  if (echecs.length > 0 || !nonDispatch || !nouvelleBranche) return 1;
  console.log(`self-test : ${CAS.length} cas tenus, dispatch et branche neuve font tout tourner`);
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();
  const fichiers = fichiersChanges({
    event: process.env.CI_EVENT,
    base: process.env.CI_BASE,
    head: process.env.CI_HEAD,
  });
  const touches = domainesTouches(fichiers);
  console.error(`fichiers changés : ${fichiers === null ? 'inconnus, tout tourne' : fichiers.length}`);
  Object.entries(touches).forEach(([domaine, valeur]) => console.log(`${domaine}=${valeur}`));
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
