/**
 * 11 — LE FIL TEMPS RÉEL (#6171) — `conversation:updated`, `message:translation`
 * et le roster multi-frappeurs, rejoués dans un VRAI navigateur par le
 * bouchon de fixtures (`src/lib/api/fixtures-realtime.ts` § `LIVE_SCHEDULE`)
 * sur la conversation dédiée `c-live` (§5 étape 6 de la spécification).
 *
 * Contexte Playwright : `locale: 'en-US'` — la locale est POSÉE, jamais
 * héritée du runner. Sous fixtures le prisme est
 * `resolveUserLanguagesOrdered({ systemLanguage: 'fr' }, { deviceLocale })`
 * (`lib/reader.ts:44-52`), donc `['fr','en']` en `en-US` : c'est ce qui rend
 * le RANG 2 (`en`) OBSERVABLE avant que `fr` ne reprenne la main au rang 1.
 *
 * Horloge : `page.clock.install({ time: INSTANT })` puis `runFor` — la scène
 * n'est PAS mesurée ici (aucune élection Focal, la réserve de
 * `instant.mjs:24-31` qui interdit `install` pour cette raison ne s'applique
 * donc pas). `install` est ce que CE gate EXIGE : la chronologie du bouchon est
 * une suite de `setTimeout` (`fixtures-realtime.ts` § `SCHEDULE`), et seul
 * `runFor` la fait avancer PAS À PAS — sous `setFixedTime` elle partirait en
 * temps réel, donc sans point d'observation entre deux événements.
 *
 * `INSTANT` est IMPORTÉ de `instant.mjs`, jamais redéclaré (revue-correction
 * #6171) : la valeur y était recopiée à l'identique, ce qui aurait fait une
 * QUATRIÈME définition de l'instant des gates — celle qui dérive en silence
 * pendant que la convergence des trois autres est suivie à part.
 *
 * DEUX RUNS (clair, sombre), motif `checkMessageStates` — un état se juge
 * sur son propre fond. EXTRAIT dès sa naissance (motif
 * `check-typing-visibility.mjs`) : l'hôte (`check-thread-states.mjs`) est
 * déjà au-delà du seuil de 1000 lignes. `expect`, `setScheme`,
 * `AA_THRESHOLD` sont REMIS par l'hôte.
 */
import { contrastOf } from './contrast.mjs';
import { INSTANT } from './instant.mjs';

const textOf = (page, id) => page.locator(`[data-message="${id}"] p`).first().innerText();
const langOf = (page, id) => page.locator(`[data-message="${id}"] p`).first().getAttribute('lang');

/**
 * LE LIBELLÉ, lu sur `data-typing-label` — jamais un TEXTE VISIBLE scanné
 * (revue-correction #6171, défaut 4) : la tenue PLATE (Focal/Script, le
 * mode PAR DÉFAUT D-7, donc l'état de CE gate) ne rend plus aucun texte —
 * pastille + trois points seuls, miroir `TypingIndicatorBubble(isFlat:
 * true)`. `TypingRosterCell` (`components/typing-roster-cell.tsx`) porte le
 * libellé calculé sur cet attribut dans LES DEUX tenues, précisément pour
 * qu'un témoin reste vrai quel que soit le mode — l'ancienne forme (scanner
 * un `<span>` dont le texte finit par « écrit »/« écrivent ») serait devenue
 * aveugle en tenue plate et aurait fait passer « personne n'écrit » pour
 * toujours vrai.
 */
const typingCellText = (page) =>
  page.evaluate(() => document.querySelector('main [data-typing-cell]')?.getAttribute('data-typing-label') ?? null);

const typingCellAvatarInitials = (page) =>
  page.evaluate(
    () => document.querySelector('main [data-typing-cell] .avatar-root span')?.textContent ?? null,
  );

const rowLine2Text = (page, conversationId) => page.locator(`[data-row="${conversationId}"] [data-line2]`).innerText();

