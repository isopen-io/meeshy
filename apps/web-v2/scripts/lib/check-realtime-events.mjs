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

/**
 * LA LANGUE QU'UN LECTEUR D'ÉCRAN ENTEND, jamais l'attribut posé sur le nœud
 * (revue-correction #7017).
 *
 * `getAttribute('lang')` ne peut pas tomber sur le défaut qui compte : un
 * attribut ABSENT (`null`) et un attribut VIDE (`''`, la coquille que Preact
 * laisse derrière une prop disparue — `lang` étant une propriété de
 * `HTMLElement`, `setProperty` prend la branche `name in dom` et écrit
 * `dom.lang = ''` au lieu d'appeler `removeAttribute`) se lisent tous deux
 * comme « rien », alors qu'ils désignent DEUX langues effectives différentes —
 * la langue HÉRITÉE du document pour le premier, « langue inconnue » pour le
 * second. Aucune des deux n'est la langue SERVIE.
 *
 * `closest('[lang]')` mesure ce que la cascade HTML résout RÉELLEMENT, et il
 * distingue les trois cas : `'fr'` (le nœud annonce sa langue), `''` (coquille)
 * et `'en'` (hérité du `<html lang>` que pose le script d'amorçage de la langue
 * d'INTERFACE). Un témoin écrit sur l'attribut aurait blanchi les deux
 * derniers.
 */
const transcriptServedLangOf = (page, id) =>
  page.evaluate((messageId) => {
    const paragraph = document.querySelector(`[data-message="${messageId}"] [data-transcript]`);
    return paragraph?.closest('[lang]')?.getAttribute('lang') ?? null;
  }, id);

