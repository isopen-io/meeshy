#!/usr/bin/env node
/**
 * LES LIENS, LES MENTIONS ET LES QUATRE EMPHASES — DANS UN VRAI NAVIGATEUR (#7032).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : le découpage
 * (`segmentText`), l'appariement de chaque adresse à `ROUTES`, l'arbre
 * d'accessibilité de la rangée plate. **Aucun ne traverse le RENDU RÉEL.** Un
 * `<a>` peut exister dans le balisage et ne mener nulle part ; une route peut
 * être déclarée et son écran ne jamais se peindre ; une emphase peut être
 * découpée et rendue par la mauvaise balise. Ce gate mesure ce que la page
 * FAIT, sur le `dist` construit :
 *
 *  1. **CONVERSATION** — une mention validée est un `<a>`, un CLIC y change
 *     l'adresse ET peint le profil (pas « introuvable ») ; un pseudo que le
 *     serveur n'a PAS validé reste du texte ;
 *  2. **LE HASHTAG EN CONVERSATION EST UN CONTRE-TÉMOIN** — mesuré : aucune
 *     jointure message ↔ hashtag n'existe dans le schéma, donc `#livraison`
 *     doit rester du TEXTE ici. Ce témoin NÉGATIF est ce qui empêche un lot
 *     ultérieur d'installer, au nom de la parité, un lien vers un écran que le
 *     serveur ne peut pas servir (loi 4 : un contrôle existe s'il a un effet) ;
 *  3. **LES QUATRE EMPHASES** rendent `<strong>`, `<em>`, `<u>`, `<s>` — et
 *     `snake_case`, dans la MÊME phrase, ne rend rien du tout ;
 *  4. **LE TEXTE TRADUIT** — le témoin est écrit sur un rang AUTRE que le
 *     premier (leçon 261) : la bulle `rt-6` est ESPAGNOLE et porte une
 *     traduction ANGLAISE, jamais française. Le prisme du lecteur étant
 *     `['fr', 'en']`, c'est le rang 2 qui sert. Un rendu qui n'enrichirait que
 *     l'original montrerait l'espagnol ; un rendu qui ne descendrait qu'au
 *     rang 1 ne montrerait rien. Seul le bon rend la mention cliquable DANS la
 *     phrase anglaise ;
 *  5. **RIEN D'HOSTILE NE DEVIENT ACTIF** — aucun `href` ne porte un autre
 *     schéma que `http(s)` ou `/`, aucun `<script>` n'entre dans le document
 *     par un message, et un `[x](javascript:…)` reste des caractères ;
 *  6. **PUBLICATION** — c'est là, et là seulement, que le hashtag est un lien,
 *     et il mène à un écran qui SERT des publications ;
 *  7. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;

/* `serviceWorker: false` — ce gate ne mesure pas le précache, et le SW
   servirait des réponses d'un build précédent. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const CONVERSATION = 'c-texte-enrichi';
const HANDLE = 'kwame-mensah';
const TAG = 'livraison';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

/** Le paragraphe enrichi d'une bulle donnée — le site unique du rendu. */
const richOf = (page, messageId) =>
  page.$eval(`[data-message="${messageId}"] [data-rich-text]`, (el) => ({
    html: el.innerHTML,
    texte: (el.textContent ?? '').trim(),
    hrefs: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    balises: [...el.querySelectorAll('strong, em, u, s')].map((n) => `${n.tagName.toLowerCase()}:${(n.textContent ?? '').trim()}`),
  }));

