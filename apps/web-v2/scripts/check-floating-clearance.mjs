/**
 * AUCUN DISQUE FLOTTANT NE RECOUVRE UN TEXTE NI UN CONTRÔLE AU REPOS
 * (#6277, #6133) — le témoin GÉOMÉTRIQUE, dans les deux schémas et aux deux
 * gabarits de la charte (390 × 844, 320 × 568).
 *
 * « AU REPOS » veut dire : l'écran tel qu'il s'ouvre, les deux disques à leur
 * pose PAR DÉFAUT (`"0,0"` / `"1,0"`, contexte neuf donc stockage vide). Un
 * disque que l'utilisateur a DÉPLACÉ se pose où il l'a voulu, au-dessus d'un
 * contenu qui défile — aucune mise en page ne l'évite, iOS pas plus que le web,
 * et c'est précisément pourquoi le disque se déplace (#6215).
 *
 * Ce que le témoin mesure, par `document.elementFromPoint` — jamais par une
 * comparaison de rectangles, qui ne dit pas QUI reçoit le doigt :
 *
 *  1. chaque bloc de TEXTE d'une carte du Flux (feuille portant son propre nœud
 *     texte), à son CENTRE et à ses QUATRE COINS, rend sa propre carte ;
 *  2. chaque CONTRÔLE du chrome (en-tête, portes du plateau, filtres de la
 *     liste) rend lui-même à son centre ;
 *  3. chaque tuile du grand plateau garde une CIBLE de 44 × 44 entièrement
 *     atteignable — iOS pose le disque sur la première tuile (cible
 *     `targets/feed.*.png`), et une tuile partiellement couverte reste une
 *     tuile tant qu'un pouce y trouve sa place ;
 *  4. l'en-tête du Flux S'ESCAMOTE : défilé, la bande compacte prend la fente
 *     du titre ; revenu en haut, elle la rend ;
 *  5. les cotes du plateau sont celles d'iOS, NOMMÉES en bornes absolues
 *     (#6133) — jamais un rapport entre deux mesures de la même page.
 *
 * GARDES DE VACUITÉ — un témoin d'absence est vert sur une page vide : chaque
 * relevé exige deux disques posés à leur couloir, au moins un texte, un
 * contrôle et une tuile mesurés.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette de chaque état.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { INSTANT } from './lib/instant.mjs';

/** Les cotes d'iOS, nommées une fois. */
const IOS = {
  /** `AvatarContext.storyTray` — `MeeshyAvatar.swift:46`. */
  storyTray: 88,
  /** `AvatarContext.storyTrayCompact` — `MeeshyAvatar.swift:52`. */
  storyTrayCompact: 36,
  /** `ringSize = size + 6` — `MeeshyAvatar.swift:165`. */
  ringOutset: 6,
  /** `StoryRingCell`, `.frame(width: 96)` — `StoryTrayView.swift:289`. */
  grandeCell: 96,
  /** `FloatingButtonSafeZone.top` — `FloatingButtons.swift:57`. */
  floatingTop: 126,
  /** `FreeFloatingButtonsContainer.buttonSize` — `FloatingButtons.swift:108`. */
  floatingButton: 52,
};
const CIBLE = 44;

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const browser = await launchChromium();
const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};
const bilan = { textes: 0, points: 0, controles: 0, tuiles: 0 };

/**
 * LE RELEVÉ, dans la page. `chrome` désigne les contrôles du chrome à mesurer
 * au centre ; les textes sont ceux des cartes du Flux (absents de la liste).
 */
