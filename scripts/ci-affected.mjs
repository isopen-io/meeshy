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
// porte. Un domaine absent de `DOMAINES` tourne toujours — c'est le cas des
// « Tests · » de la passerelle et du web, dont les gardes lisent des dizaines
// de fichiers iOS, Android et `tasks/` (suivi de #7711). Les gardes NAVIGATEUR
// (`web_navigateur`) ont, elles, leur carte, tenue par
// `scripts/ci/check-web-navigateur-read-set.mjs`.
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
  '.github/actions/',
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
  // La coque Android de `apps/web` (#6217) : ce que `build-shells.mjs`
  // LIT pour produire l'APK — le projet gradle, la config Capacitor, la
  // version (`package.json`), la construction Vite en variante B et le
  // pilote lui-même avec ses deux bibliothèques. Un écran web ne change pas
  // l'APK au sens de gradle : il est couvert par les gates web, pas ici.
  shell_android: [
    'apps/web/android/',
    'apps/web/capacitor.config.ts',
    'apps/web/package.json',
    'apps/web/vite.config.ts',
    'apps/web/scripts/build-shells.mjs',
    'apps/web/scripts/lib/android-release.mjs',
    'apps/web/scripts/shell-start-path-hook.mjs',
    'apps/web/scripts/lib/files.mjs',
    'apps/web/scripts/lib/fixture-markers.mjs',
  ],
  // Les sources de design des cadres de gloire (lot L2, #10153) : la garde d'empiètement régénère les SVG des
  // ateliers et mesure Mee et Meo contre la fenêtre photo. Le job rejoue aussi chaque `window.path` versionné
  // contre son masque (`lib/window-path-contracts.test.mjs`, #10254) : il LIT donc les contrats et le magasin
  // où vivent les masques, et une réimportation qui ne touche qu'eux doit le lancer, sinon rien ne compare
  // le chemin au masque.
  glory_frames: ['docs/product/cadres-de-gloire/', 'packages/shared/design/glory-frames/', 'services/gateway/assets/packs/'],
  // Les gardes navigateur de `ci.yml` (job `web-navigateur`) : l'application, ce qu'elle importe
  // (`packages/shared`, `packages/design-tokens`), la passerelle dont les gardes lisent les routes et les
  // schémas (zone PRUDENTE : la passerelle entière), et les rares fichiers hors d'`apps/web` que leurs scripts
  // lisent. Carte mesurée le 2026-10-23 et TENUE par `scripts/ci/check-web-navigateur-read-set.mjs`.
  web_navigateur: [
    'apps/web/',
    'packages/shared/',
    'packages/design-tokens/',
    'services/gateway/',
    'docs/product/cadres-de-gloire/',
    'apps/ios/decisions.md',
    'scripts/check-web-api-literals.mjs',
    'scripts/lib/',
  ],
  // Les suites unitaires (#12558) : chacune ne lit que sa zone, ses tests qui lisent ailleurs
  // (Swift, Kotlin, infrastructure, l'autre suite…) étant rejoués à chaque poussée par la voie
  // de parité (`scripts/ci/voie-parite.mjs`). Le script de la voie est dans les deux zones :
  // le changer peut retirer un test de la voie, la suite entière doit alors le prouver.
  tests_web: ['apps/web/', 'packages/shared/', 'packages/design-tokens/', 'scripts/ci/voie-parite.mjs'],
  tests_gateway: ['services/gateway/', 'packages/shared/', 'scripts/ci/voie-parite.mjs', 'scripts/ci/merge-jest-coverage.mjs'],
};

const toutVrai = () => Object.fromEntries(Object.keys(DOMAINES).map((domaine) => [domaine, true]));

