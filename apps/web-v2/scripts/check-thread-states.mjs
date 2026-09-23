#!/usr/bin/env node
/**
 * VÉRIFIE LES ÉTATS DU FIL — ceux qu'on oublie parce qu'ils ne sont pas le cas
 * nominal, et qui sont pourtant le cas NOMINAL du réseau visé.
 *
 * LES ÉTATS 1-4 (vide, coupure, échec d'envoi, reprise honnête) SONT DANS
 * `lib/check-offline-states.mjs` ET LE § 5 (la protection) DANS
 * `lib/check-protection-states.mjs` DEPUIS #7054 (l'hôte était hors du budget
 * de 1000-1200 lignes, § Code Style du `CLAUDE.md` — extrait AVANT
 * d'ajouter). Leur doc-comment et ce qu'ils mesurent vivent désormais là.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { awaitCondition, awaitFact } from './lib/await-fact.mjs';
import { checkOfflineStates } from './lib/check-offline-states.mjs';
import { checkThreadMedia, waitForRowSettled } from './lib/check-media.mjs';
import { waitForValueSettled } from './lib/settle-value.mjs';
import { checkThreadMediaGrid } from './lib/check-media-grid.mjs';
import { checkViewerVideoTransport } from './lib/check-media-transport.mjs';
import { checkMessageStates } from './lib/check-message-states.mjs';
import { checkRealtimeEvents } from './lib/check-realtime-events.mjs';
import { checkTypingVisibility } from './lib/check-typing-visibility.mjs';
import {
  BLURRED_CONTENT,
  BLURRED_WITNESS_ID,
  TRANSLATED_UNVEILED_WITNESS_ID,
  checkProtectionStates,
} from './lib/check-protection-states.mjs';

const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const browser = await launchChromium();

const failures = [];
/**
 * On imprime AU FIL DE L'EAU, pas à la fin. Un témoin qui garde son bilan pour
 * la sortie perd tout ce qu'il avait constaté si une étape suivante lève — et
 * c'est exactement ce qui est arrivé à sa première version : elle avait bien
 * relevé le défaut, puis a rendu un « Timeout waiting for getByText » à sa
 * place. Ce qu'un témoin a vu doit survivre à ce qui l'arrête.
 */
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/** LE SCHÉMA D'UN CONTEXTE — même pose que `check-reading-mode.mjs`
 * (`meeshy.scheme`, lu par `src/lib/scheme.ts`), jamais une seconde loi. */
const setScheme = (context, scheme) =>
  context.addInitScript((s) => {
    try {
      localStorage.setItem('meeshy.scheme', s);
    } catch {
      /* navigation privée : le schéma tient pour la page seule (repli HTML). */
    }
  }, scheme);

/** La barre AA (#5625) — la MÊME que `check-reading-mode.mjs`. */
const AA_THRESHOLD = 4.5;

// 1-4 — vide, coupure, échec d'envoi, reprise honnête : `lib/check-offline-
// states.mjs` (l'hôte était hors budget : on extrait AVANT d'ajouter, § Code
// Style du CLAUDE.md — #7054, qui y a aussi remplacé chaque délai fixe par
// une attente de fait, `await-fact.mjs`).
await checkOfflineStates({ browser, BASE, expect });

/**
 * 5 — LA PROTECTION (D-23, #5676) — `lib/check-protection-states.mjs`
 * (revue-correction #7054) : la suite y a pris son horloge EN PAUSE, et la
 * preuve mesurée qui la motive ne tenait plus dans le budget de l'hôte.
 * Elle EXPORTE les ids et les chaînes de son corpus, que le § 6.12 relit.
 */
await checkProtectionStates({ browser, BASE, expect });

