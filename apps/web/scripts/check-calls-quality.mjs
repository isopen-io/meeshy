#!/usr/bin/env node
/**
 * LA QUALITÉ D'UN APPEL S'ADAPTE AU RÉSEAU ET SE VOIT (#8047).
 *
 * Les témoins `bun test` prouvent les LOIS (paliers, survie, rapports) avec des
 * doublures de WebRTC. Aucun ne prouve qu'une vidéo suspendue CESSE d'arriver
 * chez le pair pendant que sa voix continue, ni qu'elle revient : un
 * `setParameters` refusé, posé sur le mauvais émetteur ou sur l'audio les
 * laissent tous verts. Ce gate le mesure dans un navigateur réel, sur le `dist`
 * construit (source fixtures), avec le PAIR qui décroche (`fixtures-call-peer.ts`,
 * une vraie `RTCPeerConnection` dans la page) :
 *
 *  1. un appel VIDÉO se connecte au pair, qui DÉCODE nos images ;
 *  2. l'indicateur de qualité est dans l'en-tête (cible de 44, nom qui dit le
 *     niveau) et s'ouvre sur son détail — perte, latence, gigue, débits —, qui
 *     tient dans l'écran (320 × 568 compris) et se referme ;
 *  3. un `call:quality-report` part vers la passerelle, horodaté en ISO ;
 *  4. RÉSEAU DÉGRADÉ SIMULÉ : `getStats` rend 20 % de perte et 600 ms de
 *     latence. La pastille « réseau faible » paraît, puis « vidéo ralentie »
 *     (gel à 2 i/s : le pair reçoit PEU d'images), puis « vidéo en pause » : le
 *     pair ne décode PLUS aucune image — pendant que ses paquets AUDIO
 *     continuent d'augmenter à chaque seconde ;
 *  5. le réseau revient : les pastilles s'effacent, les images reviennent chez
 *     le pair, l'audio n'a jamais cessé ;
 *  6. les alertes du pair : `call:quality-alert` dit « la connexion de Nadia
 *     Benali est instable », `call:screen-capture-alert` est une ALERTE
 *     (`role="alert"`) qui s'efface quand la capture cesse ;
 *  7. au raccroché, `call:analytics` part avec le codec RÉELLEMENT négocié,
 *     une répartition de qualité qui somme à 1 et `platform: 'web'` ;
 *  8. aucune erreur de page.
 *
 * Ce qui est SIMULÉ est la MESURE du réseau (`RTCPeerConnection.getStats`,
 * enveloppé par le script d'initialisation) : un réseau réellement dégradé ne
 * se commute pas en cours d'appel dans un Chromium sans tête. Ce qui est RÉEL
 * est tout le reste — la décision, l'encodage appliqué (`setParameters`), et ce
 * que le pair reçoit ou ne reçoit plus.
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
const PEER_NAME = 'Nadia Benali';
const INDICATOR = '[data-call-quality]';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const vanishes = (page, selector, timeout = 8000) => page.waitForSelector(selector, { state: 'detached', timeout }).then(() => true, () => false);

/* Le pair est armé ; `getStats` passe par un commutateur de réseau que le gate bascule. */
const ARM_PEER_AND_NETWORK = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  window.__gateNetwork = 'good';
  const original = RTCPeerConnection.prototype.getStats;
  RTCPeerConnection.prototype.getStats = async function getStats(...args) {
    const report = await original.apply(this, args);
    if (window.__gateNetwork !== 'bad') return report;
    const degraded = new Map();
    report.forEach((entry, id) => {
      if (entry.type === 'candidate-pair') degraded.set(id, { ...entry, currentRoundTripTime: 0.6 });
      else if (entry.type === 'inbound-rtp' && typeof entry.packetsReceived === 'number') degraded.set(id, { ...entry, packetsLost: Math.round(entry.packetsReceived * 0.25) });
      else degraded.set(id, entry);
    });
    return degraded;
  };
};

const network = (page, state) => page.evaluate((next) => void (window.__gateNetwork = next), state);
const peerFrames = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.videoFrames() ?? 0);
const peerAudio = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.audioPackets() ?? 0);
const peerReports = (page, event) => page.evaluate((name) => (window.__meeshyFixtureCallPeer?.reports ?? []).filter((report) => report.event === name).map((report) => report.payload), event);

