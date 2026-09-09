#!/usr/bin/env bun
/** @jsxImportSource preact */
/**
 * PRÉCHAUFFE les cinq pages institutionnelles en HTML STATIQUE.
 *
 * Pourquoi elles ne sont pas des routes de l'application :
 *
 * 1. **Le poids.** Elles n'ont ni session, ni API, ni temps réel. Les faire
 *    traverser le socle applicatif leur ferait payer le runtime, le routeur et
 *    le cache de données pour afficher du texte — sur le réseau visé, c'est
 *    exactement la dépense que ce produit refuse.
 * 2. **Les métadonnées.** Une application à page unique sert UN document : son
 *    `<title>` et ses `og:` sont les mêmes pour toutes les adresses. Or ces
 *    cinq pages sont précisément celles que les moteurs et les plateformes de
 *    partage lisent. Un `<title>` posé par JavaScript arrive après le robot.
 *
 * Le résultat est un fichier par page : HTML + sa feuille INLINÉE + zéro
 * script. Une requête, et rien à hydrater.
 *
 * Lancé APRÈS `vite build`, parce qu'il inline la feuille que Vite vient de
 * produire — la même que l'application, donc les mêmes jetons, sans seconde
 * table de style.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from 'preact-render-to-string';

import packageJson from '../package.json';
import budgets from '../budgets.json';

import { InstitutionalPage } from '../src/institutional/page';
import { PAGE_ABOUT } from '../src/institutional/about';
import { PAGE_CONTACT } from '../src/institutional/contact';
import { PAGE_PARTNERS } from '../src/institutional/partners';
import { PAGE_PRIVACY } from '../src/institutional/privacy';
import { PAGE_TERMS } from '../src/institutional/terms';
import type { ContentPage } from '../src/institutional/type';
import { INLINE_SCHEME_BOOTSTRAP } from '../src/lib/inline-scheme-bootstrap.js';
import { resolveDistDir } from './lib/resolve-dist-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * LE RÉPERTOIRE DE SORTIE EST REÇU, JAMAIS DEVINÉ (#5812, élargit #5821).
 *
 * `../dist` en dur ignorait `--outDir` : une construction de la variante B
 * (`dist-capacitor/`, invoquée par `vite.config.ts` sous `MEESHY_TARGET=
 * capacitor`) écrivait ses cinq pages institutionnelles dans la sortie de la
 * variante A à la place — `dist-capacitor/` n'en recevait AUCUNE, et
 * `dist/` en recevait d'une construction qui ne le visait pas. Voir
 * `scripts/lib/resolve-dist-dir.mjs` pour la mesure et le témoin.
 */
const DIST = resolveDistDir(HERE, process.argv);

/**
 * `Meeshy {version}` (`src/lib/brand.ts`) — la SEULE lecture de la version de
 * l'application, au SEUL point de build qui compose ces pages (#5606, § E3).
 */
const VERSION = packageJson.version;

/**
 * LE PLAFOND PAR PAGE (revue de #5606, défaut 3) — jusqu'ici gzip était
 * MESURÉ (voir `total` en bas de fichier) mais jamais GARDÉ : le doc-comment
 * de `src/styles/institutional.css` citait un plafond de 9 Ko sans qu'aucun
 * script ne le lise. Le plafond vit dans `budgets.json` — la SEULE table de
 * ce dépôt (comme `first_paint.kb` pour la première peinture de
 * l'application) — pour que la valeur ne se retype nulle part.
 */
const INSTITUTIONAL_PAGE_BUDGET_KB = budgets.institutional_page.kb.value;

const PAGES: readonly { readonly route: string; readonly page: ContentPage }[] = [
  { route: 'about', page: PAGE_ABOUT },
  { route: 'contact', page: PAGE_CONTACT },
  { route: 'partners', page: PAGE_PARTNERS },
  { route: 'privacy', page: PAGE_PRIVACY },
  { route: 'terms', page: PAGE_TERMS },
];

/**
 * L'ORIGINE PUBLIQUE, et pourquoi elle ne se devine pas.
 *
 * `og:url` doit porter le DOMAINE, jamais l'hôte interne : derrière un routeur,
 * l'en-tête `Host` est celui du conteneur, et une carte d'aperçu construite
 * dessus se met en cache sous deux origines. L'ancienne refonte s'était fait
 * prendre exactement là ; on lit donc une variable, et on échoue bruyamment si
 * elle manque en production.
 */
const ORIGIN = process.env.MEESHY_PUBLIC_ORIGIN ?? 'https://meeshy.me';

/**
 * La feuille DÉDIÉE à ces pages — pas celle de l'application.
 *
 * Vite en produit deux (voir `vite.config.ts`) : `index-*.css` porte toute
 * l'application, `institutional-*.css` ne porte que ce que ces cinq pages
 * rendent. Inliner la première leur ferait transporter les styles de la liste,
 * du fil et du composeur — mesuré, 2,1 Ko gzip de trop par page, payés cinq
 * fois et jamais mis en cache.
 *
 * L'échec est BRUYANT si le fichier manque : une feuille silencieusement
 * absente rendrait cinq pages de texte brut, servies en 200.
 */
