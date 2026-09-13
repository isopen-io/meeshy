#!/usr/bin/env node
/**
 * LA CLOCHE A UN EFFET — et on peut l'atteindre (#6288, #6219).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : le décodage, la
 * catégorie traduite en filtre, le marquage optimiste et son retour arrière,
 * l'application des événements `notification:*`. Aucun ne traverse le
 * CÂBLAGE — débrancher la pastille du bouton flottant, laisser un disque
 * couvrir l'heure d'une rangée ou rendre « Tout lire » inerte les laisse tous
 * verts. Ce gate les mesure dans un navigateur réel, sur le `dist` construit
 * (source fixtures : douze notifications, trois non lues, « Appels » vide), dans
 * les DEUX schémas et aux deux gabarits de la charte (390 × 844, 320 × 568) :
 *
 *  1. sur la liste, la pastille du bouton flottant porte le compte SERVI
 *     (« 3 »), posée au coin d'iOS (+16, −16), et le bouton l'annonce ;
 *  2. le barreau « Notifications » de l'échelle ouvre la cloche : douze
 *     rangées, trois non lues, « 3 non lues » dans l'en-tête ;
 *  3. AU REPOS, chaque texte de rangée et chaque contrôle du chrome retombe sur
 *     lui-même à son centre (`elementFromPoint`) — aucun disque flottant ne
 *     vole ni un texte ni un contrôle — et chaque contrôle fait 44 de haut ;
 *  4. les textes tiennent AA dans les deux schémas : titre et corps d'une
 *     rangée non lue (sur son voile d'accent), heure, compte, « Tout lire »,
 *     libellé d'une puce sur sa teinte ;
 *  5. une catégorie FILTRE (« Mentions » : deux mentions et rien d'autre,
 *     l'adresse porte `?categorie=mentions`) ; « Appels » dessine son état vide ;
 *     « Non lues » ne rend que les trois non lues ;
 *  6. ouvrir une rangée mène à sa CIBLE (le fil de la conversation) et, au
 *     retour, la rangée est lue, le compte et la pastille ont baissé ;
 *  7. le menu d'une rangée marque lu, puis supprime — chacun avec son effet ;
 *  8. « Tout lire » vide le compte : l'en-tête ne l'affiche plus et la pastille
 *     DISPARAÎT à zéro ;
 *  9. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette (liste, catégorie
 * filtrée, état vide), par schéma et par gabarit.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { contrastOf } from './lib/contrast.mjs';

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

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const WCAG_AA = 4.5;
/** `NotificationBadge` — `.offset(x: 16, y: -16)` depuis le centre du bouton. */
const CORNER = { x: 16, y: -16 };
const MENTION_TYPES = ['user_mentioned', 'mention', 'MENTION'];

const rowsOf = (page) =>
  page.$$eval('[data-notification]', (els) =>
    els.map((el) => ({ id: el.dataset.notification, type: el.dataset.notificationType, read: el.dataset.read })),
  );
const badgeOf = (page) => page.$eval('.floating-menus [data-unread]', (el) => el.getAttribute('data-unread')).catch(() => null);
const countText = (page) => page.$eval('[data-unread-count]', (el) => el.textContent?.trim() ?? '').catch(() => null);
const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

