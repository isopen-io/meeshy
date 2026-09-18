#!/usr/bin/env node
/**
 * LE SON DE FOND D'UNE STORY SE JOUE — DANS UN VRAI NAVIGATEUR (#7015).
 *
 * ## Le défaut, mesuré en production le 2026-09-18
 *
 *     GET https://gate.meeshy.me/api/v1/static/d0bf39b7-…m4a   ->  401
 *
 * Le fichier EXISTE (`/app/sounds`, 18 fichiers relevés dans le conteneur
 * `meeshy-gateway`). La route porte `preValidation: [requiredAuth]`, et **une
 * balise `<audio src>` n'envoie aucun en-tête `Authorization`** : la requête
 * part anonyme et se fait refuser. 20 publications de production citent cette
 * forme d'URL ; leur son de fond n'a jamais joué sur le web, alors qu'il joue
 * sur iOS (dont le SDK passe par `APIClient`, qui pose l'en-tête).
 *
 * ## POURQUOI UN GATE NAVIGATEUR, ET PAS SEULEMENT DES TÉMOINS
 *
 * Les témoins unitaires (`protected-media.test.ts`,
 * `background-track-audio.test.tsx`) prouvent la LOI : l'en-tête part, l'URL
 * d'objet arrive, un refus dégrade. Ils tournent sous happy-dom, qui
 * n'implémente NI le chargement d'un `<audio>`, NI `URL.createObjectURL`, NI
 * le décodage. Ils ne peuvent donc pas dire ce que #7015 promet — **que le son
 * JOUE**. Ce gate le mesure comme `check-media.mjs` mesure une image : sur
 * l'EFFET (`readyState`, `duration`), jamais sur la présence d'une balise.
 *
 * ## Ce qu'il mesure
 *
 *  1. `/story/st-scene-sound` — la story dont le son est EMPRUNTÉ à la
 *     bibliothèque (`payload.mediaURL` vers `/api/v1/static/…`, la forme
 *     exacte de la production). La requête qui part porte `authorization`,
 *     l'élément reçoit une URL `blob:`, et l'audio DÉCODE (`readyState ≥ 1`,
 *     `duration > 0`).
 *  2. AUCUN SECRET DANS UNE URL — ni le jeton, ni `token=`, dans aucune des
 *     requêtes émises vers la route protégée (`CLAUDE.md` § 4).
 *  3. DÉGRADATION — la MÊME page quand la passerelle refuse (401) : aucune
 *     piste montée, aucune erreur de page, et **aucune promesse rejetée non
 *     rattrapée** (`unhandledrejection`, posé avant tout script d'application).
 *  4. CONTRE-ÉPREUVE — `/story/st-scene`, dont le son vient d'une pièce jointe
 *     (`data:`), joue sans qu'AUCUNE requête ne parte vers la route protégée :
 *     le transport coûteux ne touche qu'elle.
 *
 * Le service worker n'est pas servi (`serviceWorker: false`) : ce gate ne
 * mesure pas le précache, et son seau est gardé par `check-sw-api-cache.mjs`,
 * qui fait décider `dist/sw.js` sur ces mêmes URL.
 */
import { readFileSync } from 'node:fs';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

/** Le chemin protégé, RECOPIÉ — un attendu relu dans le code mesuré serait
 * vert sur un code faux (`services/gateway/src/routes/posts/audio.ts`). */
const CHEMIN_PROTEGE = '/api/v1/static/';

/** La session de recette — même forme que `check-admin-rung.mjs`. Sans elle,
 * `currentCredential()` rend `null` et le transport se tait : le gate
 * mesurerait l'absence de session, pas le défaut. */