const releve = (page, chrome) =>
  page.evaluate(
    ({ chrome, cible }) => {
      const port = document.getElementById('contenu')?.getBoundingClientRect() ?? null;
      const disques = [...document.querySelectorAll('.floating-disc')].map((d) => {
        const r = d.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width };
      });
      if (port === null) return { port: null, disques, textes: [], controles: [], tuiles: [] };

      const clipTop = Math.max(port.top, 0);
      const clipBottom = Math.min(port.bottom, innerHeight);
      const dansPort = (x, y) => y > clipTop && y < clipBottom && x > 0 && x < innerWidth;
      const coupable = (el) =>
        el === null ? 'rien' : el.closest('.floating-menus') !== null ? 'un disque flottant' : (el.getAttribute('aria-label') ?? el.tagName);
      const nom = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48);
      const touche = (el, x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      };

      /* Les tuiles qui défilent SOUS les portes du plateau sont voilées par
         construction (`RailActions`) : seule la zone libre compte. */
      const portesTextes = [...document.querySelectorAll('[aria-label="Créer une story"]')].map((a) => a.getBoundingClientRect().left);
      const libreTextes = portesTextes.length > 0 ? Math.min(...portesTextes) - 16 : innerWidth;
      /* Les textes mesurés : ceux des cartes du Flux ET les libellés du grand
         plateau — un disque qui mange « Votre story » mange un texte. */
      const conteneurs = '[data-feed-card], [data-rail="grande"] [data-rail-tile]';
      const textes = [];
      for (const carte of document.querySelectorAll(conteneurs)) {
        const dansPlateau = carte.closest('[data-rail="grande"]') !== null;
        for (const el of carte.querySelectorAll('*')) {
          if (el.closest('[aria-hidden="true"]') !== null) continue;
          const porteTexte = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
          if (!porteTexte) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const i = 2;
          const points = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + i, r.top + i],
            [r.right - i, r.top + i],
            [r.left + i, r.bottom - i],
            [r.right - i, r.bottom - i],
          ].filter(([x, y]) => dansPort(x, y) && (!dansPlateau || x < libreTextes));
          if (points.length === 0) continue;
          const voles = points
            .map(([x, y]) => ({ x, y, hit: document.elementFromPoint(x, y) }))
            .filter(({ hit }) => hit === null || !carte.contains(hit))
            .map(({ x, y, hit }) => ({ x: Math.round(x), y: Math.round(y), par: coupable(hit) }));
          textes.push({ texte: nom(el), points: points.length, voles });
        }
      }

      const controles = [...document.querySelectorAll(chrome)]
        .filter((el) => el.closest('[inert]') === null && el.closest('.floating-menus') === null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (!(y > 0 && y < innerHeight && x > 0 && x < innerWidth)) return null;
          return { nom: nom(el), atteint: touche(el, x, y), par: coupable(document.elementFromPoint(x, y)) };
        })
        .filter((c) => c !== null);

      /* Les tuiles qui défilent SOUS les portes du plateau sont voilées par
         construction (`RailActions`) : seules celles de la zone libre comptent. */
      const portes = [...document.querySelectorAll('[aria-label="Créer une story"]')].map((a) => a.getBoundingClientRect().left);
      const zoneLibre = portes.length > 0 ? Math.min(...portes) - 16 : innerWidth;
      const tuiles = [...document.querySelectorAll('[data-rail="grande"] a[data-story-author]')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          const droite = Math.min(r.right, zoneLibre, innerWidth);
          if (droite - Math.max(r.left, 0) < cible) return null;
          let trouve = null;
          for (let y = Math.max(r.top, clipTop); y + cible <= Math.min(r.bottom, clipBottom) && trouve === null; y += 4) {
            for (let x = Math.max(r.left, 0); x + cible <= droite && trouve === null; x += 4) {
              const coins = [
                [x + 1, y + 1],
                [x + cible - 1, y + 1],
                [x + 1, y + cible - 1],
                [x + cible - 1, y + cible - 1],
                [x + cible / 2, y + cible / 2],
              ];
              if (coins.every(([a, b]) => touche(el, a, b))) trouve = { x: Math.round(x), y: Math.round(y) };
            }
          }
          return { nom: nom(el), trouve };
        })
        .filter((t) => t !== null);

      return { port: { top: port.top, bottom: port.bottom }, disques, textes, controles, tuiles };
    },
    { chrome, cible: CIBLE },
  );