export const couvre = (chemins, fichier) =>
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
  ['iOS seul', ['apps/ios/Meeshy/App.swift', 'packages/MeeshySDK/Package.swift'], { translator: false, shell_android: false, glory_frames: false }],
  ['traducteur', ['services/translator/src/main.py'], { translator: true, shell_android: false, glory_frames: false }],
  ['passerelle (tests vocaux)', ['services/gateway/src/voice.ts'], { translator: true, shell_android: false, glory_frames: false }],
  ['schéma partagé', ['packages/shared/prisma/schema.prisma'], { translator: true, shell_android: false, glory_frames: false }],
  ['fiche marketing', ['docs/marketing/app-store-fiche-2026-08.md'], { translator: true, shell_android: false, glory_frames: false }],
  ['pages institutionnelles', ['apps/web/src/institutional/faq.ts'], { translator: true, shell_android: false, glory_frames: false }],
  ['web hors institutionnel', ['apps/web/src/routes/thread.tsx'], { translator: false, shell_android: false, glory_frames: false }],
  ['docs hors marketing', ['docs/product/roadmap.md', 'tasks/lessons.md'], { translator: false, shell_android: false, glory_frames: false }],
  ['ce workflow', ['apps/ios/x.swift', '.github/workflows/ci.yml'], { translator: true, shell_android: true, glory_frames: true }],
  ['lockfile', ['bun.lock'], { translator: true, shell_android: true, glory_frames: true }],
  ['action composite de la CI', ['.github/actions/preparer-js/action.yml'], { translator: true, shell_android: true, glory_frames: true }],
  ['diff illisible', null, { translator: true, shell_android: true, glory_frames: true }],
  ['diff vide', [], { translator: true, shell_android: true, glory_frames: true }],
  ['préfixe trompeur', ['services/translator-old/x.py', 'packages/shared-legacy/x.ts'], { translator: false, shell_android: false, glory_frames: false }],
  ['coque Android (gradle)', ['apps/web/android/app/build.gradle'], { translator: false, shell_android: true, glory_frames: false }],
  ['version de l\'app web', ['apps/web/package.json'], { translator: false, shell_android: true, glory_frames: false }],
  ['pilote des coques', ['apps/web/scripts/build-shells.mjs'], { translator: false, shell_android: true, glory_frames: false }],
  ['config Capacitor', ['apps/web/capacitor.config.ts'], { translator: false, shell_android: true, glory_frames: false }],
  ['coque iOS seule', ['apps/web/ios/App/App/Info.plist'], { translator: false, shell_android: false, glory_frames: false }],
  ['témoin des coques', ['apps/web/scripts/build-shells.test.ts'], { translator: false, shell_android: false, glory_frames: false }],
  ['cadres de gloire', ['docs/product/cadres-de-gloire/generateur/lib/overlap.mjs'], { translator: false, shell_android: false, glory_frames: true }],
  ['autre doc produit', ['docs/product/cadres-de-gloire-old/x.md', 'docs/product/roadmap.md'], { translator: false, shell_android: false, glory_frames: false }],
  ['contrats des cadres de gloire', ['packages/shared/design/glory-frames/savane.json'], { glory_frames: true }],
  ['magasin des packs (masques)', ['services/gateway/assets/packs/443cce762c663349.json'], { glory_frames: true }],
  ['réimportation des cadres', ['packages/shared/design/glory-frames/savane.json', 'services/gateway/assets/packs/443cce762c663349.json', 'packages/shared/design/packs/retained.json'], { glory_frames: true }],
  ['autre design partagé', ['packages/shared/design/packs/retained.json', 'packages/shared/design/glory-frames-old/x.json'], { glory_frames: false }],
  ['passerelle hors magasin', ['services/gateway/assets/fonts/x.ttf'], { glory_frames: false }],
];