/** Les images que le pair décode pendant `ms`. */
const framesDuring = async (page, ms) => {
  const before = await peerFrames(page);
  await page.waitForTimeout(ms);
  return (await peerFrames(page)) - before;
};

/**
 * La voix du pair, suivie à chaque seconde pendant qu'on attend `selector` :
 * rend si le sélecteur est venu, et si chaque seconde a apporté des paquets.
 */
const whileAudioFlows = async (page, waitFor, timeout) => {
  const audioGaps = [];
  let last = await peerAudio(page);
  const deadline = Date.now() + timeout;
  let reached = false;
  while (Date.now() < deadline && !reached) {
    await page.waitForTimeout(1000);
    const now = await peerAudio(page);
    if (now <= last) audioGaps.push(now);
    last = now;
    reached = await waitFor();
  }
  return { reached, audioGaps };
};

const startConnectedVideoCall = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row] a');
  const first = await page.$eval('[data-row]', (el) => el.getAttribute('data-row'));
  await page.click(`[data-row="${first}"] a`);
  await page.waitForURL(`**/c/${first}`);
  await page.click('[data-thread-call="menu"]');
  await page.getByRole('menuitem', { name: 'Appel vidéo' }).click();
  return appears(page, '[data-call-screen="connected"]', 15_000);
};

/**
 * En vidéo, les commandes s'effacent après 4 s sans geste (#8391) : un toucher
 * sur la scène les rappelle, comme le ferait la personne en appel.
 */
const wakeChrome = async (page, width, height) => {
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.move(width / 2 + 8, height / 2 + 8);
  await appears(page, '[data-call-chrome="shown"]');
};

