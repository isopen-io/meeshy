/**
 * LE LECTEUR AUDIO PLEIN ÉCRAN (#8333), AU NAVIGATEUR — miroir d'`AudioFullscreenView`
 * iOS. Les témoins unitaires (`viewer-audio-page.test.tsx`) posent les événements
 * à la main ; ici Chromium décode les vraies pistes WAV de `c-medias`
 * (`fixtures-media.ts`) : l'appui d'agrandissement de la bulle de media-2 ouvre la
 * page audio, la transcription et la piste sont servies en français (rang 1 du
 * lecteur), lecture et pause basculent réellement `audio.paused`, la flèche passe
 * au vocal suivant de la conversation, Échap ferme et rend le focus à la bulle.
 *
 * #9256 — les trois écarts avec iOS, sur le vocal SANS transcription du corpus
 * (media-17) : « Transcrire » rend la transcription servie au Prisme,
 * « Traduire » demande une langue dont la piste se joue aussitôt, et fermer
 * pendant la lecture confie le vocal au mini-lecteur, qui reprend à la même
 * seconde.
 *
 * `expect` et `setScheme` sont REMIS par l'hôte, jamais redéfinis.
 */
import { awaitCondition } from './await-fact.mjs';
import { waitForRowSettled } from './check-media.mjs';

const VOICE_EN_MESSAGE_ID = 'media-2';
const VOICE_EN_ATTACHMENT_ID = 'media-2-a1';
const VOICE_DE_ATTACHMENT_ID = 'media-3-a1';
const UNTRANSCRIBED_MESSAGE_ID = 'media-17';
const UNTRANSCRIBED_ATTACHMENT_ID = 'media-17-a1';
const RESUME_FROM_SECONDS = 1.2;

/**
 * MONTER une rangée du haut du fil (#9281) : la boucle de `check-media.mjs`
 * (remonter, laisser 150 ms au fil), puis descendre d'un tiers d'écran par pas.
 *
 * L'ancienne forme reposait `scrollTop = 0` à CHAQUE sondage d'`awaitCondition`
 * (25 ms) : le fil, épinglé au bas tant qu'il se mesure, défaisait chaque
 * remontée avant qu'elle ne charge quoi que ce soit, et `media-2` ne montait
 * jamais — rouge dès #8333. Et une fois au sommet, la fenêtre du virtualiseur
 * s'arrête sur `media-8` et ses grilles, plus anciens que les vocaux : il faut
 * redescendre pour atteindre `media-2` ou `media-17`.
 */
async function scrollUntilMounted(page, id) {
  const scroller = page.locator('main#contenu');
  const mounted = () => page.evaluate((mid) => document.querySelector(`[data-message="${mid}"]`) !== null, id);
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (await mounted()) return;
    const atTop = await scroller.evaluate((el) => el.scrollTop === 0);
    if (atTop) break;
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(150);
  }
  for (let step = 1; step <= 40; step += 1) {
    if (await mounted()) return;
    await scroller.evaluate((el) => {
      el.scrollTop += el.clientHeight / 3;
    });
    await page.waitForTimeout(150);
  }
}

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
  /* Le vocal allemand a pu finir avant Échap, ou partir au mini-lecteur : on
     repart d'un écran sans lecture confiée, quel que soit le cas. */
  const leftover = page.locator('[data-mini-audio-player] [data-mini-audio-close]');
  if ((await leftover.count()) > 0) await leftover.click();
  await page.waitForFunction(() => document.querySelector('[data-mini-audio-player]') === null, null, { timeout: 5000 });

  await checkOnDemandAndCarry({ page, label, expect });

  await context.close();
}