function producedSheet(): string {
  const assets = join(DIST, 'assets');
  const css = readdirSync(assets).filter((f) => f.startsWith('institutional-') && f.endsWith('.css'));
  if (css.length !== 1) {
    throw new Error(
      `Attendu UNE feuille \`institutional-*.css\` dans dist/assets, trouvé ${css.length}. ` +
        'Lancer `vite build` d’abord, et vérifier l’entrée CSS de vite.config.ts.',
    );
  }
  return readFileSync(join(assets, css[0]!), 'utf8');
}

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function document(route: string, page: ContentPage, sheet: string): string {
  const body = render(<InstitutionalPage page={page} version={VERSION} />);
  const url = `${ORIGIN}/${route}`;
  /* « À propos de Meeshy · Meeshy » : le suffixe de marque ne s'ajoute qu'aux
     titres qui ne la portent pas déjà. Un onglet qui bégaie le nom du produit
     est le premier signe qu'un gabarit a été appliqué sans être lu. */
  const title = page.title.includes('Meeshy') ? page.title : `${page.title} · Meeshy`;
  return `<!doctype html>
<html lang="fr" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Meeshy">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${escape(url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0b0c14" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48">
<style>${sheet}</style>
<script>${INLINE_SCHEME_BOOTSTRAP}</script>
</head>
<body>${body}</body>
</html>
`;
}

/**
 * LES INVARIANTS, vérifiés sur le fichier ÉCRIT et non sur ce qu'on croit avoir
 * écrit.
 *
 * Le défaut qui a motivé ce contrôle : sans la pragma de source JSX en tête de
 * fichier, le rendu produisait `<body></body>` — cinq pages servies en 200,
 * titre juste, métadonnées justes, **contenu vide**. Aucune vérification
 * d'en-tête ne l'aurait vu. On mesure donc ce qui est DANS le corps.
 *
 * (Et cette phrase n'écrit pas le nom de la pragma : le transpileur le cherche
 * dans TOUS les commentaires, pas seulement le premier. L'écrire ici en toutes
 * lettres a fait résoudre un module nommé d'après la fin de la phrase.)
 */
/**
 * LES SOUS-RESSOURCES que le document demande AU NAVIGATEUR, en plus de
 * lui-même : l'icône déclarée par `<link>`, les images, et les fichiers
 * appelés par un `url(…)` de style en ligne — le masque du glyphe de la
 * signature de marque, par exemple.
 *
 * POURQUOI CETTE FONCTION EXISTE (revue de #5606). La ligne de rapport de ce
 * script annonçait « 1 requête » en DUR. C'était vrai tant que ces pages
 * n'étaient que du texte ; le jour où l'une d'elles a servi un logo, le
 * chiffre est devenu FAUX sans que rien ne bouge — dans un dépôt où le poids
 * est un gate et où « un chiffre non mesuré ne compte pas », un littéral qui
 * a l'air d'une mesure est pire qu'une absence de mesure. On COMPTE.
 *
 * Les `href` de navigation (`/about`, `/privacy`) ne sont pas des
 * sous-ressources : seuls les `href` de `<link>` le sont. Le `canonical`, lui,
 * est absolu (`https://…`), donc hors du motif ancré sur `/`.
 */
