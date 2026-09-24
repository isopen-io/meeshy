#!/usr/bin/env node
/**
 * LE BARREAU « ADMINISTRATION » DU MENU FLOTTANT (#6458) — ce qu'aucun témoin
 * unitaire ne voit : la GÉOMÉTRIE réelle de sept barreaux, le PARCOURS clavier
 * dans un vrai navigateur, la NAVIGATION vers `/admin`, et le RÉSEAU — la
 * matrice lue une fois, jamais sans session.
 *
 * Sur un `dist` construit avec `VITE_DATA_SOURCE=gateway` : l'administration
 * n'a volontairement pas de démonstration (`lib/api/admin.ts`), le barreau ne
 * peut donc exister que sur une matrice SERVIE. `GET /api/v1/me/permissions`
 * est intercepté ; TOUTE autre requête sortante est abandonnée — aucun octet
 * ne part vers une passerelle réelle depuis ce gate.
 *
 *  1. SANS session : aucune lecture des permissions (`/login`).
 *  2. Matrice SERVIE avec le droit, deux schémas × deux gabarits (390 × 844,
 *     320 × 568) :
 *     - pose par défaut (échelle qui DESCEND) : sept barreaux, le dernier mène
 *       à `/admin` et se nomme « Administration » ; chacun ENTIÈREMENT dans
 *       l'écran, atteignable en son centre (`elementFromPoint`), quatre d'air
 *       au moins entre deux voisins ;
 *     - le clavier : `Entrée` ouvre, le focus entre sur le premier barreau,
 *       `Fin` le pose sur l'administration, `Bas` revient au premier, `Haut`
 *       y retourne ; `Entrée` y NAVIGUE, l'échelle se referme, et l'écran
 *       `/admin` ne relit PAS la matrice (une seule requête) ;
 *     - pose basse (`menuButtonPosition = "1,1"`, échelle qui MONTE) : les
 *       mêmes sept barreaux dans l'écran, l'administration en haut.
 *  3. Matrice servie SANS le droit, 403, et requête EN VOL : les six d'iOS,
 *     aucun chemin vers `/admin`.
 *
 * Construit dans `dist-admin-rung` (motif `dist-*` du `.gitignore`).
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette de chaque gabarit.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-admin-rung';
const OUT = join(ROOT, OUT_DIR);
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/** Un barreau et l'air minimal que la loi de pose garantit (`floating-pose.ts`). */
const RUNG = 46;
const MIN_GAP = 4;
const RUNGS_IOS = 6;

const PERMISSIONS_PATH = '/api/v1/me/permissions';

const AUCUNE = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
};

/** Une session de RECETTE — des jetons factices, qu'aucune passerelle ne connaît. */
const SESSION = {
  token: 'jeton-de-recette',
  sessionToken: 'session-de-recette',
  user: { id: '64b000000000000000000001', username: 'recette-admin', displayName: 'Recette Admin' },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

async function serve(dist) {
  const server = createServer(async (req, res) => {
    const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    for (const f of [join(dist, p), join(dist, `${p}.html`), join(dist, p, 'index.html'), join(dist, 'index.html')]) {
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
  return server;
}

const failures = [];
let oks = 0;
const check = (ok, what) => {
  if (ok) oks += 1;
  else failures.push(what);
};

/**
 * Un contexte de navigateur : la session (ou non), la pose du bouton, et la
 * réponse que la « passerelle » sert aux permissions. `served` :
 * `'admin' | 'user' | 403 | 'pending'`.
 */
async function openContext(browser, { base, viewport, scheme, session, pose, served }) {
  const context = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
  await context.addInitScript(
    ({ session: s, pose: p }) => {
      if (s !== null) window.localStorage.setItem('meeshy.session', JSON.stringify(s));
      if (p !== null) window.localStorage.setItem('menuButtonPosition', p);
    },
    { session, pose },
  );
  const permissionCalls = [];
  const held = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.pathname !== PERMISSIONS_PATH) return route.abort();

    permissionCalls.push(url.pathname);
    if (served === 'pending') {
      held.push(route);
      return undefined;
    }
    if (served === 403) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Forbidden' }) });
    }
    const permissions = { ...AUCUNE, canAccessAdmin: served === 'admin' };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { role: served === 'admin' ? 'ADMIN' : 'USER', permissions } }),
    });
  });
  const page = await context.newPage();
  const close = async () => {
    await Promise.all(held.map((route) => route.abort().catch(() => undefined)));
    await context.close();
  };
  return { context, page, permissionCalls, close };
}

