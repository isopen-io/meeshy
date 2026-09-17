/**
 * **LE PLATEAU DE STORY PUBLIE CE QUE L'AUTEUR A POSÉ** (#6943, #6944) — dans
 * un VRAI navigateur, et prouvé sur le DOCUMENT QUI PART, pas sur celui qu'on
 * espère.
 *
 * `check-story-studio.mjs` prouve la GÉOMÉTRIE du studio (carte 9:16 centrée,
 * cibles, saisie alignée, brouillon) sur le `dist/` de fixtures ; les témoins
 * unitaires prouvent les LOIS. Ce gate-ci prouve la seule chose que ni l'un ni
 * les autres ne peuvent : qu'un parcours RÉEL — poser deux textes, en déplacer
 * un au pointeur PUIS au clavier, le tourner, l'agrandir, changer sa langue et
 * son style, placer un son sur la scène, écrire une légende — dépose CHACUNE
 * de ces valeurs dans le corps de `POST /api/v1/posts`.
 *
 * **Pourquoi une SECONDE construction.** Le `dist/` par défaut est bâti en
 * `fixtures` : `publishStory` y court-circuite avant tout octet réseau
 * (`stories-publish.ts`, branche `__FIXTURES__`), donc il n'y a AUCUN document
 * à relire. Ce gate bâtit donc `dist-gateway/` avec `VITE_DATA_SOURCE=gateway`
 * et INTERCEPTE la requête. Relire ce que le studio a composé depuis son propre
 * DOM aurait mesuré l'aperçu, pas la publication — et la question du cycle 122
 * (« qui AFFICHE ce que le résolveur élit ? ») a sa jumelle ici : **qu'est-ce
 * qui PART de ce que l'écran montre ?**
 *
 * **Ce que ce gate NE couvre PAS, délibérément** : la montée TUS d'un fichier.
 * Le brouillon est SEMÉ avec trois médias déjà PRÊTS (`postMediaId` +
 * `fileUrl`), ce que le studio restaure sans jamais remonter — la loi « un
 * média PRÊT n'est jamais remonté » (§ 1.4). Les PORTES elles-mêmes sont déjà
 * prouvées par `check-story-studio.mjs` (poser un fichier fait PEINDRE le
 * moteur). Ce gate mesure le PLATEAU, pas le transport.
 *
 * Sélecteurs préfixés `[data-story-*]`, comme l'écran les pose — jamais un
 * libellé francophone en dur, qui romprait au premier changement de catalogue.
 */
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist-gateway');
const ICON = join(ROOT, 'public/icon-192.png');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/* ── la construction « gateway », la seule où un document PART ────────────── */
const build = spawnSync(
  'npx',
  ['vite', 'build', '--outDir', 'dist-gateway', '--emptyOutDir', '--logLevel', 'warn'],
  { cwd: ROOT, env: { ...process.env, VITE_DATA_SOURCE: 'gateway', VITE_API_BASE: 'https://gate.meeshy.test' }, encoding: 'utf8' },
);
if (build.status !== 0) {
  console.error('check-story-plateau : la construction « gateway » a échoué');
  console.error(build.stdout ?? '');
  console.error(build.stderr ?? '');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const VIEWER = 'a'.repeat(24);
const BG = { postMediaId: 'pm-bg', fileUrl: '2026/09/u1/bg.png' };
const OV = { postMediaId: 'pm-ov', fileUrl: '2026/09/u1/ov.png' };
const SND = { postMediaId: 'pm-snd', fileUrl: '2026/09/u1/snd.mp3' };

const session = JSON.stringify({
  token: 'gate-token',
  sessionToken: 'gate-session',
  user: { id: VIEWER, username: 'auteur-gate' },
  expiresAt: Date.now() + 3_600_000,
});

/** Le brouillon SEMÉ — trois médias déjà PRÊTS et UN texte, la forme exacte
 * que `studioSnapshotOf` écrit (`lib/stories/studio.ts`). */
const draft = JSON.stringify({
  texts: [{ id: 'text-1', text: 'Bonjour', language: 'fr', style: 'bold', effect: 'none', color: 'FFFFFF', align: 'center', pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } }],
  language: 'fr',
  background: { ...BG, mediaType: 'image', pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } },
  overlay: { ...OV, mediaType: 'image', pose: { x: 0.3, y: 0.7, scale: 1, rotation: 0 } },
  sound: { ...SND, plane: 'background' },
});