/** Chaque texte de rangée et chaque contrôle du chrome, à son centre. */
const reachAtRest = (page) =>
  page.evaluate(() => {
    const port = document.getElementById('contenu')?.getBoundingClientRect() ?? null;
    if (port === null) return { texts: [], controls: [] };
    const by = (hit) => (hit === null ? 'rien' : hit.closest('.floating-menus') !== null ? 'un disque flottant' : hit.tagName);
    const texts = [
      ...document.querySelectorAll(
        '[data-notification] [data-notification-title], [data-notification] [data-notification-body], [data-notification] [data-notification-time]',
      ),
    ].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (!(y > Math.max(port.top, 0) && y < Math.min(port.bottom, innerHeight) && x > 0 && x < innerWidth)) return [];
      const hit = document.elementFromPoint(x, y);
      const row = el.closest('[data-notification]');
      return [{ text: (el.textContent ?? '').trim().slice(0, 40), ok: hit !== null && row !== null && row.contains(hit), par: by(hit) }];
    });
    const controls = [...document.querySelectorAll('main > header a, main > header button, [data-category]')].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (!(x > 0 && x < innerWidth && y > 0 && y < innerHeight)) return [];
      const hit = document.elementFromPoint(x, y);
      return [{ nom: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim(), ok: hit !== null && (hit === el || el.contains(hit)), par: by(hit), hauteur: r.height }];
    });
    return { texts, controls };
  });

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. la pastille sur la liste
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForSelector('.floating-menus [data-unread]').catch(() => null);
      check((await badgeOf(page)) === '3', `${label} : la pastille du bouton flottant porte le compte servi (« ${await badgeOf(page)} », « 3 » attendu)`);
      check(
        (await page.getAttribute('[data-floating-menu]', 'aria-label')) === 'Menu, 3 notifications non lues',
        `${label} : le bouton annonce le compte dans son nom`,
      );
      const corner = await page.evaluate(() => {
        const disc = document.querySelector('[data-floating-menu]')?.getBoundingClientRect();
        const badge = document.querySelector('.floating-menus [data-unread]')?.getBoundingClientRect();
        if (disc === undefined || badge === undefined) return null;
        return {
          dx: badge.left + badge.width / 2 - (disc.left + disc.width / 2),
          dy: badge.top + badge.height / 2 - (disc.top + disc.height / 2),
          h: badge.height,
        };
      });
      check(
        corner !== null && Math.abs(corner.dx - CORNER.x) <= 1 && Math.abs(corner.dy - CORNER.y) <= 1 && corner.h === 18,
        `${label} : la pastille est au coin d'iOS (+16, −16), 18 de haut (${JSON.stringify(corner)})`,
      );
      await capture(page, `liste-pastille-${scheme}-${width}x${height}`);

      // ------------------------------------------------ 2. le barreau ouvre la cloche
      await page.click('[data-floating-menu]');
      await page.click('[role="menuitem"][aria-label="Notifications"]');
      /* Une navigation d'application (`pushState`) ne déclenche aucun `load` :
         c'est l'adresse elle-même qu'on attend, jamais un chargement. */
      await page.waitForFunction(() => location.pathname === '/notifications');
      await page.waitForSelector('[data-notification]');
      await page.waitForTimeout(250);
      const all = await rowsOf(page);
      check(all.length === 12, `${label} : la cloche rend douze rangées (${all.length})`);
      check(all.filter((r) => r.read === 'false').length === 3, `${label} : dont trois non lues`);
      check((await countText(page)) === '3 non lues', `${label} : l'en-tête dit « 3 non lues » (« ${await countText(page)} »)`);

      // ------------------------------------------------ 3. atteignabilité au repos
      const reach = await reachAtRest(page);
      const stolen = reach.texts.filter((t) => !t.ok);
      check(reach.texts.length >= 6, `${label} : au moins six textes de rangée mesurés au repos (${reach.texts.length})`);
      check(stolen.length === 0, `${label} : aucun texte de rangée n'est volé à son centre — ${JSON.stringify(stolen)}`);
      const blocked = reach.controls.filter((c) => !c.ok);
      check(reach.controls.length >= 4, `${label} : au moins quatre contrôles du chrome mesurés (${reach.controls.length})`);
      check(blocked.length === 0, `${label} : chaque contrôle du chrome retombe sur lui-même — ${JSON.stringify(blocked)}`);
      const small = reach.controls.filter((c) => c.hauteur < TAP_FLOOR);
      check(small.length === 0, `${label} : chaque contrôle du chrome fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);

      // ------------------------------------------------ 4. contraste AA
      const inks = {
        titre: await contrastOf(page, '[data-notification="fx-notif-mention"] [data-notification-title]'),
        corps: await contrastOf(page, '[data-notification="fx-notif-mention"] [data-notification-body]'),
        heure: await contrastOf(page, '[data-notification="fx-notif-mention"] [data-notification-time]'),
        compte: await contrastOf(page, '[data-unread-count]'),
        toutLire: await contrastOf(page, '[data-mark-all-read]'),
        puce: await contrastOf(page, '[data-category="social"] > span'),
        puceSelectionnee: await contrastOf(page, '[data-category="all"] > span'),
      };
      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte de la cloche tient AA — ${JSON.stringify(inks)}`);
      await capture(page, `cloche-${scheme}-${width}x${height}`);

      // ------------------------------------------------ 5. les catégories filtrent
      await page.click('[data-category="mentions"]');
      await page.waitForFunction(() => document.getElementById('contenu')?.dataset.notificationsCategory === 'mentions');
      await page.waitForTimeout(250);
      const mentions = await rowsOf(page);
      check(
        mentions.length === 2 && mentions.every((r) => MENTION_TYPES.includes(r.type)),
        `${label} : « Mentions » ne rend que ses deux mentions (${JSON.stringify(mentions.map((r) => r.type))})`,
      );
      check(page.url().endsWith('/notifications?categorie=mentions'), `${label} : la catégorie vit dans l'adresse (${page.url()})`);
      check((await page.getAttribute('[data-category="mentions"]', 'aria-pressed')) === 'true', `${label} : la puce choisie s'annonce pressée`);
      await capture(page, `cloche-mentions-${scheme}-${width}x${height}`);

      await page.click('[data-category="calls"]');
      await page.waitForSelector('[data-notifications-empty]');
      const empty = await page.evaluate(() => {
        const el = document.querySelector('[data-notifications-empty] p');
        const r = el?.getBoundingClientRect();
        if (el === null || r === undefined) return null;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: el.textContent, reachable: hit === el || (hit !== null && el.contains(hit)), inside: r.bottom <= innerHeight };
      });
      check(
        empty !== null && empty.text === 'Aucune notification dans « Appels »' && empty.reachable && empty.inside,
        `${label} : « Appels » dessine son état vide, lisible dans l'écran (${JSON.stringify(empty)})`,
      );
      await capture(page, `cloche-vide-${scheme}-${width}x${height}`);

      await page.click('[data-category="unread"]');
      await page.waitForFunction(() => document.getElementById('contenu')?.dataset.notificationsCategory === 'unread');
      await page.waitForTimeout(250);
      const unreadRows = await rowsOf(page);
      check(unreadRows.length === 3 && unreadRows.every((r) => r.read === 'false'), `${label} : « Non lues » ne rend que les trois non lues`);

      await page.click('[data-category="all"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-notification]').length === 12);

      // ------------------------------------------------ 6. ouvrir mène à la cible
      await page.click('[data-notification="fx-notif-message"] a');
      await page.waitForFunction(() => location.pathname === '/c/c-deploiement');
      check(true, `${label} : ouvrir un message mène à sa conversation`);
      await page.goBack();
      await page.waitForSelector('[data-notification="fx-notif-message"]');
      await page.waitForFunction(
        () => document.querySelector('[data-notification="fx-notif-message"]')?.getAttribute('data-read') === 'true',
      ).catch(() => null);
      check(
        (await page.getAttribute('[data-notification="fx-notif-message"]', 'data-read')) === 'true',
        `${label} : au retour, la rangée ouverte est lue`,
      );
      check((await countText(page)) === '2 non lues', `${label} : le compte a baissé (« ${await countText(page)} »)`);
      check((await badgeOf(page)) === '2', `${label} : la pastille a baissé (« ${await badgeOf(page)} »)`);

      // ------------------------------------------------ 7. le menu d'une rangée
      await page.hover('[data-notification="fx-notif-reaction"]');
      await page.click('[data-notification="fx-notif-reaction"] button[aria-label="Actions de la notification"]');
      await page.click('[data-notification-action="markRead"]');
      await page.waitForFunction(
        () => document.querySelector('[data-notification="fx-notif-reaction"]')?.getAttribute('data-read') === 'true',
      ).catch(() => null);
      check(
        (await page.getAttribute('[data-notification="fx-notif-reaction"]', 'data-read')) === 'true' && (await countText(page)) === '1 non lue',
        `${label} : « Marquer comme lue » a un effet (« ${await countText(page)} »)`,
      );

      await page.hover('[data-notification="fx-notif-login"]');
      await page.click('[data-notification="fx-notif-login"] button[aria-label="Actions de la notification"]');
      await page.click('[data-notification-action="delete"]');
      await page.waitForFunction(() => document.querySelector('[data-notification="fx-notif-login"]') === null).catch(() => null);
      check((await rowsOf(page)).length === 11, `${label} : « Supprimer » retire la rangée (${(await rowsOf(page)).length} rangées)`);

      // ------------------------------------------------ 8. tout lire
      await page.click('[data-mark-all-read]');
      await page.waitForFunction(() => document.querySelector('.floating-menus [data-unread]') === null).catch(() => null);
      check((await badgeOf(page)) === null, `${label} : à zéro, la pastille DISPARAÎT`);
      check((await countText(page)) === null, `${label} : à zéro, l'en-tête ne dit plus de compte`);
      check((await page.$('[data-mark-all-read]')) === null, `${label} : « Tout lire » s'efface avec ce qu'il avait à lire`);
      check((await rowsOf(page)).every((r) => r.read === 'true'), `${label} : toutes les rangées sont lues`);
      check((await page.getAttribute('[data-floating-menu]', 'aria-label')) === 'Menu', `${label} : le bouton redevient « Menu »`);

      // ------------------------------------------------ 9. aucune erreur
      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} échec(s) :\n`);
  for (const failure of failures) console.error(`  ÉCHEC ${failure}`);
  process.exit(1);
}
console.log('\n  la cloche : pastille, catégories, cible, menu et « Tout lire » ont chacun leur effet\n');