const SESSION = {
  token: 'jeton-de-recette',
  sessionToken: 'session-de-recette',
  user: { id: '64b000000000000000000001', username: 'recette', displayName: 'Recette' },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

/**
 * DES OCTETS RÉELLEMENT DÉCODABLES, empruntés au corpus de fixtures
 * (`REEL_CLIP_VOICE`, un WebM/Opus) et lus comme du TEXTE : importer un module
 * TypeScript depuis un script node exigerait une chaîne de compilation pour
 * une constante. Servir une image ou un octet inventé rendrait
 * `readyState === 0` et ferait échouer le gate sur le FIXTURE plutôt que sur
 * le produit.
 */
function octetsAudio() {
  const source = readFileSync(new URL('../src/lib/api/fixtures-reel-clips.ts', import.meta.url), 'utf8');
  const trouve = /REEL_CLIP_VOICE = 'data:audio\/webm;base64,([A-Za-z0-9+/=]+)'/.exec(source);
  if (trouve === null) throw new Error('REEL_CLIP_VOICE introuvable dans fixtures-reel-clips.ts');
  return Buffer.from(trouve[1], 'base64');
}

const AUDIO = octetsAudio();

/**
 * Ouvre un contexte muni de la session, en interceptant la route protégée.
 * `servi` : `'ok'` sert les octets si (et seulement si) la requête porte une
 * identité ; `'refus'` répond 401 comme la production le fait aujourd'hui.
 */
async function ouvrir(browser, { servi }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  const requetes = [];
  await context.addInitScript(
    (session) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
      // POSÉ AVANT TOUT SCRIPT D'APPLICATION : une promesse rejetée plus tard
      // n'aurait aucun écouteur, et le gate ne verrait rien.
      const rejets = [];
      Object.defineProperty(window, '__rejets', { get: () => rejets });
      window.addEventListener('unhandledrejection', (event) => rejets.push(String(event.reason)));
    },
    SESSION,
  );
  await context.route(`**${CHEMIN_PROTEGE}*`, async (route) => {
    const request = route.request();
    const headers = request.headers();
    requetes.push({
      url: request.url(),
      authorization: headers['authorization'] ?? null,
      sessionToken: headers['x-session-token'] ?? null,
    });
    if (servi === 'refus') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Unauthorized' }) });
    }
    if (headers['authorization'] === undefined && headers['x-session-token'] === undefined) {
      // CE QUE LA PRODUCTION FAIT d'une balise `<audio src>` : la route est
      // authentifiée, l'absence d'en-tête vaut refus. Le gate le rejoue plutôt
      // que de servir aveuglément — sans quoi il verdirait sur le défaut.
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Unauthorized' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'audio/webm',
      headers: { 'cache-control': 'private, max-age=3600' },
      body: AUDIO,
    });
  });
  const page = await context.newPage();
  return { context, page, requetes };
}

/** L'état RÉEL de la piste — `readyState`/`duration`, jamais la seule balise. */
const pisteDe = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-scene-sound-track]');
    if (el === null) return null;
    const audio = /** @type {HTMLAudioElement} */ (el);
    return { src: audio.getAttribute('src') ?? '', readyState: audio.readyState, duration: audio.duration };
  });

/** Attend qu'une piste soit DÉCODÉE, ou rend le dernier état observé. */
async function attendrePisteDecodee(page) {
  let dernier = null;
  for (let essai = 0; essai < 60; essai += 1) {
    dernier = await pisteDe(page);
    if (dernier !== null && dernier.readyState >= 1 && Number.isFinite(dernier.duration) && dernier.duration > 0) return dernier;
    await page.waitForTimeout(100);
  }
  return dernier;
}

const browser = await launchChromium();

