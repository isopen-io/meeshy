import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

/**
 * Le harnais e2e de la v3 — UN seul, pour les quatre suites.
 *
 * OÙ EST CHROMIUM, ET POURQUOI CE FICHIER NE LE DEMANDE PAS À `navigateur.cjs`.
 *
 * `scripts/lib/navigateur.cjs` est le site UNIQUE de cette question (§ 9.2), et
 * `CHROMIUM_PATH` est l'entrée qu'il consulte EN PREMIER : `npm run e2e` la
 * remplit depuis ce site, sans qu'une seconde résolution s'écrive ici.
 * L'IMPORTER serait pourtant faux, et `scripts/check-v3-pipeline.mjs` le dit :
 * un chemin relatif hors de `apps/web-v3/` est un franchissement de frontière
 * de paquet, refusé parce que l'étage builder de l'image ne copie que ce
 * dossier. La config s'y branche donc par l'ENVIRONNEMENT, jamais par le
 * disque.
 *
 * Sans `CHROMIUM_PATH`, Playwright résout lui-même — ce qu'il fait correctement
 * partout où `playwright install` a tourné, la CI comprise. Le repli
 * `/opt/pw-browsers` n'est posé que s'il EXISTE : le poser à l'aveugle
 * détournerait la CI de son propre cache de navigateurs.
 */
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const executablePath = process.env.CHROMIUM_PATH;

const BASE_URL = process.env.V3_BASE_URL ?? 'http://127.0.0.1:3300';

/**
 * Le serveur global sert les suites qui mesurent UNE page servie — a11y (§ 9.6)
 * et cycle de vie (§ 9.7). La preuve d'un build s'y prend sur `next start`,
 * jamais sur `next dev` (leçon 339).
 *
 * Les suites du rôle premier (`v3-network-vitals`, `v3-lien-expire`) ne s'en
 * servent pas : elles mesurent une CHAÎNE — le serveur de la v3 ET la
 * passerelle qu'il appelle —, ce qu'un `webServer` global ne sait pas relier.
 * Chacune monte ses deux serveurs sur des ports libres
 * (`e2e/visual/lib/serveurs.ts`), ce qui les garde vertes hors ligne, sans
 * passerelle réelle.
 */
const webServer =
  process.env.V3_BASE_URL === undefined
    ? {
        command: 'npm run start',
        url: `${BASE_URL}/healthz`,
        reuseExistingServer: process.env.CI === undefined,
        timeout: 120_000,
      }
    : undefined;

/**
 * Le cadre de rendu, UN seul pour les deux projets : 390×844, le format de la
 * planche (§ 9.6), sur Chromium — `devices['iPhone 14']` réclamerait WebKit, et
 * un second moteur de rendu ferait diverger les captures d'un gate à l'autre.
 */
const cadreMobile = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  isMobile: false,
  launchOptions: {
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  },
};

/** Les suites qui mesurent une PAGE servie par le `webServer` ci-dessus. */
const SUITES_DE_PAGE = ['**/v3-a11y.spec.ts', '**/v3-lifecycle.spec.ts'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  /**
   * Les suites du rôle premier ouvrent CHACUNE leurs propres serveurs. Les
   * laisser se chevaucher ferait dépendre un gate de la charge de la machine
   * plutôt que du code qu'il mesure — un gate qui clignote ne garde rien.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    /**
     * DEUX PROJETS, PARCE QUE LES DEUX FAMILLES NE PEUVENT PAS PARTAGER UNE
     * MÊME EXÉCUTION — et il faut dire pourquoi, sans quoi quelqu'un les
     * refusionnera.
     *
     * Les suites de PAGE importent `scripts/lib/routes-emises.mjs`
     * STATIQUEMENT ; Playwright le fait passer par sa propre transformation, ce
     * qui installe son chargeur pour tout `.mjs` de l'exécution. Les suites de
     * CHAÎNE chargent `scripts/mesure-reseau.mjs` DYNAMIQUEMENT — le seul moyen
     * de ne pas recopier l'arithmétique des plafonds dans le spec
     * (`e2e/visual/lib/serveurs.ts`), ce module lisant `import.meta`, ce qu'un
     * import statique transpilé ne supporte pas.
     *
     * MESURÉ, sur ce dépôt : `playwright test <a11y> <network-vitals>` échoue en
     * « ./lib/motifs.mjs does not provide an export named plusPrecis » — le
     * chargeur rend le module imbriqué en CommonJS, dont l'export nommé n'est
     * plus visible. `--project=pages` et `--project=chaines`, eux, passent, et
     * `--workers=2` ne suffit PAS : la contrainte porte sur l'exécution, pas sur
     * le worker. D'où deux commandes (`test:pages`, `test:chaines`), jamais un
     * `playwright test` nu.
     *
     * La cause RACINE est ailleurs et se corrige ailleurs : `mesure-reseau.mjs`
     * mêle une coquille exécutable (`import.meta`, `main`) à des fonctions dont
     * un harnais a besoin — exactement ce que l'en-tête de `routes-emises.mjs`
     * décrit comme la raison de son existence. Les en extraire est une tâche à
     * part, suivie par son issue.
     *
     * Les deux familles diffèrent d'ailleurs déjà par leur serveur : l'une
     * mesure la page que `webServer` lève, l'autre monte sa propre chaîne.
     */
    {
      name: 'pages',
      testMatch: SUITES_DE_PAGE,
      use: cadreMobile,
    },
    /**
     * Le second projet prend TOUT LE RESTE, jamais une liste. Une liste ferait
     * qu'un spec ajouté demain n'appartiendrait à aucun projet et ne tournerait
     * PAS — un gate muet, la pire des deux pannes.
     */
    {
      name: 'chaines',
      testIgnore: SUITES_DE_PAGE,
      use: cadreMobile,
    },
  ],
  ...(webServer === undefined ? {} : { webServer }),
});
