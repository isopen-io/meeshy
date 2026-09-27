#!/usr/bin/env node
/**
 * LES SOUS-TITRES TRADUITS D'UN APPEL MARCHENT DANS LES DEUX SENS (#8048).
 *
 * Les témoins `bun test` prouvent les LOIS (journal, modes, segment émis,
 * canal) avec des doublures. Aucun ne prouve que ce que le pair DIT s'affiche
 * traduit sur l'écran d'appel, que ce que le lecteur dit PART vers la
 * passerelle sous la forme que son schéma zod accepte, ni que la transcription
 * gravée se relit dans la bulle du fil. Ce gate le mesure dans un navigateur
 * réel, sur le `dist` construit (source fixtures), avec le PAIR qui décroche
 * (`fixtures-call-peer.ts`, une vraie `RTCPeerConnection` dans la page) :
 *
 *  1. un appel se connecte ; le pair ouvre ses sous-titres
 *     (`call:transcription-active`) : le bouton CC — rangé derrière le (…) de
 *     la pilule (#8391) — l'annonce (« votre
 *     interlocuteur les lit déjà »), fait 44 × 44, et la voix du lecteur est
 *     transcrite AVANT qu'il ouvre ses propres sous-titres (la parité iOS :
 *     on transcrit dès qu'un pair lit) ;
 *  2. le pair parle (`call:translated-segment`) ; un toucher sur CC : le mode
 *     TRADUIT affiche la traduction, dans une région `aria-live` polie ; un
 *     second : le mode ORIGINAL rend ce qui a été dit ; un troisième : plus
 *     rien ; `call:transcription-active` part à chaque bascule on/off ;
 *  3. le lecteur parle (une `SpeechRecognition` SIMULÉE — la seule part simulée
 *     du gate, un micro ne dicte rien dans un Chromium sans tête) : un
 *     brouillon puis un final. Le final seul part en `call:transcription-segment`,
 *     sous la forme exacte du schéma de la passerelle (texte, locuteur, langue
 *     du Prisme, bornes, confiance ∈ [0, 1]) ; brouillon et final partent sur
 *     le canal de données `transcription` (`transcript-entry`) ;
 *  4. le journal se déplie (44 × 44), porte les deux voix dans l'ordre ;
 *  5. au raccroché, `bye` part sur le canal et `call:analytics` dit
 *     `transcriptionUsed: true` ;
 *  6. dans le fil, la bulle de l'appel terminé déplie sa transcription gravée
 *     (`GET /calls/:callId/transcript`) : la ligne du pair traduite par le
 *     Prisme du lecteur, la sienne telle quelle, l'original quand aucune
 *     traduction ne sert — puis « Voir l'original » ;
 *  7. SANS reconnaissance vocale (Firefox, la coque Android) : l'écran le dit,
 *     les sous-titres du pair arrivent quand même, rien ne part ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const CC = '[data-call-captions]';
const PEER_SAID = 'Hello, can you hear me?';
const PEER_TRANSLATED = 'Bonjour, tu m’entends ?';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const vanishes = (page, selector, timeout = 8000) => page.waitForSelector(selector, { state: 'detached', timeout }).then(() => true, () => false);
const until = async (probe, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

/* Le pair est armé ; la reconnaissance vocale est une doublure que le gate fait parler. */
const ARM_PEER_AND_SPEECH = (withSpeech) => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  window.__gateSpeech = { started: 0, aborted: 0, langs: [], current: null };
  if (!withSpeech) {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    return;
  }
  class GateRecognition {
    constructor() {
      this.lang = '';
      this.continuous = false;
      this.interimResults = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      window.__gateSpeech.started += 1;
      window.__gateSpeech.langs.push(this.lang);
      window.__gateSpeech.current = this;
    }
    abort() {
      window.__gateSpeech.aborted += 1;
      if (window.__gateSpeech.current === this) window.__gateSpeech.current = null;
    }
    stop() {
      this.abort();
    }
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: GateRecognition, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: GateRecognition, configurable: true });
  window.__gateSay = (transcript, isFinal) => {
    const recognition = window.__gateSpeech.current;
    if (recognition === null || typeof recognition.onresult !== 'function') return false;
    const result = Object.assign([{ transcript, confidence: 0.87 }], { isFinal });
    recognition.onresult({ resultIndex: 0, results: [result] });
    return true;
  };
};

const peer = (page, fn, arg) => page.evaluate(([name, value]) => window.__meeshyFixtureCallPeer?.[name]?.(value), [fn, arg]);
const peerTranscripts = (page, event) => page.evaluate((name) => (window.__meeshyFixtureCallPeer?.transcripts ?? []).filter((entry) => entry.event === name).map((entry) => entry.payload), event);
const peerChannel = (page) =>
  page.evaluate(() =>
    (window.__meeshyFixtureCallPeer?.channelMessages ?? []).map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }),
  );
