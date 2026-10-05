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
 * #9279 — `checkMiniPlayerParity` : le mini-lecteur s'efface dans la
 * conversation du vocal (la bulle en devient la télécommande), reparaît ailleurs
 * SOUS « Reprendre l'appel », et son toucher ouvre la conversation du vocal,
 * comme iOS.
 *
 * #9294 — ce toucher ouvre la conversation SUR la bulle du vocal (`?message=`,
 * mise en évidence du saut), les étapes tournent dans les deux schémas, et le
 * vocal dure trente secondes : aucune ne court plus contre la fin du son.
 *
 * `expect` et `setScheme` sont REMIS par l'hôte, jamais redéfinis.
 */
import { waitForRowSettled } from './check-media.mjs';
import { contrastOf } from './contrast.mjs';

const VOICE_EN_MESSAGE_ID = 'media-2';
const VOICE_EN_ATTACHMENT_ID = 'media-2-a1';
const VOICE_DE_ATTACHMENT_ID = 'media-3-a1';
const UNTRANSCRIBED_MESSAGE_ID = 'media-17';
const UNTRANSCRIBED_ATTACHMENT_ID = 'media-17-a1';
const RESUME_FROM_SECONDS = 1.2;
/* Un appel vivant côté serveur, comme `check-calls-join.mjs` § 7 : « Reprendre l'appel » paraît hors du fil de Kwame. */
const ACTIVE_CALL_KEY = 'meeshy.fixtures.active-call';
const LIVE_CALL = 'call-kwame-live';

const rowMounted = (page, id) => page.evaluate((mid) => document.querySelector(`[data-message="${mid}"]`) !== null, id);

/**
 * #9265 (suivi) — `awaitCondition` s'ARRÊTE dès le premier montage observé,
 * sans continuer à corriger `scrollTop` ensuite : le virtualiseur mesure
 * encore les rangées voisines à cet instant (même course que #6221,
 * doc-comment de `check-media.mjs:waitForRowSettled`) et peut démonter la
 * rangée une seconde fois avant que `waitForRowSettled` ne la mesure — qui ne
 * lève jamais sur une rangée absente, elle rend simplement la main après son
 * propre budget. Le `row.evaluate(...)` de l'appelant attendait alors une
 * rangée qui ne remonterait plus, jusqu'à son propre timeout (30 s). On
 * reboucle donc mount PUIS settle PUIS re-vérifie la présence, en reprenant
 * la remontée si la rangée a disparu entre les deux.
 */
const scrollUntilMounted = async (page, id) => {
  const scroller = page.locator('main#contenu');
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (await rowMounted(page, id)) {
      await waitForRowSettled(page, id);
      if (await rowMounted(page, id)) return true;
    }
    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(100);
  }
  return false;
};

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

  const mounted = await scrollUntilMounted(page, VOICE_EN_MESSAGE_ID);
  expect(mounted, `${label} le vocal media-2 est atteint et stable avant l'appui`);
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
  /* Effacé dans la conversation du vocal (#9279), on le ferme par son bouton sans le voir. */
  if ((await leftover.count()) > 0) await leftover.evaluate((button) => button.click());
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
  /* #9279 — dans la conversation du vocal, le mini-lecteur s'efface et la
     bulle en devient la télécommande : la mettre en pause arrête LE son. */
  expect(!(await mini.isVisible()), `${label} dans la conversation du vocal, le mini-lecteur s'efface`);
  await page.locator(`[data-attachment="${UNTRANSCRIBED_ATTACHMENT_ID}"] button`).first().click();
  await page.waitForFunction((aid) => document.querySelector(`[data-mini-audio-player="${aid}"] audio`)?.paused === true, UNTRANSCRIBED_ATTACHMENT_ID, { timeout: 5000 });
  expect(true, `${label} la pause de la bulle arrête la lecture confiée`);
}

const audioTimeAt = (page, selector) =>
  page.evaluate((query) => {
    const audio = document.querySelector(query);
    return audio === null ? null : { paused: audio.paused, time: audio.currentTime };
  }, selector);

/**
 * LA MISE EN ÉVIDENCE DU VOCAL, ENREGISTRÉE (#9294) — elle s'efface à 1600 ms
 * (`HIGHLIGHT_MS`) : on l'ARME avant le toucher et on attend le FAIT noté,
 * jamais une lecture après un délai (même loi que `check-summary.mjs`).
 */
