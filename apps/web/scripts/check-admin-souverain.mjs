#!/usr/bin/env node
/**
 * LA RECETTE AU NAVIGATEUR DE L'ADMINISTRATION SOUVERAINE (#6862, #6733,
 * #6819) — ce qu'aucun témoin `bun test` de ce chantier ne peut voir : le
 * `<dialog>` natif (happy-dom ne l'ouvre pas), les sections montées en
 * panneaux de leur onglet, le PARCOURS clavier réel, le contenu de `localStorage` APRÈS une
 * lecture souveraine, et la LANGUE effectivement peinte dans les rangées.
 *
 * Sur un `dist` construit avec `VITE_DATA_SOURCE=gateway` : l'administration
 * n'a volontairement aucune démonstration (`lib/api/admin.ts`), donc tout ce
 * qui s'affiche ici vient d'une charge SERVIE. Les routes d'administration
 * sont interceptées et répondues ; TOUTE autre requête sortante est
 * abandonnée — aucun octet ne part vers une passerelle réelle.
 *
 * AUCUNE ROUTE HTTP N'EST INVENTÉE : les huit adresses servies plus bas
 * existent toutes dans `services/gateway/src/routes/{me,admin}` et sont déjà
 * les seules que `lib/api/admin*.ts` appelle.
 *
 * CE FICHIER ORCHESTRE, IL NE PORTE PLUS NI LA CHARGE NI LES CONSTATS (#7023).
 * La charge servie vit dans `lib/admin-souverain-corpus.mjs` — dont l'en-tête
 * porte la table du Prisme et la raison de chaque ligne — et les constats de
 * médias dans `lib/check-admin-medias.mjs`. Un découpage PAR RESPONSABILITÉ,
 * arrivé par le budget : la rangée des trois médiums ajoutée au corpus faisait
 * passer cet hôte au-delà des 1 000 lignes (`CLAUDE.md` § Code Style).
 *
 * Construit dans `dist-admin-souverain` (motif `dist-*` du `.gitignore`).
 * `CAPTURE_DIR=<dossier>` écrit les captures de chaque état ; par défaut
 * `dist-recette/`, ignoré par le même motif.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { constateLesMedias } from './lib/check-admin-medias.mjs';
import {
  AGENT_CONFIGS,
  AGENT_LOGS,
  AGENT_STATS,
  CONVERSATIONS_DU_MEMBRE,
  CONVERSATION_ID,
  MEDIAS_DU_MEMBRE,
  MEMBRE,
  MEMBRE_ID,
  MESSAGES_SERVIS,
  SECRETS_DES_PIECES,
  SESSION,
  TEXTES,
  identiteServie,
} from './lib/admin-souverain-corpus.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-admin-souverain';
const OUT = join(ROOT, OUT_DIR);
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? join(ROOT, 'dist-recette');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const VIEWPORT = { width: 430, height: 932 };

// ---------------------------------------------------------------------------
// LE SERVEUR STATIQUE ET L'INTERCEPTION
// ---------------------------------------------------------------------------

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

const enveloppe = (data, pagination) => JSON.stringify({ success: true, data, ...(pagination === undefined ? {} : { pagination }) });

/** La table des routes SERVIES — chacune existe déjà côté passerelle. */
function repondre(pathname, search, avecAgent) {
  if (pathname === '/api/v1/me/permissions') return enveloppe(identiteServie(avecAgent));

  if (pathname === `/api/v1/admin/users/${MEMBRE_ID}/conversations`) {
    return enveloppe(CONVERSATIONS_DU_MEMBRE, { total: CONVERSATIONS_DU_MEMBRE.length, offset: 0, limit: 20, hasMore: false });
  }
  if (pathname === `/api/v1/admin/users/${MEMBRE_ID}/media`) {
    return enveloppe(MEDIAS_DU_MEMBRE, { total: MEDIAS_DU_MEMBRE.length, offset: 0, limit: 20, hasMore: false });
  }
  if (pathname === `/api/v1/admin/users/${MEMBRE_ID}`) return enveloppe(MEMBRE);

  if (pathname === `/api/v1/admin/conversations/${CONVERSATION_ID}/messages`) {
    // LE MOTIF EST LU SUR LA REQUÊTE — une lecture sans motif est REFUSÉE ici
    // comme le schéma AJV de la route la refuse (400 avant le handler).
    const reason = new URLSearchParams(search).get('reason') ?? '';
    if (reason.trim().length < 10) return null;
    return enveloppe(MESSAGES_SERVIS, { total: MESSAGES_SERVIS.length, offset: 0, limit: 30, hasMore: false });
  }

  if (pathname === '/api/v1/admin/agent/stats') return enveloppe(AGENT_STATS);
  if (pathname === '/api/v1/admin/agent/configs') {
    return enveloppe(AGENT_CONFIGS, { total: AGENT_CONFIGS.length, page: 1, limit: 20, hasMore: false });
  }
  if (pathname === '/api/v1/admin/agent/scan-logs') {
    return enveloppe(AGENT_LOGS, { total: AGENT_LOGS.length, page: 1, limit: 20, hasMore: false });
  }
  if (pathname === `/api/v1/admin/agent/configs/${CONVERSATION_ID}/live`) {
    return enveloppe({ conversationId: CONVERSATION_ID, isScanning: false, currentNode: null });
  }
  if (pathname === '/api/v1/admin/dashboard') {
    // La forme que `decodeAdminDashboard` lit : `statistics` et
    // `recentActivity`, jamais une charge à plat — six compteurs à zéro sur un
    // hub par ailleurs juste est la signature d'un corpus mal formé.
    return enveloppe({
      statistics: { totalUsers: 128, activeUsers: 64, totalMessages: 9421, totalCommunities: 7, totalReports: 2 },
      recentActivity: { newUsers: 3, newMessages: 51 },
    });
  }

  return null;
}