const cotes = (page, variant) =>
  page.evaluate((variant) => {
    const li = document.querySelector(`[data-rail="${variant}"] [data-rail-tile]`);
    const anneau = li?.querySelector('[data-anneau]') ?? null;
    const avatar = anneau?.querySelector('.avatar-root') ?? null;
    const fente = li?.closest('[data-title-slot]') ?? null;
    const w = (el) => (el === null ? null : Math.round(el.getBoundingClientRect().width * 10) / 10);
    const h = (el) => (el === null ? null : Math.round(el.getBoundingClientRect().height * 10) / 10);
    return { cellule: w(li), anneau: w(anneau), anneauH: h(anneau), avatar: w(avatar), fenteH: h(fente) };
  }, variant);

const exigeRepos = (tag, mesure) => {
  constate(mesure.port !== null, `${tag} : le scrollport #contenu est introuvable`);
  constate(
    mesure.disques.length === 2 && mesure.disques.every((d) => Math.round(d.top) === IOS.floatingTop),
    `${tag} : les deux disques ne sont pas posés au couloir par défaut (${IOS.floatingTop}) — ${JSON.stringify(mesure.disques)}`,
  );
  constate(mesure.controles.length > 0, `${tag} : aucun contrôle du chrome mesuré`);
  constate(mesure.tuiles.length > 0, `${tag} : aucune tuile du grand plateau mesurée`);
  for (const c of mesure.controles) {
    constate(c.atteint, `${tag} : le contrôle « ${c.nom} » est recouvert à son centre par ${c.par}`);
  }
  for (const t of mesure.tuiles) {
    constate(t.trouve !== null, `${tag} : la tuile « ${t.nom} » n'offre plus aucune cible de ${CIBLE} × ${CIBLE} atteignable`);
  }
  bilan.controles += mesure.controles.length;
  bilan.tuiles += mesure.tuiles.length;
};

