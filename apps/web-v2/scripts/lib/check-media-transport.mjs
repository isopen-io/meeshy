/**
 * T1-T5 — LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359), AU NAVIGATEUR. Les
 * témoins unitaires (`media-transport.test.tsx`, `media-viewer.test.tsx`)
 * posent la durée et la position à la main ; ici, c'est Chromium qui décode
 * la vraie vidéo de `media-12` (WebM 7 s, `fixtures-media-grid.ts`) et qui dit
 * où en est la lecture.
 *
 * Fichier À PART de `check-media-grid.mjs` : la grille et la barre sont deux
 * lots, et deux sessions y écrivent (#6303 porte la colonne d'actions de la
 * même visionneuse). `expect` et `setScheme` sont REMIS par l'hôte, jamais
 * redéfinis. `waitForRowSettled` vient de `check-media.mjs`.
 */
import { waitForRowSettled } from './check-media.mjs';

const TRIPLE_VIDEO_ID = 'media-12';

async function scrollUntilMounted(page, scroller, id) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const mounted = await page.evaluate((mid) => document.querySelector(`[data-message="${mid}"]`) !== null, id);
    if (mounted) return;
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(150);
  }
}

const viewerVideoState = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-media-viewer] [data-viewer-page] video');
    if (video === null) return null;
    return { currentTime: video.currentTime, duration: video.duration, muted: video.muted, playbackRate: video.playbackRate };
  });

const topCorridorOpacity = (page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('[data-media-viewer] > div')).opacity);