const settle = (page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), undefined, { timeout: 3_000 }).catch(() => undefined);

/** Les barreaux rendus, leur boîte, et qui reçoit le doigt en leur centre. */
const readRungs = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        href: el.getAttribute('href'),
        label: el.getAttribute('aria-label'),
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        reachable: hit !== null && (hit === el || el.contains(hit)),
        viewportW: innerWidth,
        viewportH: innerHeight,
      };
    }),
  );

const focusedHref = (page) => page.evaluate(() => document.activeElement?.getAttribute('href') ?? null);

const until = async (predicate, timeout = 3_000) => {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeout) await new Promise((ok) => setTimeout(ok, 25));
  return predicate();
};

/** La géométrie de sept barreaux : dans l'écran, atteignables, espacés. */
function checkLadderGeometry(tag, rungs, { adminEnd }) {
  check(rungs.length === RUNGS_IOS + 1, `${tag} : sept barreaux (obtenu ${rungs.length})`);
  const admin = rungs.at(-1);
  check(admin?.href === '/admin', `${tag} : le dernier barreau mène à /admin (obtenu ${admin?.href})`);
  check(admin?.label === 'Administration', `${tag} : le dernier barreau se nomme « Administration » (obtenu ${admin?.label})`);
  check(rungs.filter((r) => r.href === '/admin').length === 1, `${tag} : un seul chemin vers /admin`);

  for (const r of rungs) {
    check(
      r.top >= 0 && r.bottom <= r.viewportH && r.left >= 0 && r.right <= r.viewportW,
      `${tag} : « ${r.label} » entièrement dans l'écran (${JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom), h: r.viewportH })})`,
    );
    check(Math.round(r.width) === RUNG, `${tag} : « ${r.label} » garde son diamètre de ${RUNG} (${r.width})`);
    check(r.reachable, `${tag} : « ${r.label} » reçoit le doigt en son centre`);
  }

  const ordered = [...rungs].sort((a, b) => a.top - b.top);
  for (let i = 1; i < ordered.length; i += 1) {
    const gap = ordered[i].top - ordered[i - 1].bottom;
    check(gap >= MIN_GAP - 0.5, `${tag} : ${MIN_GAP} d'air au moins entre « ${ordered[i - 1].label} » et « ${ordered[i].label} » (${gap.toFixed(1)})`);
  }

  const extreme = adminEnd === 'bottom' ? ordered.at(-1) : ordered[0];
  check(extreme?.href === '/admin', `${tag} : l'administration est le barreau le plus ${adminEnd === 'bottom' ? 'bas' : 'haut'} (obtenu ${extreme?.href})`);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

  console.log(`  construction VITE_DATA_SOURCE=gateway → ${OUT_DIR}/ …`);
  const build = spawnSync('bunx', ['vite', 'build', '--outDir', OUT_DIR], {
    cwd: ROOT,
    env: { ...process.env, VITE_DATA_SOURCE: 'gateway' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (build.status !== 0) {
    console.error('\n  la construction VITE_DATA_SOURCE=gateway a échoué — voir la sortie ci-dessus.\n');
    process.exit(1);
  }

  const server = await serve(OUT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();

  try {
    // ----------------------------------------------------- 1. sans session
    {
      const ctx = await openContext(browser, { base, viewport: { width: 390, height: 844 }, scheme: 'light', session: null, pose: null, served: 'admin' });
      await ctx.page.goto(`${base}/`, { waitUntil: 'load' });
      await ctx.page.waitForTimeout(1_200);
      const path = await ctx.page.evaluate(() => window.location.pathname);
      check(path === '/login', `sans session, "/" mène à /login (obtenu ${path})`);
      check(ctx.permissionCalls.length === 0, `sans session, aucune lecture des permissions (obtenu ${ctx.permissionCalls.length})`);
      await ctx.close();
    }

    // ------------------------------------------- 2. le droit servi, 2 × 2
    for (const scheme of ['light', 'dark']) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 320, height: 568 },
      ]) {
        const gabarit = `${scheme} ${viewport.width}×${viewport.height}`;

        // 2a. pose par défaut — l'échelle descend, parcourue au clavier.
        {
          const tag = `Administration, pose haute, ${gabarit}`;
          const ctx = await openContext(browser, { base, viewport, scheme, session: SESSION, pose: null, served: 'admin' });
          const { page } = ctx;
          await page.goto(`${base}/`, { waitUntil: 'load' });
          await page.waitForSelector('[data-floating-menu]');
          check(await until(() => ctx.permissionCalls.length === 1), `${tag} : la matrice est lue (obtenu ${ctx.permissionCalls.length})`);
          await page.waitForTimeout(250);

          await page.focus('[data-floating-menu]');
          await page.keyboard.press('Enter');
          await page.waitForSelector('[role="menuitem"][href="/admin"]', { timeout: 3_000 }).catch(() => undefined);
          await settle(page);

          checkLadderGeometry(tag, await readRungs(page), { adminEnd: 'bottom' });
          if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `admin-rung.down.${scheme}.${viewport.width}x${viewport.height}.png`) });

          check((await focusedHref(page)) === '/links', `${tag} : à l'ouverture, le focus entre sur le premier barreau (obtenu ${await focusedHref(page)})`);
          await page.keyboard.press('End');
          check((await focusedHref(page)) === '/admin', `${tag} : Fin pose le focus sur l'administration (obtenu ${await focusedHref(page)})`);
          await page.keyboard.press('ArrowDown');
          check((await focusedHref(page)) === '/links', `${tag} : Bas revient au premier barreau (obtenu ${await focusedHref(page)})`);
          await page.keyboard.press('ArrowUp');
          check((await focusedHref(page)) === '/admin', `${tag} : Haut retourne à l'administration (obtenu ${await focusedHref(page)})`);

          await page.keyboard.press('Enter');
          const arrived = await page
            .waitForFunction(() => window.location.pathname === '/admin', undefined, { timeout: 3_000 })
            .then(() => true, () => false);
          check(arrived, `${tag} : Entrée sur le barreau mène à /admin`);
          check((await page.locator('[role="menu"]').count()) === 0, `${tag} : l'échelle se referme en y allant`);
          await page.waitForTimeout(600);
          check(ctx.permissionCalls.length === 1, `${tag} : l'écran /admin ne relit pas la matrice (obtenu ${ctx.permissionCalls.length} lectures)`);
          await ctx.close();
        }

        // 2b. pose basse — l'échelle monte.
        {
          const tag = `Administration, pose basse, ${gabarit}`;
          const ctx = await openContext(browser, { base, viewport, scheme, session: SESSION, pose: '1,1', served: 'admin' });
          const { page } = ctx;
          await page.goto(`${base}/`, { waitUntil: 'load' });
          await page.waitForSelector('[data-floating-menu]');
          await until(() => ctx.permissionCalls.length === 1);
          await page.waitForTimeout(250);
          await page.click('[data-floating-menu]');
          await page.waitForSelector('[role="menuitem"][href="/admin"]', { timeout: 3_000 }).catch(() => undefined);
          await settle(page);

          checkLadderGeometry(tag, await readRungs(page), { adminEnd: 'top' });
          if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `admin-rung.up.${scheme}.${viewport.width}x${viewport.height}.png`) });
          await ctx.close();
        }
      }
    }

    // ------------------------------------ 3. sans le droit, 403, en vol
    for (const served of ['user', 403, 'pending']) {
      const tag = `matrice ${served}`;
      const ctx = await openContext(browser, { base, viewport: { width: 320, height: 568 }, scheme: 'light', session: SESSION, pose: null, served });
      const { page } = ctx;
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForSelector('[data-floating-menu]');
      check(await until(() => ctx.permissionCalls.length === 1), `${tag} : la matrice est demandée (obtenu ${ctx.permissionCalls.length})`);
      await page.waitForTimeout(400);
      await page.click('[data-floating-menu]');
      await page.waitForSelector('[role="menuitem"]');
      await settle(page);
      const rungs = await readRungs(page);
      check(rungs.length === RUNGS_IOS, `${tag} : les six barreaux d'iOS (obtenu ${rungs.length})`);
      check(rungs.every((r) => r.href !== '/admin'), `${tag} : aucun chemin vers /admin`);
      if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `admin-rung.absent.${served}.png`) });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(`check-admin-rung : ${failures.length} échec(s) sur ${failures.length + oks} constats`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `check-admin-rung : vert — ${oks} constats ; sept barreaux dans l'écran aux deux poses, 2 schémas × 2 gabarits, ` +
      'parcours clavier et navigation vers /admin sur une seule lecture de la matrice ; six barreaux sans le droit, sur 403 et en vol ; aucune lecture sans session.',
  );
}

await main();