const capture = async (page, nom) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${nom}.png`) });
};

const defile = async (page, top) => {
  await page.evaluate((v) => document.getElementById('contenu')?.scrollTo({ top: v }), top);
};

const attend = (page, fn) => page.waitForFunction(fn, undefined, { timeout: 3_000 }).then(() => true, () => false);

for (const scheme of ['light', 'dark']) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    const gabarit = `${scheme} ${viewport.width}×${viewport.height}`;
    const context = await browser.newContext({ viewport, colorScheme: scheme });
    const page = await context.newPage();
    await page.clock.setFixedTime(INSTANT);

    // ------------------------------------------------------------------ le Flux
    await page.goto(`${BASE}/feed`, { waitUntil: 'load' });
    await page.waitForSelector('[data-feed-card]');
    await page.waitForSelector('.floating-disc');
    await page.waitForTimeout(300);

    const tagFlux = `Flux ${gabarit}`;
    const flux = await releve(page, 'header a, header button, section:has([data-rail="grande"]) a[aria-label]:not([data-story-author])');
    constate(
      (await page.evaluate(() => document.querySelector('#contenu [data-rail="grande"]') !== null)),
      `${tagFlux} : le grand plateau de stories n'ouvre pas le fil (cible targets/feed.*.png)`,
    );
    exigeRepos(tagFlux, flux);
    constate(flux.textes.length > 0, `${tagFlux} : aucun texte de carte mesuré`);
    for (const t of flux.textes) {
      constate(t.voles.length === 0, `${tagFlux} : le texte « ${t.texte} » est recouvert — ${JSON.stringify(t.voles)}`);
      bilan.points += t.points;
    }
    bilan.textes += flux.textes.length;
    const premiereCarte = await page.evaluate(() => document.querySelector('[data-feed-card]')?.getBoundingClientRect().top ?? null);
    constate(
      premiereCarte !== null && premiereCarte >= IOS.floatingTop + IOS.floatingButton - 0.5,
      `${tagFlux} : la première carte commence DANS le couloir des disques (${premiereCarte} < ${IOS.floatingTop + IOS.floatingButton})`,
    );

    const grandeFlux = await cotes(page, 'grande');
    constate(grandeFlux.avatar === IOS.storyTray, `${tagFlux} : l'avatar du grand plateau ne vaut pas .storyTray (${IOS.storyTray}) — ${grandeFlux.avatar}`);
    constate(
      grandeFlux.anneau === IOS.storyTray + IOS.ringOutset,
      `${tagFlux} : l'anneau du grand plateau ne vaut pas ringSize (${IOS.storyTray + IOS.ringOutset}) — ${grandeFlux.anneau}`,
    );
    constate(grandeFlux.cellule === IOS.grandeCell, `${tagFlux} : la cellule du grand plateau ne vaut pas ${IOS.grandeCell} — ${grandeFlux.cellule}`);
    await capture(page, `feed-rest.${scheme}.${viewport.width}x${viewport.height}`);

    await defile(page, 600);
    const bandeVenue = await attend(page, () => {
      const h1 = document.querySelector('header h1');
      return h1 !== null && Number(getComputedStyle(h1).opacity) === 0 && document.querySelector('header [data-rail="pinned"]') !== null;
    });
    constate(bandeVenue, `${tagFlux} : défilé, la bande compacte ne prend pas la fente du titre (en-tête non escamotable)`);
    const pinnedFlux = await cotes(page, 'pinned');
    constate(
      pinnedFlux.avatar === IOS.storyTrayCompact,
      `${tagFlux} : l'avatar de la bande ne vaut pas .storyTrayCompact (${IOS.storyTrayCompact}) — ${pinnedFlux.avatar}`,
    );
    constate(
      pinnedFlux.anneau === IOS.storyTrayCompact + IOS.ringOutset,
      `${tagFlux} : l'anneau de la bande ne vaut pas ${IOS.storyTrayCompact + IOS.ringOutset} — ${pinnedFlux.anneau}`,
    );
    constate(
      pinnedFlux.anneauH !== null && pinnedFlux.fenteH !== null && pinnedFlux.anneauH <= pinnedFlux.fenteH,
      `${tagFlux} : la bande déborde de la fente du titre (${pinnedFlux.anneauH} > ${pinnedFlux.fenteH})`,
    );
    await capture(page, `feed-scrolled.${scheme}.${viewport.width}x${viewport.height}`);

    await defile(page, 0);
    const bandeRendue = await attend(page, () => {
      const h1 = document.querySelector('header h1');
      return h1 !== null && Number(getComputedStyle(h1).opacity) === 1 && document.querySelector('header [data-rail="pinned"]') === null;
    });
    constate(bandeRendue, `${tagFlux} : revenu en haut, la bande ne rend pas la fente au titre`);

    // --------------------------------------------------------------- la liste
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-row]');
    await page.waitForSelector('.floating-disc');
    await page.waitForTimeout(300);

    const tagListe = `Liste ${gabarit}`;
    const liste = await releve(page, 'header a, header button, section:has([data-rail="grande"]) a[aria-label]:not([data-story-author]), nav[aria-label="Filtres"] button');
    exigeRepos(tagListe, liste);
    const grandeListe = await cotes(page, 'grande');
    constate(
      grandeListe.avatar === grandeFlux.avatar && grandeListe.cellule === grandeFlux.cellule,
      `${tagListe} : le rail de la liste n'a pas la cote de celui du Flux (${JSON.stringify(grandeListe)} ≠ ${JSON.stringify(grandeFlux)})`,
    );
    await capture(page, `list-rest.${scheme}.${viewport.width}x${viewport.height}`);

    await defile(page, 600);
    await attend(page, () => document.querySelector('header [data-rail="pinned"] [data-rail-tile]') !== null);
    const pinnedListe = await cotes(page, 'pinned');
    constate(
      pinnedListe.avatar === pinnedFlux.avatar && pinnedListe.anneau === pinnedFlux.anneau,
      `${tagListe} : la bande de la liste n'a pas la cote de celle du Flux (${JSON.stringify(pinnedListe)} ≠ ${JSON.stringify(pinnedFlux)})`,
    );
    await capture(page, `list-scrolled.${scheme}.${viewport.width}x${viewport.height}`);

    await context.close();
  }
}

await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-floating-clearance : ${failures.length} échec(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-floating-clearance : vert — ${bilan.textes} textes de carte (${bilan.points} points), ` +
    `${bilan.controles} contrôles, ${bilan.tuiles} tuiles, 2 schémas × 2 gabarits, aucun disque au repos sur un texte ni un contrôle.`,
);