try {
  /* ── 1 & 2. LA PISTE PROTÉGÉE JOUE, ET AUCUN SECRET N'EST DANS L'URL ──── */
  {
    const { context, page, requetes } = await ouvrir(browser, { servi: 'ok' });
    await page.goto(`${BASE}/story/st-scene-sound`, { waitUntil: 'load' });
    const piste = await attendrePisteDecodee(page);

    check(piste !== null, 'st-scene-sound : aucune piste montée — le son de fond n’a pas été élu');
    check(
      piste !== null && piste.src.startsWith('blob:'),
      `st-scene-sound : la balise porte « ${piste?.src ?? '—'} » — attendu une URL d’objet (une balise ne peut pas porter d’en-tête)`,
    );
    check(
      piste !== null && !piste.src.includes(CHEMIN_PROTEGE),
      'st-scene-sound : l’URL protégée est posée en `src` — la requête partirait anonyme, donc 401',
    );
    check(
      piste !== null && piste.readyState >= 1 && piste.duration > 0,
      `st-scene-sound : la piste ne DÉCODE pas (readyState=${piste?.readyState ?? '—'}, duration=${piste?.duration ?? '—'})`,
    );

    check(requetes.length >= 1, 'st-scene-sound : aucune requête vers la route protégée — les octets ne sont pas demandés');
    const portentUneIdentite = requetes.every((r) => r.authorization !== null || r.sessionToken !== null);
    check(portentUneIdentite, 'st-scene-sound : une requête part SANS identité — c’est exactement le 401 de production');
    const urlPropre = requetes.every((r) => !r.url.includes(SESSION.token) && !r.url.includes(SESSION.sessionToken) && !r.url.includes('token='));
    check(urlPropre, 'st-scene-sound : un jeton voyage dans l’URL — interdit (journaux, référents, historique)');

    const rejets = await page.evaluate(() => window.__rejets.slice());
    check(rejets.length === 0, `st-scene-sound : ${rejets.length} promesse(s) rejetée(s) non rattrapée(s) — ${rejets.join(' | ')}`);
    await context.close();
  }

  /* ── 3. DÉGRADATION — la passerelle refuse ────────────────────────────── */
  {
    const { context, page, requetes } = await ouvrir(browser, { servi: 'refus' });
    const erreurs = [];
    page.on('pageerror', (error) => erreurs.push(String(error?.message ?? error)));
    await page.goto(`${BASE}/story/st-scene-sound`, { waitUntil: 'load' });
    await page.waitForSelector('[data-story-scene], [data-story-ready], [data-scene-player]', { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);

    check(requetes.length >= 1, 'refus : la route protégée n’est même pas appelée');
    check(
      (await pisteDe(page)) === null,
      'refus : une balise `<audio>` reste montée sur une piste indisponible — elle rejouera l’échec à chaque lecture',
    );
    check(erreurs.length === 0, `refus : ${erreurs.length} erreur(s) de page — ${erreurs.join(' | ')}`);
    const rejets = await page.evaluate(() => window.__rejets.slice());
    check(rejets.length === 0, `refus : ${rejets.length} promesse(s) rejetée(s) non rattrapée(s) — ${rejets.join(' | ')}`);
    await context.close();
  }

  /* ── 4. CONTRE-ÉPREUVE — une pièce jointe ne passe PAS par ce transport ─ */
  {
    const { context, page, requetes } = await ouvrir(browser, { servi: 'ok' });
    await page.goto(`${BASE}/story/st-scene`, { waitUntil: 'load' });
    const piste = await attendrePisteDecodee(page);
    check(piste !== null, 'st-scene : la piste de pièce jointe a disparu — le correctif a débranché le cas nominal');
    check(
      piste !== null && piste.src.startsWith('data:'),
      `st-scene : la source a changé de forme (« ${(piste?.src ?? '—').slice(0, 24)}… ») — une pièce jointe reste posée telle quelle`,
    );
    check(requetes.length === 0, `st-scene : ${requetes.length} requête(s) vers la route protégée pour un média qui n’en relève pas`);
    await context.close();
  }
} finally {
  await browser.close();
  await served.close();
}

if (failures.length > 0) {
  console.error(`\n  check-story-sound : ${failures.length} défaut(s) sur ${invariants} invariants\n`);
  for (const line of failures) console.error(`    ✗ ${line}`);
  process.exit(1);
}

console.log(`  check-story-sound : le son de fond protégé JOUE (${invariants} invariants) — en-tête posé, URL d’objet décodée, refus dégradé sans promesse rejetée.`);
