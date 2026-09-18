/**
 * 11 — LE FIL TEMPS RÉEL (#6171) — `conversation:updated`, `message:translation`
 * et le roster multi-frappeurs, rejoués dans un VRAI navigateur par le
 * bouchon de fixtures (`src/lib/api/fixtures-realtime.ts` § `LIVE_SCHEDULE`)
 * sur la conversation dédiée `c-live` (§5 étape 6 de la spécification).
 *
 * Contexte Playwright : `locale: 'en-US'` — la locale est POSÉE, jamais
 * héritée du runner. Elle résout AUSSI la langue d'INTERFACE (`en`, script
 * d'amorçage de `index.html`) : le libellé de frappe, qui vient du catalogue
 * d'interface (#6206), se lit donc en ANGLAIS pendant que le CONTENU suit le
 * prisme ci-dessous — deux résolveurs, deux langues, sur le même écran. Sous fixtures le prisme est
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
 * LA TRANSCRIPTION D'UN VOCAL (#7017) — `[data-transcript]`
 * (`attachment-blocks.tsx`), le MÊME nœud que `check-media.mjs` interroge sur
 * le chemin REST. Ici il est mesuré sur le chemin TEMPS RÉEL, qu'aucun gate ne
 * jouait : la transcription Whisper puis les traductions NLLB arrivent APRÈS
 * le message, par `message:attachment-updated`, et web-v2 ne l'écoutait pas.
 *
 * LE TEXTE, JAMAIS LA PRÉSENCE DU NŒUD. `servedTranscript` (`api/prism.ts`)
 * retombe sur `originalName` quand aucune transcription n'existe : le
 * paragraphe est donc DÉJÀ LÀ au chargement, avec le nom du fichier. Compter
 * les nœuds ferait passer un gate qui ne mesure rien — c'est la forme « un
 * témoin qui ne peut pas tomber » appliquée à un sélecteur.
 */
