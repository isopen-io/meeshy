#!/usr/bin/env node
/**
 * **LA BANDE DU COMPOSEUR OCCULTE CE QUI PASSE DESSOUS** (#7143).
 *
 * Le fil a DEUX bords flottants depuis #6213. Celui du HAUT porte le verre
 * (`thread-header glass`) ; celui du BAS n'a jamais rien porté — ni fond, ni
 * `backdrop-filter`. Le fil transitait donc sous une bande **entièrement
 * transparente**, et le rail (⏱ 👁 ✨ 😀 FR), la pilule « Message… » et les
 * réactions rapides se peignaient PAR-DESSUS des bulles restées parfaitement
 * lisibles : deux textes entrelacés.
 *
 * ## POURQUOI AUCUN GATE NE LE VOYAIT
 *
 * À la position de REPOS, la réserve basse du défileur (`useThreadInsets`)
 * laisse la bande vide — et c'est cette position que tous les gates mesuraient.
 * Le défaut n'apparaît qu'une fois le fil REMONTÉ : par un geste, ou par un
 * saut à la citation (défilement programmatique, qui ne révèle même pas le
 * chrome — D-50).
 *
 * ## CE QUI EST MESURÉ ICI : L'EFFET, PAS LE REMÈDE
 *
 * Vérifier que `.thread-composer-chrome` porte `glass-prominent` mesurerait le
 * CORRECTIF, pas son résultat — un gate qui verdirait sur une classe posée au
 * mauvais endroit, ou rendue inopérante par un `background: transparent` plus
 * spécifique.
 *
 * Ce gate compare donc **deux captures de la même bande** : l'une au repos (la
 * réserve basse la laisse vide), l'autre le fil REMONTÉ (des bulles passent
 * dessous). Si la bande occulte, les deux images sont IDENTIQUES. Si le texte
 * transparaît, elles diffèrent — et l'écart se mesure sans seuil arbitraire sur
 * le contenu du chrome, qui est le même dans les deux prises.
 *
 * Le chrome est laissé au REPOS (≥ 2 s après `touchend`) dans les deux cas :
 * on ne mesure pas un escamotage en cours, mais la bande telle qu'on la lit.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'rendus');

const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;
await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const CONVERSATION = 'c-rattrapage';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;

/**
 * **LES PLAFONDS SONT ARBITRÉS SUR UNE MESURE, PAS CHOISIS** — même discipline
 * que les densités de D-51 (« arbitrées sur une mesure de contraste, pas
 * moyennées »). Les deux états ont été mesurés, sur les mêmes prises :
 *
 * ```
 *                     écart max      écart moyen
 *   SANS le verre     222,3 / 207,4   7,70 / 9,15   ← le texte est LU au travers
 *   AVEC le verre       6,9 /   6,2   0,71 / 0,58   ← il n'en reste qu'un fantôme
 * ```
 *
 * Le matériau divise l'écart maximal par **32** et le moyen par **12**. Les
 * plafonds se posent entre les deux, avec la marge qu'un rendu demande — assez
 * bas pour rougir dès qu'un texte redevient lisible (il faudrait que l'écart
 * sextuple), assez haut pour ne pas tomber sur une variation d'antialiasing.
 *
 * Captures REGARDÉES dans les deux schémas (`composeur-repos-*`,
 * `composeur-remonte-*`) : le rail, la pilule « Message… » et les réactions
 * sont nets ; ce qui passe dessous ne se lit plus.
 */
const ECART_MAX = 40;
const ECART_MOYEN = 3;

const browser = await launchChromium();

/** Le DOIGT, jamais la molette — le même geste que `check-thread-chrome.mjs`. */
const touch = (page, kind, dy = 0) =>
  page.evaluate(
    ({ kind, dy }) => {
      const el = document.querySelector('main');
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const point = (clientY) => new Touch({ identifier: 1, target: el, clientX: x, clientY });
      if (kind === 'start') {
        const t = point(y);
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      if (kind === 'move') {
        el.scrollTop -= dy;
        const t = point(y + dy);
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      const t = point(y);
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], targetTouches: [], changedTouches: [t] }));
    },
    { kind, dy },
  );

const openThread = async (scheme) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });
  await context.addInitScript(
    ({ scheme, key }) => {
      try {
        localStorage.setItem('meeshy.scheme', scheme);
        localStorage.setItem(key, 'focal');
      } catch {
        /* navigation privée : le repli HTML tient pour la page seule. */
      }
    },
    { scheme, key: MODE_KEY },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main li', { timeout: 20_000 });
  await page.waitForTimeout(900);
  page.__context = context;
  return page;
};

const close = async (page) => {
  await page.close();
  await page.__context.close();
};