/**
 * 6 — LE MENU DU MESSAGE (#5814) : L'APPUI LONG, LE CLIC DROIT ET LA TOUCHE
 * MENU OUVRENT LE MÊME MENU, ET CHAQUE ENTRÉE A UN EFFET.
 *
 * POURQUOI UN NAVIGATEUR RÉEL, alors que `message-menu.test.tsx` couvre déjà
 * l'ouverture. Trois choses n'existent que là : (a) le vrai `contextmenu` du
 * clic droit et le vrai `pointerdown` tenu, sur les rangées VIRTUALISÉES du
 * fil réel — pas sur une rangée de banc ; (b) `navigator.clipboard`, qu'aucun
 * test unitaire n'a ; (c) l'EFFET d'une action sur l'écran ENTIER (la barre de
 * sélection qui remplace le composeur, la citation qui apparaît dans le
 * composeur, la capsule optimiste qui pousse sous la bulle). Le critère de fin
 * de #5814 demande exactement cela : « chaque entrée a un EFFET mesurable ».
 *
 * ON MESURE L'EFFET, JAMAIS LA PRÉSENCE. Un menu dont les cinq entrées
 * existent et ne font rien passerait n'importe quel témoin structurel — c'est
 * le défaut le plus fréquent du dépôt (loi 4 : « un contrôle existe s'il a un
 * effet »). Chaque ligne ci-dessous nomme donc ce qui CHANGE.
 */
{
  /**
   * LA LANGUE D'INTERFACE EST ÉPINGLÉE (#5866) — `locale: 'fr-FR'`, et c'est
   * une DÉPENDANCE, pas une décoration. Les libellés du menu du message
   * (« Sélectionner », « Traduire », « Copier », « Transférer », « Composer »)
   * et le nom de la barre de sélection viennent du catalogue depuis #5866 :
   * ils suivent donc `currentInterfaceLanguage()`, qui se résout d'abord sur la
   * langue du NAVIGATEUR. Un contexte Playwright sans `locale` hérite du défaut
   * de Chromium (`en-US`) — ce gate cherchait alors « Copier » dans un menu qui
   * disait « Copy », et rendait « l'entrée manque au menu » pour une interface
   * parfaitement correcte. Tant que ces libellés étaient écrits EN DUR en
   * français, la dépendance existait sans se voir : le gate mesurait une
   * constante, pas une résolution.
   */
  const menuContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  // `navigator.clipboard` n'existe pas sur un contexte non sécurisé (http) :
  // on le POSE avant tout script de page et on garde ce qu'on y écrit.
  await menuContext.addInitScript(() => {
    const written = [];
    Object.defineProperty(window, '__copied', { get: () => written });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
  });
  const menuPage = await menuContext.newPage();
  await menuPage.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await menuPage.waitForSelector('[data-message]');

  const rows = menuPage.locator('[data-row]');
  const cluster = menuPage.locator('[role="menu"]');
  const listItems = menuPage.locator('.message-menu-list [role="menuitem"]');

  /**
   * L'ANCRAGE D'OUVERTURE DU FIL EST ENCORE EN VOL (#7054, découvert en
   * vérifiant ce lot) — `pinToBottom` répète `scrollTop = scrollHeight` sur
   * 20 VRAIES images pendant que les hauteurs convergent, et chaque image où
   * la hauteur a changé émet un `scroll` NATIF que `useRovingMenu` (#5814)
   * traite comme une fermeture (`onScroll: onClose`, capturé sur `document`,
   * `roving-menu.ts:160`) : un menu ouvert PENDANT cette fenêtre se referme
   * aussitôt, sans rapport avec le clic. `waitForRowSettled`
   * (`lib/check-media.mjs`) attend le FAIT — réutilisé, jamais dupliqué.
   */
  await waitForRowSettled(menuPage, await rows.nth(2).locator('[data-message]').getAttribute('data-message'));

  /**
   * Le fil est ANCRÉ EN BAS et VIRTUALISÉ : une rangée peut être montée sans
   * être à l'écran. `click()` fait défiler tout seul, `mouse.move()` non — on
   * amène donc la rangée en vue avant TOUT geste de bas niveau, sinon le
   * témoin mesure un pointeur posé dans le vide (mesuré en revue).
   */
  const openMenuOnRow = async (index) => {
    await rows.nth(index).scrollIntoViewIfNeeded();
    await rows.nth(index).click({ button: 'right' });
    await awaitFact(cluster);
  };
  /**
   * Rend `false` PLUTÔT QUE DE LEVER quand l'entrée manque — un témoin doit
   * nommer le défaut trouvé, jamais mourir dessus (§ `clickIfPresent`).
   *
   * AUCUNE attente après le clic (#7054) : l'EFFET d'une entrée de menu
   * diffère de l'une à l'autre (le presse-papiers, un attribut `lang`, une
   * capsule, une barre de sélection…) — chaque APPELANT attend SON fait,
   * juste après.
   */
  const clickMenuItem = async (label) => {
    const item = listItems.filter({ hasText: label }).first();
    if ((await item.count()) === 0) return expect(false, `l'entrée « ${label} » manque au menu`);
    await item.click();
    return true;
  };

  // 6.1 — LE CLIC DROIT ouvre UN menu, avec son rail et ses entrées.
  await openMenuOnRow(2);
  expect((await cluster.count()) === 1, 'le clic droit sur la 3e rangée ouvre UN role=menu');
  expect(
    (await menuPage.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]').count()) === 7,
    'le rail porte 6 emojis + « Ajouter une réaction »',
  );

  /**
   * 6.1 bis — LE VOILE FLOUTE POUR DE BON. La spécification a tranché « flou »
   * (parité avec la capture cible iOS 26) ; la feuille le déclarait ET la
   * minification le PERDAIT — `backdrop-filter` écrit à côté de sa jumelle
   * `-webkit-` était fusionné en la seule forme préfixée, que Chromium
   * n'applique pas. Mesuré sur le dist : `backdropFilter === 'none'`, fond
   * NET sous le voile. Une décision de design qui n'atteint aucun lecteur
   * n'a été prise pour personne — on la mesure donc dans le NAVIGATEUR, sur
   * le style RÉSOLU, jamais dans la feuille source.
   */
  const veil = await menuPage.evaluate(() => {
    const el = document.querySelector('.message-menu-backdrop');
    if (el === null) return null;
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, background: cs.backgroundColor };
  });
  expect(veil !== null, 'le menu pose un voile plein écran');
  expect(
    veil !== null && veil.filter !== 'none' && veil.filter !== '',
    `le voile FLOUTE le fond (backdrop-filter: ${veil?.filter})`,
  );
  expect(
    veil !== null && /rgba?\(0, ?0, ?0/.test(veil.background),
    `le voile TEINTE le fond (${veil?.background})`,
  );

  /**
   * 6.1 ter — LE CLUSTER PORTE L'ACCENT DE LA CONVERSATION. `--accent` est
   * posée sur la RACINE de l'écran ; le menu vit dans un PORTAIL sur `body`,
   * donc hors de cette portée — mesuré, l'avatar du clone et les cinq icônes
   * retombaient sur la valeur globale, un cluster gris au-dessus d'un fil
   * teinté. La charte veut l'inverse (« ALL conversation-context components
   * MUST use accentColor »).
   */
  const accentCheck = await menuPage.evaluate(() => {
    const row = document.querySelector('[data-row]');
    const backdrop = document.querySelector('.message-menu-backdrop');
    if (row === null || backdrop === null) return null;
    const icon = backdrop.querySelector('.message-menu-list svg');
    return {
      row: getComputedStyle(row).getPropertyValue('--accent').trim(),
      menu: getComputedStyle(backdrop).getPropertyValue('--accent').trim(),
      icon: icon === null ? null : getComputedStyle(icon).color,
    };
  });
  expect(accentCheck !== null && accentCheck.row !== '', 'la rangée porte bien un accent de conversation');
  expect(
    accentCheck !== null && accentCheck.menu === accentCheck.row,
    `le menu porte l'accent de la conversation (rangée ${accentCheck?.row}, menu ${accentCheck?.menu})`,
  );

  // 6.2 — AUCUN CONTRÔLE SANS GESTIONNAIRE : tout ce qui est atteignable dans
  // le cluster est un `<button type="button">` actif. Un `<div>` cliquable ou
  // un bouton désactivé y serait un contrôle qui ment.
  const inertControls = await menuPage.evaluate(() => {
    const root = document.querySelector('[role="menu"]');
    if (root === null) return ['aucun cluster'];
    const controls = Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'));
    return controls
      .filter((el) => el.tagName !== 'BUTTON' || el.hasAttribute('disabled') || el.getAttribute('type') !== 'button')
      .map((el) => `${el.tagName}/${el.getAttribute('aria-label') ?? el.textContent}`);
  });
  expect(inertControls.length === 0, `0 contrôle du menu sans gestionnaire (${inertControls.join(', ')})`);

  // 6.3 — ÉCHAP ferme et rend le focus À LA RANGÉE.
  await menuPage.keyboard.press('Escape');
  await awaitFact(cluster, { state: 'detached' });
  expect((await cluster.count()) === 0, 'Échap ferme le menu');
  expect(
    await menuPage.evaluate(() => document.activeElement?.hasAttribute('data-row') === true),
    'Échap rend le focus à la rangée qui a ouvert le menu',
  );

  /**
   * 6.3 bis — ÉCHAP TENU DANS LA TÂCHE QUI MONTE LE MENU (#7293).
   *
   * POURQUOI CE SECOND TÉMOIN, alors que le 6.3 mesure la même phrase. Le
   * 6.3 presse Échap quatre allers-retours Playwright après l'ouverture : il
   * laisse donc passer une image, et sur une machine au repos l'image arrive
   * en quatorze millisecondes. Le défaut, lui, vit AVANT cette image — sous
   * `preact/compat`, les sorties du menu (Échap, appui hors du menu) étaient
   * posées par un effet PASSIF, différé par un `requestAnimationFrame` et
   * garanti seulement par un `setTimeout` de 100 ms. Entre le commit et
   * l'image, le menu est visible et SOURD : la touche n'est pas retardée,
   * elle est perdue, et le menu ne se referme plus jamais. `dev` en rendait
   * les DEUX témoins d'Échap rouges pendant que le 6.3 passait 3 fois sur 3
   * à froid en local — vert-à-froid + rouge-à-chaud sur le même invariant
   * n'est pas un flottement, c'est une COURSE.
   *
   * ON N'OUVRE PAS LA FENÊTRE PAR LA CHARGE, ON LA VISE PAR L'ORDRE. Le
   * geste et la touche partent de la MÊME tâche : l'attente du portail passe
   * par un `MutationObserver`, dont les rappels sont des MICROTÂCHES —
   * aucune image ne peut s'intercaler, par construction et non par pari sur
   * une vitesse. Aucune horloge ici : c'est ce qui rend ce témoin
   * reproductible sur n'importe quelle machine.
   */
  const heldEscape = await menuPage.evaluate(async () => {
    const row = document.querySelectorAll('[data-row]')[2];
    if (row === undefined) return null;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => {
      if (document.querySelector('[role="menu"]') !== null) return resolve();
      const observer = new MutationObserver(() => {
        if (document.querySelector('[role="menu"]') === null) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { opened: document.querySelectorAll('[role="menu"]').length };
  });
  expect(heldEscape !== null && heldEscape.opened === 1, 'le clic droit synthétique monte le menu dans sa propre tâche');
  await awaitFact(cluster, { state: 'detached' });
  expect((await cluster.count()) === 0, "Échap ferme le menu dès la tâche qui le monte, sans attendre une image");
  expect(
    await menuPage.evaluate(() => document.activeElement?.hasAttribute('data-row') === true),
    "Échap rend le focus à la rangée dès la tâche qui monte le menu",
  );
  /* Le verdict est PRIS ; on rend la page à l'état que la suite attend (menu
     fermé, focus sur la rangée) même quand le témoin ci-dessus est tombé,
     pour que le § 6.4 mesure son propre geste et non ce résidu. */
  if ((await cluster.count()) !== 0) {
    await menuPage.keyboard.press('Escape');
    await awaitFact(cluster, { state: 'detached' });
    await menuPage.locator('[data-row]').nth(2).focus();
  }

  // 6.4 — LA TOUCHE MENU (Shift+F10) ouvre le MÊME menu depuis le clavier.
  await menuPage.keyboard.press('Shift+F10');
  await awaitFact(cluster);
  expect((await cluster.count()) === 1, 'Shift+F10 sur la rangée focalisée ouvre le menu');
  /**
   * LE FOCUS INITIAL DU CLUSTER EST POSÉ PAR UN `requestAnimationFrame`
   * DIFFÉRÉ (#7054) — `useRovingMenu` (`roving-menu.ts:176`) focalise le
   * premier item une image APRÈS le montage, donc APRÈS `awaitFact(cluster)`.
   * Un `.focus()` programmatique + `ArrowRight` avant cette image se fait
   * ÉCRASER par cet effet (« 😂 → 😂 », mesuré). On attend la STABILISATION
   * du focus dans le cluster avant de le déplacer nous-mêmes.
   */
  await waitForValueSettled(
    menuPage,
    () => document.querySelector('[role="menu"]')?.contains(document.activeElement) === true,
  );

  // 6.4 bis — LE PARCOURS CLAVIER DU RAIL. `ArrowRight` y déplaçait le focus
  // par un événement RECOPIÉ (`{ ...event, key }`), qui perd `preventDefault`
  // — méthode de PROTOTYPE : le rail levait `TypeError` et restait inerte.
  const railFirst = menuPage.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]').first();
  await railFirst.focus();
  const focusedBefore = await menuPage.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await menuPage.keyboard.press('ArrowRight');
  // `waitForValueSettled` (`settle-value.mjs`) : DEUX lectures consécutives
  // identiques, jamais une seule — la garde ci-dessus n'exclut pas un second
  // rebond du même effet différé. LE RETOUR EST JETÉ, JAMAIS ASSERTÉ
  // (revue-correction #7054, défaut majeur 2) : `waitForValueSettled` rend
  // `undefined` quand son budget s'épuise, et `undefined !== null &&
  // undefined !== focusedBefore` sont VRAIES toutes les deux — l'expiration
  // de l'attente se rapportait alors comme un SUCCÈS. Même discipline que le
  // 6.4 ter juste en dessous : on attend la stabilisation, puis on RELIT
  // l'état réel de la page pour l'assertion.
  await waitForValueSettled(
    menuPage,
    () => document.activeElement?.getAttribute('aria-label') ?? null,
  );
  const focusedAfter = await menuPage.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);
  expect(
    focusedAfter !== null && focusedAfter !== focusedBefore,
    `ArrowRight déplace le focus sur le rail (${focusedBefore} → ${focusedAfter})`,
  );
  // 6.4 ter — TAB NE SORT PAS DU CLUSTER : derrière le voile, les rangées sont
  // focalisables et pourtant inatteignables. Même garde qu'au-dessus : DEUX
  // lectures consécutives identiques, pas une lecture après un seul fait.
  await menuPage.keyboard.press('Tab');
  await waitForValueSettled(
    menuPage,
    () => document.querySelector('[role="menu"]')?.contains(document.activeElement) === true,
  );
  expect(
    await menuPage.evaluate(() => document.querySelector('[role="menu"]')?.contains(document.activeElement) === true),
    'Tab garde le focus DANS le menu',
  );
  await menuPage.keyboard.press('Escape');
  await awaitFact(cluster, { state: 'detached' });

  // 6.5 — L'APPUI LONG (500 ms, souris tenue) ouvre le même menu, et le geste
  // ne laisse AUCUNE sélection de texte native derrière lui.
  await rows.nth(0).scrollIntoViewIfNeeded();
  await rows.nth(0).hover();
  // DÉLAI DE GESTE, pas d'état (#7054) : le temps tenu EST l'entrée — le
  // seuil d'appui long (500 ms) se mesure en le TENANT, aucun fait ne le
  // remplace. La seule occurrence autorisée par `no-fixed-delays.test.ts`.
  await menuPage.mouse.down();
  await menuPage.waitForTimeout(700);
  await menuPage.mouse.up();
  const longPressOpened = expect(
    (await awaitFact(cluster)) && (await cluster.count()) === 1,
    'un appui tenu 500 ms ouvre le menu',
  );
  expect(
    await menuPage.evaluate(() => (window.getSelection()?.toString() ?? '') === ''),
    "l'appui long ne sélectionne pas le texte de la rangée",
  );
  if (!longPressOpened) await openMenuOnRow(0);

  // 6.6 — COPIER écrit le texte SERVI dans le presse-papiers.
  const servedText = await rows.nth(0).innerText();
  if (await clickMenuItem('Copier')) {
    await awaitCondition(menuPage, () => window.__copied.length > 0);
    const copied = await menuPage.evaluate(() => window.__copied);
    expect(copied.length === 1, 'Copier écrit une fois dans le presse-papiers');
    expect(
      copied.length === 1 && servedText.includes(copied[0]),
      `Copier écrit le texte SERVI (« ${copied[0] ?? ''} »)`,
    );
  }

  // 6.7 — TRADUIRE change le texte servi ET l'attribut `lang` de la rangée.
  const langBefore = await rows.nth(0).locator('[lang]').first().getAttribute('lang');
  const textBefore = await rows.nth(0).innerText();
  await openMenuOnRow(0);
  if (await clickMenuItem('Traduire')) {
    const choices = menuPage.locator('[role="group"][aria-label="Traduire"] [role="menuitemradio"]');
    expect((await choices.count()) >= 2, 'le sous-menu Traduire offre au moins deux langues');
    // La langue NON servie — un témoin de RANG ne se pose jamais sur le rang 1.
    const unchecked = choices.and(menuPage.locator('[aria-checked="false"]'));
    const target = (await unchecked.count()) > 0 ? unchecked.first() : choices.nth(1);
    await target.click();
    /**
     * ON ATTEND LE CHANGEMENT, ON NE LE « STABILISE » PAS (revue-correction
     * #7054). `waitForValueSettled` rend la première valeur lue DEUX FOIS de
     * suite : si le rendu du nouveau texte a un tour de retard, elle rend la
     * valeur d'AVANT, parfaitement stable — et le témoin rougit en disant
     * « Traduire ne change pas lang », un défaut qui n'existe pas. Elle est
     * faite pour une valeur qu'un effet DIFFÉRÉ peut annuler (le focus du
     * cluster, 6.4bis/6.4ter) ; ici le fait est un CHANGEMENT qu'on attend,
     * donc `awaitCondition`, qui sonde jusqu'à ce qu'il soit vrai.
     */
    await awaitCondition(
      menuPage,
      (before) =>
        (document.querySelector('[data-row]')?.querySelector('[lang]')?.getAttribute('lang') ?? null) !== before,
      langBefore,
    );
    const langAfter = await rows.nth(0).locator('[lang]').first().getAttribute('lang');
    const textAfter = await rows.nth(0).innerText();
    expect(langAfter !== langBefore, `Traduire change lang (${langBefore} → ${langAfter})`);
    expect(textAfter !== textBefore, 'Traduire change le TEXTE servi, pas seulement son étiquette');
  }

  // 6.8 — UNE RÉACTION DU RAIL pousse une capsule OPTIMISTE sous la rangée.
  const chipsBefore = await rows.nth(0).locator('.rounded-chip').count();
  await openMenuOnRow(0);
  await menuPage.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]').first().click();
  // Le fait est la CAPSULE EN PLUS, pas une valeur qui se stabilise (§ 6.7).
  await awaitCondition(
    menuPage,
    (before) => (document.querySelector('[data-row]')?.querySelectorAll('.rounded-chip').length ?? 0) > before,
    chipsBefore,
  );
  expect(
    (await rows.nth(0).locator('.rounded-chip').count()) > chipsBefore,
    'une réaction du rail ajoute une capsule tout de suite (optimiste)',
  );

  // 6.9 — COMPOSER pré-adresse le composeur (la citation apparaît).
  await openMenuOnRow(0);
  if (await clickMenuItem('Composer')) {
    await awaitFact(
      menuPage.getByRole('button', { name: /Annuler la réponse/ }).or(menuPage.locator('[data-reply-target]')).first(),
    );
    expect(
      (await menuPage.getByRole('button', { name: /Annuler la réponse/ }).count()) > 0 ||
        (await menuPage.locator('[data-reply-target]').count()) > 0,
      'Composer pré-adresse le composeur (la citation apparaît)',
    );
  }

  // 6.10 — SÉLECTIONNER remplace le composeur par la barre de sélection, et la
  // coche de la rangée est un contrôle RÉEL (role=checkbox), pas un décor.
  await openMenuOnRow(0);
  if (await clickMenuItem('Sélectionner')) {
    await awaitFact(menuPage.getByRole('toolbar', { name: 'Sélection de messages' }));
    expect(
      (await menuPage.getByRole('toolbar', { name: 'Sélection de messages' }).count()) === 1,
      'Sélectionner remplace le composeur par la barre de sélection',
    );
    expect(
      (await menuPage.getByPlaceholder('Message…').count()) === 0,
      'le composeur et la barre de sélection ne coexistent jamais',
    );
    const checkboxes = menuPage.getByRole('checkbox');
    const checked = await checkboxes.count();
    expect(checked > 1, 'chaque rangée porte une coche role=checkbox atteignable');
    if (checked > 1) {
      const second = checkboxes.nth(1);
      const before = await second.getAttribute('aria-checked');
      await second.click();
      /* Le fait est la BASCULE (§ 6.7) — et `waitForValueSettled` rendait ici
         `undefined` quand son budget s'épuisait, ce qui satisfaisait
         `after !== before` : un témoin qui verdissait sur l'échec de sa propre
         attente. */
      await awaitCondition(
        menuPage,
        (previous) =>
          (document.querySelectorAll('[role="checkbox"]')[1]?.getAttribute('aria-checked') ?? null) !== previous,
        before,
      );
      const after = await second.getAttribute('aria-checked');
      expect(
        after !== before,
        "la coche d'une AUTRE rangée bascule au clic (contrôle réel, pas un décor)",
      );
    }
  }

  /**
   * 6.10 bis — « TRANSFÉRER » ARME LA SÉLECTION, ET LA BARRE OUVRE LES
   * DESTINATAIRES (#5866, décision porteur #5989).
   *
   * Le porteur a tranché : la porte « Transférer » a le MÊME effet que
   * « Sélectionner », avec ce message déjà coché — pas un sélecteur de
   * conversations qui s'ouvre d'un coup. Ce témoin mesure LES DEUX ÉTAPES,
   * parce que la première seule ne distingue pas le geste voulu d'un
   * « Transférer » qui aurait simplement été câblé sur « Sélectionner » par
   * erreur : c'est la SECONDE qui prouve que le mot mène quelque part.
   */
  /* ON QUITTE LA SÉLECTION PAR SON PROPRE GESTE — Échap ne la ferme pas, et
     `openMenuFor` REFUSE d'ouvrir un menu tant qu'une sélection est armée
     (`use-message-menu.ts`, « en sélection, un tap bascule déjà »). Sans ce
     « Annuler », l'entrée cherchée ci-dessous manquait à un menu qui n'était
     jamais monté — un rouge qui accusait la mauvaise chose. */
  await menuPage.getByRole('toolbar', { name: 'Sélection de messages' }).getByRole('button', { name: 'Annuler' }).click();
  await awaitFact(menuPage.getByRole('toolbar', { name: 'Sélection de messages' }), { state: 'detached' });
  await openMenuOnRow(0);
  if (await clickMenuItem('Transférer')) {
    await awaitFact(menuPage.getByRole('toolbar', { name: 'Sélection de messages' }));
    expect(
      (await menuPage.getByRole('toolbar', { name: 'Sélection de messages' }).count()) === 1,
      '« Transférer » arme la sélection multiple (décision #5989)',
    );
    expect(
      (await menuPage.locator('[role="checkbox"][aria-checked="true"]').count()) === 1,
      '« Transférer » coche CE message, et lui seul',
    );
    const forwardButton = menuPage
      .getByRole('toolbar', { name: 'Sélection de messages' })
      .getByRole('button', { name: 'Transférer' });
    expect((await forwardButton.count()) === 1, 'la barre de sélection porte « Transférer »');
    await forwardButton.click();
    /* Le FAIT est la feuille de destinataires — pas un état qui se stabilise :
       `useConversations` sert le cache tout de suite quand il en a, et
       n'attend le réseau que sur un cache vide (cache-first, D-113). */
    await awaitFact(menuPage.locator('[data-forward-target]').first());
    expect(
      (await menuPage.locator('[data-forward-target]').count()) > 0,
      'valider ouvre la feuille de destinataires, avec au moins une conversation',
    );
  }

  await menuPage.close();
  await menuContext.close();

  /**
   * 6.12 — LA COPIE NE FAIT PAS SORTIR UN CONTENU PROTÉGÉ (D-23).
   *
   * Le menu retire « Copier » d'un message protégé — mais le mode SÉLECTION
   * n'a qu'UN bouton « Copier » pour toute la sélection. Le texte que le § 5
   * vérifie absent du DOM entier peut donc partir par le PRESSE-PAPIERS, une
   * porte que ce fichier n'interrogeait pas : « que transporte-t-on À CÔTÉ de
   * ce qu'on garde ? » (cycle 123 du CLAUDE.md racine). Vu ROUGIR avant le
   * correctif de revue.
   */
  {
    const leakContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    await leakContext.addInitScript(() => {
      const written = [];
      Object.defineProperty(window, '__copied', { get: () => written });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (text) => { written.push(text); return Promise.resolve(); } },
      });
    });
    const leakPage = await leakContext.newPage();
    await leakPage.goto(`${BASE}/c/c-protection`, { waitUntil: 'load' });
    await leakPage.waitForSelector('[data-message]');

    const rowFor = (id) => leakPage.locator(`[data-row]:has([data-message="${id}"])`);
    const leakMenuList = leakPage.locator('.message-menu-list');

    // L'ancrage d'ouverture peut encore être en vol (§ doc-comment du premier
    // `waitForRowSettled` de ce fichier) — le clic droit qui suit ouvrirait
    // un menu que le premier `scroll` de convergence referme aussitôt.
    await waitForRowSettled(leakPage, BLURRED_WITNESS_ID);

    // (a) le menu d'un message PROTÉGÉ n'offre pas « Copier ».
    await rowFor(BLURRED_WITNESS_ID).click({ button: 'right' });
    await awaitFact(leakMenuList);
    const protectedLabels = await leakPage.locator('.message-menu-list [role="menuitem"]').allInnerTexts();
    expect(!protectedLabels.includes('Copier'), 'un message flouté n’offre pas « Copier »');
    expect(!protectedLabels.includes('Traduire'), 'un message flouté n’offre pas « Traduire »');
    await leakPage.keyboard.press('Escape');
    await awaitFact(leakPage.locator('[role="menu"]'), { state: 'detached' });

    // (b) le SÉLECTIONNER + « Copier » de la barre ne fait pas sortir le secret.
    await rowFor(TRANSLATED_UNVEILED_WITNESS_ID).click({ button: 'right' });
    await awaitFact(leakMenuList);
    await leakPage.locator('.message-menu-list [role="menuitem"]').filter({ hasText: 'Sélectionner' }).first().click();
    await awaitFact(leakPage.getByRole('toolbar', { name: 'Sélection de messages' }));
    const blurredCheckbox = rowFor(BLURRED_WITNESS_ID).getByRole('checkbox');
    if ((await blurredCheckbox.count()) === 0) {
      expect(false, 'la rangée floutée porte une coche de sélection');
    } else {
      await blurredCheckbox.first().click();
      await awaitFact(rowFor(BLURRED_WITNESS_ID).locator('[role="checkbox"][aria-checked="true"]'));
      await leakPage.getByRole('button', { name: 'Copier' }).click();
      await awaitCondition(leakPage, () => window.__copied.length > 0);
      const leaked = await leakPage.evaluate(() => window.__copied.join('\n'));
      expect(!leaked.includes(BLURRED_CONTENT), 'le contenu flouté ne part JAMAIS dans le presse-papiers');
      expect(leaked.length > 0, 'la copie d’une sélection mixte rend quand même le message non protégé');
    }
    await leakPage.close();
    await leakContext.close();
  }

  /**
   * 6.11 — LA GARDE TACTILE, MESURÉE SUR UN APPAREIL SANS SURVOL.
   *
   * `user-select: none` sur `[data-row]` vit sous `@media (any-hover: none)` :
   * sur le Chrome de bureau qui joue les témoins ci-dessus, cette requête ne
   * matche PAS — leur « l'appui long ne sélectionne pas le texte » ne prouve
   * donc RIEN de la coque, où le doigt sélectionnerait le texte AU LIEU
   * d'ouvrir le menu. On rejoue la mesure dans un contexte TACTILE, et on lit
   * le style RÉSOLU plutôt que la feuille : c'est le navigateur qui tranche
   * si la requête matche.
   */
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'fr-FR',
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await touchPage.waitForSelector('[data-row]');
  const touchGuard = await touchPage.evaluate(() => {
    const row = document.querySelector('[data-row]');
    if (row === null) return null;
    const style = getComputedStyle(row);
    return {
      coarse: window.matchMedia('(any-hover: none)').matches,
      userSelect: style.userSelect || style.webkitUserSelect,
    };
  });
  expect(touchGuard !== null && touchGuard.coarse, 'le contexte tactile fait matcher (any-hover: none)');
  expect(
    touchGuard !== null && touchGuard.userSelect === 'none',
    `au doigt, la rangée n'est pas sélectionnable (user-select: ${touchGuard?.userSelect})`,
  );
  /**
   * `-webkit-touch-callout` NE SE MESURE PAS DANS CHROMIUM : la propriété est
   * propre à WebKit, donc son moteur la JETTE à l'analyse — ni
   * `getComputedStyle` ni `cssRules[].cssText` ne la rendent, et l'y chercher
   * fait rougir un témoin pour la mauvaise raison. Ce qui SE mesure, et qui
   * est le vrai risque, c'est qu'elle ARRIVE dans la feuille construite : le
   * même lot a perdu `backdrop-filter` exactement ainsi (fusionné par la
   * minification en sa seule forme préfixée). On lit donc le DIST.
   */
  const distCss = await readdir(join(DIST, 'assets'));
  const calloutServed = (
    await Promise.all(
      distCss
        .filter((f) => f.endsWith('.css'))
        .map(async (f) => /\[data-row\][^}]*-webkit-touch-callout\s*:\s*none/.test(await readFile(join(DIST, 'assets', f), 'utf8'))),
    )
  ).some(Boolean);
  expect(calloutServed, 'la feuille construite porte `-webkit-touch-callout: none` sur [data-row] (garde de coque WebKit)');

  /**
   * 6.12 — LA MÊME GARDE COUVRE LE CLUSTER DU MENU (revue #5814, défaut
   * majeur 7, mesuré sur l'AVD `Meeshy_Poc_Web-v31`, `AND-2-menu.png`) —
   * `[data-row]` seul ne suffit pas : le cluster (`.message-menu-*`) vit
   * dans un PORTAIL sur `document.body`, hors de cette portée. Au
   * relâchement d'un appui long dont le doigt se trouve à l'endroit où la
   * liste d'actions vient d'apparaître, la WebView Android démarrait une
   * sélection de texte SUR un libellé du menu au lieu de le laisser ouvert.
   * Même méthode que ci-dessus : `user-select` RÉSOLU sur `.message-menu-
   * list` dans le contexte tactile, `-webkit-touch-callout` lu dans le DIST
   * construit (WebKit-only, jeté par Chromium à l'analyse).
   */
  // L'ancrage d'ouverture peut encore être en vol (§ doc-comment du premier
  // `waitForRowSettled` de ce fichier).
  await waitForRowSettled(touchPage, await touchPage.locator('[data-row] [data-message]').first().getAttribute('data-message'));
  await touchPage.dispatchEvent('[data-row]', 'contextmenu');
  await touchPage.waitForSelector('.message-menu-list');
  const clusterTouchGuard = await touchPage.evaluate(() => {
    const list = document.querySelector('.message-menu-list');
    if (list === null) return null;
    const style = getComputedStyle(list);
    return { userSelect: style.userSelect || style.webkitUserSelect };
  });
  expect(
    clusterTouchGuard !== null && clusterTouchGuard.userSelect === 'none',
    `au doigt, la liste d'actions du menu n'est pas sélectionnable (user-select: ${clusterTouchGuard?.userSelect})`,
  );
  const clusterCalloutServed = (
    await Promise.all(
      distCss
        .filter((f) => f.endsWith('.css'))
        .map(async (f) =>
          /\.message-menu-cluster[^}]*-webkit-touch-callout\s*:\s*none/.test(await readFile(join(DIST, 'assets', f), 'utf8')),
        ),
    )
  ).some(Boolean);
  expect(
    clusterCalloutServed,
    'la feuille construite porte `-webkit-touch-callout: none` sur `.message-menu-cluster` (garde de coque WebKit, menu compris)',
  );
  await touchPage.close();
  await touchContext.close();
}

