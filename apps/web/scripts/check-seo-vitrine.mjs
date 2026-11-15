#!/usr/bin/env node
/**
 * VÉRIFIE QUE LA VITRINE PUBLIQUE EST INDEXABLE (Google) ET CITABLE (moteurs IA).
 *
 * POURQUOI CE TÉMOIN EXISTE (#12938)
 *
 * La vitrine publique — l'accueil `/` (français, `x-default`) et chaque landing
 * de langue `/<code>` — est ce qu'un robot d'indexation et un moteur IA (AEO/GEO)
 * LISENT. Tout ce qu'ils lisent doit être dans le HTML SERVI, jamais posé par
 * JavaScript après coup : un `<title>` arrivé après le robot n'existe pas pour lui.
 *
 * Le document servi est composé par `landingHead()` et `landingStructuredData()`
 * (`src/landing/landing-document.tsx`) — UNE source pour les sept langues, donc
 * un témoin qui garde ce producteur garde toutes les pages d'un coup. Le prérendu
 * (`scripts/prerender-landing.tsx`) relit chaque fichier ÉCRIT ; ce gate-ci, lui,
 * tient sur la SOURCE, sous `node` seul, sans build ni navigateur — il a sa place
 * dans le job `quality` de la CI, à côté des autres gardes statiques.
 *
 * CE QU'IL MESURE
 *
 *   1. `landingHead()` émet chaque balise d'indexation attendue : `<title>`,
 *      `<meta name="description">`, `<link rel="canonical">`, Open Graph
 *      (`og:title` / `og:description` / `og:image` / `og:url`), et le bloc
 *      `<script type="application/ld+json">`.
 *   2. `landingStructuredData()` produit un JSON-LD VALIDE (il s'évalue, se
 *      sérialise en JSON, et porte le contexte `schema.org`) contenant à la
 *      fois une entité `Organization` ET une entité `WebApplication` — les deux
 *      que les moteurs IA citent pour nommer le produit et son éditeur.
 *
 * `--self-test` nourrit le même validateur avec un en-tête amputé et un JSON-LD
 * cassé, et EXIGE qu'il les refuse : la garde est rouge quand la propriété
 * disparaît, jamais verte par omission (« gate rouge d'abord »).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCUMENT_SOURCE = join(HERE, '..', 'src', 'landing', 'landing-document.tsx');

/** Les balises d'indexation que l'en-tête de la vitrine DOIT émettre. */
const REQUIRED_HEAD_TAGS = [
  { label: '<title>', pattern: /<title>/ },
  { label: '<meta name="description">', pattern: /name="description"/ },
  { label: '<link rel="canonical">', pattern: /rel="canonical"/ },
  { label: 'og:title', pattern: /property="og:title"/ },
  { label: 'og:description', pattern: /property="og:description"/ },
  { label: 'og:url', pattern: /property="og:url"/ },
  { label: 'og:image', pattern: /property="og:image"/ },
  { label: 'application/ld+json', pattern: /type="application\/ld\+json"/ },
];

/** Les deux entités que le JSON-LD de la vitrine DOIT porter. */
const REQUIRED_LD_TYPES = ['Organization', 'WebApplication'];