export async function checkViewerVideoTransport({ browser, BASE, expect, setScheme, scheme }) {
  const label = `[transport/${scheme}]`;
  // La barre parle la LANGUE D'INTERFACE (catalogue `media.video.*`), résolue
  // depuis la langue du navigateur : sans locale posée, Chromium dit `en-US`
  // et ses libellés seraient anglais. Les témoins ci-dessous visent le
  // français, donc la locale est FIXÉE, jamais laissée à la machine.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');

  const scroller = page.locator('main#contenu');
  await scrollUntilMounted(page, scroller, TRIPLE_VIDEO_ID);
  await waitForRowSettled(page, TRIPLE_VIDEO_ID);
  const row = page.locator(`[data-message="${TRIPLE_VIDEO_ID}"]`);
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, TRIPLE_VIDEO_ID);

  // La tuile vidéo ouvre la visionneuse sur un tap HORS de son bouton central
  // (`VideoTile.onExpand`) ; le centre, lui, lit la vidéo sur place. Playwright
  // clique au CENTRE d'un élément par défaut : on vise donc un coin.
  await row.locator('[data-media-tile]').filter({ has: page.locator('video') }).first().click({ position: { x: 10, y: 10 } });
  await page.waitForSelector('[data-media-viewer]');

  // ===== T1 — une fois la vidéo décodée, la piste vit dans le couloir bas, jamais sur le média =====
  const slider = page.locator('[data-viewer-transport-slot] [role="slider"]');
  await slider.waitFor({ state: 'visible', timeout: 8000 });
  expect(
    (await page.locator('[data-media-viewer] [data-viewer-page] [role="slider"]').count()) === 0,
    `${label} la piste n'est jamais posée sur le média`,
  );
  const initial = await viewerVideoState(page);
  expect(
    initial !== null && Number.isFinite(initial.duration) && initial.duration > 6,
    `${label} la vidéo de media-12 a décodé sa durée (${JSON.stringify(initial)})`,
  );

  // ===== T2 — la vidéo avance PENDANT le glissement, pas au relâcher =====
  // La lecture est d'abord ASSURÉE : parcourir ne doit jamais l'arrêter, et le
  // témoin ne peut le dire que si elle jouait avant le geste.
  await page.evaluate(async () => {
    const video = document.querySelector('[data-media-viewer] [data-viewer-page] video');
    video.muted = true;
    if (video.paused) await video.play().catch(() => {});
  });
  const playingBefore = await page.evaluate(() => !document.querySelector('[data-media-viewer] [data-viewer-page] video').paused);
  const box = await slider.boundingBox();
  const middleY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, middleY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, middleY, { steps: 6 });
  const duringDrag = await viewerVideoState(page);
  const expectedDuring = initial.duration * 0.8;
  expect(
    duringDrag !== null && Math.abs(duringDrag.currentTime - expectedDuring) < 0.8,
    `${label} doigt encore posé à 80 % : la lecture y est déjà (${duringDrag?.currentTime} s, attendu ≈ ${expectedDuring.toFixed(2)} s)`,
  );
  await page.mouse.up();
  expect((await topCorridorOpacity(page)) === '1', `${label} parcourir la piste ne bascule pas le plateau en plein cadre`);
  const playingAfter = await page.evaluate(() => !document.querySelector('[data-media-viewer] [data-viewer-page] video').paused);
  expect(
    playingBefore && playingAfter,
    `${label} une vidéo qui jouait joue encore après le parcours — la piste ne met jamais en pause (avant ${playingBefore}, après ${playingAfter})`,
  );
  // Le muet posé pour garantir la lecture est retiré : T3 part d'une vidéo sonore.
  // `volumechange` arrive dans une tâche à part : on attend que la barre l'ait
  // RELU (son bouton redevient « Couper le son ») — ce qui prouve au passage
  // qu'un changement de son fait hors de la barre y est bien reflété.
  await page.evaluate(() => {
    document.querySelector('[data-media-viewer] [data-viewer-page] video').muted = false;
  });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-viewer-transport-slot] button')).some((b) => b.getAttribute('aria-label') === 'Couper le son'),
    null,
    { timeout: 3000 },
  );

  // ===== T3 — le muet agit sur la vidéo sans cacher le chrome =====
  const barLabels = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    buttons: Array.from(document.querySelectorAll('[data-viewer-transport-slot] button')).map((b) => b.getAttribute('aria-label')),
  }));
  expect(
    barLabels.buttons.includes('Couper le son') && barLabels.buttons.includes("Plus d'options"),
    `${label} la barre porte « Couper le son » et « Plus d'options » en français (${JSON.stringify(barLabels)})`,
  );
  await page.locator('[data-viewer-transport-slot]').getByRole('button', { name: 'Couper le son' }).click();
  expect((await viewerVideoState(page))?.muted === true, `${label} « Couper le son » coupe réellement la vidéo`);
  expect((await topCorridorOpacity(page)) === '1', `${label} toucher le muet laisse le chrome visible`);

  // ===== T4 — la vitesse se choisit dans le menu « ⋯ » =====
  await page.locator('[data-viewer-transport-slot]').getByRole('button', { name: "Plus d'options" }).click();
  await page.getByRole('menuitemradio', { name: '1,5×' }).click();
  expect((await viewerVideoState(page))?.playbackRate === 1.5, `${label} choisir 1,5× règle la vitesse de la vidéo`);
  expect((await page.locator('[data-viewer-transport-slot] [role="menu"]').count()) === 0, `${label} le menu se referme après le choix`);

  // ===== T5 — Échap dans le menu referme le menu, jamais la visionneuse =====
  await page.locator('[data-viewer-transport-slot]').getByRole('button', { name: "Plus d'options" }).click();
  await page.getByRole('menuitemradio', { name: '1×' }).focus();
  await page.keyboard.press('Escape');
  expect((await page.locator('[data-viewer-transport-slot] [role="menu"]').count()) === 0, `${label} Échap referme le menu`);
  expect((await page.locator('[data-media-viewer]').count()) === 1, `${label} Échap dans le menu laisse la visionneuse ouverte`);

  // ===== T6 — le double tap latéral (#6369) avance/recule de 10 s, comme iOS =====
  // La vidéo de `media-12` dure ~7 s : le pas de 10 s dépasse toujours la
  // piste, donc chaque bord CLAMPE — la butée seule suffit à prouver le sens
  // du geste, sans dépendre de la position au moment où T6 démarre.
  const stage = page.locator('[data-media-viewer] [data-viewer-page]').filter({ has: page.locator('video') });
  const stageBox = await stage.boundingBox();

  await page.mouse.dblclick(stageBox.x + stageBox.width * 0.1, stageBox.y + stageBox.height / 2);
  await page.waitForTimeout(50);
  const afterBackward = await viewerVideoState(page);
  expect(
    afterBackward !== null && afterBackward.currentTime < 0.5,
    `${label} le double tap au tiers gauche recule, borné à zéro (${afterBackward?.currentTime})`,
  );

  await page.mouse.dblclick(stageBox.x + stageBox.width * 0.9, stageBox.y + stageBox.height / 2);
  await page.waitForTimeout(50);
  const afterForward = await viewerVideoState(page);
  expect(
    afterForward !== null && afterForward.currentTime > afterForward.duration - 0.5,
    `${label} le double tap au tiers droit avance, borné à la fin (${afterForward?.currentTime} / ${afterForward?.duration})`,
  );

  // Y loin du centre vertical : le bouton play/pause (64 px, centré) y couvrirait
  // le double tap et le confondrait avec un rejeu de lecture depuis `ended`.
  await page.mouse.dblclick(stageBox.x + stageBox.width * 0.5, stageBox.y + stageBox.height * 0.15);
  await page.waitForTimeout(50);
  const afterCentre = await viewerVideoState(page);
  expect(
    afterCentre !== null && Math.abs(afterCentre.currentTime - afterForward.currentTime) < 0.3,
    `${label} le double tap au centre ne déplace pas la lecture, aucun double tap n'y est armé (${afterCentre?.currentTime} contre ${afterForward.currentTime})`,
  );
  expect((await page.locator('[data-media-viewer]').count()) === 1, `${label} le double tap latéral laisse la visionneuse ouverte`);

  await context.close();
}