/** #9256 — transcrire, traduire, puis fermer pendant la lecture : le mini-lecteur reprend. */
async function checkOnDemandAndCarry({ page, label, expect }) {
  await scrollUntilMounted(page, UNTRANSCRIBED_MESSAGE_ID);
  await waitForRowSettled(page, UNTRANSCRIBED_MESSAGE_ID);
  await page.locator(`[data-message="${UNTRANSCRIBED_MESSAGE_ID}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, UNTRANSCRIBED_MESSAGE_ID);
  await page.locator(`[data-attachment="${UNTRANSCRIBED_ATTACHMENT_ID}"] [data-voice-expand]`).click();
  const audioPage = page.locator(`[data-media-viewer] [data-viewer-audio="${UNTRANSCRIBED_ATTACHMENT_ID}"]`);
  await audioPage.waitFor({ state: 'visible', timeout: 8000 });

  // ===== A6 — « Transcrire » rend la transcription, servie au Prisme du lecteur =====
  const transcribe = audioPage.locator('[data-viewer-audio-transcribe]');
  expect((await transcribe.innerText()).includes('Transcrire'), `${label} sans transcription, le lecteur offre « Transcrire »`);
  await transcribe.click();
  await page.waitForFunction(
    (aid) => document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] [data-viewer-audio-transcript]`) !== null,
    UNTRANSCRIBED_ATTACHMENT_ID,
    { timeout: 5000 },
  );
  const transcript = audioPage.locator('[data-viewer-audio-transcript]');
  expect(
    (await transcript.getAttribute('lang')) === 'fr' && (await transcript.innerText()).startsWith('Point du jour') && (await transcribe.count()) === 0,
    `${label} « Transcrire » rend la transcription en français, et le bouton se retire`,
  );

  // ===== A7 — « Traduire » demande une langue ; sa piste ET son texte se servent, d'une seule descente =====
  await audioPage.locator('[data-viewer-audio-translate]').click();
  const toEnglish = audioPage.locator('[data-viewer-audio-translate-to="en"]');
  expect((await toEnglish.getAttribute('aria-label')) === 'Traduire en anglais', `${label} « Traduire » offre l'anglais (« Traduire en anglais »)`);
  await toEnglish.click();
  await page.waitForFunction(
    (aid) => {
      const root = document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"]`);
      const audio = root?.querySelector('audio');
      return audio?.getAttribute('data-viewer-audio-track') === 'en' && audio.paused === false && root?.querySelector('[data-viewer-audio-transcript]')?.getAttribute('lang') === 'en';
    },
    UNTRANSCRIBED_ATTACHMENT_ID,
    { timeout: 8000 },
  );
  expect(
    (await audioPage.locator('[data-viewer-audio-language="en"]').getAttribute('aria-pressed')) === 'true' &&
      (await transcript.innerText()).startsWith('Daily update'),
    `${label} la version anglaise arrive, se joue, et la transcription la suit`,
  );

  // ===== A8 — fermer pendant la lecture : le mini-lecteur reprend à la même seconde =====
  await page.waitForFunction(
    ({ aid, from }) => (document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] audio`)?.currentTime ?? 0) >= from,
    { aid: UNTRANSCRIBED_ATTACHMENT_ID, from: RESUME_FROM_SECONDS },
    { timeout: 8000 },
  );
  const closedAt = await page.evaluate((aid) => document.querySelector(`[data-media-viewer] [data-viewer-audio="${aid}"] audio`)?.currentTime ?? 0, UNTRANSCRIBED_ATTACHMENT_ID);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    ({ aid, from }) => {
      if (document.querySelector('[data-media-viewer]') !== null) return false;
      const audio = document.querySelector(`[data-mini-audio-player="${aid}"] audio`);
      return audio !== null && audio.paused === false && audio.currentTime >= from;
    },
    { aid: UNTRANSCRIBED_ATTACHMENT_ID, from: closedAt - 0.1 },
    { timeout: 8000 },
  );
  const mini = page.locator(`[data-mini-audio-player="${UNTRANSCRIBED_ATTACHMENT_ID}"]`);
  expect(
    (await mini.locator('audio').getAttribute('data-mini-audio-track')) === 'en' && (await mini.getAttribute('data-mini-audio-status')) === 'playing',
    `${label} fermer pendant la lecture confie le vocal au mini-lecteur : même piste (en), lecture continue depuis ${closedAt.toFixed(2)} s`,
  );
  await mini.locator('[data-mini-audio-close]').click();
  await page.waitForFunction(() => document.querySelector('[data-mini-audio-player]') === null, null, { timeout: 5000 });
  expect(true, `${label} « Fermer le lecteur » arrête la lecture et retire le mini-lecteur`);
}