/**
 * Extrait le corps textuel d'une fonction nommée par appariement d'accolades,
 * depuis sa première `{` jusqu'à la `}` qui l'équilibre.
 */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`fonction introuvable dans la source : ${signature}`);
  const open = source.indexOf('{', start);
  if (open === -1) throw new Error(`corps introuvable pour : ${signature}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`accolades non équilibrées pour : ${signature}`);
}

/** L'objet littéral retourné par `landingStructuredData`, extrait de son corps. */
function structuredDataLiteral(source) {
  const body = functionBody(source, 'export function landingStructuredData');
  const ret = body.indexOf('return ');
  if (ret === -1) throw new Error('`return` introuvable dans landingStructuredData');
  const braceStart = body.indexOf('{', ret);
  let depth = 0;
  for (let i = braceStart; i < body.length; i += 1) {
    const char = body[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(braceStart, i + 1);
    }
  }
  throw new Error('objet retourné non équilibré dans landingStructuredData');
}

/**
 * Évalue le JSON-LD de la vitrine en fournissant des bouchons aux rares
 * dépendances de son objet littéral (origine, copie, langue, chemin, logo),
 * puis le sérialise — ce qui prouve qu'il est du JSON VALIDE, pas seulement
 * présent dans la source.
 */
function evaluateStructuredData(literal) {
  const build = new Function(
    'origin',
    'copy',
    'language',
    'landingPath',
    'BRAND_LOGO_PATH',
    `return (${literal});`,
  );
  const value = build(
    'https://meeshy.me',
    { metaDescription: 'Messagerie multilingue en temps réel.' },
    'fr',
    (code) => (code === 'fr' ? '/' : `/${code}`),
    '/brand/logo.png',
  );
  return JSON.parse(JSON.stringify(value));
}

/** Les types `@type` présents dans le graphe JSON-LD, quelle que soit sa forme. */
function graphTypes(data) {
  const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
  return new Set(nodes.map((node) => node?.['@type']).filter(Boolean));
}

/**
 * Le validateur, isolé pour que `--self-test` le confronte à une source cassée.
 * Rend la liste des manques — vide quand la vitrine est conforme.
 */
function validate(headSource, structuredLiteral) {
  const failures = [];
  for (const { label, pattern } of REQUIRED_HEAD_TAGS) {
    if (!pattern.test(headSource)) failures.push(`balise absente de l'en-tête : ${label}`);
  }
  let data;
  try {
    data = evaluateStructuredData(structuredLiteral);
  } catch (error) {
    failures.push(`JSON-LD invalide : ${error.message}`);
    return failures;
  }
  if (data?.['@context'] !== 'https://schema.org') failures.push('JSON-LD sans contexte schema.org');
  const types = graphTypes(data);
  for (const type of REQUIRED_LD_TYPES) {
    if (!types.has(type)) failures.push(`entité JSON-LD absente : ${type}`);
  }
  return failures;
}

function selfTest() {
  const ampute = '<title>x</title><meta name="description" content="x">';
  const brokenJson = "{ '@context': 'https://schema.org', '@graph': [ { '@type': 'Organization' } ";
  const problems = [];

  const missingTags = validate(ampute, structuredDataLiteral(readFileSync(DOCUMENT_SOURCE, 'utf8')));
  if (!missingTags.some((f) => f.includes('canonical'))) problems.push('le self-test n’a pas vu le canonical manquant');
  if (!missingTags.some((f) => f.includes('og:title'))) problems.push('le self-test n’a pas vu og:title manquant');

  const brokenLd = validate('', brokenJson);
  if (!brokenLd.some((f) => f.includes('JSON-LD invalide'))) problems.push('le self-test n’a pas vu le JSON-LD cassé');

  const goodHead = REQUIRED_HEAD_TAGS.map(({ label }) => label).join(' ');
  const missingWebApp = validate(
    goodHead,
    "{ '@context': 'https://schema.org', '@graph': [ { '@type': 'Organization' } ] }",
  );
  if (!missingWebApp.some((f) => f.includes('WebApplication'))) problems.push('le self-test n’a pas vu WebApplication manquant');

  if (problems.length > 0) {
    console.error('  check-seo-vitrine --self-test — la garde ne protège PAS la propriété :');
    for (const problem of problems) console.error(`    · ${problem}`);
    process.exit(1);
  }
  console.log('  check-seo-vitrine --self-test — la garde refuse bien une vitrine amputée ✓');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const source = readFileSync(DOCUMENT_SOURCE, 'utf8');
  const headSource = functionBody(source, 'export function landingHead');
  const failures = validate(headSource, structuredDataLiteral(source));
  if (failures.length > 0) {
    console.error(`\n  Vitrine non indexable — ${failures.length} invariant(s) rompu(s) :`);
    for (const failure of failures) console.error(`    · ${failure}`);
    console.error('\n  Source : src/landing/landing-document.tsx (landingHead / landingStructuredData).\n');
    process.exit(1);
  }
  console.log('  check-seo-vitrine — <title>, description, Open Graph, canonical et JSON-LD Organization + WebApplication présents ✓');
}

main();