const documentLangOf = (page) => page.evaluate(() => document.documentElement.lang);

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

  /**
   * LA PRÉMISSE DES TROIS MESURES DE LANGUE CI-DESSOUS, POSÉE PLUTÔT QUE
   * SUPPOSÉE (revue-correction #7017). Ce contexte est ouvert en `locale:
   * 'en-US'`, donc le script d'amorçage de la langue d'INTERFACE
   * (`inline-interface-language-bootstrap.js`) écrit `<html lang="en">`,
   * pendant que le CONTENU descend le Prisme du LECTEUR, dont le rang 1 vaut
   * TOUJOURS `'fr'` (`systemLanguage: 'fr'`, `src/lib/reader.ts`). Les deux
   * résolveurs DIVERGENT, et c'est cette divergence — le cas NOMINAL d'un
   * francophone sur un appareil anglais — qui rend les assertions suivantes
   * falsifiables : sans elle, « annoncer la langue servie » et « ne rien
   * annoncer » se ressembleraient.
   */
  expect(
    (await documentLangOf(page)) === 'en',
    `${label} le document est en ANGLAIS (langue d'INTERFACE, locale en-US) pendant que le Prisme sert du contenu français (obtenu ${await documentLangOf(page)})`,
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
    (await transcriptServedLangOf(page, 'live-3')) === 'es',
    `${label} live-3 : la transcription est ANNONCÉE en "es" — la langue RÉELLEMENT servie, pas celle du lecteur ni celle du document (obtenu ${JSON.stringify(await transcriptServedLangOf(page, 'live-3'))})`,
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
    (await transcriptServedLangOf(page, 'live-3')) === 'en',
    `${label} live-3 : la transcription est ANNONCÉE en "en" au rang 2 (obtenu ${JSON.stringify(await transcriptServedLangOf(page, 'live-3'))})`,
  );
  expect(messageFetches === 0, `${label} aucune requête « /messages » n'a été déclenchée par la traduction ni par l'enrichissement de la pièce (${messageFetches})`);

  // ===== 2. conversation:updated NE PARLE QU'À LA LISTE =====
  await page.clock.runFor(1000); // T+5 s
  expect(
    (await textOf(page, 'live-1')).includes('Bonjour, la revue reste bien jeudi ?'),
    `${label} live-1 : le fil ne change pas quand conversation:updated arrive (le fil OUVERT n'écoute que message:translation)`,
  );
  /**
   * LE RANG 1 REPREND LA MAIN — et la langue ANNONCÉE doit devenir « fr »,
   * jamais se taire.
   *
   * CE TÉMOIN NE POUVAIT PAS TOMBER, et c'est la revue-correction #7017 qui
   * l'a mesuré. Il exigeait `lang === null || lang === ''` : les DEUX seules
   * valeurs que la règle de rendu d'alors pouvait produire à cet instant
   * (`null` si le nœud naissait ici, `''` — la coquille Preact — parce qu'il
   * avait porté « en » une seconde plus tôt). Une assertion satisfaite par
   * l'ensemble des issues possibles ne garde rien.
   *
   * Pire, elle CONSACRAIT le défaut. `attachment-blocks.tsx` omettait
   * l'attribut quand la langue servie valait `READER_LOCALE`, en le justifiant
   * par « c'est la langue du document » — or le document est en `en` ici
   * (assertion posée plus haut) et `READER_LOCALE` vaut TOUJOURS `'fr'`. Le
   * cas où l'attribut disparaissait était donc exactement celui où il est
   * INDISPENSABLE : un texte français dans un document anglais. Mesuré au
   * navigateur sur le dist d'avant correctif — quatre instants, `closest
   * ('[lang]')` :
   *
   *     T+0,3 « es »   T+2,5 « es »   T+4 « en »   T+5 « » (langue INCONNUE)
   *
   * Un lecteur d'écran lisait donc « Bonjour, on garde la revue jeudi ? » sans
   * langue déclarée. La coquille `lang=""` sauvait la mise par accident (HTML
   * la définit comme « langue explicitement inconnue », donc elle n'hérite pas
   * de l'anglais) ; sur le chemin REST, où le nœud naît sans attribut, rien ne
   * la sauvait — le français y héritait bel et bien du `<html lang="en">`.
   *
   * La règle appliquée désormais n'a plus de cas particulier : on ANNONCE la
   * langue servie, à tous les rangs. C'est ce que la spécification §4.3 d
   * demandait (`<p lang="fr">`), et ce que `attachment-blocks.test.tsx` garde
   * à l'unité avec la divergence interface/Prisme qui la motive.
   */
  expect(
    (await transcriptOf(page, 'live-3')).includes('on garde la revue jeudi ?'),
    `${label} live-3 : la traduction FRANÇAISE (rang 1) reprend la main à T+4,2 s (obtenu « ${await transcriptOf(page, 'live-3')} »)`,
  );
  const rank1Lang = await transcriptServedLangOf(page, 'live-3');
  expect(
    rank1Lang === 'fr',
    `${label} live-3 : la transcription est ANNONCÉE en "fr" au rang 1 — jamais muette dans un document anglais (obtenu ${JSON.stringify(rank1Lang)})`,
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

  // ===== 6. LA PIÈCE PROTÉGÉE ARRIVÉE PAR SOCKET N'ATTEINT PAS LE DOM (#7014) =====
  /**
   * LE CHEMIN TEMPS RÉEL, QU'AUCUN GATE NE JOUAIT — et c'est la moitié qui a
   * fui. `check-media.mjs` exerce `media-10` (la PIÈCE déclarée protégée sur un
   * message ordinaire, #6189) sur le chemin REST : il était VERT pendant toute
   * la vie du défaut, parce que le corpus arrive par `GET /messages`, où le
   * `select` sert bien `isViewOnce`. Le canal SOCKET, lui, ne servait RIEN —
   * `serializeAttachmentForSocket` énumérait trente champs à la main, sans les
   * trois de la protection — et `maskedAttachment` échoue OUVERTE quand on ne
   * la nourrit pas. Une photo à VUE UNIQUE reçue en direct rendait donc son
   * `<img>` EN CLAIR jusqu'au prochain `GET /messages`.
   *
   * CE QUE CE GATE MESURE, exactement : la moitié CLIENT du fail-closed —
   * `message:new` → `applyMessageNew` → cache TanStack → `decodeMessage` →
   * bulle → `<Attachments>` → DOM, dans un VRAI navigateur. C'est le segment
   * qu'aucun autre témoin ne traverse : le témoin bout-à-bout
   * (`realtime-attachment-protection.test.tsx`) branche le VRAI sérialiseur de
   * la passerelle mais rend `<Attachments>` à la main, sans cache ni bulle ;
   * `check-media.mjs` monte la vraie bulle mais n'arrive que par REST.
   *
   * La moitié SERVEUR — que la passerelle ÉMET bien ces champs — est tenue
   * ailleurs, et doit l'être : la charge ci-dessous est une FIXTURE, donc ce
   * gate ne peut pas prouver ce que le sérialiseur sert. C'est la garde
   * d'INVENTAIRE (`serializeAttachmentForSocket.test.ts`) qui le prouve, et le
   * témoin bout-à-bout qui relie les deux.
   *
   * L'ÉPREUVE DE CE TÉMOIN N'EST PAS SON VERT mais sa MUTATION : retirer
   * `isViewOnce` de la pièce de `live-protege` (`fixtures-realtime.ts`) — la
   * forme EXACTE du défaut, une charge socket muette sur sa protection — doit
   * le faire tomber. Mesuré en l'écrivant.
   */
  const bulleVue = (id, urlServie) =>
    page.evaluate(
      ([messageId, url]) => {
        const bulle = document.querySelector(`[data-message="${messageId}"]`);
        if (bulle === null) return null;
        const img = bulle.querySelector('img');
        return {
          img: img !== null,
          src: img?.getAttribute('src') ?? null,
          substitut: bulle.querySelector('[data-protected-attachment="hidden"]') !== null,
          /* L'URL est cherchée dans le HTML ENTIER de la bulle, jamais sur le
             seul `src` d'un `<img>` : un `background-image`, un `<source>`,
             un `data-` quelconque la ferait fuir tout autant. Les octets dans
             la page SONT la fuite — un `filter: blur()` n'est pas une
             rétention (motif `check-media.mjs` § (n)). */
          urlEnClair: url !== null && bulle.outerHTML.includes(url),
        };
      },
      [id, urlServie ?? null],
    );

  /**
   * LE CONTRÔLE EST OBSERVÉ EN PREMIER, et il n'est pas seulement la
   * contre-épreuve (leçon 261) : c'est LUI qui donne au gate l'URL à chercher
   * dans la bulle protégée. Recopier ce littéral ici en ferait une SECONDE
   * définition — celle qui dérive en silence le jour où la fixture change son
   * média, laissant le témoin chercher une chaîne que plus personne ne sert et
   * verdir sur une fuite réelle. Le média est servi par la fixture, une fois.
   */
  await page.clock.runFor(3000); // T+30,3 s — `live-ordinaire` est arrivé à 30 000 ms.
  const ordinaire = page.locator('[data-message="live-ordinaire"]');
  await ordinaire.waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
  const vuOrdinaire = await bulleVue('live-ordinaire', null);
  expect(
    vuOrdinaire?.img === true,
    `${label} CONTRÔLE, T+30,3 s : le média SANS déclaration, arrivé PAR SOCKET, rend bien son <img> — sans quoi les témoins suivants ne pourraient pas tomber (obtenu ${JSON.stringify(vuOrdinaire)})`,
  );
  expect(
    vuOrdinaire?.substitut === false,
    `${label} CONTRÔLE, T+30,3 s : la pièce ordinaire ne porte AUCUN substitut (obtenu ${JSON.stringify(vuOrdinaire)})`,
  );

  const urlServie = vuOrdinaire?.src ?? null;
  expect(
    typeof urlServie === 'string' && urlServie.length > 0,
    `${label} CONTRÔLE : l'URL du média est LUE sur la bulle ordinaire, jamais recopiée dans ce gate (obtenue ${urlServie})`,
  );

  /** LE MÊME MÉDIA, LA MÊME ARRIVÉE — la seule déclaration en plus. */
  await page.clock.runFor(1000); // T+31,3 s — `live-protege` est arrivé à 31 000 ms.
  const protegee = page.locator('[data-message="live-protege"]');
  await protegee.waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
  const vuProtege = await bulleVue('live-protege', urlServie);
  expect(
    vuProtege !== null,
    `${label} T+31,3 s : le message protégé reçu par socket porte bien sa bulle (sinon ce témoin ne mesure RIEN)`,
  );
  expect(
    vuProtege?.img === false,
    `${label} T+31,3 s : la pièce déclarée \`isViewOnce\` arrivée PAR SOCKET ne rend AUCUN <img> (obtenu ${JSON.stringify(vuProtege)})`,
  );
  expect(
    vuProtege?.urlEnClair === false,
    `${label} T+31,3 s : l'URL du média protégé n'est NULLE PART dans la bulle (obtenu ${JSON.stringify(vuProtege)})`,
  );
  expect(
    vuProtege?.substitut === true,
    `${label} T+31,3 s : la pièce protégée porte son substitut \`data-protected-attachment="hidden"\` (obtenu ${JSON.stringify(vuProtege)})`,
  );

  await context.close();
}
