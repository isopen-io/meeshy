#!/usr/bin/env node
/**
 * LA RECETTE AU NAVIGATEUR DE L'ADMINISTRATION SOUVERAINE (#6862, #6733,
 * #6819) — ce qu'aucun témoin `bun test` de ce chantier ne peut voir : le
 * `<dialog>` natif (happy-dom ne l'ouvre pas), la GÉOMÉTRIE d'une section
 * repliable, le PARCOURS clavier réel, le contenu de `localStorage` APRÈS une
 * lecture souveraine, et la LANGUE effectivement peinte dans les rangées.
 *
 * Sur un `dist` construit avec `VITE_DATA_SOURCE=gateway` : l'administration
 * n'a volontairement aucune démonstration (`lib/api/admin.ts`), donc tout ce
 * qui s'affiche ici vient d'une charge SERVIE. Les routes d'administration
 * sont interceptées et répondues ; TOUTE autre requête sortante est
 * abandonnée — aucun octet ne part vers une passerelle réelle.
 *
 * AUCUNE ROUTE HTTP N'EST INVENTÉE : les huit adresses servies ci-dessous
 * existent toutes dans `services/gateway/src/routes/{me,admin}` et sont déjà
 * les seules que `lib/api/admin*.ts` appelle.
 *
 * LE CORPUS EST BÂTI POUR QUE LE TÉMOIN DE PRISME NE PUISSE PAS VERDIR PAR
 * COÏNCIDENCE (leçon 261) : le membre administré lit `de › es`, son rang 1
 * (`de`) n'a AUCUNE traduction, l'administrateur lit `fr`, et l'original est
 * anglais. Les trois textes sont DIFFÉRENTS :
 *
 * | prisme | rang servi | texte attendu |
 * |---|---|---|
 * | membre `['de','es']` | 2 (`es`) | **Hola equipo** |
 * | administrateur `['fr', …]` | 1 (`fr`) | Bonjour l'équipe |
 * | descente arrêtée au rang 1 | aucun | Hello team (l'original) |
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
// LE CORPUS SERVI
// ---------------------------------------------------------------------------

const MEMBRE_ID = '64b000000000000000000042';
const CONVERSATION_ID = '64c000000000000000000007';
const AUTRE_CONVERSATION_ID = '64c000000000000000000008';

/** L'ADMINISTRATEUR — sa langue d'application est le FRANÇAIS. */
const SESSION = {
  token: 'jeton-de-recette',
  sessionToken: 'session-de-recette',
  user: {
    id: '64b000000000000000000001',
    username: 'recette-admin',
    displayName: 'Recette Admin',
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
  },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

const PERMISSIONS_NUES = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: false,
  canManageConversations: true,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
  canManageAgent: false,
};

const identiteServie = (avecAgent) => ({
  role: 'ADMIN',
  permissions: { ...PERMISSIONS_NUES, canManageAgent: avecAgent },
});

/** LE MEMBRE ADMINISTRÉ — allemand d'abord, espagnol ensuite. */
const MEMBRE = {
  id: MEMBRE_ID,
  username: 'kaethe',
  displayName: 'Käthe Vogel',
  firstName: 'Käthe',
  lastName: 'Vogel',
  bio: '',
  avatar: '',
  email: 'kaethe@example.test',
  phoneNumber: '',
  role: 'USER',
  timezone: 'Europe/Berlin',
  systemLanguage: 'de',
  regionalLanguage: 'es',
  customDestinationLanguage: '',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  emailVerifiedAt: '2026-04-02T09:00:00.000Z',
  phoneVerifiedAt: null,
  lastActiveAt: '2026-09-16T18:20:00.000Z',
  createdAt: '2026-01-12T08:30:00.000Z',
  updatedAt: '2026-09-16T18:20:00.000Z',
};

const participant = (userId, displayName, role) => ({
  userId,
  displayName,
  avatar: null,
  role,
  joinedAt: '2026-02-01T10:00:00.000Z',
  isActive: true,
});