const SUBRESOURCE_PATTERNS = [
  /<(?:img|script|source|iframe)\b[^>]*\ssrc="(\/[^"]*)"/g,
  /<link\b[^>]*\shref="(\/[^"]*)"/g,
  /url\((\/[^)"']*)\)/g,
] as const;

const subresources = (html: string): readonly string[] => {
  const urls = new Set<string>();
  for (const pattern of SUBRESOURCE_PATTERNS) {
    for (const [, url] of html.matchAll(pattern)) {
      if (url) urls.add(url);
    }
  }
  return [...urls];
};

function check(route: string, html: string, page: ContentPage): void {
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '';
  const failures: string[] = [];

  if (body.length < 500) failures.push(`corps quasi vide (${body.length} caractères)`);
  if (!body.includes(escape(page.title))) failures.push('le titre de la page est absent du corps');
  // Chaque section doit avoir laissé une trace : un bloc perdu en silence est
  // exactement ce qu'un `switch` non exhaustif produirait.
  for (const section of page.sections) {
    if (!body.includes(escape(section.title))) failures.push(`section absente : « ${section.title} »`);
  }
  if (!html.includes(`<link rel="canonical" href="${ORIGIN}/${route}">`)) failures.push('canonical absent ou faux');
  if (!html.includes('property="og:url"')) failures.push('og:url absent');
  // Mesuré sur le fichier ÉCRIT, pas sur la constante importée : un gabarit
  // qui échapperait mal `INLINE_SCHEME_BOOTSTRAP` produirait un script tronqué
  // sans qu'aucun des invariants ci-dessus ne le voie (#5588).
  if (!html.includes(`<script>${INLINE_SCHEME_BOOTSTRAP}</script>`)) {
    failures.push("le script d'amorçage du schéma est absent ou altéré");
  }
  if (!html.includes('property="og:description"')) failures.push('og:description absent');
  // ZÉRO script externe : c'est la promesse de ces pages. Le seul `<script>`
  // toléré est le thème, inline.
  if (/<script[^>]+src=/.test(html)) failures.push('un script EXTERNE est référencé');
  if (/<link[^>]+rel="stylesheet"/.test(html)) failures.push('une feuille EXTERNE est référencée');
  /* CHAQUE sous-ressource référencée doit EXISTER dans le dist (revue de
     #5606). Le générateur d'actifs (`scripts/generate-icons.py`) et les
     chemins que le markup sert (`src/lib/brand.ts`) sont deux chaînes de
     caractères tenues dans DEUX langages : un renommage d'un seul côté rendait
     jusqu'ici une page au logo cassé, en vert. Ce contrôle-ci ferme la porte
     là où elle compte — sur le document ÉCRIT, quel que soit le chemin par
     lequel l'actif y est arrivé. */
  for (const url of subresources(html)) {
    const file = join(DIST, url.replace(/^\//, '').replace(/[?#].*$/, ''));
    if (!existsSync(file)) failures.push(`sous-ressource absente du dist : ${url}`);
  }

  if (failures.length > 0) {
    console.error(`\n  /${route} — ${failures.length} invariant(s) rompu(s) :`);
    for (const e of failures) console.error(`    · ${e}`);
    process.exit(1);
  }
}

const sheet = producedSheet();
let total = 0;
const overBudget: string[] = [];
for (const { route, page } of PAGES) {
  const html = document(route, page, sheet);

  /**
   * DEUX fichiers pour une page, et ce n'est pas un doublon par paresse.
   *
   * `/privacy` (sans barre finale) est l'URL qu'on PARTAGE, et la façon dont
   * un serveur la résout dépend de sa convention : nginx `try_files` et la
   * plupart des hébergeurs statiques la font tomber sur `privacy/index.html`,
   * mais `vite preview` — et tout serveur qui privilégie le repli d'une
   * application à page unique — sert l'`index.html` du SOCLE à la place.
   * Mesuré : `/privacy/` rendait le bon titre, `/privacy` rendait « Meeshy ».
   *
   * Une page institutionnelle qui tombe sur le socle perd ses métadonnées au
   * moment précis où elles servent — un robot ou une carte d'aperçu ne suit
   * pas de redirection côté client. Écrire les DEUX formes retire la question
   * au serveur : quelle que soit sa convention, il trouve un fichier.
   *
   * `<link rel="canonical">` désigne la forme SANS barre finale, pour qu'un
   * moteur n'indexe pas deux fois la même page.
   */
  check(route, html, page);

  const dir = join(DIST, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  writeFileSync(join(DIST, `${route}.html`), html);
  /* `node:zlib` plutôt que l'API globale du runtime : le type-check ne doit
     pas dépendre des types d'un runtime particulier, et le chiffre est le
     même — gzip niveau 9, comme partout ailleurs dans ce dépôt. */
  const gz = gzipSync(Buffer.from(html), { level: 9 }).length;
  total += gz;
  const gzKb = Math.round((gz / 1024) * 100) / 100;
  if (gzKb > INSTITUTIONAL_PAGE_BUDGET_KB) {
    overBudget.push(`/${route} : ${gzKb} Ko gzip, plafond ${INSTITUTIONAL_PAGE_BUDGET_KB} Ko (budgets.json → institutional_page.kb)`);
  }
  /* Le document LUI-MÊME plus ce qu'il fait chercher au navigateur. Compté,
     jamais annoncé — voir le doc-comment de `subresources`. */
  const requests = 1 + subresources(html).length;
  console.log(
    `  /${route.padEnd(9)} ${String(gzKb).padStart(6)} Ko gzip · ` +
      `${requests} requête${requests > 1 ? 's' : ''} · 0 script`,
  );
}
console.log(`  ${' '.repeat(10)}${String(Math.round((total / 1024) * 100) / 100).padStart(6)} Ko pour les cinq\n`);

/**
 * LE GATE (revue de #5606, défaut 3) — un dépassement rend le script en
 * erreur, comme `scripts/measure-weight.mjs` le fait déjà pour la première
 * peinture de l'application. Après l'affichage des cinq lignes : le rapport
 * complet sert de preuve même quand une seule page dépasse.
 */
if (overBudget.length > 0) {
  console.error(`  ${overBudget.length} page(s) institutionnelle(s) au-dessus du plafond :\n`);
  for (const line of overBudget) console.error(`    · ${line}`);
  console.error('\n  Alléger la page, ou faire arbitrer le plafond par le porteur (budgets.json).\n');
  process.exit(1);
}