/**
 * 7 — LE COMPOSEUR TIENT CE QU'IL PROMET (#5668, critère (1)).
 *
 * Le § 6.2 ci-dessus applique « 0 contrôle sans gestionnaire » au MENU du
 * message ; le composeur en avait besoin autant, et pour la même raison : ce
 * sont les deux surfaces du fil dont chaque élément est une PORTE. La mesure
 * est la même — un contrôle atteignable qui n'est ni un `<button
 * type="button">` actif, ni un `<label>` portant un `<input type="file">`,
 * ni le champ de saisie, est un contrôle qui ment — plus l'EFFET du seul
 * geste qui ouvre le tiroir : le « + » doit CHANGER quelque chose.
 *
 * Le micro N'EST PAS exigé ici : Chromium sans permission média peut ne pas
 * exposer `navigator.mediaDevices` sur un contexte http, et la loi 4 dit
 * alors de NE PAS le rendre (`use-recorder.ts § recordingSupported`). Ce qui
 * est exigé, c'est que TOUT CE QUI EST RENDU ait un gestionnaire.
 */
{
  const composerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const composerPage = await composerContext.newPage();
  await composerPage.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await composerPage.waitForSelector('[data-message]');

  const inertInComposer = () =>
    composerPage.evaluate(() => {
      const composer = document.querySelector('[data-composer]');
      if (composer === null) return ['aucun composeur'];
      const controls = Array.from(composer.querySelectorAll('button, a, [role="button"], input, textarea, label'));
      return controls
        .filter((el) => {
          if (el.tagName === 'TEXTAREA') return false;
          if (el.tagName === 'LABEL') return el.querySelector('input[type="file"]') === null;
          if (el.tagName === 'INPUT') return el.getAttribute('type') !== 'file' || el.getAttribute('aria-label') === null;
          return (
            el.tagName !== 'BUTTON' ||
            el.hasAttribute('disabled') ||
            el.getAttribute('type') !== 'button' ||
            (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() === ''
          );
        })
        .map((el) => `${el.tagName}/${el.getAttribute('aria-label') ?? el.textContent}`);
    });

  const inertClosed = await inertInComposer();
  expect(inertClosed.length === 0, `0 contrôle du composeur sans gestionnaire, tiroir fermé (${inertClosed.join(', ')})`);

  const plus = composerPage.getByRole('button', { name: 'Ouvrir le menu des pièces jointes' });
  expect((await plus.count()) === 1, 'le composeur offre la porte des pièces jointes');
  /* L'ANCRE, PAS LE LIBELLÉ (#7280) — ce gate désignait le panneau par son
     `aria-label` français en dur. Depuis que les sept sources viennent du
     catalogue (#6310), ce libellé vaut « Attachment types » sur un Chromium
     en anglais, qui est celui de la CI : la garde reconnaissait par un NOM
     qu'un lot venait de rendre traduisible. `data-composer-panel` ne se
     traduit pas. */
  const panel = '[data-composer-panel]';
  const tilesBefore = await composerPage.locator(panel).count();
  await plus.click();
  // C'EST L'`import()` DIFFÉRÉ DE LA LEÇON 590 (#7054) : le tiroir est chargé
  // en chunk `lazy(…)` (`ComposerTray`), donc son montage n'est pas une
  // micro-tâche — on attend le FAIT (le panneau attaché), jamais un délai.
  await awaitFact(composerPage.locator(panel));
  const tilesAfter = await composerPage.locator(panel).count();
  expect(tilesBefore === 0 && tilesAfter === 1, 'le « + » OUVRE le tiroir (le geste a un effet, loi 4)');

  const inertOpen = await inertInComposer();
  expect(inertOpen.length === 0, `0 contrôle du composeur sans gestionnaire, tiroir OUVERT (${inertOpen.join(', ')})`);

  // Les tuiles portent une cible d'au moins 44 px (dimension 5).
  const smallTargets = await composerPage.evaluate(() => {
    const panel = document.querySelector('[data-composer-panel]');
    if (panel === null) return ['aucun panneau'];
    return Array.from(panel.querySelectorAll('label, button'))
      .map((el) => ({ name: el.getAttribute('aria-label') ?? el.textContent, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44 || box.width < 44)
      .map(({ name, box }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`);
  });
  expect(smallTargets.length === 0, `chaque tuile du tiroir mesure au moins 44 px (${smallTargets.join(', ')})`);

  await composerPage.close();
  await composerContext.close();
}

/**
 * 8 — LES MÉDIAS (#5805) — `lib/check-media.mjs` (l'hôte est à 51 lignes du
 * plafond dur de 1 200 et chaque écran ajoute sa suite : on extrait AVANT
 * d'ajouter, § Code Style du `CLAUDE.md`).
 *
 * DEUX PEAUX × DEUX SCHÉMAS : Focal en clair, Bulles en sombre — le défaut de
 * contraste trouvé en revue (transcription à 3,74:1) ne se voyait qu'en
 * clair, et une suite jouée dans un seul schéma ne pouvait pas le rougir.
 */
await checkThreadMedia({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'focal', scheme: 'light' });
await checkThreadMedia({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'bulles', scheme: 'dark' });

/**
 * 8bis — LA GRILLE DE MÉDIAS ET SA VISIONNEUSE (#6169) — `lib/check-media-
 * grid.mjs` : tuiles comptées, badge `+N`, décodage sans saut de mise en
 * page, tap ⇒ visionneuse au bon index avec focus piégé et retour matériel
 * qui ferme la couche sans quitter le fil.
 */
await checkThreadMediaGrid({ browser, BASE, expect, setScheme, skin: 'focal', scheme: 'light' });
await checkThreadMediaGrid({ browser, BASE, expect, setScheme, skin: 'bulles', scheme: 'dark' });

/**
 * 8ter — LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359) — `lib/check-media-
 * transport.mjs` : la vraie vidéo de media-12 décodée par Chromium, la piste
 * au couloir bas, la lecture qui suit la souris PENDANT le glissement, le muet
 * et la vitesse qui agissent sans cacher le chrome, Échap qui ferme le menu et
 * jamais la visionneuse. Un seul schéma : la barre n'a pas de variante claire.
 */
await checkViewerVideoTransport({ browser, BASE, expect, setScheme, scheme: 'dark' });

/**
 * 9 — LES ÉTATS DU MESSAGE (#5936) — `lib/check-message-states.mjs`, QUATRE
 * runs : un badge se juge sur son propre fond, qui change avec la peau ET
 * le schéma (contraste AA mesuré dans chacun des quatre).
 */
await checkMessageStates({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'focal', scheme: 'light' });
await checkMessageStates({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'focal', scheme: 'dark' });
await checkMessageStates({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'bulles', scheme: 'light' });
await checkMessageStates({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin: 'bulles', scheme: 'dark' });

await checkTypingVisibility({ browser, BASE, expect });

/**
 * 11 — LE FIL TEMPS RÉEL (#6171) — `conversation:updated`, `message:translation`
 * et le roster multi-frappeurs, DEUX runs (clair/sombre), `lib/check-
 * realtime-events.mjs`.
 */
await checkRealtimeEvents({ browser, BASE, expect, setScheme, AA_THRESHOLD, scheme: 'light' });
await checkRealtimeEvents({ browser, BASE, expect, setScheme, AA_THRESHOLD, scheme: 'dark' });

await browser.close();
served.close();

if (failures.length > 0) {
  // Le bilan existe déjà en mémoire — le sortir muet force à rejouer la
  // suite en aveugle. Un `console.log` d'exécution long fait perdre la ligne
  // ECHEC dans le tail : la réimprimer ICI, juste avant la sortie, est la
  // SEULE ligne qui reste visible quel que soit le bruit qui précède
  // (défaut #5676 revue 3, flake non identifiable dans check-thread-states.mjs).
  console.error(`\n  ${failures.length} état(s) du fil non tenus :\n`);
  for (const what of failures) console.error(`    - ${what}`);
  console.error('');
  process.exit(1);
}
console.log('\n  Les états du fil tiennent : vide dessiné, coupure annoncée sans bloquer, échec attaché à sa bulle et reprise honnête,\n  et la protection (flou, vue unique, éphémère, supprimé) ne fuit jamais sur les deux peaux —\n  et une image s’affiche, un vocal se joue dans la langue du lecteur, un seul à la fois.\n');
