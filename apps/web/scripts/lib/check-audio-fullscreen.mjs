/**
 * LE LECTEUR AUDIO PLEIN ÉCRAN (#8333), AU NAVIGATEUR — miroir d'`AudioFullscreenView`
 * iOS. Les témoins unitaires (`viewer-audio-page.test.tsx`) posent les événements
 * à la main ; ici Chromium décode les vraies pistes WAV de `c-medias`
 * (`fixtures-media.ts`) : l'appui d'agrandissement de la bulle de media-2 ouvre la
 * page audio, la transcription et la piste sont servies en français (rang 1 du
 * lecteur), lecture et pause basculent réellement `audio.paused`, la flèche passe
 * au vocal suivant de la conversation, Échap ferme et rend le focus à la bulle.
 *
 * `expect` et `setScheme` sont REMIS par l'hôte, jamais redéfinis.
 */
import { awaitCondition } from './await-fact.mjs';
import { waitForRowSettled } from './check-media.mjs';

const VOICE_EN_MESSAGE_ID = 'media-2';
const VOICE_EN_ATTACHMENT_ID = 'media-2-a1';
const VOICE_DE_ATTACHMENT_ID = 'media-3-a1';

const scrollUntilMounted = (page, id) =>
  awaitCondition(
    page,
    (mid) => {
      if (document.querySelector(`[data-message="${mid}"]`) !== null) return true;
      const scroller = document.querySelector('main#contenu');
      if (scroller !== null) scroller.scrollTop = 0;
      return false;
    },
    id,
  );

const pageAudio = (page, id) =>
  page.evaluate((aid) => {
    const audio = document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] audio`);
    return audio === null ? null : { paused: audio.paused, track: audio.getAttribute('data-viewer-audio-track') };
  }, id);

export async function checkAudioFullscreen({ browser, BASE, expect, setScheme, scheme }) {
  const label = `[plein écran audio/${scheme}]`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');

  await scrollUntilMounted(page, VOICE_EN_MESSAGE_ID);
  await waitForRowSettled(page, VOICE_EN_MESSAGE_ID);
  const row = page.locator(`[data-message="${VOICE_EN_MESSAGE_ID}"]`);
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, VOICE_EN_MESSAGE_ID);

  // ===== A1 — l'appui d'agrandissement de la bulle ouvre la page audio, jamais la page image =====
  const expand = page.locator(`[data-attachment="${VOICE_EN_ATTACHMENT_ID}"] [data-voice-expand]`);
  expect((await expand.getAttribute('aria-label')) === 'Ouvrir en plein écran', `${label} la bulle offre « Ouvrir en plein écran »`);
  await expand.click();
  const audioPage = page.locator(`[data-media-viewer] [data-viewer-audio="${VOICE_EN_ATTACHMENT_ID}"]`);
  await audioPage.waitFor({ state: 'visible', timeout: 8000 });
  expect((await page.locator('[data-media-viewer] [data-viewer-page] img').count()) === 0, `${label} la pièce audio ne tombe pas sur la page image`);
  expect(
    (await page.locator('[data-media-viewer]').getAttribute('role')) === 'dialog' &&
      (await page.locator('[data-media-viewer]').getAttribute('aria-modal')) === 'true',
    `${label} le lecteur est un dialogue modal`,
  );

  // ===== A2 — la transcription ET la piste sont servies au Prisme du lecteur =====
  const transcript = audioPage.locator('[data-viewer-audio-transcript]');
  const transcriptLang = await transcript.getAttribute('lang');
  const transcriptText = await transcript.innerText();
  const served = await pageAudio(page, VOICE_EN_ATTACHMENT_ID);
  expect(
    transcriptLang === 'fr' && transcriptText.startsWith('Bonjour') && served?.track === 'fr',
    `${label} transcription et piste en français, d'une seule descente (lang=${transcriptLang}, piste=${served?.track})`,
  );

  // ===== A3 — lecture et pause basculent RÉELLEMENT l'élément =====
  const play = audioPage.locator('[data-viewer-audio-play]');
  if ((await pageAudio(page, VOICE_EN_ATTACHMENT_ID))?.paused !== false) await play.click();
  await page.waitForFunction(
    (aid) => document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] audio`)?.paused === false,
    VOICE_EN_ATTACHMENT_ID,
    { timeout: 5000 },
  );
  expect((await play.getAttribute('aria-label')) === 'Mettre en pause', `${label} en lecture, le bouton dit « Mettre en pause »`);
  await play.click();
  await page.waitForFunction(
    (aid) => document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] audio`)?.paused === true,
    VOICE_EN_ATTACHMENT_ID,
    { timeout: 5000 },
  );
  expect(true, `${label} « Mettre en pause » arrête réellement la lecture`);
  expect((await page.locator('[data-media-viewer] [data-viewer-top-bar]').evaluate((el) => getComputedStyle(el).opacity)) === '1', `${label} toucher les commandes laisse le chrome visible`);

  // ===== A4 — le balayage passe au vocal suivant de la conversation =====
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    (aid) => document.querySelector('[data-media-viewer]')?.getAttribute('data-viewer-attachment') === aid,
    VOICE_DE_ATTACHMENT_ID,
    { timeout: 5000 },
  );
  expect(true, `${label} la flèche droite passe au vocal suivant (${VOICE_DE_ATTACHMENT_ID})`);

  // ===== A5 — Échap ferme le lecteur, sans quitter le fil =====
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('[data-media-viewer]') === null, null, { timeout: 5000 });
  expect(page.url().endsWith('/c/c-medias'), `${label} Échap ferme le lecteur et laisse le fil ouvert (${page.url()})`);

  await context.close();
}
