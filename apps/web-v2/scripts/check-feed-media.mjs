/**
 * 12 — LES MÉDIAS DU FIL ET DES STORIES SE JOUENT (#6807, volets 2 et 3).
 *
 * #6800 et #6801 sont livrées avec leurs témoins unitaires verts, et aucun
 * gate ne les exerce : `check-feed-disc` mesure de la géométrie,
 * `check-reels` le lecteur plein écran, `lib/check-media.mjs` les pièces
 * jointes d'une CONVERSATION. Le dépôt savait donc prouver que ces deux lots
 * n'ont rien cassé, pas qu'ils réparent.
 *
 * **CE GATE MESURE L'EFFET, JAMAIS LA PRÉSENCE D'UNE BALISE.** Un `<video>`
 * monté prouve seulement qu'un élément existe ; ce qu'on veut savoir, c'est
 * si le temps AVANCE quand on demande la lecture. Les surfaces du fil sont
 * montées `preload="none"` (rien n'est téléchargé tant qu'on ne joue pas —
 * c'est voulu, § Cache-First), donc au repos leur `readyState` vaut 0 : un
 * témoin qui lirait `readyState` sans demander la lecture serait rouge sur
 * une surface parfaitement saine.
 *
 * Les médias sont mis en sourdine avant `play()` : Chromium refuse la lecture
 * automatique d'un média SONORE sans geste, et ce refus n'apprendrait rien
 * sur le code mesuré.
 *
 * L'aide de lecture est posée par `addInitScript`, donc UNE fois pour toutes
 * les navigations, plutôt que recopiée dans chaque `evaluate` — le motif de
 * `lib/browser.mjs` : une chose écrite à plusieurs endroits finit écrite de
 * plusieurs façons.
 *
 * UN SEUL SCHÉMA, délibérément. Les gates du dépôt jouent clair ET sombre
 * parce qu'un CONTRASTE se juge sur son propre fond ; ici rien de ce qui est
 * mesuré n'est une couleur — une source servie, un temps qui avance et un
 * élément absent sont les mêmes sur les deux peaux. Le contraste de ces
 * surfaces est gardé ailleurs (`check-feed-disc`, `lib/check-media.mjs`).
 *
 * LA CONTRE-ÉPREUVE EST DANS LE GATE, pas à côté : l'affiche d'un RÉEL ne
 * monte AUCUN élément média (#6457 — la lecture appartient au lecteur des
 * Réels) et une story IMAGE n'en monte pas non plus. Sans ces deux
 * invariants, « monter un `<video>` partout » passerait au vert.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const browser = await launchChromium();
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 420, height: 900 } });
const page = await context.newPage();

/** Demander la lecture, puis regarder si le temps a bougé. Rend `null` quand
 * l'élément n'existe pas — l'appelant distingue « absent » de « ne joue pas ». */
await page.addInitScript(() => {
  window.__joueMedia = async (el) => {
    if (el === null || el === undefined) return null;
    el.muted = true;
    try {
      el.currentTime = 0;
      await el.play();
    } catch (e) {
      return { avance: false, refus: String(e).slice(0, 120) };
    }
    const t0 = el.currentTime;
    await new Promise((r) => setTimeout(r, 900));
    return {
      avance: el.currentTime > t0,
      t0: Number(t0.toFixed(2)),
      t1: Number(el.currentTime.toFixed(2)),
      readyState: el.readyState,
      code: el.error ? el.error.code : null,
    };
  };
});

/* ── LE FIL ─────────────────────────────────────────────────────────────── */
await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
await page.waitForSelector('[data-feed-card]');

const fil = await page.evaluate(async () => {
  const video = document.querySelector('[data-feed-card="post"] video');
  const audio = document.querySelector('[data-feed-card="post"] audio');
  return {
    videoSrc: video === null ? '' : video.currentSrc || video.src || '',
    videoPoster: video === null ? '' : video.poster || '',
    audioSrc: audio === null ? '' : audio.currentSrc || audio.src || '',
    mediasDuReel: document.querySelectorAll('[data-feed-card="reel"] video, [data-feed-card="reel"] audio').length,
    lectureVideo: await window.__joueMedia(video),
    lectureAudio: await window.__joueMedia(audio),
  };
});

check(
  fil.videoSrc.startsWith('data:video/'),
  `le fil : aucune carte de POST ne monte un <video> portant la source servie — « ${fil.videoSrc.slice(0, 40) || '(aucun <video>)'} »`,
);
check(
  fil.videoPoster.startsWith('data:image/'),
  `le fil : la vidéo d'un post ne porte pas sa vignette en \`poster\` — « ${fil.videoPoster.slice(0, 40) || '(aucun poster)'} »`,
);
check(
  fil.lectureVideo !== null && fil.lectureVideo.avance === true,
  `le fil : la vidéo d'un post NE JOUE PAS — ${JSON.stringify(fil.lectureVideo)}`,
);
check(
  fil.audioSrc.startsWith('data:audio/'),
  `le fil : aucune carte de POST ne monte un <audio> portant la source servie — « ${fil.audioSrc.slice(0, 40) || '(aucun <audio>)'} »`,
);
check(
  fil.lectureAudio !== null && fil.lectureAudio.avance === true,
  `le fil : le son d'un post NE JOUE PAS — ${JSON.stringify(fil.lectureAudio)}`,
);
check(
  fil.mediasDuReel === 0,
  `le fil : l'affiche d'un RÉEL monte ${fil.mediasDuReel} élément(s) média — la lecture appartient au lecteur des Réels (#6457)`,
);