const CAS_NAVIGATEUR = [
  ['navigateur : iOS seul', ['apps/ios/Meeshy/App.swift'], false],
  ['navigateur : Android natif seul', ['apps/android/app/src/main/Foo.kt'], false],
  ['navigateur : SDK seul', ['packages/MeeshySDK/Sources/MeeshySDK/X.swift'], false],
  ['navigateur : documentation', ['docs/product/roadmap.md', 'tasks/lessons.md'], false],
  ['navigateur : traducteur seul', ['services/translator/src/main.py'], false],
  ['navigateur : préfixe trompeur', ['packages/shared-legacy/x.ts', 'apps/web-old/x.ts'], false],
  ['navigateur : application web', ['apps/web/src/routes/thread.tsx'], true],
  ['navigateur : schéma partagé', ['packages/shared/types/user.ts'], true],
  ['navigateur : jetons de design', ['packages/design-tokens/ios.css'], true],
  ['navigateur : passerelle', ['services/gateway/src/routes/x.ts'], true],
  ['navigateur : cadres de gloire', ['docs/product/cadres-de-gloire/generateur/lib/overlap.mjs'], true],
  ['navigateur : décisions iOS lues par le web', ['apps/ios/decisions.md'], true],
  ['navigateur : fichier global', ['bun.lock'], true],
  ['navigateur : diff illisible', null, true],
];

const CAS_SUITES = [
  ['suites : iOS seul', ['apps/ios/Meeshy/App.swift'], { tests_web: false, tests_gateway: false }],
  ['suites : Android natif seul', ['apps/android/app/src/main/Foo.kt'], { tests_web: false, tests_gateway: false }],
  ['suites : infrastructure seule', ['infrastructure/docker/compose/docker-compose.prod.yml'], { tests_web: false, tests_gateway: false }],
  ['suites : application web', ['apps/web/src/routes/thread.tsx'], { tests_web: true, tests_gateway: false }],
  ['suites : passerelle', ['services/gateway/src/routes/x.ts'], { tests_web: false, tests_gateway: true }],
  ['suites : partagé', ['packages/shared/types/user.ts'], { tests_web: true, tests_gateway: true }],
  ['suites : la voie de parité elle-même', ['scripts/ci/voie-parite.mjs'], { tests_web: true, tests_gateway: true }],
  ['suites : fichier global', ['bun.lock'], { tests_web: true, tests_gateway: true }],
];

const selfTest = () => {
  const echecsSuites = CAS_SUITES.filter(([, fichiers, attendu]) =>
    Object.entries(attendu).some(([domaine, valeur]) => domainesTouches(fichiers)[domaine] !== valeur),
  );
  echecsSuites.forEach(([titre, fichiers]) => console.error(`ÉCHEC : « ${titre} » rend ${JSON.stringify(domainesTouches(fichiers))}`));
  if (echecsSuites.length > 0) process.exit(1);
  const echecs = CAS.filter(([, fichiers, attendu]) =>
    Object.entries(attendu).some(([domaine, valeur]) => domainesTouches(fichiers)[domaine] !== valeur),
  );
  echecs.forEach(([titre, fichiers]) =>
    console.error(`ÉCHEC : « ${titre} » rend ${JSON.stringify(domainesTouches(fichiers))}`),
  );
  const echecsNavigateur = CAS_NAVIGATEUR.filter(([, fichiers, attendu]) => domainesTouches(fichiers).web_navigateur !== attendu);
  echecsNavigateur.forEach(([titre, fichiers]) =>
    console.error(`ÉCHEC : « ${titre} » rend web_navigateur=${domainesTouches(fichiers).web_navigateur}`),
  );
  if (echecsNavigateur.length > 0) return 1;
  const nonDispatch = fichiersChanges({ event: 'workflow_dispatch', base: 'a', head: 'b' }) === null;
  const nouvelleBranche = fichiersChanges({ event: 'push', base: '0'.repeat(40), head: 'b' }) === null;
  if (!nonDispatch || !nouvelleBranche) console.error('ÉCHEC : un dispatch ou une branche neuve ne fait pas tout tourner');
  if (echecs.length > 0 || !nonDispatch || !nouvelleBranche) return 1;
  console.log(`self-test : ${CAS.length + CAS_NAVIGATEUR.length + CAS_SUITES.length} cas tenus, dispatch et branche neuve font tout tourner`);
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
