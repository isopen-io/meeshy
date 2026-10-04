/**
 * **UN VISITEUR SANS COMPTE VOIT LE CONTENU PUBLIC, MÊME SUR RÉSEAU LENT**
 * (#9172, suite de #9149) — joué par `check-gateway-build.mjs` sur le `dist`
 * construit en `VITE_DATA_SOURCE=gateway` : en fixtures, le lecteur a toujours
 * un compte (`resolveViewer`), et le visiteur n'existe pas.
 *
 *  1. `/story/<id>` dont `GET /posts/:id` répond en QUATRE secondes : la story
 *     et l'invitation finissent par paraître, et AUCUN « Réessayer » ni
 *     `role="alert"` ne s'est peint pendant la requête. Le délai de 2,5 s qui
 *     coupait cette requête rendait « Réessayer » à la place du contenu.
 *  2. le TÉMOIN DU TÉMOIN : la même lecture en ÉCHEC (500) peint bien
 *     « Réessayer » — sans lui, le guetteur du 1 pourrait verdir en ne
 *     voyant rien.
 *  3. `/reels` sans identifiant : l'invitation à REJOINDRE (`invite`), qui
 *     ramène à `/reels`, sans « contenu indisponible » ni « Continuer » — et
 *     aucune requête du fil `scope=reels`, que la passerelle refuse à un
 *     visiteur.
 *
 * Aucun délai fixe suivi d'une lecture (`fixed-delay-ratchet.test.ts`) : le
 * réseau lent est un bouchon RETARDÉ côté Node, et chaque verdict attend son
 * FAIT (`awaitFact`).
 */
import { awaitFact } from './await-fact.mjs';

const STORY_ID = '6a0000000000000000009172';
const SLOW_MS = 4_000;
const SETTLE_MS = SLOW_MS + 8_000;

const hoursFrom = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

const PUBLIC_STORY = {
  id: STORY_ID,
  type: 'STORY',
  visibility: 'PUBLIC',
  createdAt: hoursFrom(-2),
  expiresAt: hoursFrom(22),
  viewCount: 0,
  isViewedByMe: false,
  author: { id: '6a0000000000000000000a11', username: 'alice', displayName: 'Alice Martin' },
  content: 'Le lac, ce matin.',
  originalLanguage: 'fr',
};

const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Toute adresse d'API non nommée répond 404 — jamais le réseau réel. Les
 * bouchons nommés s'enregistrent APRÈS : Playwright essaie le plus récent
 * d'abord. */
async function visitorPage(browser, { requests }) {
  const context = await browser.newContext({ serviceWorkers: 'block', locale: 'fr-FR' });
  await context.addInitScript(() => {
    const seen = { retry: false, alert: false };
    Object.defineProperty(window, '__visitorFailureSeen', { value: seen });
    new MutationObserver(() => {
      if (document.querySelector('[role="alert"]') !== null) seen.alert = true;
      for (const button of document.querySelectorAll('button')) {
        if (/Réessayer|Retry/.test(button.textContent ?? '')) seen.retry = true;
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await context.newPage();
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(request.url());
  });
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.route('**/api/v1/**', (route) => route.fulfill(json(404, { success: false, error: 'Not found', code: 'NOT_FOUND' })));
  return { context, page };
}

const failureSeen = (page) => page.evaluate(() => ({ ...window.__visitorFailureSeen }));

export async function checkVisitor({ browser, base, check }) {
  /* --- 1. La story d'un lien, servie en quatre secondes ------------------ */
  {
    const requests = [];
    const { context, page } = await visitorPage(browser, { requests });
    let answeredAfterMs = 0;
    await page.route(`**/api/v1/posts/${STORY_ID}`, async (route) => {
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
      answeredAfterMs = Date.now() - started;
      await route.fulfill(json(200, { success: true, data: PUBLIC_STORY }));
    });
    await page.goto(`${base}/story/${STORY_ID}`, { waitUntil: 'domcontentloaded' });
    const invited = await awaitFact(page.locator('dialog[data-visitor-invitation="served"]'), { timeoutMs: SETTLE_MS });
    const scene = await page.locator(`[data-story-scene="${STORY_ID}"]`).count();
    const seen = await failureSeen(page);
    check(
      invited && scene === 1,
      `réseau lent (${answeredAfterMs} ms) : la story d'un lien paraît, l'invitation par-dessus (invitation : ${invited}, scène : ${scene})`,
    );
    check(answeredAfterMs >= SLOW_MS, `la lecture de la story a bien duré plus de 2,5 s (${answeredAfterMs} ms)`);
    check(
      !seen.retry && !seen.alert,
      `réseau lent : jamais « Réessayer » ni alerte pendant la requête (Réessayer : ${seen.retry}, alerte : ${seen.alert})`,
    );
    await context.close();
  }

  /* --- 2. Le témoin du témoin : un échec RÉEL peint « Réessayer » -------- */
  {
    const requests = [];
    const { context, page } = await visitorPage(browser, { requests });
    await page.route(`**/api/v1/posts/${STORY_ID}`, (route) =>
      route.fulfill(json(500, { success: false, error: 'Internal server error' })),
    );
    await page.goto(`${base}/story/${STORY_ID}`, { waitUntil: 'domcontentloaded' });
    const alerted = await awaitFact(page.locator('[role="alert"] button', { hasText: 'Réessayer' }), { timeoutMs: SETTLE_MS });
    const seen = await failureSeen(page);
    const invitation = await page.locator('dialog[data-visitor-invitation]').count();
    check(
      alerted && seen.retry && invitation === 0,
      `un échec réel (500) peint « Réessayer », et le guetteur le voit (bouton : ${alerted}, guetteur : ${seen.retry}, modale : ${invitation})`,
    );
    await context.close();
  }

  /* --- 3. `/reels` sans identifiant : l'invitation à rejoindre ----------- */
  {
    const requests = [];
    const { context, page } = await visitorPage(browser, { requests });
    await page.goto(`${base}/reels`, { waitUntil: 'domcontentloaded' });
    const dialog = page.locator('dialog[data-visitor-invitation="invite"]');
    const invited = await awaitFact(dialog, { timeoutMs: SETTLE_MS });
    const exits = invited ? await dialog.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? '')) : [];
    const buttons = invited ? await dialog.locator('button').count() : -1;
    const text = invited ? ((await dialog.textContent()) ?? '') : '';
    const seen = await failureSeen(page);
    check(
      invited && exits.includes('/signup?next=%2Freels') && exits.includes('/login?next=%2Freels'),
      `/reels sans identifiant : l'invitation à rejoindre, qui ramène à /reels (invitation : ${invited}, sorties : ${exits.join(', ')})`,
    );
    check(
      buttons === 0 && !text.includes('pas accessible') && !seen.retry,
      `/reels sans identifiant : ni « contenu indisponible », ni « Continuer », ni « Réessayer » (boutons : ${buttons}, Réessayer : ${seen.retry})`,
    );
    const feedCalls = requests.filter((url) => new URL(url).searchParams.get('scope') === 'reels' || url.includes('/posts/feed/reels'));
    check(feedCalls.length === 0, `/reels sans identifiant : le fil des réels n'est pas demandé (obtenu : ${feedCalls.length})`);
    await context.close();
  }
}
