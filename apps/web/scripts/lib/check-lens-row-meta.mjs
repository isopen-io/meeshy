import { awaitCondition } from './await-fact.mjs';

/**
 * 14 — L'HEURE ET LES POINTS D'UNE RANGÉE NE PARAISSENT QU'AU DÉFILEMENT
 * (#9570, directive porteur 2026-10-07).
 *
 * `bun test` prouve la loi (l'attribut posé hors React, aucune rangée
 * re-rendue) et la FORME de la feuille de style ; il ne peut pas prouver que
 * le navigateur l'APPLIQUE — happy-dom ne calcule aucune cascade. Ce témoin
 * lit l'opacité CALCULÉE de `.lens-row-meta` dans Chromium :
 *
 *  a. l'ouverture la montre UNE fois (relevé par un observateur posé AVANT le
 *     premier script de la page : un relevé après coup raterait une fenêtre
 *     de 900 ms sur un agent chargé), puis la liste revient au repos —
 *     opacité nulle, aucun attribut sur le défileur ;
 *  b. au repos, le lecteur d'écran garde l'heure : ni `aria-hidden`, ni
 *     `display: none`, ni `visibility: hidden` sur le chemin ;
 *  c. un défilement à la MOLETTE (un geste réel, jamais un `scrollTo` du
 *     code, qui ne doit rien révéler) la montre, puis elle s'efface ;
 *  d. le focus clavier d'une rangée, puis son survol, montrent les siens ;
 *  e. la place est RÉSERVÉE : la boîte de l'heure ne bouge pas entre repos et
 *     révélation ;
 *  f. « animations réduites » : même visibilité, sans fondu.
 *
 * Extrait dès sa naissance : l'hôte (`check-list-actions.mjs`) est au seuil
 * de découpage de 1000 lignes (CLAUDE.md § Code Style). `check` est REMIS par
 * l'hôte, jamais redéfini.
 */
const META = (row) => `[data-row="${row}"] .lens-row-meta`;

const atRest = (selector) => {
  const meta = document.querySelector(selector);
  return meta !== null && getComputedStyle(meta).opacity === '0' && document.getElementById('contenu')?.dataset.rowMeta === undefined;
};

const shown = (selector) => {
  const meta = document.querySelector(selector);
  return meta !== null && getComputedStyle(meta).opacity === '1';
};

const revealedByScroll = (selector) => {
  const meta = document.querySelector(selector);
  return meta !== null && getComputedStyle(meta).opacity === '1' && document.getElementById('contenu')?.dataset.rowMeta === 'revealed';
};

/** La boîte de MISE EN PAGE de l'heure dans sa rangée — `offset*`, que ni la
 *  perspective (`transform`) ni l'opacité ne touchent. La hauteur de ligne
 *  seule, jamais `offsetTop` : la rangée ÉLUE au défilement ouvre son
 *  supplément au-dessus du nom, ce qui recentre la colonne — un mouvement de
 *  la magnification, pas de cette feuille. */
const timeBox = (selector) => {
  const time = document.querySelector(`${selector} [data-time]`);
  if (time === null) return null;
  return { left: time.offsetLeft, width: time.offsetWidth, height: time.offsetHeight };
};

const OBSERVE_ROW_META = () => {
  const seen = [];
  Object.defineProperty(window, '__rowMetaSeen', { value: seen });
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target instanceof HTMLElement && record.target.id === 'contenu') seen.push(record.target.dataset.rowMeta ?? null);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-row-meta'] });
};

export async function checkLensRowMetaRest({ browser, base, row, check }) {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const label = reducedMotion === 'reduce' ? 'animations réduites' : 'animations';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', reducedMotion });
    await context.addInitScript(OBSERVE_ROW_META);
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector(META(row));
    await page.mouse.move(2, 2);

    check(await awaitCondition(page, atRest, META(row)), `${label} : au repos, l'heure et les points d'une rangée sont effacés (opacité 0, aucun attribut)`);
    const opening = await page.evaluate(() => window.__rowMetaSeen ?? []);
    check(
      opening[0] === 'revealed' && opening.includes(null),
      `${label} : l'ouverture les a montrés UNE fois, puis effacés (${JSON.stringify(opening)})`,
    );

    const spoken = await page.$eval(`[data-row="${row}"] [data-time]`, (time) => {
      const hidden = (node) => {
        const style = getComputedStyle(node);
        return node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden';
      };
      const chain = [];
      for (let node = time; node instanceof Element; node = node.parentElement) chain.push(node);
      return { hidden: chain.some(hidden), text: (time.textContent ?? '').trim() };
    });
    check(!spoken.hidden && spoken.text !== '', `${label} : au repos, le lecteur d'écran lit toujours l'heure (« ${spoken.text} »)`);

    const restBox = await page.evaluate(timeBox, META(row));
    await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 60 }));
    check(await awaitCondition(page, atRest, META(row), { timeoutMs: 1_500 }), `${label} : un défilement du CODE ne révèle rien`);

    const list = await page.$eval('#contenu', (el) => {
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await page.mouse.move(list.x, list.y);
    await page.mouse.wheel(0, 120);
    check(await awaitCondition(page, revealedByScroll, META(row)), `${label} : à la molette, l'heure et les points paraissent`);
    const revealedBox = await page.evaluate(timeBox, META(row));
    check(
      restBox !== null && restBox.width > 0 && JSON.stringify(restBox) === JSON.stringify(revealedBox),
      `${label} : la place est réservée — la boîte de l'heure ne bouge pas (${JSON.stringify(restBox)} → ${JSON.stringify(revealedBox)})`,
    );
    await page.mouse.move(2, 2);
    check(await awaitCondition(page, atRest, META(row)), `${label} : l'arrêt du défilement les efface de nouveau`);

    await page.focus(`[data-row="${row}"] a[href^="/c/"]:not([aria-hidden])`);
    check(await awaitCondition(page, shown, META(row)), `${label} : le focus clavier d'une rangée montre les siens`);
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    check(await awaitCondition(page, atRest, META(row)), `${label} : le focus parti, ils s'effacent`);

    await page.hover(`[data-row="${row}"] [data-name]`);
    check(await awaitCondition(page, shown, META(row)), `${label} : le survol d'une rangée montre les siens`);
    await page.mouse.move(2, 2);

    /* Sous « animations réduites », la règle globale d'`app.css` ramène déjà
       toute transition à 0,01 ms (`!important`) : « aucun fondu » se lit donc
       comme une durée sous la milliseconde, jamais comme `0s` littéral. */
    const duration = await page.$eval(META(row), (el) => Number.parseFloat(getComputedStyle(el).transitionDuration));
    check(
      reducedMotion === 'reduce' ? duration < 0.001 : duration >= 0.1,
      `${label} : ${reducedMotion === 'reduce' ? 'aucun fondu' : 'un fondu'} (transition-duration ${duration}s)`,
    );
    await context.close();
  }
}