/**
 * LA LANGUE D'INTERFACE EST SEMÉE, JAMAIS SUBIE. `currentInterfaceLanguage()`
 * la lit sur `document.documentElement.lang`, que le script inline résout
 * depuis `localStorage` PUIS depuis `navigator.language`. Sans cette graine, le
 * verdict d'un libellé dépendrait de la locale de la machine qui lance la
 * recette — « un vert des deux côtés d'une mutation mesure la machine ».
 */
const LANGUE_KEY = 'meeshy.interface-language';

async function openContext(browser, { base, avecAgent, langue = 'fr', schema = 'light' }) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: schema, serviceWorkers: 'block' });
  await context.addInitScript(
    ({ session, langue: code, clef }) => {
      window.localStorage.setItem('meeshy.session', JSON.stringify(session));
      window.localStorage.setItem(clef, code);
    },
    { session: SESSION, langue, clef: LANGUE_KEY },
  );

  const appels = [];
  await context.route('**/*', async (route) => {
    const brut = route.request().url();
    if (!brut.startsWith('http')) return route.continue();
    const url = new URL(brut);
    if (url.origin === base) return route.continue();
    if (!url.pathname.startsWith('/api/v1/')) return route.abort();

    appels.push(url.pathname + url.search);
    const corps = repondre(url.pathname, url.search.replace(/^\?/, ''), avecAgent);
    if (corps === null) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'non prévu par la recette' }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: corps });
  });

  const page = await context.newPage();
  return { context, page, appels, close: () => context.close() };
}

// ---------------------------------------------------------------------------
// LE JOURNAL DE RECETTE
// ---------------------------------------------------------------------------

const constats = [];
const check = (ok, quoi) => {
  constats.push({ ok, quoi });
  console.log(`  ${ok ? '✓' : '✗'} ${quoi}`);
};

let capture = 0;
const cliche = async (page, nom, { fullPage = false } = {}) => {
  capture += 1;
  const fichier = join(CAPTURE_DIR, `${String(capture).padStart(2, '0')}-${nom}.png`);
  await page.screenshot({ path: fichier, fullPage });
  console.log(`    ↳ ${fichier}`);
  return fichier;
};

/** Un horodatage SERVI tel quel — ce qu'aucun écran ne doit peindre. */
const ISO_NU = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const texteDe = (page, selecteur) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', selecteur);
const present = async (page, selecteur) => (await page.locator(selecteur).count()) > 0;

const attendre = async (predicat, timeout = 6_000) => {
  const debut = Date.now();
  for (;;) {
    if (await predicat()) return true;
    if (Date.now() - debut > timeout) return false;
    await new Promise((ok) => setTimeout(ok, 60));
  }
};