const peerReports = (page, event) => page.evaluate((name) => (window.__meeshyFixtureCallPeer?.reports ?? []).filter((report) => report.event === name).map((report) => report.payload), event);
const lineTexts = (page) => page.$$eval('[data-call-caption]', (lines) => lines.map((line) => line.textContent ?? ''));
const tapSize = async (locator) => {
  const box = await locator.boundingBox();
  return { ok: box !== null && box.width >= TAP_FLOOR && box.height >= TAP_FLOOR, size: box && [Math.round(box.width), Math.round(box.height)] };
};

/**
 * Les actions vivent derrière le (…) de la pilule (#8391), et en vidéo les
 * commandes s'effacent après 4 s sans geste — jamais les sous-titres : un
 * toucher sur la scène les rappelle, puis le (…) déplie les actions.
 */
const openActions = async (page) => {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 3);
  await page.mouse.move(width / 2 + 8, height / 3 + 8);
  await appears(page, '[data-call-chrome="shown"]');
  const more = page.locator('[data-call-more]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
};

const startConnectedCall = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row] a');
  const first = await page.$eval('[data-row]', (el) => el.getAttribute('data-row'));
  await page.click(`[data-row="${first}"] a`);
  await page.waitForURL(`**/c/${first}`);
  await page.click('[data-thread-call="menu"]');
  await page.getByRole('menuitem', { name: 'Appel vidéo' }).click();
  return appears(page, '[data-call-screen="connected"]', 15_000);
};