/* ── LA STORY VIDÉO ─────────────────────────────────────────────────────── */
await page.goto(`${BASE}/story/st-video`, { waitUntil: 'load' });
await page.waitForTimeout(800);

const story = await page.evaluate(async () => {
  const video = document.querySelector('video');
  const texte = document.body.innerText;
  return {
    monte: video !== null,
    src: video === null ? '' : video.currentSrc || video.src || '',
    lecture: await window.__joueMedia(video),
    indisponible: texte.includes('indisponible') || texte.includes('unavailable'),
  };
});

check(
  story.monte,
  `la story VIDÉO : aucun <video> monté — l'élection par le \`mimeType\` ne tient pas (${JSON.stringify(story)})`,
);
check(
  story.src.startsWith('data:video/'),
  `la story VIDÉO : le <video> ne porte pas la source servie — « ${story.src.slice(0, 40) || '(aucune)'} »`,
);
check(
  story.lecture !== null && story.lecture.avance === true,
  `la story VIDÉO NE JOUE PAS — ${JSON.stringify(story.lecture)}`,
);
check(!story.indisponible, 'la story VIDÉO peint « Média indisponible » alors que son clip est décodable');

/* ── LA DIAPOSITIVE SUIT SON MÉDIA (#6836) ──────────────────────────────── */
/* On lit la BARRE plutôt que d'attendre que la story avance, parce que la
   barre EST le ratio : `paintProgress(ratio)` et `if (ratio >= 1) advance()`
   partagent la même variable dans la boucle de `story.tsx`. Mesurer la barre
   mesure donc les deux — et prouve au passage ce qu'iOS exige explicitement
   (« progress bar et auto-advance utilisent la MÊME valeur »), ce qu'une
   attente de fin de diapositive ne dirait pas.

   À 3 s sur un clip de 9 s : 33 % si le dénominateur suit le média, 50 % s'il
   est resté `DEFAULT_SLIDE_DURATION_MS`. Le seuil est posé à 45 % — au-dessus
   du vrai (33) avec de la marge pour le démarrage du décodage, au-dessous du
   défaut (50) sans ambiguïté. */
await page.goto(`${BASE}/story/st-video-long`, { waitUntil: 'load' });
await page.waitForSelector('video');
await page.waitForTimeout(3000);

const lireScene = () =>
  page.evaluate(() => {
    const video = document.querySelector('video');
    const barres = [...document.querySelectorAll('[aria-valuenow]')].map((b) =>
      Number(b.getAttribute('aria-valuenow')),
    );
    const scene = document.querySelector('[data-story-scene]');
    return {
      scene: scene === null ? '' : scene.getAttribute('data-story-scene'),
      progression: barres.length === 0 ? null : Math.max(...barres),
      dureeMedia: video === null || !Number.isFinite(video.duration) ? null : Number(video.duration.toFixed(2)),
    };
  });

const aTroisSecondes = await lireScene();

check(
  aTroisSecondes.dureeMedia !== null && aTroisSecondes.dureeMedia > 6,
  `la story LONGUE : son clip ne dure pas plus que le plancher de 6 s — ${JSON.stringify(aTroisSecondes.dureeMedia)} s. ` +
    'Sans un média plus long que le plancher, la troncature de #6836 est inobservable et ce gate ne prouve rien.',
);
check(
  aTroisSecondes.progression !== null && aTroisSecondes.progression < 45,
  `la story LONGUE : la barre est à ${aTroisSecondes.progression} % après 3 s d'un clip de 9 s — ` +
    'la progression divise donc par la CONSTANTE de 6 s, pas par la durée du média (#6836).',
);

/* LA FACE GRAVE — à 7 s, une diapositive restée à 6 s a DÉJÀ avancé, coupant
   le clip à son tiers restant. C'est le défaut que la boucle seule ne corrige
   pas : `loop` empêche le gel d'un clip COURT, rien n'empêche la troncature
   d'un clip LONG. */
await page.waitForTimeout(4200);
const aSeptSecondes = await lireScene();

check(
  aSeptSecondes.scene === 'st-video-long',
  `la story LONGUE est COUPÉE : après 7 s, la scène affichée est « ${aSeptSecondes.scene} » et non « st-video-long » — ` +
    'la diapositive s\'est terminée avant son média de 9 s (#6836).',
);

/* ── LA CONTRE-ÉPREUVE : UNE STORY IMAGE RESTE UNE IMAGE ────────────────── */
await page.goto(`${BASE}/story/st-amie-2`, { waitUntil: 'load' });
await page.waitForTimeout(600);

const storyImage = await page.evaluate(() => ({
  videos: document.querySelectorAll('video').length,
  images: document.querySelectorAll('img').length,
  indisponible: document.body.innerText.includes('indisponible') || document.body.innerText.includes('unavailable'),
}));

check(
  storyImage.videos === 0 && storyImage.images >= 1,
  `la story IMAGE : l'élection par le \`mimeType\` ne tient pas — ${JSON.stringify(storyImage)}`,
);
check(!storyImage.indisponible, 'la story IMAGE peint « Média indisponible » sur une image servie');

await context.close();
await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`check-feed-media : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-feed-media : vert — ${invariants} invariants : dans le fil, la vidéo et le son d'un post SE JOUENT ` +
    "(le temps avance, la vignette est le poster) pendant que l'affiche d'un RÉEL ne monte aucun élément média ; " +
    'une story vidéo se joue sans « Média indisponible », et une story image reste une image.',
);