/** Le fil ne se peint qu'une fois le virtualiseur alimenté. */
const attendreLeFil = (page) => attendre(() => present(page, '[data-row]'));

/** Ouvre un onglet de la fiche d'un membre (#7845) et attend qu'il soit sélectionné. */
async function ouvrirOnglet(page, onglet) {
  const selecteur = `[data-admin-user-tab="${onglet}"]`;
  await attendre(() => present(page, selecteur));
  await page.click(selecteur);
  await attendre(() => page.evaluate((s) => document.querySelector(s)?.getAttribute('aria-selected') === 'true', selecteur));
}

/** Ouvre la modale d'une conversation et écrit le motif. */
async function lireLaConversation(page, motif) {
  await page.click(`[data-admin-conversation-open="${CONVERSATION_ID}"]`);
  await attendre(() => present(page, '[data-admin-reading-gate]'));
  await page.fill('[data-admin-reason]', motif);
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
// LA RECETTE
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(CAPTURE_DIR, { recursive: true });

  /* `REUSE_DIST=1` REJOUE la recette sur le `dist` déjà construit — pour
     l'itération sur les constats eux-mêmes, jamais pour un verdict : une
     recette qui juge un `dist` qu'elle n'a pas construit ne dit rien des
     sources d'aujourd'hui. */
  const reutilise = process.env.REUSE_DIST === '1' && (await stat(join(OUT, 'index.html')).then(() => true, () => false));
  if (reutilise) {
    console.log(`  REUSE_DIST=1 — recette rejouée sur ${OUT_DIR}/ tel quel.`);
  } else {
    await rm(OUT, { recursive: true, force: true });
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
  }

  const server = await serve(OUT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();

  try {
    // ------------------------------------------------- 1. la tuile « Agent »
    console.log('\n1. LA TUILE « AGENT » SUIT `canManageAgent`');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      await ctx.page.goto(`${base}/adm`, { waitUntil: 'load' });
      await attendre(() => present(ctx.page, '[data-admin-section="users"]'));
      await ctx.page.waitForTimeout(400);
      check(await present(ctx.page, '[data-admin-section="agent"]'), 'avec `canManageAgent` : la tuile Agent est peinte');
      check(
        await present(ctx.page, '[data-admin-section="conversations"]'),
        'avec le rang ADMIN : la tuile Conversations est peinte',
      );
      await cliche(ctx.page, 'hub-avec-agent');
      await ctx.close();
    }
    {
      const ctx = await openContext(browser, { base, avecAgent: false });
      await ctx.page.goto(`${base}/adm`, { waitUntil: 'load' });
      await attendre(() => present(ctx.page, '[data-admin-section="users"]'));
      await ctx.page.waitForTimeout(400);
      check(!(await present(ctx.page, '[data-admin-section="agent"]')), 'sans `canManageAgent` : AUCUNE tuile Agent');
      check(await present(ctx.page, '[data-admin-section="users"]'), 'sans `canManageAgent` : les autres tuiles restent');
      await cliche(ctx.page, 'hub-sans-agent');
      await ctx.close();
    }

    // ---------------------------------------- 2. /adm/agent === /admin/agent
    console.log('\n2. `/adm/agent` ET `/admin/agent` RENDENT LE MÊME ÉCRAN');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const lire = async (adresse) => {
        await ctx.page.goto(`${base}${adresse}`, { waitUntil: 'load' });
        await attendre(() => present(ctx.page, '[data-admin-agent-panel]'));
        await ctx.page.waitForTimeout(500);
        return ctx.page.evaluate(() => (document.querySelector('[data-admin-agent-panel]')?.textContent ?? '').replace(/\s+/g, ' ').trim());
      };
      const adm = await lire('/adm/agent');
      await cliche(ctx.page, 'agent-adm');
      const admin = await lire('/admin/agent');
      await cliche(ctx.page, 'agent-admin');
      check(adm !== '', '`/adm/agent` rend le panneau de l’agent');
      check(admin !== '', '`/admin/agent` rend le panneau de l’agent');
      check(adm === admin, 'les deux adresses rendent le MÊME contenu');

      // -------------------------- 8. le libellé de relance dit ce qu'il fait
      console.log('\n8. LE CONTRÔLE DE RELANCE DIT QU’IL PEUT PUBLIER');
      check(
        await present(ctx.page, `[data-agent-relaunch="${CONVERSATION_ID}"]`),
        'la conversation suivie porte un bouton de relance',
      );
      const effet = await texteDe(ctx.page, `[data-agent-relaunch-effect="${CONVERSATION_ID}"]`);
      check(/publier un message/i.test(effet), `le libellé mentionne la publication — « ${effet.trim()} »`);
      await ctx.page.locator(`[data-agent-relaunch="${CONVERSATION_ID}"]`).scrollIntoViewIfNeeded();
      await cliche(ctx.page, 'agent-relance-libelle');
      await ctx.close();
    }
    {
      // LA PROMESSE TIENT DANS UNE SECONDE LANGUE — une phrase d'effet servie
      // par un seul catalogue serait un avertissement réservé aux francophones.
      const ctx = await openContext(browser, { base, avecAgent: true, langue: 'en' });
      await ctx.page.goto(`${base}/adm/agent`, { waitUntil: 'load' });
      await attendre(() => present(ctx.page, `[data-agent-relaunch-effect="${CONVERSATION_ID}"]`));
      await ctx.page.waitForTimeout(400);
      const effet = await texteDe(ctx.page, `[data-agent-relaunch-effect="${CONVERSATION_ID}"]`);
      check(/publish a message/i.test(effet), `en anglais aussi, le libellé dit la publication — « ${effet.trim()} »`);
      await ctx.page.locator(`[data-agent-relaunch="${CONVERSATION_ID}"]`).scrollIntoViewIfNeeded();
      await cliche(ctx.page, 'agent-relance-libelle-en');
      await ctx.close();
    }

    // ------------------------------- 3. les deux sections sont des panneaux
    console.log('\n3. LA FICHE MEMBRE MONTE CHAQUE SECTION COMME PANNEAU DE SON ONGLET');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page } = ctx;
      await page.goto(`${base}/adm/users/${MEMBRE_ID}`, { waitUntil: 'load' });
      await attendre(() => present(page, `[data-admin-user="${MEMBRE_ID}"]`));
      /* LA FICHE EST EN ONGLETS depuis #7845 : chaque section ne se monte
         qu'avec le sien. On ouvre donc celui des conversations pour la voir. */
      await ouvrirOnglet(page, 'conversations');
      await attendre(() => present(page, '[data-admin-section="conversations"]'));
      await page.waitForTimeout(500);
      await cliche(page, 'fiche-membre-profil', { fullPage: true });

      /* LA FICHE NE PEINT PAS D'HORODATAGE BRUT — « Inscrit le
         2026-01-12T08:30:00.000Z » est ce qu'un écran affiche quand il rend la
         charge au lieu de la LIRE, et aucun témoin unitaire ne le voit. */
      const fiche = await texteDe(page, `[data-admin-user="${MEMBRE_ID}"]`);
      check(!ISO_NU.test(fiche), `la fiche ne peint aucun horodatage ISO brut${ISO_NU.test(fiche) ? ` — « ${(fiche.match(ISO_NU) ?? [''])[0]} »` : ''}`);
      check(
        await present(page, `[data-admin-conversation-open="${CONVERSATION_ID}"]`),
        'l’onglet Conversations porte ses lignes',
      );
      /* Le cadre d'administration défile dans un conteneur À LUI : `fullPage`
         ne descend pas dedans. On amène donc la seconde section à l'écran pour
         la VOIR — une capture qui ne montre pas ce qu'on affirme ne prouve
         rien. */
      await page.locator(`[data-admin-conversation-open="${CONVERSATION_ID}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await cliche(page, 'fiche-membre-section-conversations');

      /* Un repliable du même titre que l'onglet le RÉPÉTAIT, et un clic
         vidait le panneau entier (revue #7845) : la section est désormais le
         panneau lui-même, nommé par son onglet. */
      for (const [section, onglet, ancien] of [['media', 'media', 'admin-media'], ['conversations', 'conversations', 'admin-conv']]) {
        await ouvrirOnglet(page, onglet);
        check(await attendre(() => present(page, `[data-admin-section="${section}"]`)), `l’onglet « ${onglet} » monte sa section`);
        const etat = await page.evaluate(
          ({ onglet: o, ancien: a }) => {
            const tab = document.querySelector(`[data-admin-user-tab="${o}"]`);
            const panneau = document.querySelector(`[data-admin-user-panel="${o}"]`);
            return {
              repliable: document.querySelector(`[data-collapsible-toggle="${a}"]`) !== null,
              nomme: tab !== null && panneau?.getAttribute('aria-labelledby') === tab.id,
            };
          },
          { onglet, ancien },
        );
        check(!etat.repliable, `« ${onglet} » : aucun repliable ne répète l’onglet`);
        check(etat.nomme, `« ${onglet} » : le panneau est nommé par son onglet (aria-labelledby)`);
      }
      await ctx.close();
    }

    // ------------------------ 4. la ligne ouvre la modale, sous motif écrit
    console.log('\n4. UNE LIGNE DE CONVERSATION OUVRE LA MODALE, SOUS MOTIF');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page, appels } = ctx;
      await page.goto(`${base}/adm/users/${MEMBRE_ID}?tab=conversations`, { waitUntil: 'load' });
      await attendre(() => present(page, `[data-admin-conversation-open="${CONVERSATION_ID}"]`));
      await page.waitForTimeout(400);

      const avant = appels.filter((a) => a.includes('/messages')).length;
      await page.click(`[data-admin-conversation-open="${CONVERSATION_ID}"]`);
      check(
        await attendre(() => present(page, `[data-admin-conversation-sheet="${CONVERSATION_ID}"]`)),
        'la ligne OUVRE la modale (elle n’est pas inerte)',
      );
      /* La fiche d'un membre monte PLUSIEURS `Sheet` (mot de passe, édition,
       * bannissement, conversation) : `document.querySelector('dialog')` rend
       * le PREMIER du document, pas celui qu'on vient d'ouvrir. Et `showModal()`
       * vit dans un effet — sur un exécuteur lent, l'interroger juste après le
       * clic mesure l'ORDONNANCEMENT, pas le produit. On cherche donc le dialog
       * qui CONTIENT la feuille attendue, et on lui laisse le temps de s'ouvrir.
       *
       * `:modal` est vrai pour `showModal()` et FAUX pour `<dialog open>` : ce
       * témoin est plus strict que `.open`, il ne se contente pas d'un panneau
       * visible qui ne piégerait ni le focus ni Échap. */
      const modaleEstNative = () =>
        page.evaluate((id) => {
          const feuille = document.querySelector(`[data-admin-conversation-sheet="${id}"]`);
          const d = feuille?.closest('dialog') ?? null;
          return d !== null && d.open && d.matches(':modal');
        }, CONVERSATION_ID);
      check(await attendre(modaleEstNative), '`<dialog>` natif, réellement MODAL (showModal)');
      check(await present(page, '[data-admin-reading-gate]'), 'le MOTIF est demandé avant toute lecture');
      await page.waitForTimeout(500);
      check(
        appels.filter((a) => a.includes('/messages')).length === avant,
        'aucune requête de messages n’est partie avant le motif',
      );
      await cliche(page, 'modale-motif-demande');

      await page.fill('[data-admin-reason]', 'Neuf care');
      await page.waitForTimeout(150);
      const neuf = await page.evaluate(() => ({
        longueur: document.querySelector('[data-admin-reason]')?.value.length ?? -1,
        inactif: document.querySelector('[data-admin-reason-submit]')?.disabled ?? null,
      }));
      check(neuf.longueur === 9, `le champ porte bien NEUF caractères (${neuf.longueur})`);
      check(neuf.inactif === true, 'à neuf caractères, le bouton de lecture reste INACTIF');
      await cliche(page, 'modale-motif-neuf-caracteres');

      await page.fill('[data-admin-reason]', 'Signalement #9142 — vérification du fil');
      await page.waitForTimeout(150);
      const dix = await page.evaluate(() => document.querySelector('[data-admin-reason-submit]')?.disabled ?? null);
      check(dix === false, 'à dix caractères et plus, le bouton devient actif');
      await ctx.close();
    }

    // ------------------- 5, 6, 7 : la vraie vue, au prisme du membre, sans trace
    console.log('\n5+6+7. LA VRAIE VUE, AU PRISME DU MEMBRE, SANS TRACE SUR LE DISQUE');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page } = ctx;
      await page.goto(`${base}/adm/users/${MEMBRE_ID}?tab=conversations`, { waitUntil: 'load' });
      await attendre(() => present(page, `[data-admin-conversation-open="${CONVERSATION_ID}"]`));
      await page.waitForTimeout(400);
      await lireLaConversation(page, 'Signalement #9142 — vérification du fil');
      await page.click('[data-admin-reason-submit]');

      check(await attendreLeFil(page), 'la modale rend LE FIL après le motif');
      await page.waitForTimeout(900);
      await cliche(page, 'modale-fil-prisme-membre');

      // 5. LA VRAIE VUE — les rangées du produit, pas des `<li>` à plat.
      const anatomie = await page.evaluate(() => {
        const racine = document.querySelector('[data-admin-reading]');
        const rangees = [...(racine?.querySelectorAll('[data-row]') ?? [])];
        return {
          rangees: rangees.length,
          articles: rangees.filter((r) => r.getAttribute('role') === 'article').length,
          etiquetes: rangees.filter((r) => (r.getAttribute('aria-label') ?? '') !== '').length,
          langues: rangees.map((r) => r.getAttribute('lang')),
          images: racine?.querySelectorAll('img').length ?? 0,
          audios: racine?.querySelectorAll('audio').length ?? 0,
          liPlats: racine === null ? -1 : [...racine.querySelectorAll('li')].filter((li) => li.querySelector('[data-row]') === null).length,
        };
      });
      check(anatomie.rangees >= 2, `la vue rend des rangées du produit (${anatomie.rangees})`);
      check(anatomie.articles === anatomie.rangees, 'chaque rangée est un `role="article"`, pas un `<li>` nu');
      check(anatomie.etiquetes === anatomie.rangees, 'chaque rangée porte son `aria-label` composé');
      check(anatomie.images >= 1, `l’IMAGE du message est rendue (${anatomie.images})`);
      check(anatomie.audios >= 1, `l’AUDIO du message est rendu (${anatomie.audios})`);

      // 6. LE PRISME EST CELUI DU MEMBRE.
      const rendu = await texteDe(page, '[data-admin-reading]');
      const prisme = await texteDe(page, '[data-admin-reading-prism]');
      check(/de\s*›\s*es/.test(prisme), `la bannière ANNONCE le prisme du membre — « ${prisme.trim()} »`);
      check(rendu.includes(TEXTES.espagnol), `le texte SERVI est l’espagnol (rang 2 du membre) — « ${TEXTES.espagnol} »`);
      check(
        !rendu.includes(TEXTES.francais),
        'le français de l’ADMINISTRATEUR n’est PAS servi dans la modale du membre',
      );
      check(!rendu.includes(TEXTES.original), 'l’ORIGINAL anglais n’est pas servi (la descente ne s’arrête pas au rang 1)');
      check(
        anatomie.langues.includes('es'),
        `la rangée DÉCLARE la langue servie pour le lecteur d’écran (${JSON.stringify(anatomie.langues)})`,
      );

      // 7. RIEN SUR LE DISQUE.
      await page.waitForTimeout(2_500);
      const disque = await page.evaluate(() => {
        const entrees = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const clef = localStorage.key(i) ?? '';
          entrees.push({ clef, valeur: localStorage.getItem(clef) ?? '' });
        }
        return entrees;
      });
      const dump = disque.map((e) => `${e.clef}=${e.valeur}`).join('\n');
      check(disque.length > 0, `localStorage est LU depuis la page (${disque.length} clés : ${disque.map((e) => e.clef).join(', ')})`);
      for (const [nom, aiguille] of [
        ['l’espagnol servi', TEXTES.espagnol],
        ['le français', TEXTES.francais],
        ['l’original anglais', TEXTES.original],
        ['le message allemand du membre', 'Alles klar.'],
        ['la clé souveraine', 'admin-souverain'],
      ]) {
        check(!dump.includes(aiguille), `aucune trace de ${nom} dans localStorage`);
      }
      await ctx.close();
    }

    // --------------------------- 6 bis : le CONTRASTE, prisme administrateur
    console.log('\n6 bis. LE CONTRASTE — le MÊME corpus au prisme de l’ADMINISTRATEUR');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page } = ctx;
      await page.goto(`${base}/adm/conversations/${CONVERSATION_ID}`, { waitUntil: 'load' });
      await attendre(() => present(page, '[data-admin-reading-gate]'));
      await page.fill('[data-admin-reason]', 'Signalement #9142 — lecture de contrôle');
      await page.waitForTimeout(120);
      await page.click('[data-admin-reason-submit]');
      check(await attendreLeFil(page), '`/adm/conversations/:id` rend le fil au prisme de l’administrateur');
      await page.waitForTimeout(700);
      const rendu = await texteDe(page, '[data-admin-reading]');
      check(rendu.includes(TEXTES.francais), 'sans membre administré, c’est le FRANÇAIS de l’administrateur qui est servi');
      check(!rendu.includes(TEXTES.espagnol), 'l’espagnol du membre n’y est PAS — les deux prismes rendent bien deux textes');

      /* ET IL NE PRÉTEND PAS LE CONTRAIRE — constat ajouté par CETTE recette :
         le bandeau annonçait « Lu dans le prisme du membre : fr › en » sur un
         écran qui n'administre AUCUN membre et sert, de son propre
         doc-comment, le prisme de l'administrateur. Une phrase fausse sur la
         langue servie est pire qu'aucune phrase : elle fait prendre sa propre
         traduction pour celle de quelqu'un d'autre. */
      const banniere = await texteDe(page, '[data-admin-reading-prism]');
      check(
        !/prisme du membre/i.test(banniere),
        `le bandeau n’annonce AUCUN prisme de membre là où il n’y en a pas${banniere === '' ? '' : ` — « ${banniere.trim()} »`}`,
      );
      await cliche(page, 'ecran-souverain-prisme-administrateur');
      await ctx.close();
    }

    // ------------------- 8 : LES MÉDIAS, PEINTS ET PROTÉGÉS, DANS LES DEUX SCHÉMAS
    /**
     * #7023 — le constat qui manquait, et qu'aucun témoin `bun test` ne peut
     * rendre : happy-dom ne peint pas. Les sections 5 à 7 comptaient les
     * balises `<img>`/`<audio>` ; une balise n'est pas un pixel.
     *
     * Les DEUX schémas, parce que le voile d'une pièce protégée et le constat
     * d'un contenu retenu sont peints par des tokens (`--accent`,
     * `--color-ios-ink-2`) que le schéma sombre redéfinit — et qu'une
     * protection qu'on ne VOIT pas sur fond sombre est une protection annoncée
     * et non montrée (CLAUDE.md, cycle 124).
     */
    console.log('\n8. LES MÉDIAS DE LA LECTURE SOUVERAINE — PEINTS, ET PROTÉGÉS');
    for (const schema of ['light', 'dark']) {
      const ctx = await openContext(browser, { base, avecAgent: true, schema });
      const { page } = ctx;
      await page.goto(`${base}/adm/conversations/${CONVERSATION_ID}`, { waitUntil: 'load' });
      await attendre(() => present(page, '[data-admin-reading-gate]'));
      await page.fill('[data-admin-reason]', 'Signalement #9142 — contrôle des pièces');
      await page.waitForTimeout(120);
      await page.click('[data-admin-reason-submit]');
      check(await attendreLeFil(page), `[${schema}] la lecture souveraine rend le fil`);
      await page.waitForTimeout(900);

      await constateLesMedias(page, {
        check,
        schema,
        libre: 'a-image',
        vocal: 'm-traduit',
        protegee: 'm-piece-protegee',
        pieces: 'm-pieces',
        retenue: 'm-protege',
        /* Le prisme de CET écran est celui de l'administrateur (`fr`) : la
           piste attendue est donc la française, et le témoin distingue ainsi
           « la bonne piste » de « l'original servi par défaut ». */
        pisteAttendue: 'AAAAHGZ0eXBNNEEi',
        secrets: SECRETS_DES_PIECES,
      });

      await cliche(page, `medias-souverains-${schema}`, { fullPage: true });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const echecs = constats.filter((c) => !c.ok);
  console.log('');
  if (echecs.length > 0) {
    console.error(`check-admin-souverain : ${echecs.length} échec(s) sur ${constats.length} constats`);
    for (const e of echecs) console.error(`  ✗ ${e.quoi}`);
    process.exit(1);
  }
  console.log(
    `check-admin-souverain : vert — ${constats.length} constats ; tuile Agent sous son droit, deux adresses d’un même écran, ` +
      'sections montées en panneaux de leur onglet, modale sous motif, vraie vue au Prisme du MEMBRE, et rien sur le disque.',
  );
}

await main();