/** La forme que `callTranscriptionSegmentSchema` (passerelle) accepte, relue ici champ par champ. */
const segmentProblems = (payload, callId) => {
  const segment = payload?.segment ?? {};
  const problems = [];
  if (payload?.callId !== callId) problems.push(`callId ${payload?.callId}`);
  if (typeof segment.text !== 'string' || segment.text.length < 1 || segment.text.length > 5000) problems.push('text');
  if (typeof segment.speakerId !== 'string' || segment.speakerId === '') problems.push('speakerId');
  if (!Number.isInteger(segment.startMs) || !Number.isInteger(segment.endMs) || segment.startMs < 0 || segment.startMs > segment.endMs) problems.push(`bornes ${segment.startMs}..${segment.endMs}`);
  if (typeof segment.isFinal !== 'boolean') problems.push('isFinal');
  if (typeof segment.confidence !== 'number' || segment.confidence < 0 || segment.confidence > 1) problems.push('confidence');
  if (typeof segment.language !== 'string' || segment.language.length < 2 || segment.language.length > 10) problems.push('language');
  if (segment.id !== undefined && (typeof segment.id !== 'string' || segment.id.length > 64)) problems.push('id');
  return problems;
};

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [width, height, withSpeech] of [
    [390, 844, true],
    [320, 568, false],
  ]) {
    const label = `${width}×${height}${withSpeech ? '' : ' sans reconnaissance vocale'}`;
    const context = await browser.newContext({ viewport: { width, height }, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER_AND_SPEECH, withSpeech);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    try {
      // ------------------------------------------------ 1. le pair ouvre ses sous-titres
      check(await startConnectedCall(page), `${label} : l'appel se connecte au pair`);
      await openActions(page);
      check(await appears(page, CC), `${label} : le bouton des sous-titres est sur l'écran d'appel connecté`);
      const cc = page.locator(CC);
      const ccSize = await tapSize(cc);
      check(ccSize.ok, `${label} : le bouton CC fait au moins ${TAP_FLOOR} (${JSON.stringify(ccSize.size)})`);
      const callId = await page.evaluate(() => window.__meeshyFixtureCallPeer?.callId() ?? null);
      check(typeof callId === 'string' && callId !== '', `${label} : le pair a rejoint l'appel (${callId})`);
      await peer(page, 'transcribing', true);
      check(
        await until(async () => (await cc.getAttribute('aria-label')) === 'Afficher les sous-titres — votre interlocuteur les lit déjà'),
        `${label} : le pair lit ses sous-titres — le bouton l'annonce (« ${await cc.getAttribute('aria-label')} »)`,
      );
      if (withSpeech) {
        check(await until(() => page.evaluate(() => window.__gateSpeech.current !== null)), `${label} : un pair lit — la voix du lecteur est transcrite avant qu'il ouvre ses sous-titres`);
        const langs = await page.evaluate(() => window.__gateSpeech.langs);
        check(langs[0] === 'fr', `${label} : la reconnaissance écoute dans la langue du Prisme du lecteur (${JSON.stringify(langs)})`);
      }

      // ------------------------------------------------ 2. le pair parle, trois modes
      await peer(page, 'speak', { id: 'n-1', text: PEER_SAID, translatedText: PEER_TRANSLATED });
      await openActions(page);
      await cc.click();
      check(await appears(page, '[data-call-captions-panel="translated"]'), `${label} : un toucher ouvre les sous-titres TRADUITS`);
      check(await until(async () => (await lineTexts(page)).some((line) => line.includes(PEER_TRANSLATED))), `${label} : la parole du pair s'affiche TRADUITE (${JSON.stringify(await lineTexts(page))})`);
      check((await page.$('[data-call-caption-lines][aria-live="polite"]')) !== null, `${label} : les sous-titres sont une région aria-live POLIE`);
      check((await page.$eval('[data-call-caption="peer"] [dir="auto"]', (el) => el.getAttribute('dir')).catch(() => null)) === 'auto', `${label} : le texte d'une ligne porte dir="auto" (RTL)`);
      await capture(page, `traduits-${width}x${height}`);
      await openActions(page);
      await cc.click();
      check(await appears(page, '[data-call-captions-panel="original"]'), `${label} : un second toucher passe en langue d'ORIGINE`);
      check(await until(async () => (await lineTexts(page)).some((line) => line.includes(PEER_SAID))), `${label} : le mode original rend ce qui a été dit (${JSON.stringify(await lineTexts(page))})`);
      await openActions(page);
      await cc.click();
      check(await vanishes(page, '[data-call-captions-panel]'), `${label} : un troisième toucher les masque`);
      await openActions(page);
      await cc.click();
      check(await appears(page, '[data-call-captions-panel="translated"]'), `${label} : un quatrième les rouvre, traduits`);
      const actives = (await peerTranscripts(page, 'call:transcription-active')).filter((payload) => payload?.callId === callId).map((payload) => payload.active);
      check(JSON.stringify(actives) === JSON.stringify([true, false, true]), `${label} : call:transcription-active part à chaque bascule on/off (${JSON.stringify(actives)})`);

      if (withSpeech) {
        // ------------------------------------------------ 3. le lecteur parle
        const said = await page.evaluate(() => window.__gateSay('Oui je', false) && window.__gateSay('Oui je t’entends très bien', true));
        check(said, `${label} : la reconnaissance simulée rend un brouillon puis un final`);
        check(await until(async () => (await peerTranscripts(page, 'call:transcription-segment')).length > 0), `${label} : un call:transcription-segment part vers la passerelle`);
        const segments = await peerTranscripts(page, 'call:transcription-segment');
        check(segments.length === 1 && segments[0]?.segment?.isFinal === true, `${label} : seul le FINAL part au socket, jamais le brouillon (${segments.length})`);
        const problems = segmentProblems(segments[0], callId);
        check(problems.length === 0, `${label} : le segment a la forme du schéma de la passerelle (${JSON.stringify(problems)})`);
        check(segments[0]?.segment?.text === 'Oui je t’entends très bien' && segments[0]?.segment?.language === 'fr' && segments[0]?.segment?.confidence === 0.87, `${label} : texte, langue et confiance sont ceux dits (${JSON.stringify(segments[0]?.segment)})`);
        check(await until(async () => (await peerChannel(page)).filter((message) => message?.type === 'transcript-entry').length >= 2), `${label} : brouillon et final partent sur le canal de données « transcription »`);
        const entries = (await peerChannel(page)).filter((message) => message?.type === 'transcript-entry').map((message) => message.entry);
        check(entries.at(-1)?.isFinal === true && entries.at(-1)?.text === 'Oui je t’entends très bien' && entries.at(-1)?.callId === callId && entries.at(-1)?.speakerId === segments[0]?.segment?.speakerId, `${label} : l'entrée du canal a la forme iOS (${JSON.stringify(entries.at(-1))})`);
        check(await appears(page, '[data-call-caption="mine"]'), `${label} : la parole du lecteur s'affiche dans ses sous-titres`);
        check(await appears(page, '[data-call-captions-note="listening"]'), `${label} : l'écran dit que la voix est transcrite`);
      } else {
        check(await appears(page, '[data-call-captions-note="unsupported"]'), `${label} : sans reconnaissance vocale, l'écran le dit`);
        check((await peerTranscripts(page, 'call:transcription-segment')).length === 0, `${label} : sans reconnaissance vocale, rien ne part`);
      }

      // ------------------------------------------------ 4. le journal
      const toggle = page.locator('[data-call-captions-journal-toggle]');
      const toggleSize = await tapSize(toggle);
      check(toggleSize.ok, `${label} : « Journal » fait au moins ${TAP_FLOOR} (${JSON.stringify(toggleSize.size)})`);
      await toggle.click();
      check(await appears(page, '[data-call-captions-journal]'), `${label} : le journal se déplie`);
      const journal = await page.$$eval('[data-call-journal-entry]', (items) => items.map((item) => item.getAttribute('data-call-journal-entry')));
      check(JSON.stringify(journal) === JSON.stringify(withSpeech ? ['peer', 'mine'] : ['peer']), `${label} : le journal porte les voix dans l'ordre (${JSON.stringify(journal)})`);
      await capture(page, `journal-${width}x${height}`);

      if (withSpeech) {
        // ------------------------------------------------ 5. le raccroché
        await openActions(page);
        await page.getByRole('button', { name: 'Raccrocher' }).click();
        check(await appears(page, '[data-call-screen="ended"]'), `${label} : raccrocher termine l'appel`);
        check(await until(async () => (await peerChannel(page)).some((message) => message?.type === 'bye')), `${label} : « bye » part sur le canal de transcription`);
        check(await until(async () => (await peerReports(page, 'call:analytics')).length > 0), `${label} : call:analytics part`);
        const [analytics] = await peerReports(page, 'call:analytics');
        check(analytics?.transcriptionUsed === true, `${label} : call:analytics dit transcriptionUsed (${analytics?.transcriptionUsed})`);
        check(await page.evaluate(() => window.__gateSpeech.current === null && window.__gateSpeech.aborted > 0), `${label} : la reconnaissance vocale est arrêtée`);
      }

      // ------------------------------------------------ 6. la transcription dans la bulle du fil
      await page.goto(`${BASE}/c/c-states`, { waitUntil: 'load' });
      await page.waitForSelector('[data-message]');
      const BUBBLE_TOGGLE = '[data-message="st-call"] [data-call-transcript-toggle]';
      /* Le fil s'ouvre en BAS (le dernier message) et s'y recale le temps de
         mesurer ses lignes : la bulle d'appel est en haut, on y remonte jusqu'à
         ce qu'elle y RESTE une demi-seconde. */
      const reached = await until(async () => {
        await page.evaluate(() => {
          const scroller = document.getElementById('contenu');
          if (scroller !== null) scroller.scrollTop = 0;
        });
        await page.waitForTimeout(500);
        return (await page.$(BUBBLE_TOGGLE)) !== null;
      }, 15_000);
      check(reached, `${label} : la bulle de l'appel terminé propose sa transcription`);
      const open = page.locator(BUBBLE_TOGGLE);
      await open.scrollIntoViewIfNeeded();
      const openSize = await tapSize(open);
      check(openSize.ok, `${label} : « Transcription » fait au moins ${TAP_FLOOR} (${JSON.stringify(openSize.size)})`);
      check((await open.getAttribute('aria-expanded')) === 'false', `${label} : repliée par défaut`);
      await open.click();
      check(await appears(page, '[data-call-transcript="lines"]'), `${label} : la transcription gravée se déplie`);
      check((await open.getAttribute('aria-expanded')) === 'true', `${label} : le bouton dit qu'elle est dépliée`);
      const transcript = await page.$$eval('[data-call-transcript-line]', (lines) => lines.map((line) => [line.getAttribute('data-call-transcript-line'), line.querySelector('[dir="auto"]')?.textContent ?? '']));
      check(
        JSON.stringify(transcript) ===
          JSON.stringify([
            ['peer', 'Salut, tu m’entends ?'],
            ['mine', 'Oui, très bien.'],
            ['peer', 'Great, let’s go over the plan.'],
          ]),
        `${label} : le pair traduit par le Prisme, le lecteur tel quel, l'original quand rien ne sert (${JSON.stringify(transcript)})`,
      );
      await capture(page, `transcription-${width}x${height}`);
      await page.click('[data-call-transcript-original]');
      const originals = await page.$$eval('[data-call-transcript-line] [dir="auto"]', (lines) => lines.map((line) => line.textContent ?? ''));
      check(originals[0] === 'Hi, can you hear me?', `${label} : « Voir l'original » rend ce qui a été dit (${JSON.stringify(originals[0])})`);
    } catch (error) {
      failures.push(`${label} : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
    }
    check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
    await context.close();
  }
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Les sous-titres d’un appel marchent dans les deux sens : le pair se lit traduit, le lecteur part transcrit, la transcription se relit dans le fil.\n');
