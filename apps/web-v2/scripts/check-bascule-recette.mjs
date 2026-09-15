#!/usr/bin/env node
/**
 * LA RECETTE DE LA BASCULE (#6702) — ce qu'un visiteur SANS session voit du
 * domaine, rejoué contre un site DÉPLOYÉ : staging avant la bascule, meeshy.me
 * après.
 *
 * Le legacy est décommissionné : la v2 sert seule le domaine. Les gates du
 * dépôt prouvent chaque écran sur un serveur local ; celui-ci prouve que
 * l'IMAGE DÉPLOYÉE, derrière Traefik, sert ce que des artefacts extérieurs
 * visent — liens universels, liens de partage et de parrainage déjà en
 * circulation, redirections des anciens formats — et que les routes privées le
 * restent.
 *
 * Il ne se connecte JAMAIS et n'écrit AUCUNE donnée : un contexte de navigateur
 * neuf, sans session ni service worker, et des requêtes HTTP en lecture.
 *
 *   RECETTE_BASE=https://staging.meeshy.me node scripts/check-bascule-recette.mjs
 *   RECETTE_BASE=https://meeshy.me RECETTE_LINK=mshy_… node scripts/check-bascule-recette.mjs
 *
 * `RECETTE_LINK` (facultatif) : l'identifiant d'un lien de partage RÉEL et actif
 * du site visé — l'invitation s'y lit alors en entier, avec ses deux sorties.
 */

import { launchChromium } from './lib/browser.mjs';

const BASE = (process.env.RECETTE_BASE ?? 'https://staging.meeshy.me').replace(/\/$/, '');
const LINK = process.env.RECETTE_LINK ?? '';
const SETTLE_MS = 8000;

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const head = async (path) => {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    location: response.headers.get('location') ?? '',
    body: response.status === 200 ? await response.text() : '',
  };
};

console.log(`\n  Recette de la bascule contre ${BASE}\n`);

/* --- 1. Ce que le domaine sert en HTTP, sans navigateur -------------------- */

const build = await head('/build-info.json');
let revision = 'illisible';
try {
  revision = JSON.parse(build.body)?.build?.commitShort ?? 'null';
} catch {
  revision = 'illisible';
}
check(build.status === 200 && revision !== 'illisible', `/build-info.json sert une révision (${revision})`);

const aasa = await head('/.well-known/apple-app-site-association');
check(
  aasa.status === 200 && aasa.type.startsWith('application/json') && aasa.body.includes('applinks'),
  `liens universels iOS : AASA en application/json (${aasa.status} ${aasa.type})`,
);

const assetlinks = await head('/.well-known/assetlinks.json');
check(
  assetlinks.status === 200 && assetlinks.type.startsWith('application/json') && assetlinks.body.includes('me.meeshy.app'),
  `App Links Android : assetlinks.json en application/json (${assetlinks.status} ${assetlinks.type})`,
);

const robots = await head('/robots.txt');
check(robots.status === 200 && robots.type.startsWith('text/plain'), `robots.txt en text/plain (${robots.status} ${robots.type})`);

const join = await head('/join/mshy_recette');
check(
  join.status === 308 && join.location === '/chat/mshy_recette',
  `/join/:id redirige en 308 RELATIF vers /chat/:id (${join.status} « ${join.location} »)`,
);

const affiliate = await head('/?affiliate=aff_recette');
check(
  affiliate.status === 308 && affiliate.location === '/signup/affiliate/aff_recette',
  `/?affiliate= redirige en 308 vers /signup/affiliate/ (${affiliate.status} « ${affiliate.location} »)`,
);

const legacyConversation = await head('/conversations/64f0c0ffee0000000000abcd');
check(
  legacyConversation.status === 308 && legacyConversation.location === '/c/64f0c0ffee0000000000abcd',
  `/conversations/:id (ancien lien de notification) redirige vers /c/:id (${legacyConversation.status} « ${legacyConversation.location} »)`,
);

/* --- 2. Ce qu'un visiteur sans session voit, dans un vrai navigateur ------- */

const browser = await launchChromium();
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();

const settle = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: SETTLE_MS }).catch(() => {});
  return new URL(page.url());
};

const root = await settle('/');
check(
  ['/welcome', '/login'].includes(root.pathname),
  `/ sans session mène à l'accueil ou à la connexion (obtenu : ${root.pathname})`,
);

const privateNew = await settle('/conversations/new');
check(privateNew.pathname !== '/conversations/new', `/conversations/new reste PRIVÉE (obtenu : ${privateNew.pathname})`);

const signupAffiliate = await settle('/signup/affiliate/aff_recette');
check(
  signupAffiliate.pathname === '/signup' && signupAffiliate.searchParams.get('ref') === 'aff_recette',
  `un lien de parrainage garde son code jusqu'à l'inscription (obtenu : ${signupAffiliate.pathname}${signupAffiliate.search})`,
);

const deadLink = await settle('/chat/mshy_recette_inexistant');
await page.waitForSelector('[role="alert"]', { timeout: SETTLE_MS }).catch(() => {});
const deadLinkAlert = await page.locator('[role="alert"]').count();
check(
  deadLink.pathname === '/chat/mshy_recette_inexistant' && deadLinkAlert >= 1,
  `/chat/:lien inconnu reste sur l'invitation et dit son refus (alertes : ${deadLinkAlert}, chemin : ${deadLink.pathname})`,
);

if (LINK !== '') {
  await settle(`/chat/${encodeURIComponent(LINK)}`);
  await page.waitForSelector('a[href*="next="]', { timeout: SETTLE_MS }).catch(() => {});
  const exits = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="next="]')].map((a) => a.getAttribute('href') ?? ''),
  );
  check(
    exits.some((href) => href.startsWith('/login')) && exits.some((href) => href.startsWith('/signup')),
    `l'invitation d'un lien réel offre « Se connecter » et « Créer un compte » avec next (${exits.length} sortie(s))`,
  );
  const leaked = await page.locator('[data-message-id], [data-row][data-message]').count();
  check(leaked === 0, `l'invitation ne montre AUCUN message avant la jonction (obtenu : ${leaked})`);
} else {
  console.log('  —     RECETTE_LINK absent : l’invitation d’un lien réel n’est pas jouée');
}

await context.close();
await browser.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} constat(s) en défaut contre ${BASE} :`);
  for (const failure of failures) console.error(`    · ${failure}`);
  console.error('\n  La bascule ne se prononce pas sur un domaine qui ne sert pas ce que le monde vise.\n');
  process.exit(1);
}
console.log(`\n  ${BASE} sert ce que la bascule exige (révision ${revision}).\n`);