const armRowHighlight = (page, messageId) =>
  page.evaluate((mid) => {
    const lit = () => {
      const row = document.querySelector(`main li [data-message="${mid}"]`);
      if (row === null) return false;
      const bg = getComputedStyle(row).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    };
    const state = { seen: false };
    window.__vocalHighlight = state;
    const observer = new MutationObserver(() => {
      if (!lit()) return;
      state.seen = true;
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
  }, messageId);

/**
 * #9279 — LE MINI-LECTEUR REJOINT iOS (`MiniAudioPlayerBar`), sous un appel
 * vivant côté serveur pour que « Reprendre l'appel » soit à l'écran :
 *  B1 fermer le plein écran dans le fil du vocal : il s'efface, la bulle dit
 *     « Mettre en pause » ;
 *  B2 ailleurs il reparaît, SOUS le bandeau d'appel, sans le chevaucher ;
 *  B3 son toucher ouvre la conversation du vocal SUR sa bulle (#9294), mise
 *     en évidence et à l'écran sans défilement : la lecture continue, il s'y
 *     efface et la bulle montre la lecture à la même seconde ;
 *  B4 la bulle commande LE son ; B5 hors du fil, « Fermer » le retire.
 */
export async function checkMiniPlayerParity({ browser, BASE, expect, setScheme, scheme }) {
  const label = `[mini-lecteur/${scheme}]`;
  const aid = UNTRANSCRIBED_ATTACHMENT_ID;
  const miniAudio = `[data-mini-audio-player="${aid}"] audio`;
  const pageAudioSelector = `[data-media-viewer] [data-viewer-audio="${aid}"] audio`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await setScheme(context, scheme);
  await context.addInitScript(
    ([key, id]) => {
      try {
        localStorage.setItem(key, id);
      } catch {}
    },
    [ACTIVE_CALL_KEY, LIVE_CALL],
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-medias`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');
  await page.waitForSelector(`[data-call-resume="${LIVE_CALL}"]`, { timeout: 8000 });

  await scrollUntilMounted(page, UNTRANSCRIBED_MESSAGE_ID);
  await waitForRowSettled(page, UNTRANSCRIBED_MESSAGE_ID);
  await page.locator(`[data-message="${UNTRANSCRIBED_MESSAGE_ID}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await waitForRowSettled(page, UNTRANSCRIBED_MESSAGE_ID);
  await page.locator(`[data-attachment="${aid}"] [data-voice-expand]`).click();
  await page.locator(`[data-media-viewer] [data-viewer-audio="${aid}"]`).waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForFunction(
    (query) => {
      const audio = document.querySelector(query);
      return audio !== null && audio.paused === false && audio.currentTime >= 0.4;
    },
    pageAudioSelector,
    { timeout: 8000 },
  );
  await page.keyboard.press('Escape');

  // ===== B1 — fermer dans le fil du vocal : le mini-lecteur s'efface, la bulle dit la lecture =====
  await page.waitForFunction(
    ({ query, id }) =>
      document.querySelector('[data-media-viewer]') === null &&
      document.querySelector('[data-mini-audio-concealed]') !== null &&
      document.querySelector(query)?.paused === false &&
      document.querySelector(`[data-attachment="${id}"] button`)?.getAttribute('aria-label') === 'Mettre en pause',
    { query: miniAudio, id: aid },
    { timeout: 8000 },
  );
  const mini = page.locator(`[data-mini-audio-player="${aid}"]`);
  const bubble = page.locator(`[data-attachment="${aid}"] button`).first();
  expect(!(await mini.isVisible()), `${label} dans la conversation du vocal, le mini-lecteur s'efface et la bulle dit « Mettre en pause »`);

  // ===== B2 — ailleurs, il reparaît sous « Reprendre l'appel », sans le chevaucher =====
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await mini.waitFor({ state: 'visible', timeout: 8000 });
  const banner = await page.locator(`[data-call-resume="${LIVE_CALL}"]`).boundingBox();
  const bar = await mini.boundingBox();
  expect(
    banner !== null && bar !== null && banner.y + banner.height <= bar.y,
    `${label} hors de la conversation, le mini-lecteur reparaît SOUS le bandeau d'appel, sans chevauchement (bandeau ${JSON.stringify(banner)}, lecteur ${JSON.stringify(bar)})`,
  );
  const titleContrast = await contrastOf(page, `[data-mini-audio-player="${aid}"] [data-mini-audio-title]`);
  expect(titleContrast !== null && titleContrast >= 4.5, `${label} l'auteur du vocal se lit sur l'aplat du mini-lecteur (contraste ${titleContrast?.toFixed(2)} ≥ 4.5)`);

  // ===== B3 — le toucher ouvre la conversation du vocal (iOS : onMiniPlayerTap) ; la lecture continue, la bulle la montre =====
  const before = await audioTimeAt(page, miniAudio);
  await armRowHighlight(page, UNTRANSCRIBED_MESSAGE_ID);
  await mini.locator('[data-mini-audio-open]').click();
  await page.waitForURL(`**/c/c-medias?message=${UNTRANSCRIBED_MESSAGE_ID}`, { timeout: 8000 });
  await page.waitForFunction(() => window.__vocalHighlight?.seen === true, null, { timeout: 8000 });
  expect(true, `${label} le toucher ouvre la conversation SUR le vocal : sa rangée est mise en évidence, sans défilement à la main`);
  await waitForRowSettled(page, UNTRANSCRIBED_MESSAGE_ID);
  const onScreen = await page.evaluate((mid) => {
    const row = document.querySelector(`main li [data-message="${mid}"]`)?.getBoundingClientRect();
    const main = document.querySelector('main#contenu')?.getBoundingClientRect();
    return row !== undefined && main !== undefined && row.bottom > main.top && row.top < main.bottom;
  }, UNTRANSCRIBED_MESSAGE_ID);
  expect(onScreen, `${label} la bulle du vocal est à l'écran à l'ouverture`);
  await page.waitForFunction(
    ({ query, id, from }) => {
      const audio = document.querySelector(query);
      const slider = document.querySelector(`[data-attachment="${id}"] [role="slider"]`);
      return (
        document.querySelector('[data-mini-audio-concealed]') !== null &&
        audio !== null &&
        audio.paused === false &&
        audio.currentTime >= from &&
        document.querySelector(`[data-attachment="${id}"] button`)?.getAttribute('aria-label') === 'Mettre en pause' &&
        slider !== null &&
        Math.abs(Number(slider.getAttribute('aria-valuenow')) - audio.currentTime) <= 1
      );
    },
    { query: miniAudio, id: aid, from: before?.time ?? 0 },
    { timeout: 8000 },
  );
  const after = await audioTimeAt(page, miniAudio);
  const shown = await page.locator(`[data-attachment="${aid}"] [role="slider"]`).getAttribute('aria-valuenow');
  expect(
    before !== null && before.paused === false && after !== null && after.paused === false && after.time >= before.time && !(await mini.isVisible()),
    `${label} toucher le mini-lecteur ouvre la conversation du vocal (${new URL(page.url()).pathname}) : la lecture continue sans coupure (${before?.time.toFixed(2)} → ${after?.time.toFixed(2)} s), le mini-lecteur s'y efface, et la bulle dit « Mettre en pause » à la même seconde (${shown} s)`,
  );

  // ===== B4 — la bulle commande LE son, sans en ouvrir un second =====
  await bubble.click();
  await page.waitForFunction(
    ({ query, id }) =>
      document.querySelector(query)?.paused === true && document.querySelector(`[data-attachment="${id}"] button`)?.getAttribute('aria-label') === "Lire l'audio",
    { query: miniAudio, id: aid },
    { timeout: 5000 },
  );
  expect(true, `${label} la pause de la bulle arrête LE son, et la bulle le dit (« Lire l'audio »)`);
  await bubble.click();
  await page.waitForFunction((query) => document.querySelector(query)?.paused === false, miniAudio, { timeout: 5000 });
  expect(
    (await page.locator('[data-attachment] audio').evaluateAll((all) => all.filter((audio) => !audio.paused).length)) === 0,
    `${label} la bulle relance la lecture confiée, sans ouvrir un second son`,
  );

  // ===== B5 — hors du fil, « Fermer le lecteur » le retire =====
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await mini.waitFor({ state: 'visible', timeout: 8000 });
  await mini.locator('[data-mini-audio-close]').click();
  await page.waitForFunction(() => document.querySelector('[data-mini-audio-player]') === null, null, { timeout: 5000 });
  expect(true, `${label} « Fermer le lecteur » le retire`);

  await context.close();
}