export async function checkRealtimeEvents({ browser, BASE, expect, setScheme, AA_THRESHOLD, scheme }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.clock.install({ time: INSTANT });

  let messageFetches = 0;
  /**
   * LE CHEMIN D'API, JAMAIS L'URL ENTIÈRE (revue-correction #5893) — ce
   * témoin veut compter les RE-LECTURES de `GET /…/messages`. Le prédicat
   * `req.url().includes('/messages')` comptait aussi les FICHIERS servis par
   * le dist : dès que `api/messages.ts` est devenu un chunk partagé
   * (l'arrivée de la route `/feed` dans `api/query.ts` a suffi), Rollup a
   * émis `assets/messages-<hash>.js`, que le navigateur charge à l'ouverture
   * du fil — et ce gate rougissait en annonçant une requête d'API que
   * personne n'avait faite. Un témoin qui nomme un défaut ABSENT coûte plus
   * cher qu'un témoin manquant : on cherche dans le mauvais fichier.
   */
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (pathname.startsWith('/api/') && pathname.includes('/messages')) messageFetches += 1;
  });

  const label = `[${scheme}]`;

  // ===== 1. LE FIL — message:translation, le RANG du lecteur =====
  await page.goto(`${BASE}/c/c-live`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message="live-1"]');
  await page.clock.runFor(300);

  expect((await textOf(page, 'live-1')).includes('Hola'), `${label} live-1 : l'ORIGINAL espagnol au chargement`);
  expect((await langOf(page, 'live-1')) === 'es', `${label} live-1 : lang="es" au chargement`);

  await page.clock.runFor(2200); // T+2,3 s
  expect(
    (await textOf(page, 'live-1')).includes('Hi, is the review still on Thursday?'),
    `${label} live-1 : la traduction ANGLAISE (rang 2 du Prisme) est servie à T+2 s`,
  );
  expect((await langOf(page, 'live-1')) === 'en', `${label} live-1 : lang="en" au rang 2`);

  await page.clock.runFor(1500); // T+3,8 s
  expect(
    (await textOf(page, 'live-1')).includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} live-1 : la traduction FRANÇAISE (rang 1) reprend la main à T+3,5 s`,
  );
  expect((await langOf(page, 'live-1')) === 'fr', `${label} live-1 : lang="fr" au rang 1`);
  expect(messageFetches === 0, `${label} aucune requête « /messages » n'a été déclenchée par la traduction (${messageFetches})`);

  // ===== 2. conversation:updated NE PARLE QU'À LA LISTE =====
  await page.clock.runFor(1000); // T+4,8 s
  expect(
    (await textOf(page, 'live-1')).includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} live-1 : le fil ne change pas quand conversation:updated arrive (le fil OUVERT n'écoute que message:translation)`,
  );

  // ===== 3. LE ROSTER, DANS LE FIL =====
  await page.clock.runFor(1500); // T+6,3 s
  expect(
    /^Kwame Mensah écrit$/.test((await typingCellText(page)) ?? ''),
    `${label} T+6,3 s : la cellule dit « Kwame Mensah écrit » (obtenu ${await typingCellText(page)})`,
  );

  await page.clock.runFor(1500); // T+7,8 s
  expect(
    (await typingCellText(page)) === 'Kwame Mensah et Fatou Bâ écrivent',
    `${label} T+7,8 s : « Kwame Mensah et Fatou Bâ écrivent » (obtenu ${await typingCellText(page)})`,
  );
  expect(
    (await typingCellAvatarInitials(page)) === 'KM',
    `${label} T+7,8 s : l'avatar est celui du MENEUR (KM), jamais FB (obtenu ${await typingCellAvatarInitials(page)})`,
  );

  /**
   * LE KEEPALIVE NE DÉPLACE PAS LE MENEUR (revue-correction #6171, défaut 3)
   * — Kwame réarme sa frappe à 9 000 ms (`LIVE_SCHEDULE`, § fixtures-
   * realtime.ts) : un roster qui le relègue en queue à ce `typing:start`
   * inverserait le libellé (« Fatou Bâ et Kwame Mensah écrivent ») et
   * l'avatar (FB) — exactement le défaut mesuré en revue avant correctif
   * (`typing-store.ts` § `start`, falsifié par `typing-store.test.ts`).
   */
  await page.clock.runFor(1500); // T+9,3 s — keepalive de Kwame à 9 000 ms.
  expect(
    (await typingCellText(page)) === 'Kwame Mensah et Fatou Bâ écrivent',
    `${label} T+9,3 s : le keepalive de Kwame ne change PAS l'ordre du roster (obtenu ${await typingCellText(page)})`,
  );
  expect(
    (await typingCellAvatarInitials(page)) === 'KM',
    `${label} T+9,3 s : le keepalive de Kwame ne lui fait pas perdre le visage du MENEUR (obtenu ${await typingCellAvatarInitials(page)})`,
  );

  /**
   * LA CAPSULE N'EST LA TENUE QUE DU MODE BULLES (revue-correction #6171,
   * défaut 4) — miroir `TypingIndicatorBubble(isFlat: readingMode !=
   * .bubbles)` (`MessageListViewController.swift:3137-3138`). Basculé ICI, à
   * deux frappeurs déjà en roster, puis REPOSÉ sur Focal (le mode PAR DÉFAUT,
   * D-7) avant de reprendre le scénario — un mode qui resterait Bulles
   * fausserait la suite (la cellule y garde sa capsule à tout instant).
   */
  const modeChip = page.getByRole('button', { name: /Mode de lecture/ });
  const menuItem = (name) => page.getByRole('menuitemradio', { name });
  /**
   * `.rounded-chip` N'EST PAS LE BON SIGNAL — `Avatar` l'emploie DÉJÀ pour la
   * forme de son insigne d'initiales, DANS LES DEUX TENUES (même défaut que
   * `typing-roster-cell.test.tsx`, mesuré au premier jet de ce témoin). Le
   * signal propre à la capsule DE FRAPPE est `.text-time` (le libellé
   * visible), présent dans la SEULE tenue bulles.
   */
  const hasCapsule = () =>
    page.evaluate(() => document.querySelector('main [data-typing-cell] .text-time') !== null);

  await modeChip.click();
  await menuItem(/^Focal/).click();
  await page.waitForTimeout(50);
  expect(
    (await hasCapsule()) === false,
    `${label} mode Focal (défaut D-7) : la cellule n'a AUCUNE capsule (pastille + points seuls)`,
  );

  await modeChip.click();
  await menuItem(/^Script/).click();
  await page.waitForTimeout(50);
  expect((await hasCapsule()) === false, `${label} mode Script : la cellule n'a AUCUNE capsule, même tenue que Focal`);

  await modeChip.click();
  await menuItem(/^Bulles/).click();
  await page.waitForTimeout(50);
  expect((await hasCapsule()) === true, `${label} mode Bulles : la capsule à libellé reste la tenue du mode bulles`);

  await modeChip.click();
  await menuItem(/^Focal/).click();
  await page.waitForTimeout(50);

  await page.clock.runFor(4000); // T+13,3 s — Fatou s'arrête à 13 000 ms.
  expect(
    (await typingCellText(page)) === 'Kwame Mensah écrit',
    `${label} T+13,3 s : Fatou s'est arrêtée, Kwame reste seul (obtenu ${await typingCellText(page)})`,
  );

  await page.clock.runFor(14000); // T+27,3 s — dernier `start` de Kwame à 12 000 ms + 15 000 ms de sécurité.
  expect(
    (await typingCellText(page)) === null,
    `${label} T+27,3 s : plus aucun frappeur, la cellule a disparu (obtenu ${await typingCellText(page)})`,
  );

  // ===== 4. LA LISTE — conversation:updated résolu au Prisme, puis la frappe PRIME =====
  const listPage = await context.newPage();
  await listPage.clock.install({ time: INSTANT });
  await listPage.goto(`${BASE}/`, { waitUntil: 'load' });
  await listPage.waitForSelector('[data-row="c-live"]');
  await listPage.clock.runFor(300);
  expect(
    (await rowLine2Text(listPage, 'c-live')).includes('Oui, jeudi 14h.'),
    `${label} liste, T+0,3 s : la ligne 2 décrit le dernier message CONNU avant l'événement`,
  );

  await listPage.clock.runFor(4700); // T+5 s — conversation:updated a adopté live-1.
  const line2AfterAdoption = await rowLine2Text(listPage, 'c-live');
  expect(
    line2AfterAdoption.includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} liste, T+5 s : la ligne 2 adopte live-1 et sert le FRANÇAIS (rang du lecteur) (obtenu « ${line2AfterAdoption} »)`,
  );
  const previewLang = await listPage.locator('[data-row="c-live"] [data-line2] span[lang]').first().getAttribute('lang');
  expect(previewLang === 'fr', `${label} liste, T+5 s : le span de l'aperçu porte lang="fr" (obtenu ${previewLang})`);

  /* L'APERÇU SERVI DOIT SE LIRE — et à l'AA, jamais « mesurable » (revue-
     correction #6171 : la première forme de ce témoin n'exigeait que
     `contrast !== null`, donc acceptait n'importe quelle valeur ; mesuré 4,98:1
     en clair et 9,98:1 en sombre, l'exigence PASSE — la version molle ne
     retenait rien). `expectQuantifiedContrast` (`check-message-states.mjs`) est
     réservé aux trois crans iOS qui ne PEUVENT pas tenir l'AA ; la ligne 2 de la
     Lentille n'en est pas un, et `check-list-actions.mjs` l'exige déjà ailleurs.

     MESURÉ ICI, AVANT que la frappe ne prenne la ligne 2 : après `runFor(1500)`
     ce nœud ne porte plus l'aperçu mais « Kwame Mensah écrit », et le témoin
     mesurerait un AUTRE texte que celui qu'il nomme. */
  const contrast = await contrastOf(listPage, `[data-row="c-live"] [data-line2]`);
  expect(
    contrast !== null && contrast >= AA_THRESHOLD,
    `${label} liste, T+5 s : l'aperçu SERVI de la ligne 2 tient l'AA (${contrast}:1 >= ${AA_THRESHOLD})`,
  );

  await listPage.clock.runFor(1500); // T+6,5 s — la frappe de Kwame PRIME sur l'aperçu.
  expect(
    (await rowLine2Text(listPage, 'c-live')).includes('écrit'),
    `${label} liste, T+6,5 s : la frappe PRIME sur l'aperçu (Line2Kind)`,
  );

  await listPage.close();
  await context.close();
}