const icon = await readFile(ICON);
const browser = await launchChromium();
const context = await browser.newContext({ colorScheme: 'light', locale: 'fr-FR', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.addInitScript(
  ([sessionJson, draftJson, viewerId]) => {
    localStorage.setItem('meeshy.session', sessionJson);
    localStorage.setItem(`meeshy.draft.story.${viewerId}`, draftJson);
  },
  [session, draft, VIEWER],
);

/** Les médias du brouillon se prévisualisent DEPUIS LE SERVEUR (le fichier
 * local n'existe plus) : on sert l'icône, sinon le moteur ne peint rien. */
await context.route('**/attachments/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: icon }));
await context.route('**/api/v1/uploads**', (route) => route.fulfill({ status: 500, body: 'ce gate ne monte AUCUN fichier' }));

// Tout autre appel réseau rend une réponse VIDE plutôt qu'une erreur : le
// studio ne lit rien, mais le socle (session, temps réel) peut sonder.
// **ENREGISTRÉ EN PREMIER, et c'est l'inverse de l'intuition** : Playwright
// résout ses routes dans l'ORDRE INVERSE de leur enregistrement — la dernière
// posée gagne. Un attrape-tout posé après la route de publication l'aurait
// avalée, et le gate aurait dit « aucun POST n'est parti » alors que l'écran
// publiait très bien.
await context.route('**/api/v1/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }),
);

let published = null;
await context.route('**/api/v1/posts', async (route) => {
  if (route.request().method() !== 'POST') return route.fallback();
  published = JSON.parse(route.request().postData() ?? '{}');
  await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'post-gate-1' } }) });
});

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/stories/new`, { waitUntil: 'load' });
await page.waitForSelector('[data-story-studio]', { timeout: 15000 });
await page.waitForSelector('[data-scene-player]', { timeout: 15000 });

const twoFrames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
await twoFrames();

/* ── 1. le brouillon SEMÉ est restauré, avec sa sélection ────────────────── */
check(
  (await page.evaluate(() => document.querySelector('#story-studio-text')?.value ?? null)) === 'Bonjour',
  'le texte du brouillon semé n’est pas restauré dans la saisie',
);
check(
  (await page.evaluate(() => document.querySelectorAll('[data-scene-object="text"]').length)) === 1,
  'le moteur devrait peindre UN objet texte avant l’ajout',
);

/* ── 2. AJOUTER un second texte ⇒ deux objets, le neuf sélectionné ───────── */
check(
  (await page.evaluate(() => document.querySelectorAll('[data-story-option]').length)) > 0,
  'aucun contrôle du rail n’est rendu',
);
await page.click('[data-story-option="add-text"]');
await page.fill('#story-studio-text', 'Hello');
await twoFrames();
check(
  (await page.evaluate(() => document.querySelectorAll('[data-scene-object="text"]').length)) === 2,
  'après l’ajout, le moteur devrait peindre DEUX objets texte',
);
check(
  (await page.evaluate(() => document.querySelector('#story-studio-text')?.dataset.storyTextTarget ?? null)) === 'text-2',
  'le texte AJOUTÉ devrait être celui que la saisie édite',
);

/* ── 3. les RÉGLAGES de l'objet — langue, police, effet, couleur, alignement ── */
await page.click('[data-story-option="editor-toggle"]');
await page.waitForSelector('[data-story-object-editor="text-2"]', { timeout: 8000 });
const pick = async (section, value) => {
  const selector = `[data-story-option="${section}:${value}"]`;
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.click(selector);
  await twoFrames();
};
await pick('language', 'en');
await pick('style', 'typewriter');
await pick('effect', 'longShadow');
await pick('color', 'F8B500');
await pick('align', 'right');

/* Le style est-il PEINT, ou seulement annoncé ? (cycle 123) */
const painted = await page.evaluate(() => {
  const el = document.querySelector('[data-scene-object-id="text-2"] [data-scene-text]');
  if (el === null) return null;
  const cs = getComputedStyle(el);
  return { fontFamily: cs.fontFamily, textAlign: cs.textAlign, color: cs.color, textShadow: cs.textShadow, lang: el.getAttribute('lang') };
});
check(painted !== null, 'le second objet texte n’est pas peint');
if (painted !== null) {
  check(/courier|monospace/i.test(painted.fontFamily), `la police « machine » n’est pas peinte — ${painted.fontFamily}`);
  check(painted.textAlign === 'right', `l’alignement n’est pas peint — ${painted.textAlign}`);
  check(painted.color === 'rgb(248, 181, 0)', `la couleur n’est pas peinte — ${painted.color}`);
  check(painted.textShadow !== 'none' && painted.textShadow !== '', `l’effet n’est pas peint — ${painted.textShadow}`);
  check(painted.lang === 'en', `la langue de l’objet n’est pas portée par le texte peint — ${painted.lang}`);
}

/* ── 4. DÉPLACER au POINTEUR, puis TOURNER et AGRANDIR au CLAVIER ────────── */
const moveBox = await page.evaluate(() => {
  const el = document.querySelector('[data-story-object-move]');
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
});
check(moveBox !== null, 'aucune poignée de déplacement sur l’objet sélectionné');
check(moveBox !== null && moveBox.width >= 43.5 && moveBox.height >= 43.5, `poignée de déplacement trop petite — ${JSON.stringify(moveBox)}`);
if (moveBox !== null) {
  await page.mouse.move(moveBox.x, moveBox.y);
  await page.mouse.down();
  await page.mouse.move(moveBox.x + 40, moveBox.y - 60, { steps: 8 });
  await page.mouse.up();
  await twoFrames();
}

const gripBox = await page.evaluate(() => {
  const el = document.querySelector('[data-story-object-grip]');
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { width: r.width, height: r.height };
});
check(gripBox !== null && gripBox.width >= 43.5 && gripBox.height >= 43.5, `poignée d’échelle/rotation trop petite — ${JSON.stringify(gripBox)}`);

// Le CLAVIER fait tout ce que le pointeur fait (dimension 5).
await page.focus('[data-story-object-move]');
for (let i = 0; i < 4; i += 1) await page.keyboard.press(']');
for (let i = 0; i < 3; i += 1) await page.keyboard.press('+');
await page.keyboard.press('ArrowDown');
await twoFrames();

/* ── 5. le SON se place SUR LA SCÈNE, la LÉGENDE s'écrit ─────────────────── */
await page.click('[data-story-option="sound-plane:foreground"]');
await page.fill('#story-studio-caption-visual', 'Au lever du jour');
await twoFrames();

/* ── 6. PUBLIER, puis RELIRE le document qui part ────────────────────────── */
await page.click('[data-story-publish]');
for (let i = 0; i < 60 && published === null; i += 1) await page.waitForTimeout(150);

check(published !== null, 'AUCUN POST /api/v1/posts n’est parti — rien à relire');
if (published !== null) {
  const objects = published.storyEffects?.scenes?.[0]?.objects ?? [];
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]));
  const texts = objects.filter((o) => o.kind === 'text');

  check(published.type === 'STORY', `type publié ${published.type} — attendu STORY`);
  check(!('content' in published), 'une story ne porte JAMAIS de `content` : son texte vit dans storyEffects');

  /* les DEUX objets texte, chacun le sien */
  check(texts.length === 2, `${texts.length} objet(s) texte publié(s) — attendu 2`);
  check(texts.map((o) => o.id).join(',') === 'text-1,text-2', `identifiants publiés ${texts.map((o) => o.id).join(',')}`);
  check(byId['text-1']?.payload?.text === 'Bonjour', `text-1 porte « ${byId['text-1']?.payload?.text} »`);
  check(byId['text-2']?.payload?.text === 'Hello', `text-2 porte « ${byId['text-2']?.payload?.text} »`);

  /* la LANGUE choisie, sur l'ENVELOPPE */
  check(byId['text-1']?.locale === 'fr', `locale de text-1 ${byId['text-1']?.locale}`);
  check(byId['text-2']?.locale === 'en', `locale de text-2 ${byId['text-2']?.locale} — la langue CHOISIE ne voyage pas`);
  check(!('sourceLanguage' in (byId['text-2']?.payload ?? {})), 'la langue ne doit PAS voyager dans le payload');

  /* le STYLE choisi */
  const p2 = byId['text-2']?.payload ?? {};
  check(p2.textStyle === 'typewriter', `textStyle publié ${p2.textStyle}`);
  check(p2.textEffect === 'longShadow', `textEffect publié ${p2.textEffect}`);
  check(p2.textColor === 'F8B500', `textColor publié ${p2.textColor}`);
  check(p2.textAlign === 'right', `textAlign publié ${p2.textAlign}`);

  /* la POSE — déplacée, tournée, agrandie */
  const t2 = byId['text-2']?.transform ?? {};
  const a2 = byId['text-2']?.anchor ?? {};
  check(a2.x !== 0.5 || a2.y !== 0.5, `l’ancre publiée n’a pas bougé — ${JSON.stringify(a2)}`);
  check(typeof t2.rotation === 'number' && t2.rotation !== 0, `la rotation publiée est ${t2.rotation} — le geste ne la grave pas`);
  check(typeof t2.scale === 'number' && t2.scale > 1, `l’échelle publiée est ${t2.scale} — l’agrandissement ne se grave pas`);
  check(typeof t2.scale === 'number' && t2.scale <= 4, `l’échelle publiée ${t2.scale} dépasse la borne 4`);
  /* text-1, NON touché, reste où il est : un geste ne touche QUE son objet */
  check(byId['text-1']?.anchor?.x === 0.5 && byId['text-1']?.transform?.rotation === 0, 'un geste a déplacé un objet NON sélectionné');

  /* les PLANS — fond, calque, son posé */
  check(byId['background']?.plane === 'content' && byId['background']?.payload?.isBackground === true, 'le fond publié n’est pas un fond');
  check(byId['overlay']?.plane === 'fg', `le calque publié est en plan ${byId['overlay']?.plane} — attendu fg`);
  check(!('isBackground' in (byId['overlay']?.payload ?? {})), 'le calque ne doit PAS se déclarer fond');
  check(byId['sound']?.plane === 'fg', `le son POSÉ est en plan ${byId['sound']?.plane} — attendu fg`);
  check(byId['sound']?.payload?.isBackground === false, `le son POSÉ se déclare encore fond — ${byId['sound']?.payload?.isBackground}`);

  /* la LÉGENDE du média (#6944) — et elle s'adresse par identité SERVEUR */
  check(published.mediaCaption?.[BG.postMediaId] === 'Au lever du jour', `mediaCaption publié ${JSON.stringify(published.mediaCaption)}`);
  check(published.mediaCaption?.[OV.postMediaId] === undefined, 'une légende NON écrite ne doit pas voyager');

  /* les trois médias RÉCLAMÉS, sans quoi la passerelle refuse tout */
  check(
    JSON.stringify(published.mediaIds) === JSON.stringify([BG.postMediaId, OV.postMediaId, SND.postMediaId]),
    `mediaIds publiés ${JSON.stringify(published.mediaIds)}`,
  );
}

check(pageErrors.length === 0, `erreurs de page — ${pageErrors.join(' | ')}`);

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`check-story-plateau : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-story-plateau : vert — ${invariants} invariants : deux objets texte posés, celui-ci déplacé au POINTEUR puis tourné et ` +
    'agrandi au CLAVIER, sa langue et son style choisis ET PEINTS, un son placé sur la scène, une légende écrite — et CHACUNE de ces ' +
    'valeurs relue dans le corps de POST /api/v1/posts, un objet non sélectionné restant intact.',
);