const browser = await launchChromium();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // ------------------------------------------------ 1. la conversation
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message="rt-2"] [data-rich-text]');
  await page.waitForTimeout(250);
  await capture(page, 'conversation');

  const mention = await richOf(page, 'rt-2');
  check(mention.hrefs.length === 1 && mention.hrefs[0] === `/u/${HANDLE}`, `une mention VALIDÉE est un lien vers son profil — ${JSON.stringify(mention.hrefs)}`);
  check(mention.texte.includes('@fantome'), 'le pseudo NON validé reste lisible dans la phrase');
  check(!mention.html.includes('>@fantome<'), 'le pseudo NON validé n’est pas un nœud à part — la phrase ne se coupe pas autour de lui');
  check(mention.texte.includes(`@${HANDLE}`), 'la mention garde son arobase à l’affichage');

  // ------------------------------------------------ 2. le hashtag, CONTRE-témoin
  const hashtag = await richOf(page, 'rt-5');
  check(hashtag.hrefs.length === 0, `en CONVERSATION, #${TAG} ne devient PAS un lien — aucune jointure message ↔ hashtag n'existe (${JSON.stringify(hashtag.hrefs)})`);
  check(hashtag.texte.includes(`#${TAG}`), `et #${TAG} reste lisible comme du texte`);

  // ------------------------------------------------ 3. les quatre emphases
  const emphase = await richOf(page, 'rt-4');
  const attendues = ['strong:important', 'em:urgent', 'u:noté', 's:annulé'];
  check(JSON.stringify(emphase.balises) === JSON.stringify(attendues), `les QUATRE emphases rendent leur balise porteuse de sens — ${JSON.stringify(emphase.balises)}`);
  check(!/[*~]|__/.test(emphase.texte), `aucun marqueur d'emphase ne reste à l'écran — « ${emphase.texte} »`);
  check(emphase.texte.includes('snake_case'), 'snake_case traverse le rendu INTACT — un tiret bas dans un mot ne souligne rien');
  check(!emphase.html.includes('<u>case'), 'et snake_case n’a produit aucune balise');

  /* ------------------------------------------------ 4. le TEXTE TRADUIT, au rang 2
     CE TÉMOIN EXIGE SON PROPRE CONTEXTE, et c'est la mesure qui l'a dit.
     En fixtures, le prisme est `resolveUserLanguagesOrdered({systemLanguage:
     'fr'}, {deviceLocale: navigator.language})` (`src/lib/reader.ts`). Sous la
     locale `fr-FR` du reste de ce gate, le rang 1 et le rang 4 se DÉDUPLIQUENT
     : le prisme retombe à `['fr']` — UN seul échelon. Or `rt-6` est espagnol
     et ne porte qu'une traduction anglaise : à un seul échelon, la loi sert
     l'ORIGINAL (règle 1 du Prisme), et le témoin mesurait donc l'espagnol tout
     en ayant l'air de parler de traduction.
     `en-US` donne au lecteur le prisme `['fr', 'en']` — deux échelons, le
     minimum pour qu'une descente soit OBSERVABLE (leçon 261, et le
     doc-comment de `reader.ts` nomme exactement ce piège). L'anglais y est
     servi au rang 2 : le témoin ne peut plus passer par accident. */
  const rangContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const rangPage = await rangContext.newPage();
  rangPage.setDefaultTimeout(10_000);
  const rangErrors = [];
  rangPage.on('pageerror', (error) => rangErrors.push(error.message));
  await rangPage.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await rangPage.waitForSelector('[data-message="rt-6"] [data-rich-text]');
  await rangPage.waitForTimeout(250);

  const traduit = await richOf(rangPage, 'rt-6');
  check(traduit.texte.startsWith('Hi '), `prisme ['fr','en'] : la bulle sert le RANG 2 (anglais), pas l'original espagnol — « ${traduit.texte} »`);
  check(
    traduit.hrefs.includes(`/u/${HANDLE}`),
    `L'ENRICHISSEMENT PORTE SUR LE TEXTE TRADUIT — la mention est cliquable dans la phrase anglaise (${JSON.stringify(traduit.hrefs)})`,
  );
  check(traduit.hrefs.includes('https://meeshy.me/en'), `et le lien enrichi est celui de la TRADUCTION, pas celui de l'original (${JSON.stringify(traduit.hrefs)})`);
  check(
    (await richOf(page, 'rt-6')).texte.startsWith('Hola '),
    'CONTRE-TÉMOIN DE RANG : sous un prisme d’un seul échelon (`fr`), la MÊME bulle sert son original espagnol — la descente est bien ce qui distingue les deux',
  );
  check(rangErrors.length === 0, `aucune erreur de page sous le prisme à deux échelons — ${JSON.stringify(rangErrors)}`);
  await capture(rangPage, 'traduit-rang-2');
  await rangContext.close();

  // ------------------------------------------------ 5. rien d'hostile n'est actif
  const lien = await richOf(page, 'rt-3');
  check(lien.hrefs.length === 1 && lien.hrefs[0] === 'https://meeshy.me/notes/7021', `une URL devient un lien — ${JSON.stringify(lien.hrefs)}`);
  check(lien.texte.includes('javascript:alert(1)'), 'un `javascript:` reste des CARACTÈRES, visibles dans la phrase');
  const externe = await page.$eval(`[data-message="rt-3"] [data-rich-text] a`, (a) => a.getAttribute('rel'));
  check((externe ?? '').includes('noopener') && (externe ?? '').includes('noreferrer'), `un lien externe ne cède ni son onglet ni son adresse d'origine — rel="${externe}"`);

  const hostiles = await page.$$eval('[data-rich-text] a', (els) => els.map((a) => a.getAttribute('href')).filter((h) => h !== null && !/^(https?:\/\/|\/)/.test(h)));
  check(hostiles.length === 0, `AUCUN href de toute la page ne porte un schéma autre que http(s) ou une adresse interne — ${JSON.stringify(hostiles)}`);
  check(await page.$eval('main', (el) => el.querySelectorAll('script').length === 0), 'aucun <script> n’est entré dans le document par un message');

  // ------------------------------------------------ 6. le CLIC mène quelque part
  await page.click(`[data-message="rt-2"] [data-rich-text] a`);
  await page.waitForURL(`**/u/${HANDLE}`);
  const profil = await page.waitForSelector('[data-user-profile]', { timeout: 8000 }).then(() => true, () => false);
  check(profil, 'CLIQUER une mention peint le profil — la route existe VRAIMENT, le lien ne ment pas');
  const nom = await page.$eval('[data-user-profile]', (el) => (el.textContent ?? '')).catch(() => '');
  check(nom.includes('Kwame'), `et le profil ouvert est bien CELUI de la personne mentionnée — « ${nom.slice(0, 60)} »`);
  await capture(page, 'profil-public');

  // ------------------------------------------------ 7. la PUBLICATION, où le hashtag est un lien
  await page.goto(`${BASE}/hashtag/${TAG}`, { waitUntil: 'load' });
  const servies = await page.waitForSelector('[data-feed-card="post"]', { timeout: 8000 }).then(() => true, () => false);
  check(servies, `/hashtag/${TAG} SERT des publications — l'écran que le hashtag d'une publication promet existe`);
  await capture(page, 'hashtag');

  const carte = await page.$eval('[data-feed-card="post"] [data-rich-text]', (el) => ({
    hrefs: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    balises: [...el.querySelectorAll('strong, em, u, s')].map((n) => n.tagName.toLowerCase()),
  }));
  check(carte.hrefs.includes(`/hashtag/${TAG}`), `en PUBLICATION, #${TAG} EST un lien — c'est la seule surface où il en est un (${JSON.stringify(carte.hrefs)})`);
  check(carte.hrefs.includes(`/u/${HANDLE}`), `et la mention d'une publication l'est aussi (${JSON.stringify(carte.hrefs)})`);
  check(carte.balises.includes('strong'), `et l'emphase d'une publication rend sa balise (${JSON.stringify(carte.balises)})`);

  check(errors.length === 0, `aucune erreur de page — ${JSON.stringify(errors)}`);
  await context.close();
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Liens, mentions et les quatre emphases : cliquables, inoffensifs, et jusque sur le texte TRADUIT.\n');
