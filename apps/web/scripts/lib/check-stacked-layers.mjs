/**
 * DEUX COUCHES EMPILÉES : CHAQUE RETOUR EN FERME UNE, LE DERNIER QUITTE LE FIL (#7561).
 *
 * Les détails de la conversation restent montés quand la visionneuse d'un
 * média de leur bande s'ouvre PAR-DESSUS : deux couches, deux entrées
 * d'historique. Un seul `popstate` les fermait toutes les deux (#8078), et le
 * retour suivant ne trouvait plus de couche à fermer ; deux couches refermées
 * dans le même commit ne rendaient qu'une entrée, et le fil gardait une marche
 * fantôme (#7561, témoin unitaire).
 *
 * `use-back-dismiss.test.tsx` dit la même phrase sous happy-dom, qui dispatche
 * `popstate` SYNCHRONEMENT et tourne sur React : ici c'est Chromium qui poste
 * son retour et le bundle LIVRÉ (`preact/compat`) qui l'écoute.
 *
 * Les attentes sont des FAITS (`awaitCondition`) ou la fenêtre du `popstate`
 * posté, bornée par deux images encadrant une tâche — jamais un délai (#7054).
 */

import { awaitCondition } from './await-fact.mjs';

const THREAD_PATH = '/c/c-deploiement';

const letThePostedPopStateLand = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
      }),
  );

/** Les feuilles VIVANTES : la copie qui joue la sortie (`[data-dialog-ghost]`) n'en est plus une. */
const liveSheets = (page) =>
  page.evaluate(() => {
    const live = (selector) =>
      [...document.querySelectorAll(selector)].filter((el) => el.closest('[data-dialog-ghost]') === null).length;
    return {
      details: live('dialog[open] [data-conversation-details]'),
      viewer: live('[data-media-viewer]'),
    };
  });

const awaitSheets = (page, expected) =>
  awaitCondition(
    page,
    ({ details, viewer }) => {
      const live = (selector) =>
        [...document.querySelectorAll(selector)].filter((el) => el.closest('[data-dialog-ghost]') === null).length;
      return live('dialog[open] [data-conversation-details]') === details && live('[data-media-viewer]') === viewer;
    },
    expected,
  );

const pathnameOf = (page) => new URL(page.url()).pathname;

export async function checkStackedLayers({ browser, BASE, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}${THREAD_PATH}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-message]');

    /* La porte de l'avatar (en-tête replié) ou le titre (en-tête déplié) : les deux ouvrent les détails d'un groupe. */
    const door = page.locator('[data-thread-avatar-door], [data-thread-title-details]');
    if ((await door.count()) === 0) return expect(false, 'couches empilées : l’en-tête du fil n’ouvre pas les détails');
    await door.first().click();
    if (!(await awaitSheets(page, { details: 1, viewer: 0 }))) return expect(false, 'couches empilées : les détails de la conversation s’ouvrent');

    /* La bande des médias arrive après l'ouverture de la feuille : on attend sa première vignette. */
    await awaitCondition(page, () => document.querySelector('dialog[open] [data-media-hub-tile]') !== null);
    const tile = page.locator('dialog[open] [data-media-hub-tile]').first();
    if ((await tile.count()) === 0) return expect(false, 'couches empilées : la bande des médias des détails porte une vignette');
    await tile.click();
    const stacked = await awaitSheets(page, { details: 1, viewer: 1 });
    expect(stacked, 'couches empilées : la visionneuse s’ouvre PAR-DESSUS les détails, restés ouverts');
    if (!stacked) return false;
    await letThePostedPopStateLand(page);

    await page.goBack();
    await awaitSheets(page, { details: 1, viewer: 0 });
    await letThePostedPopStateLand(page);
    const afterFirst = await liveSheets(page);
    expect(
      afterFirst.viewer === 0 && afterFirst.details === 1,
      `couches empilées : le premier retour ferme la visionneuse SEULE (${JSON.stringify(afterFirst)})`,
    );
    expect(pathnameOf(page) === THREAD_PATH, `couches empilées : le premier retour reste dans le fil (${pathnameOf(page)})`);

    await page.goBack();
    await awaitSheets(page, { details: 0, viewer: 0 });
    await letThePostedPopStateLand(page);
    const afterSecond = await liveSheets(page);
    expect(
      afterSecond.viewer === 0 && afterSecond.details === 0,
      `couches empilées : le deuxième retour ferme les détails (${JSON.stringify(afterSecond)})`,
    );
    expect(pathnameOf(page) === THREAD_PATH, `couches empilées : le deuxième retour reste dans le fil (${pathnameOf(page)})`);

    await page.goBack();
    expect(pathnameOf(page) !== THREAD_PATH, `couches empilées : le troisième retour quitte le fil (${pathnameOf(page)})`);
    return true;
  } finally {
    await page.close();
    await context.close();
  }
}