const CONVERSATIONS_DU_MEMBRE = [
  {
    id: CONVERSATION_ID,
    identifier: 'projet-rosetta',
    title: 'Projet Rosetta',
    type: 'group',
    isActive: true,
    memberCount: 4,
    createdAt: '2026-02-01T10:00:00.000Z',
    lastMessageAt: '2026-06-02T11:00:00.000Z',
    participants: [
      participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
      participant('u-alice', 'Alice', 'ADMIN'),
    ],
    membership: participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
  },
  {
    id: AUTRE_CONVERSATION_ID,
    identifier: 'support-2026',
    title: 'Support 2026',
    type: 'group',
    isActive: true,
    memberCount: 9,
    createdAt: '2026-03-04T10:00:00.000Z',
    lastMessageAt: '2026-05-30T09:10:00.000Z',
    participants: [participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER')],
    membership: participant(MEMBRE_ID, 'Käthe Vogel', 'MEMBER'),
  },
];

const MEDIAS_DU_MEMBRE = [
  { id: 'md-1', originalName: 'plan-de-salle.png', mimeType: 'image/png', source: 'message', isProtected: false },
  { id: 'md-2', originalName: 'note-vocale.m4a', mimeType: 'audio/mp4', source: 'message', isProtected: false },
  { id: 'md-3', originalName: 'contrat.pdf', mimeType: 'application/pdf', source: 'post', isProtected: true },
];

/** Une vignette RÉELLE — un PNG data-URI ne dépend d'aucune passerelle. */
const IMAGE = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
    '<rect width="480" height="270" fill="#1f6feb"/>' +
    '<circle cx="150" cy="135" r="70" fill="#f0c674"/>' +
    '<text x="240" y="240" font-family="sans-serif" font-size="28" fill="#ffffff">plan-de-salle.png</text>' +
    '</svg>',
).toString('base64')}`;

const TEXTES = {
  original: 'Hello team',
  espagnol: 'Hola equipo',
  francais: "Bonjour l'équipe",
  allemand: 'ABSENT — le rang 1 du membre n’a aucune traduction',
};

const expediteur = (id, nom) => ({
  id: `p-${id}`,
  userId: id,
  displayName: nom,
  avatar: null,
  user: { id, username: nom.toLowerCase() },
});

/** Le fil SERVI : `createdAt DESC`, la forme de `sovereign-message-projection.ts`. */
const MESSAGES_SERVIS = [
  {
    id: 'm-reponse',
    conversationId: CONVERSATION_ID,
    senderId: MEMBRE_ID,
    content: 'Alles klar.',
    originalLanguage: 'de',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [],
    attachmentCount: 0,
    attachments: [],
    replyTo: null,
    createdAt: '2026-06-02T11:05:00.000Z',
    sender: expediteur(MEMBRE_ID, 'Käthe'),
  },
  {
    id: 'm-protege',
    conversationId: CONVERSATION_ID,
    senderId: 'u-bob',
    content: null,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: true,
    encryptionMode: 'e2ee',
    isProtected: true,
    translations: [],
    attachmentCount: 0,
    attachments: [],
    replyTo: null,
    createdAt: '2026-06-02T11:00:00.000Z',
    sender: expediteur('u-bob', 'Bob'),
  },
  {
    id: 'm-traduit',
    conversationId: CONVERSATION_ID,
    senderId: 'u-alice',
    content: TEXTES.original,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    reactionCount: 0,
    isEncrypted: false,
    isProtected: false,
    translations: [
      {
        id: 't-es',
        messageId: 'm-traduit',
        targetLanguage: 'es',
        translatedContent: TEXTES.espagnol,
        createdAt: '2026-06-02T10:00:05.000Z',
      },
      {
        id: 't-fr',
        messageId: 'm-traduit',
        targetLanguage: 'fr',
        translatedContent: TEXTES.francais,
        createdAt: '2026-06-02T10:00:05.000Z',
      },
    ],
    attachmentCount: 2,
    attachments: [
      {
        id: 'a-image',
        messageId: 'm-traduit',
        originalName: 'plan-de-salle.png',
        mimeType: 'image/svg+xml',
        fileSize: 4096,
        fileUrl: IMAGE,
        thumbnailUrl: null,
        transcription: null,
        translations: null,
        imageVariants: null,
        isProtected: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
      {
        id: 'a-vocal',
        messageId: 'm-traduit',
        originalName: 'note-vocale.m4a',
        mimeType: 'audio/mp4',
        fileSize: 20480,
        fileUrl: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEg',
        thumbnailUrl: null,
        transcription: { language: 'en', text: TEXTES.original },
        translations: {
          es: { type: 'audio', transcription: TEXTES.espagnol, url: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEh' },
          fr: { type: 'audio', transcription: TEXTES.francais, url: 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEi' },
        },
        imageVariants: null,
        isProtected: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
      },
    ],
    replyTo: null,
    createdAt: '2026-06-02T10:00:00.000Z',
    sender: expediteur('u-alice', 'Alice'),
  },
];

const AGENT_STATS = { totalConfigs: 4, activeConfigs: 3, totalControlledUsers: 12, totalMessagesSent: 486 };

const AGENT_CONFIGS = [
  {
    conversationId: CONVERSATION_ID,
    conversation: { id: CONVERSATION_ID, title: 'Projet Rosetta' },
    enabled: true,
    isScanning: false,
    currentNode: null,
    controlledUserIds: ['u-alice', 'u-bob'],
    analytics: { messagesSent: 34, lastResponseAt: '2026-09-16T09:15:00.000Z' },
  },
];

const AGENT_LOGS = [
  {
    id: 'log-1',
    conversationId: CONVERSATION_ID,
    conversation: { id: CONVERSATION_ID, title: 'Projet Rosetta' },
    trigger: 'manual',
    startedAt: '2026-09-16T09:14:30.000Z',
    durationMs: 4200,
    outcome: 'completed',
    messagesSent: 1,
    userIdsUsed: ['u-alice'],
  },
];

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

async function openContext(browser, { base, avecAgent, langue = 'fr' }) {
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light', serviceWorkers: 'block' });
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

    // ------------------------------------- 3. les deux sections repliables
    console.log('\n3. LA FICHE MEMBRE PLIE ET DÉPLIE SES DEUX SECTIONS');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page } = ctx;
      await page.goto(`${base}/adm/users/${MEMBRE_ID}`, { waitUntil: 'load' });
      await attendre(() => present(page, `[data-admin-user="${MEMBRE_ID}"]`));
      await attendre(() => present(page, '[data-collapsible-toggle="admin-conv"]'));
      await page.waitForTimeout(500);
      await cliche(page, 'fiche-membre-depliee', { fullPage: true });

      /* LA FICHE NE PEINT PAS D'HORODATAGE BRUT — constat ajouté par CETTE
         recette : « Inscrit le 2026-01-12T08:30:00.000Z » est ce qu'un écran
         affiche quand il rend la charge au lieu de la LIRE, et aucun témoin
         unitaire ne le voit (le champ est juste, c'est son rendu qui ne l'est
         pas). L'écran de l'agent formate déjà les siens. */
      const fiche = await texteDe(page, `[data-admin-user="${MEMBRE_ID}"]`);
      check(!ISO_NU.test(fiche), `la fiche ne peint aucun horodatage ISO brut${ISO_NU.test(fiche) ? ` — « ${(fiche.match(ISO_NU) ?? [''])[0]} »` : ''}`);
      check(
        await present(page, `[data-admin-conversation-open="${CONVERSATION_ID}"]`),
        'la section Conversations et la section Médias sont TOUTES DEUX sur la fiche',
      );
      /* Le cadre d'administration défile dans un conteneur À LUI : `fullPage`
         ne descend pas dedans. On amène donc la seconde section à l'écran pour
         la VOIR — une capture qui ne montre pas ce qu'on affirme ne prouve
         rien. */
      await page.locator(`[data-admin-conversation-open="${CONVERSATION_ID}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await cliche(page, 'fiche-membre-section-conversations');

      for (const id of ['admin-media', 'admin-conv']) {
        const etat = () =>
          page.evaluate(
            (s) => ({
              expanded: document.querySelector(`[data-collapsible-toggle="${s}"]`)?.getAttribute('aria-expanded') ?? null,
              cache: document.getElementById(`${s}-panel`)?.hasAttribute('hidden') ?? null,
              controle: document.querySelector(`[data-collapsible-toggle="${s}"]`)?.getAttribute('aria-controls') ?? null,
            }),
            id,
          );

        const depart = await etat();
        check(depart.expanded === 'true', `« ${id} » : dépliée au départ (aria-expanded=${depart.expanded})`);
        check(depart.controle === `${id}-panel`, `« ${id} » : aria-controls désigne son panneau`);

        await page.click(`[data-collapsible-toggle="${id}"]`);
        await page.waitForTimeout(220);
        const souris = await etat();
        check(souris.expanded === 'false' && souris.cache === true, `« ${id} » : la SOURIS la replie, aria-expanded suit`);

        await page.focus(`[data-collapsible-toggle="${id}"]`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(220);
        const clavier = await etat();
        check(clavier.expanded === 'true' && clavier.cache === false, `« ${id} » : ENTRÉE la déplie, aria-expanded suit`);

        await page.keyboard.press('Space');
        await page.waitForTimeout(220);
        const espace = await etat();
        check(espace.expanded === 'false', `« ${id} » : ESPACE la replie`);
        if (id === 'admin-conv') await cliche(page, 'fiche-membre-repliee');

        await page.keyboard.press('Enter');
        await page.waitForTimeout(220);
      }
      await ctx.close();
    }

    // ------------------------ 4. la ligne ouvre la modale, sous motif écrit
    console.log('\n4. UNE LIGNE DE CONVERSATION OUVRE LA MODALE, SOUS MOTIF');
    {
      const ctx = await openContext(browser, { base, avecAgent: true });
      const { page, appels } = ctx;
      await page.goto(`${base}/adm/users/${MEMBRE_ID}`, { waitUntil: 'load' });
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
      await page.goto(`${base}/adm/users/${MEMBRE_ID}`, { waitUntil: 'load' });
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
      'sections repliables souris et clavier, modale sous motif, vraie vue au Prisme du MEMBRE, et rien sur le disque.',
  );
}

await main();