/** La bande telle qu'on la LIT : chrome révélé, au repos. */
const bande = async (page, nom) => {
  const boite = await page.evaluate(() => {
    const el = document.querySelector('.thread-composer-chrome');
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  if (boite === null || boite.height === 0) return null;
  const png = await page.screenshot({ clip: boite });
  await writeFile(join(CAPTURES, `${nom}.png`), png);
  return { png, base64: png.toString('base64') };
};

/**
 * **L'ÉCART DE LUMINANCE ENTRE DEUX PRISES**, calculé dans la page — Chromium
 * décode les PNG, Node ne le fait pas sans dépendance.
 *
 * Ce n'est PAS une comparaison à l'identique : un verre à 92 % laisse passer
 * 8 %, donc l'image ne peut pas être strictement inchangée. Ce qu'on mesure est
 * ce qui RESTE d'un texte au travers — et c'est bien la question du critère,
 * « aucun texte de rangée n'est LISIBLE ».
 */
const ecartLuminance = (page, a, b) =>
  page.evaluate(
    async ([a, b]) => {
      const charger = (base64) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = `data:image/png;base64,${base64}`;
        });
      const [ia, ib] = await Promise.all([charger(a), charger(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return null;
      const lire = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = [lire(ia), lire(ib)];
      let max = 0;
      let somme = 0;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        const la = 0.2126 * da[i] + 0.7152 * da[i + 1] + 0.0722 * da[i + 2];
        const lb = 0.2126 * db[i] + 0.7152 * db[i + 1] + 0.0722 * db[i + 2];
        const d = Math.abs(la - lb);
        if (d > max) max = d;
        somme += d;
        n += 1;
      }
      return { max: Math.round(max * 10) / 10, moyen: Math.round((somme / n) * 100) / 100, pixels: n };
    },
    [a, b],
  );

/**
 * CE QUI PASSE SOUS LA BANDE, mesuré plutôt que supposé : sans une rangée
 * dessous, les deux captures seraient identiques QUOI QU'IL ARRIVE, et le gate
 * verdirait en ne mesurant rien.
 */
const texteSousLaBande = (page) =>
  page.evaluate(() => {
    const bande = document.querySelector('.thread-composer-chrome')?.getBoundingClientRect();
    if (bande === undefined) return 0;
    return [...document.querySelectorAll('main li p')].filter((p) => {
      const r = p.getBoundingClientRect();
      const texte = (p.textContent ?? '').trim();
      return texte !== '' && r.top < bande.bottom && r.bottom > bande.top;
    }).length;
  });

for (const scheme of ['light', 'dark']) {
  /* ---------------------------------------------- 1. le GESTE remonte le fil */
  const page = await openThread(scheme);

  const auRepos = await bande(page, `composeur-repos-${scheme}`);
  expect(auRepos !== null, `${scheme} · la bande du composeur est mesurable au repos`);
  expect((await texteSousLaBande(page)) === 0, `${scheme} · au repos, la réserve basse laisse la bande vide (contre-épreuve)`);

  await touch(page, 'start');
  for (let i = 0; i < 6; i += 1) await touch(page, 'move', 90);
  await touch(page, 'end');
  /* LE REPOS, pas l'escamotage : on lit la bande telle qu'elle se pose. */
  await page.waitForTimeout(2500);

  const sousLaBande = await texteSousLaBande(page);
  expect(sousLaBande > 0, `${scheme} · fil remonté : ${sousLaBande} rangée(s) de texte passent sous la bande — sans quoi ce gate ne mesure RIEN`);

  const remonte = await bande(page, `composeur-remonte-${scheme}`);
  expect(remonte !== null, `${scheme} · la bande reste mesurable le fil remonté`);
  const ecart = auRepos !== null && remonte !== null ? await ecartLuminance(page, auRepos.base64, remonte.base64) : null;
  expect(
    ecart !== null && ecart.max <= ECART_MAX && ecart.moyen <= ECART_MOYEN,
    `${scheme} · GESTE : ce qui passe sous la bande n'y est plus LISIBLE — écart ${JSON.stringify(ecart)} (plafonds ${ECART_MAX} / ${ECART_MOYEN})`,
  );

  /* ------------------------------------- 2. le texte reste ATTEIGNABLE dessus */
  const atteignable = await page.evaluate(() => {
    const bande = document.querySelector('.thread-composer-chrome')?.getBoundingClientRect();
    if (bande === undefined) return null;
    const rangee = [...document.querySelectorAll('main li')]
      .map((li) => ({ li, r: li.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom <= bande.top && r.height > 20)
      .at(-1);
    if (rangee === undefined) return null;
    const x = Math.round(rangee.r.left + rangee.r.width / 2);
    const y = Math.round(rangee.r.bottom - 8);
    const touche = document.elementFromPoint(x, y);
    return { atteinte: rangee.li.contains(touche), quoi: touche?.className?.toString().slice(0, 60) ?? null };
  });
  expect(
    atteignable !== null && atteignable.atteinte,
    `${scheme} · la rangée JUSTE AU-DESSUS de la bande reçoit son geste — ${JSON.stringify(atteignable)}`,
  );

  await close(page);
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.log(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.log(`    · ${f}`);
  process.exit(1);
}

console.log('\n  check-composer-band : vert — la bande du composeur occulte ce qui passe dessous, dans les deux schémas,');
console.log('  et le texte qui la borde reste atteignable au doigt.');