const inViewport = (box, width, height) => box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 0.5 && box.y + box.height <= height + 0.5;

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [width, height, full] of [
    [390, 844, true],
    [320, 568, false],
  ]) {
    const label = `${width}×${height}`;
    const context = await browser.newContext({ viewport: { width, height }, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER_AND_NETWORK);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    try {
      // ------------------------------------------------ 1. un appel vidéo connecté
      check(await startConnectedVideoCall(page), `${label} : l'appel vidéo se connecte au pair`);
      check((await framesDuring(page, 2000)) > 10, `${label} : le pair décode nos images`);

      // ------------------------------------------------ 2. l'indicateur et son détail
      check(await appears(page, INDICATOR), `${label} : l'indicateur de qualité paraît dans l'en-tête`);
      const indicator = page.locator(INDICATOR);
      const box = await indicator.boundingBox();
      check(box !== null && box.width >= TAP_FLOOR && box.height >= TAP_FLOOR, `${label} : l'indicateur fait au moins ${TAP_FLOOR} (${JSON.stringify(box && [Math.round(box.width), Math.round(box.height)])})`);
      const name = (await indicator.getAttribute('aria-label')) ?? '';
      check(/ — Qualité de l’appel : (excellente|bonne)$/.test(name), `${label} : l'indicateur DIT le niveau d'un lien sain (« ${name} »)`);
      await indicator.click();
      check(await appears(page, '[data-call-quality-detail]'), `${label} : un toucher ouvre le détail`);
      const rows = await page.$$eval('[data-call-quality-row]', (cells) => cells.map((cell) => [cell.getAttribute('data-call-quality-row') ?? '', cell.textContent ?? '']));
      const measures = rows.filter(([key]) => !['call.quality.profile', 'call.quality.audioCap', 'call.quality.videoCap'].includes(key)).map(([, text]) => text);
      check(measures.length === 5 && measures.every((row) => /\d/.test(row)), `${label} : perte, latence, gigue et débits sont chiffrés (${JSON.stringify(measures)})`);
      const caps = Object.fromEntries(rows);
      check(caps['call.quality.profile'] !== undefined && caps['call.quality.profile'] !== '' && /\d/.test(caps['call.quality.audioCap'] ?? '') && /\d/.test(caps['call.quality.videoCap'] ?? ''), `${label} : le profil de données et ses plafonds se lisent (#8697) (${JSON.stringify(caps)})`);
      check(inViewport(await page.locator('[data-call-quality-detail]').boundingBox(), width, height), `${label} : le détail tient dans l'écran`);
      await capture(page, `detail-${width}x${height}`);
      const close = page.locator('[data-call-quality-close]');
      const closeBox = await close.boundingBox();
      check(closeBox !== null && closeBox.width >= TAP_FLOOR && closeBox.height >= TAP_FLOOR, `${label} : « Fermer » fait au moins ${TAP_FLOOR}`);
      await close.click();
      check(await vanishes(page, '[data-call-quality-detail]'), `${label} : le détail se referme`);

      if (full) {
        // ------------------------------------------------ 3. le rapport de qualité
        const reports = await peerReports(page, 'call:quality-report');
        check(reports.length > 0 && typeof reports[0]?.stats?.timestamp === 'string' && !Number.isNaN(Date.parse(reports[0].stats.timestamp)), `${label} : un call:quality-report horodaté ISO part vers la passerelle (${reports.length})`);

        // ------------------------------------------------ 4. le réseau se dégrade
        await network(page, 'bad');
        check(await appears(page, '[data-call-pill="poor-network"]', 8000), `${label} : réseau dégradé — la pastille « Connexion instable » paraît`);
        check((await indicator.getAttribute('data-call-quality')) === 'poor', `${label} : l'indicateur passe au niveau faible`);
        const frozen = await whileAudioFlows(page, () => page.$('[data-call-pill="video-frozen"]').then((el) => el !== null), 15_000);
        check(frozen.reached, `${label} : un lien mauvais tenu GÈLE la vidéo (« vidéo ralentie »)`);
        const frozenFrames = await framesDuring(page, 3000);
        check(frozenFrames <= 12, `${label} : gelée, la vidéo arrive à quelques images par seconde (${frozenFrames} en 3 s)`);
        await capture(page, 'video-gelee');
        const suspended = await whileAudioFlows(page, () => page.$('[data-call-pill="video-suspended"]').then((el) => el !== null), 15_000);
        check(suspended.reached, `${label} : le gel ne suffisant pas, la vidéo est SUSPENDUE (« vidéo en pause, l'audio continue »)`);
        await page.waitForTimeout(1500);
        const suspendedFrames = await framesDuring(page, 3000);
        check(suspendedFrames <= 1, `${label} : suspendue, le pair ne décode plus aucune image (${suspendedFrames} en 3 s)`);
        const audioBefore = await peerAudio(page);
        await page.waitForTimeout(2000);
        const audioSuspended = (await peerAudio(page)) - audioBefore;
        check(audioSuspended > 40, `${label} : vidéo suspendue, la voix arrive toujours au pair (${audioSuspended} paquets en 2 s)`);
        await capture(page, 'video-suspendue');

        // ------------------------------------------------ 5. le réseau revient
        await network(page, 'good');
        const resumed = await whileAudioFlows(page, () => page.$('[data-call-pill="video-suspended"], [data-call-pill="video-frozen"]').then((el) => el === null), 20_000);
        check(resumed.reached, `${label} : le réseau revenu, la vidéo REPREND (les pastilles s'effacent)`);
        await page.waitForTimeout(1500);
        const resumedFrames = await framesDuring(page, 3000);
        check(resumedFrames > 20, `${label} : les images reviennent chez le pair (${resumedFrames} en 3 s)`);
        const gaps = [...frozen.audioGaps, ...suspended.audioGaps, ...resumed.audioGaps];
        check(gaps.length === 0, `${label} : l'audio n'a JAMAIS coupé — chaque seconde a apporté des paquets au pair (${gaps.length} seconde(s) muette(s))`);
        const degradedReports = (await peerReports(page, 'call:quality-report')).filter((report) => report?.stats?.level === 'poor');
        check(degradedReports.length > 0, `${label} : les rapports de la passerelle ont dit le lien dégradé (${degradedReports.length})`);

        // ------------------------------------------------ 6. les alertes du pair
        await page.evaluate(() => window.__meeshyFixtureCallPeer?.alertQuality());
        check(await appears(page, '[data-call-alert="weak-network"]'), `${label} : call:quality-alert s'affiche`);
        const weak = await page.$eval('[data-call-alert="weak-network"]', (el) => el.textContent ?? '').catch(() => '');
        check(weak === `La connexion de ${PEER_NAME} est instable`, `${label} : l'alerte nomme le pair (« ${weak} »)`);
        await page.evaluate(() => window.__meeshyFixtureCallPeer?.capture(true));
        check(await appears(page, '[role="alert"][data-call-alert="capturing"]'), `${label} : call:screen-capture-alert est annoncé comme une ALERTE`);
        const capturing = await page.$eval('[data-call-alert="capturing"]', (el) => el.textContent ?? '').catch(() => '');
        check(capturing === `${PEER_NAME} capture l’écran de l’appel`, `${label} : l'alerte de capture nomme le pair (« ${capturing} »)`);
        await capture(page, 'alertes');
        await page.evaluate(() => window.__meeshyFixtureCallPeer?.capture(false));
        check(await vanishes(page, '[data-call-alert="capturing"]'), `${label} : la capture cessée, l'alerte s'efface`);

        // ------------------------------------------------ 7. le rapport de fin d'appel
        await wakeChrome(page, width, height);
        await page.getByRole('button', { name: 'Raccrocher' }).click();
        check(await appears(page, '[data-call-screen="ended"]'), `${label} : raccrocher termine l'appel`);
        const [analytics] = await peerReports(page, 'call:analytics');
        const distribution = analytics?.qualityDistribution ?? {};
        const sum = ['excellent', 'good', 'fair', 'poor'].reduce((total, key) => total + (distribution[key] ?? 0), 0);
        check(typeof analytics?.codec === 'string' && analytics.codec !== 'unknown' && analytics.codec !== '', `${label} : call:analytics porte le codec négocié (« ${analytics?.codec} »)`);
        check(Math.abs(sum - 1) < 1e-6 && (distribution.poor ?? 0) > 0, `${label} : la répartition de qualité somme à 1 et compte le passage dégradé (${JSON.stringify(distribution)})`);
        check(analytics?.platform === 'web' && analytics?.isVideo === true && analytics?.setupTimeMs >= 0 && analytics?.transcriptionUsed === false, `${label} : plateforme, vidéo, établissement et sous-titres sont ceux de l'appel (${JSON.stringify({ platform: analytics?.platform, isVideo: analytics?.isVideo, setupTimeMs: analytics?.setupTimeMs, transcriptionUsed: analytics?.transcriptionUsed })})`);

        // ------------------------------------------------ 8. le journal réseau survit au rechargement (#8698)
        await page.reload({ waitUntil: 'load' });
        const journal = await page.evaluate(() => {
          const keys = Object.keys(localStorage).filter((key) => /^meeshy\.call-journal\.u_[^.]+\.call-/.test(key));
          return keys.map((key) => ({ key, events: JSON.parse(localStorage.getItem(key) ?? '[]') }));
        });
        const events = journal[0]?.events ?? [];
        const kinds = (kind, test) => events.filter((event) => event.kind === kind && test(event)).length;
        check(journal.length === 1, `${label} : l'appel a UN journal réseau, rangé sous le compte (${journal.map((entry) => entry.key).join(', ')})`);
        check(kinds('phase', (event) => event.phase === 'connected') === 1 && kinds('phase', (event) => event.phase === 'ended' && event.reason === 'local') === 1, `${label} : rechargé, le journal garde la connexion et la fin raccrochée`);
        check(kinds('quality', (event) => event.level === 'poor') > 0 && kinds('survival', (event) => event.stage === 'frozen') > 0 && kinds('survival', (event) => event.stage === 'suspended') > 0, `${label} : rechargé, il garde le lien dégradé, le gel puis la suspension de la vidéo`);
        check(kinds('profile', (event) => typeof event.audioBitrate === 'number') > 0 && events.length <= 150, `${label} : il dit le profil de données et reste borné (${events.length} événements)`);
        await page.evaluate(([key, value]) => {
          const viewerKey = key.slice(0, key.lastIndexOf('.'));
          localStorage.setItem(`${viewerKey}.call-kwame-video`, value);
        }, [journal[0]?.key ?? '', JSON.stringify(events)]);
        await page.goto(`${BASE}/call/call-kwame-video`, { waitUntil: 'load' });
        check(await appears(page, '[data-call-detail-network] [data-call-network-journal]'), `${label} : la fiche d'un appel lit son journal sous « Qualité et réseau »`);
        const heading = await page.textContent('[data-call-network-journal] h3').catch(() => '');
        check(heading === 'Qualité et réseau', `${label} : sous son titre (« ${heading} »)`);
        const lines = await page.$$eval('[data-call-network-event]', (items) => items.length);
        check(lines === events.length, `${label} : une ligne datée par événement (${lines}/${events.length})`);
        await capture(page, 'fiche-qualite-reseau');
      }
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
console.log('\n  La qualité d’un appel s’adapte au réseau et se voit : la vidéo se suspend puis reprend, la voix ne coupe jamais.\n');