const transcriptOf = (page, id) => page.locator(`[data-message="${id}"] [data-transcript]`).first().innerText();
const transcriptLangOf = (page, id) =>
  page.locator(`[data-message="${id}"] [data-transcript]`).first().getAttribute('lang');

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

  /**
   * ===== 1 bis. LE VOCAL — message:attachment-updated (#7017) =====
   *
   * Le pipeline audio rend en TROIS temps (`fixtures-realtime.ts` § les trois
   * entrées `MESSAGE_ATTACHMENT_UPDATED`), et chacun est lu à un arrêt
   * d'horloge que ce gate observait DÉJÀ : la section ne coûte pas une
   * milliseconde simulée de plus.
   *
   * L'ÉPREUVE DE CE TÉMOIN N'EST PAS SON VERT mais sa MUTATION : retirer
   * `socket.on(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, …)` de
   * `src/lib/api/socket.ts` doit le faire TOMBER dès la première assertion de
   * T+2,5 s. Un gate qu'on n'a pas vu rougir ne garde rien.
   */
  const live3AtLoad = await transcriptOf(page, 'live-3');
  expect(
    !live3AtLoad.includes('revisión') && !live3AtLoad.includes('review') && !live3AtLoad.includes('revue'),
    `${label} live-3 : AUCUNE transcription au chargement — le pipeline n'a encore rien produit (obtenu « ${live3AtLoad} »)`,
  );

  await page.clock.runFor(2200); // T+2,5 s
  expect(
    (await textOf(page, 'live-1')).includes('Hi, is the review still on Thursday?'),
    `${label} live-1 : la traduction ANGLAISE (rang 2 du Prisme) est servie à T+2 s`,
  );
  expect((await langOf(page, 'live-1')) === 'en', `${label} live-1 : lang="en" au rang 2`);
  expect(
    (await transcriptOf(page, 'live-3')).includes('¿seguimos con la revisión el jueves?'),
    `${label} live-3 : la transcription Whisper (es) apparaît SANS rechargement (obtenu « ${await transcriptOf(page, 'live-3')} »)`,
  );
  expect(
    (await transcriptLangOf(page, 'live-3')) === 'es',
    `${label} live-3 : lang="es" — la langue RÉELLEMENT servie, pas celle du lecteur (obtenu ${await transcriptLangOf(page, 'live-3')})`,
  );

  await page.clock.runFor(1500); // T+4 s
  expect(
    (await textOf(page, 'live-1')).includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} live-1 : la traduction FRANÇAISE (rang 1) reprend la main à T+3,5 s`,
  );
  expect((await langOf(page, 'live-1')) === 'fr', `${label} live-1 : lang="fr" au rang 1`);
  /* LE RANG 2, sur la famille AUDIO — la seule traduction disponible à cet
     instant est `en`, le rang 2 du prisme du lecteur. Un témoin posé au rang 1
     ne pourrait pas tomber : la descente juste et le court-circuit interdit y
     rendent le même verdict (CLAUDE.md § Prisme, leçon 261). */
  expect(
    (await transcriptOf(page, 'live-3')).includes('shall we keep the review on Thursday?'),
    `${label} live-3 : la traduction ANGLAISE (rang 2) est servie dès qu'elle arrive (obtenu « ${await transcriptOf(page, 'live-3')} »)`,
  );
  expect(
    (await transcriptLangOf(page, 'live-3')) === 'en',
    `${label} live-3 : lang="en" au rang 2 (obtenu ${await transcriptLangOf(page, 'live-3')})`,
  );
  expect(messageFetches === 0, `${label} aucune requête « /messages » n'a été déclenchée par la traduction ni par l'enrichissement de la pièce (${messageFetches})`);

  // ===== 2. conversation:updated NE PARLE QU'À LA LISTE =====
  await page.clock.runFor(1000); // T+5 s
  expect(
    (await textOf(page, 'live-1')).includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} live-1 : le fil ne change pas quand conversation:updated arrive (le fil OUVERT n'écoute que message:translation)`,
  );
  /**
   * LE RANG 1 REPREND LA MAIN — et l'annotation de langue doit LÂCHER avec
   * lui. Un `lang` resté à « en » sur un texte français est le défaut que ce
   * témoin garde : il ferait prononcer « on garde la revue jeudi ? » à une
   * voix anglaise, c'est-à-dire un Prisme juste à l'œil et faux à l'oreille.
   *
   * CE QUE LA MESURE A RENDU, et pourquoi ce témoin n'exige PAS `null`
   * (mesuré au navigateur sur ce dist, `dump` des quatre instants) :
   *
   *     T+0    lang="es"   T+2,5 lang="es"   T+4 lang="en"   T+5 lang=""
   *
   * Preact ne RETIRE pas l'attribut quand la prop disparaît : `lang` étant une
   * propriété de `HTMLElement`, `setProperty` prend la branche `name in dom`
   * et écrit `dom.lang = ''` au lieu d'appeler `removeAttribute`. Sur le
   * chemin REST le nœud naît sans l'attribut (`check-media.mjs` (e ter)
   * l'asserte `null` à juste titre) ; ici il a porté « en » une seconde plus
   * tôt, et il en garde la COQUILLE.
   *
   * `lang=""` n'est pas neutre — HTML le définit comme « langue explicitement
   * INCONNUE », donc il n'hérite PAS du français du document. C'est un défaut
   * de RENDU (`attachment-blocks.tsx:129`, et ses jumeaux `media-grid.tsx:58,
   * 298` / `media-viewer.tsx:190`), atteignable aussi par le geste
   * « Traduire » du chemin REST — hors du périmètre de #7017, qui ne touche
   * que l'ALIMENTATION. Suivi : #7024.
   *
   * Ce témoin garde donc ce qui relève de CE lot — la langue annoncée SUIT le
   * rang servi et ne reste pas accrochée au rang précédent — et il tombe sur
   * le défaut qui compte (`lang="en"` figé), coquille ou pas.
   */
  expect(
    (await transcriptOf(page, 'live-3')).includes('on garde la revue jeudi ?'),
    `${label} live-3 : la traduction FRANÇAISE (rang 1) reprend la main à T+4,2 s (obtenu « ${await transcriptOf(page, 'live-3')} »)`,
  );
  const rank1Lang = await transcriptLangOf(page, 'live-3');
  expect(
    rank1Lang === null || rank1Lang === '',
    `${label} live-3 : la transcription ne réclame plus AUCUNE langue étrangère au rang 1 (obtenu ${JSON.stringify(rank1Lang)})`,
  );
  expect(messageFetches === 0, `${label} le fil n'a jamais été rechargé pour obtenir la transcription (${messageFetches})`);

  // ===== 3. LE ROSTER, DANS LE FIL =====
  await page.clock.runFor(1500); // T+6,3 s
  expect(
    /^Kwame Mensah is typing$/.test((await typingCellText(page)) ?? ''),
    `${label} T+6,3 s : la cellule dit « Kwame Mensah is typing » (obtenu ${await typingCellText(page)})`,
  );

  await page.clock.runFor(1500); // T+7,8 s
  expect(
    (await typingCellText(page)) === 'Kwame Mensah and Fatou Bâ are typing',
    `${label} T+7,8 s : « Kwame Mensah and Fatou Bâ are typing » (obtenu ${await typingCellText(page)})`,
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
    (await typingCellText(page)) === 'Kwame Mensah and Fatou Bâ are typing',
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
    (await typingCellText(page)) === 'Kwame Mensah is typing',
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

  // ===== 5. conversation:new — LA CONVERSATION QUI SURGIT (#6807, preuve de #6799) =====
  /**
   * CE QUE CETTE SECTION GARDE, et pourquoi elle existe.
   *
   * #6799 a trouvé `conversation:new` écouté NULLE PART dans web-v2 : 0
   * occurrence sur 766 fichiers, alors que la passerelle l'émet à trois sites
   * et que le legacy l'écoute. Conséquence mesurée : `patchConversation` ne
   * modifie qu'une page portant DÉJÀ l'id, donc pour un premier DM reçu ou un
   * ajout à un groupe, le `message:new` suivant patchait le vide EN SILENCE.
   *
   * Le correctif INVALIDE la liste — il ne fabrique pas la ligne, la charge
   * `ConversationNewEventData` étant minimale (une ligne fabriquée afficherait
   * un direct SANS NOM). Sa valeur n'est donc visible que si la source peut
   * rendre une conversation que le corpus ne connaissait pas : c'est le rôle
   * du registre des survenues (`fixtures.ts`), alimenté au TIR de l'entrée.
   *
   * `c-surgie` est ABSENTE de `CONVERSATIONS` : sans l'abonnement, l'aperçu
   * n'arrive qu'au prochain rechargement complet — jamais ici.
   *
   * L'ÉPREUVE DE CE TÉMOIN N'EST PAS SON VERT (le correctif le précède) mais
   * sa MUTATION : retirer `socket.on(SERVER_EVENTS.CONVERSATION_NEW, …)` de
   * `src/lib/api/socket.ts` doit le faire TOMBER. Un gate qu'on n'a pas vu
   * rougir ne garde rien.
   */
  const rowsBefore = await listPage.locator('[data-row]').count();
  await listPage.clock.runFor(8000); // T+14,5 s — l'entrée `conversation:new` a tiré.
  const surgedRow = listPage.locator('[data-row="c-surgie"]');
  await surgedRow.waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
  const rowsAfter = await listPage.locator('[data-row]').count();
  expect(
    (await surgedRow.count()) === 1,
    `${label} liste, T+14,5 s : la conversation SURGIE porte sa ligne — sans l'abonnement \`conversation:new\`, rien n'apparaît avant un rechargement complet (rangées ${rowsBefore} → ${rowsAfter}, c-surgie ${await surgedRow.count()})`,
  );

  await listPage.close();
  await context.close();
}
