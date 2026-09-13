#!/usr/bin/env node
/**
 * VÉRIFIE QUE LES ACTIONS DE RANGÉE ONT UN EFFET — et qu'on peut les
 * atteindre.
 *
 * POURQUOI CE TÉMOIN EXISTE. Le critère de fin de #5559 est écrit en toutes
 * lettres : « actions rapides de ligne présentes et à EFFET — un contrôle
 * inerte est un échec ». Or les témoins `bun test` du lot ne mesurent que des
 * LOIS PURES : `rowMenuItems` compose les bons libellés, le store fusionne les
 * bons drapeaux, `applyFilter` filtre. Aucun ne traverse le CÂBLAGE. Débrancher
 * `onRowAction` dans `routes/conversations.tsx`, ou rendre le bouton
 * inatteignable, les laisse tous les quatorze verts — le défaut le plus
 * fréquent du dépôt survivrait donc à sa propre suite de tests.
 *
 * CE QU'IL MESURE, dans un navigateur réel, sur le `dist` construit :
 *
 *  1. CHAQUE rangée expose son bouton d'actions, et aucun n'est retiré à
 *     l'arbre d'accessibilité ni à la tabulation. La magnification est élue par
 *     la POSITION DE DÉFILEMENT : la réserver au rang magnifié rendait les
 *     actions des autres rangées inexistantes pour qui n'a pas de souris.
 *  2. La cible TACTILE RÉELLE de ce bouton — débord `::after` compris — fait au
 *     moins 44×44, mesurée par `elementFromPoint`, jamais par sa boîte visuelle.
 *  3. Il s'atteint AU CLAVIER : `Tab` depuis le lien d'une rangée quelconque
 *     s'y pose, `Entrée` ouvre le menu, le focus entre dedans, les flèches y
 *     naviguent, `Échap` referme et rend le focus au bouton.
 *  4. CHAQUE action change QUELQUE CHOSE À L'ÉCRAN — c'est le cœur :
 *     épingler pose l'épingle ET remonte la rangée, mettre en sourdine fond
 *     le CHROME à 0.55 en gardant le TITRE et l'APERÇU pleinement lisibles
 *     — LISIBLES au sens du CONTRASTE WCAG (≥ 4,5:1), pas seulement d'une
 *     opacité CSS de 1 (#5559 revue-correction, défauts 1/8 puis 1 bis :
 *     `opacity === 1` ne dit rien de l'encre elle-même — `--color-ios-ink-2`
 *     valait 2,70:1 sur une rangée en sourdine tout en rapportant une
 *     opacité de 1, corrigé à la racine par #5625 sur `MeeshyColors
 *     .textSecondary`, jamais ici : D-4 interdit une couleur écrite à la
 *     main côté web) — une conversation en sourdine reste une conversation
 *     qu'on LIT. Marquer lu/non lu fait disparaître/apparaître le badge,
 *     archiver sort la rangée du corpus « Tous » et la fait entrer sous
 *     « Archivées ».
 *  5. Les chips filtrent RÉELLEMENT — « Épinglés » ne rend que des épinglées,
 *     « Archivées » que des archivées.
 *  6. L'état vide tient ENTIÈREMENT dans l'écran, sa sortie comprise.
 *  7. Le fondu de sourdine (du CHROME) vaut dans les DEUX schémas, et le
 *     texte servi n'y perd JAMAIS son contraste.
 *  8. SUR UN CONTEXTE TACTILE (`any-hover: none`) — #5559 revue-correction,
 *     défaut 6 (bloquant) — le bouton d'actions d'une rangée NON magnifiée
 *     reste visible et ATTEIGNABLE, et un tap dans sa zone ouvre RÉELLEMENT
 *     son menu plutôt que de tomber sur le conteneur muet qui l'enveloppe.
 *  9. LE MENU NE DÉBORDE JAMAIS DU BAS DE L'ÉCRAN — #5559 revue-correction,
 *     défaut 7 : sur un viewport de 390×640, le menu de la DERNIÈRE rangée
 *     se RETOURNE au-dessus de son ancre et ses QUATRE lignes restent
 *     atteignables.
 * 10. « 0 CONTRÔLE SANS GESTIONNAIRE » (#5652) — les trois boutons ronds de
 *     l'en-tête ont chacun leur effet MESURÉ (feuille ouverte + retour
 *     annoncé, route montée, route quittée), la recherche de contacts rend
 *     des résultats cliquables, et CHAQUE pastille du rail de stories mène
 *     RÉELLEMENT à la story de SON auteur (`/stories?author=…`, #6080) — la
 *     règle #5765 (« un bouton sans porte est un bouton mort ») est un
 *     CLIQUET : la porte est arrivée, ce témoin mesure désormais l'effet du
 *     tap plutôt que l'absence de contrôle — tout en SERVANT ce que ses ports
 *     résolvent (anneau, couverture, humeur).
 * 11. LA BARRE DE RECHERCHE NE VOLE JAMAIS LE CENTRE D'UN CONTRÔLE AU BAS DE
 *     LA LISTE (#6220) — posée EN FLUX, elle réduisait la boîte de
 *     `#contenu` d'autant, et la rangée qui tombait pile sur cette frontière
 *     avait son centre — et celui de son bouton « Actions de conversation »
 *     — VOLÉ par la barre elle-même (`elementFromPoint`), une frontière
 *     qu'AUCUN défilement supplémentaire ne pouvait plus jamais franchir
 *     puisqu'elle EST le bas de la boîte défilante. La liste défilée
 *     jusqu'à son maximum RÉEL (gestes `wheel`, jamais un `scrollTop`
 *     programmé — seul un geste réel arme le même défilement qu'un doigt),
 *     la dernière rangée et son bouton doivent retomber sur EUX-MÊMES.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

const failures = [];
/** D-13 : le nom est ANGLAIS, à la différence du « constate » que portent ses
 *  cinq aînés — dette antérieure à la directive, qu'on ne propage pas. */
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

/** La cible tactile MINIMALE du dépôt — le plancher de la charte. */
const TAP_FLOOR = 44;
/** Le seuil WCAG AA texte normal — #5559 revue-correction, défaut 1 bis :
 *  une opacité de 1 ne prouve rien de l'encre, seul le contraste RENDU le
 *  fait (`contrastOf`, `./lib/contrast.mjs`, partagée avec
 *  `check-reading-mode.mjs`). */
const WCAG_AA = 4.5;
/** LE TITRE et L'APERÇU d'une rangée, dans les DEUX états qui comptent pour
 *  #5559 : muette (`c-annonces`, préfixture) et ORDINAIRE (`c-deploiement`,
 *  le SUJET). Une conversation en sourdine fond son CHROME (0.55) mais son
 *  ENCRE doit rester lisible — c'est exactement l'assertion qu'un simple
 *  `opacity === 1` sur le texte ne peut pas rendre : `contrastOf` compose
 *  l'alpha propre du token (`--color-ios-ink-2` est translucide) PUIS
 *  l'opacité CSS de l'élément, avant de mesurer la luminance WCAG. */
const rowInkContrast = async (page, row) => ({
  title: await contrastOf(page, `[data-row="${row}"] [data-name]`),
  preview: await contrastOf(page, `[data-row="${row}"] [data-line2]`),
});
const checkRowInkMeetsAA = async (page, row, schemeLabel) => {
  const { title, preview } = await rowInkContrast(page, row);
  check(
    title !== null && title >= WCAG_AA,
    `${schemeLabel} : le titre de « ${row} » tient AA (${title}:1, ≥ ${WCAG_AA}:1 attendu)`,
  );
  check(
    preview !== null && preview >= WCAG_AA,
    `${schemeLabel} : l'aperçu de « ${row} » tient AA (${preview}:1, ≥ ${WCAG_AA}:1 attendu) — ` +
      "c'est le dernier message, la ligne la plus lue de l'écran phare",
  );
};
/**
 * L'EN-TÊTE DE SECTION EST LE PLUS PETIT TEXTE DE L'ÉCRAN (#5694 revue) —
 * 10,5 px, `list.sticker.size`. C'est celui dont le contraste peut le moins
 * se permettre d'être approximatif, et le seul que ce lot ajoute : il entre
 * donc dans le balayage AA, dans les DEUX schémas, comme le titre et
 * l'aperçu. L'heure passe par le même token que l'aperçu (`--color-ios-ink-3`
 * contre `-ink-2`) et se mesure aussi : c'est le troisième texte de la
 * rangée, et le seul dont la couleur est INCONDITIONNELLE.
 */
const checkLensInkMeetsAA = async (page, schemeLabel) => {
  const sticker = await contrastOf(page, '[data-sticker]');
  check(
    sticker !== null && sticker >= WCAG_AA,
    `${schemeLabel} : l'en-tête de section (10,5 px) tient AA (${sticker}:1, ≥ ${WCAG_AA}:1 attendu)`,
  );
  const time = await contrastOf(page, '[data-row="c-deploiement"] [data-time]');
  check(
    time !== null && time >= WCAG_AA,
    `${schemeLabel} : l'heure de la rangée tient AA (${time}:1, ≥ ${WCAG_AA}:1 attendu)`,
  );
};

const BUTTON = 'button[aria-label="Actions de conversation"]';
const rowIds = (page) => page.$$eval('[data-row]', (els) => els.map((el) => el.dataset.row));
const menuItem = (label) => `[role="menu"] [role="menuitem"]:text-is("${label}")`;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const page = await context.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-row]');
await page.waitForTimeout(300);

// ---------------------------------------- 0. l'encre tient AA, schéma SOMBRE
// (#5559 revue-correction, défaut 1 bis) — AVANT toute mutation : `c-annonces`
// est muette dans les fixtures, `c-deploiement` (le SUJET du § 4) est ordinaire.
await checkRowInkMeetsAA(page, 'c-annonces', 'schéma sombre, rangée MUETTE');
await checkRowInkMeetsAA(page, 'c-deploiement', 'schéma sombre, rangée ordinaire');
await checkLensInkMeetsAA(page, 'schéma sombre');

// ------------------------------------------------------- 1. présence et exposition
const buttons = await page.$$eval(BUTTON, (els) =>
  els.map((el) => ({
    row: el.closest('[data-row]')?.dataset.row,
    ariaHidden: el.getAttribute('aria-hidden'),
    tabIndex: el.tabIndex,
  })),
);
const rows = await rowIds(page);
check(buttons.length === rows.length, `chaque rangée porte son bouton d'actions (${buttons.length}/${rows.length})`);
check(
  buttons.every((b) => b.ariaHidden === null),
  `aucun bouton d'actions n'est retiré au lecteur d'écran : ${JSON.stringify(buttons.filter((b) => b.ariaHidden !== null))}`,
);
check(
  buttons.every((b) => b.tabIndex >= 0),
  `aucun bouton d'actions n'est retiré de la tabulation : ${JSON.stringify(buttons.filter((b) => b.tabIndex < 0))}`,
);

// ------------------------------------------------------- 2. cible tactile réelle
//
// LA RANGÉE EST D'ABORD AMENÉE AU CENTRE DU SCROLLPORT, ET C'EST UNE CONDITION
// DE LA MESURE, PAS UNE COMMODITÉ (#6229 → #6237).
//
// Depuis que la barre de recherche FLOTTE (`absolute inset-x-0 bottom-0 z-10`,
// #6220), les rangées passent SOUS elle pendant le défilement — c'est le
// comportement voulu, celui d'iOS, et `#contenu` réserve sa hauteur pour que la
// DERNIÈRE rangée reste atteignable dégagée. Mais le débord `::after` de la
// cible tactile (34 + 2×5 = 44) dépasse la boîte du bouton de 5 px : pour toute
// rangée qui se trouve à cet instant sous la barre, `elementFromPoint` rend la
// barre sur les deux coins BAS. Mesuré : `bas-gauche → DIV…backdrop-blur-xl`,
// `bas-droit → DIV.absolute inset-x-0 bottom-0 z-10`, bouton 753→787 dans une
// fenêtre de 844 dont la barre occupe 779→844.
//
// Ce que ce constat mesurait alors était l'OCCLUSION par un flotteur assumé, pas
// la géométrie du bouton — le seul sujet de cette section. Et il tombait sur une
// rangée DIFFÉRENTE selon la machine (`c-nouvelle` en local, `c-salon-riviere`
// en CI), signature d'un artefact de position. Centrer la rangée reproduit ce
// que fait un doigt — on amène à soi ce qu'on veut toucher — et la garde
// conserve ses dents : un bouton réellement trop petit rougit toujours, partout.
//
// La contre-garde est juste en dessous : on VÉRIFIE que la rangée mesurée est
// bien dégagée de la barre, sinon un futur changement de disposition pourrait
// remettre la mesure sous le flotteur sans que rien ne le dise.
for (const row of rows) {
  await page.evaluate((r) => {
    document.querySelector(`[data-row="${r}"]`)?.scrollIntoView({ block: 'center' });
  }, row);
  await page.waitForTimeout(80);
  await page.hover(`[data-row="${row}"]`);
  await page.waitForTimeout(60);
  const hit = await page.evaluate(
    ({ row, floor }) => {
      const btn = document.querySelector(`[data-row="${row}"] button[aria-label="Actions de conversation"]`);
      if (btn === null) return { ok: false, why: 'bouton absent', degage: false };
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const half = floor / 2 - 0.5;
      const corners = [
        [cx - half, cy - half],
        [cx + half, cy - half],
        [cx - half, cy + half],
        [cx + half, cy + half],
      ];
      const misses = corners.filter(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el !== btn && !btn.contains(el);
      });
      const bar = document.querySelector('[data-search-bar]')?.getBoundingClientRect();
      const degage = bar === undefined || cy + half < bar.top;
      return {
        ok: misses.length === 0,
        why: `${misses.length} coin(s) hors cible, boîte ${Math.round(r.width)}×${Math.round(r.height)}`,
        degage,
      };
    },
    { row, floor: TAP_FLOOR },
  );
  check(
    hit.degage,
    `la rangée « ${row} » est mesurée DÉGAGÉE de la barre flottante — sinon on mesure le flotteur, pas le bouton`,
  );
  check(hit.ok, `la cible tactile du bouton d'actions de « ${row} » couvre ${TAP_FLOOR}×${TAP_FLOOR} (${hit.why})`);
}

// ------------------------------------------------------- 3. clavier
/** La DERNIÈRE rangée — jamais la première : au chargement c'est la première
 *  qui est magnifiée, et un témoin écrit sur elle serait vert même si les
 *  autres rangées restaient inatteignables (le défaut exact qu'on mesure). */
const lastRow = rows[rows.length - 1];
await page.evaluate((row) => document.querySelector(`[data-row="${row}"] a`)?.focus(), lastRow);
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => ({
  label: document.activeElement?.getAttribute('aria-label'),
  row: document.activeElement?.closest('[data-row]')?.dataset.row,
}));
check(
  focused.label === 'Actions de conversation' && focused.row === lastRow,
  `au clavier, Tab depuis la DERNIÈRE rangée atteint SON bouton d'actions (${JSON.stringify(focused)})`,
);

await page.keyboard.press('Enter');
await page.waitForSelector('[role="menu"]');
await page.waitForTimeout(120);
const firstItem = await page.evaluate(() => document.activeElement?.textContent?.trim());
check(firstItem === 'Épingler' || firstItem === 'Désépingler', `à l'ouverture, le focus entre DANS le menu (« ${firstItem} »)`);
await page.keyboard.press('ArrowDown');
const secondItem = await page.evaluate(() => document.activeElement?.textContent?.trim());
check(
  secondItem !== firstItem && (secondItem === 'Silence' || secondItem === 'Son'),
  `ArrowDown déplace RÉELLEMENT le focus vers la ligne suivante (« ${secondItem} »)`,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(120);
const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
check(back === 'Actions de conversation', `Échap referme et rend le focus au bouton (« ${back} »)`);
check((await page.$('[role="menu"]')) === null, 'Échap referme réellement le menu');

// ------------------------------------------------------- 4. chaque action a un effet
/** Ouvre le menu de `row` au CLAVIER — le pointeur ne peut pas atteindre un
 *  bouton au repos (`pointer-events: none` tant qu'il est invisible), et c'est
 *  voulu : un bouton transparent ne doit pas voler le clic de sa rangée. */
const openMenu = async (row) => {
  await page.evaluate((r) => document.querySelector(`[data-row="${r}"] button[aria-label="Actions de conversation"]`)?.focus(), row);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="menu"]');
  await page.waitForTimeout(80);
};
/**
 * Une ligne ABSENTE du menu est un CONSTAT, pas un plantage : quand une action
 * n'a pas eu d'effet, son libellé ne bascule pas (« Épingler » reste
 * « Épingler ») et l'appel suivant cherche une ligne qui n'existe plus. Sans
 * cette borne, le témoin mourait sur une exception de Playwright au lieu de
 * dire ce qui manque — vérifié en débranchant `handleRowAction`.
 */
const act = async (row, label) => {
  await openMenu(row);
  try {
    await page.click(menuItem(label), { timeout: 2000 });
  } catch {
    failures.push(`le menu de « ${row} » n'offre pas la ligne « ${label} » — l'action précédente n'a rien changé`);
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(150);
};

/** « Équipe déploiement » — ni épinglée, ni en sourdine, ni archivée dans les
 *  fixtures, et porteuse de deux non-lus : la seule sur laquelle les QUATRE
 *  actions sont observables dans les deux sens. */
const SUBJECT = 'c-deploiement';
check(rows.includes(SUBJECT), `la rangée sujet « ${SUBJECT} » est bien dans le corpus`);

const pinnedMark = (row) => page.$(`[data-row="${row}"] [aria-label="Épinglée"]`);
/**
 * LE FONDU DE SOURDINE NE PORTE PLUS SUR LE `<li>` ENTIER (#5559 revue-
 * correction, défauts 1/8) — il composait `MUTED_OPACITY` (0.55) avec
 * l'encre du TITRE et de l'APERÇU, faisant tomber leur contraste sous le
 * plancher AA dans les deux schémas. Il ne porte plus que sur le CHROME de
 * la rangée : `.avatar-root` (`Avatar`, `components/avatar.tsx`) en est le
 * témoin STABLE — un petit-enfant du `<li>`, jamais son `firstElementChild`
 * que `useScene` réécrit à chaque image (`scene.ts:104-108`).
 */
const avatarOpacity = (row) => page.$eval(`[data-row="${row}"] .avatar-root`, (el) => Number(getComputedStyle(el).opacity));
/**
 * Le TITRE et l'APERÇU, eux, gardent leur encre PLEINE sous sourdine — la
 * preuve DIRECTE que le lot ne compose plus le fondu avec le texte servi.
 * `[data-name]`/`[data-line2]` — pas `.text-title`/`.text-body` (leçon 548) :
 * #5694 a changé la classe de TAILLE du nom (`text-title` → `text-bubble`) et
 * de l'aperçu (`text-body` → `text-title`) — un sélecteur ancré sur une
 * classe de taille se serait mis à interroger le MAUVAIS nœud, en silence.
 */
const rowTitleOpacity = (row) =>
  page.$eval(`[data-row="${row}"] [data-name]`, (el) => Number(getComputedStyle(el).opacity));
const rowPreviewOpacity = (row) =>
  page.$eval(`[data-row="${row}"] [data-line2]`, (el) => Number(getComputedStyle(el).opacity));
/**
 * L'HEURE (#5694, écart 8) — `[data-time]` est le crochet STABLE posé par
 * `LensTime`. Sa COULEUR ne doit JAMAIS dépendre du non-lu — c'est la preuve
 * directe que `LentilleConversationRow.timestampColor` (toujours tertiaire)
 * est bien respectée côté web.
 */
const rowTimeColor = (row) =>
  page.$eval(`[data-row="${row}"] [data-time]`, (el) => getComputedStyle(el).color);
/** `data-unread` est le crochet STABLE du badge — même parti que `data-row`,
 *  qui sert déjà `check-lens.mjs` : compter sur la position d'un `<span>` dans
 *  le lien rendrait ce témoin faux au premier remaniement de la rangée. */
const unreadBadge = (row) =>
  page.$eval(`[data-row="${row}"]`, (el) => el.querySelector('[data-unread]')?.getAttribute('data-unread') ?? null);

check((await pinnedMark(SUBJECT)) === null, 'avant action, la rangée sujet ne porte AUCUNE épingle');
await act(SUBJECT, 'Épingler');
check((await pinnedMark(SUBJECT)) !== null, 'après « Épingler », la rangée porte une épingle VISIBLE et NOMMÉE');
check((await rowIds(page))[0] === SUBJECT, `après « Épingler », la rangée passe en tête (${JSON.stringify(await rowIds(page))})`);
await act(SUBJECT, 'Désépingler');
check((await pinnedMark(SUBJECT)) === null, 'après « Désépingler », l’épingle disparaît');

check((await avatarOpacity(SUBJECT)) === 1, 'avant action, le CHROME de la rangée sujet est à pleine opacité');
check((await rowTitleOpacity(SUBJECT)) === 1, 'avant action, le titre est à pleine opacité');
check((await rowPreviewOpacity(SUBJECT)) === 1, "avant action, l'aperçu est à pleine opacité");
await act(SUBJECT, 'Silence');
check((await avatarOpacity(SUBJECT)) === 0.55, `après « Silence », le CHROME se fond à 0.55 (${await avatarOpacity(SUBJECT)})`);
/**
 * LE TITRE ET L'APERÇU NE SE FONDENT PAS (#5559 revue-correction, défauts
 * 1/8) : composer `MUTED_OPACITY` avec leur encre faisait tomber leur
 * contraste sous le plancher AA dans les deux schémas (mesuré 3,74:1 /
 * 2,80:1 en clair, 5,71:1 / 3,63:1 en sombre) — une conversation en sourdine
 * reste une conversation qu'on LIT. Seul le CHROME (avatar, heure, puces,
 * supplément) porte le fondu ; ces deux assertions sont la preuve DIRECTE
 * que le texte servi n'est plus dans la boucle.
 */
check((await rowTitleOpacity(SUBJECT)) === 1, "après « Silence », le titre reste à pleine opacité (lisible)");
check((await rowPreviewOpacity(SUBJECT)) === 1, "après « Silence », l'aperçu reste à pleine opacité (lisible)");
const mutedSpoken = await page.$eval(`[data-row="${SUBJECT}"]`, (el) => el.textContent?.includes('En sourdine') ?? false);
check(mutedSpoken, 'la sourdine est aussi DITE — le fondu ne se lit qu’à l’œil');
await act(SUBJECT, 'Son');
check((await avatarOpacity(SUBJECT)) === 1, 'après « Son », le CHROME revient à pleine opacité');

check((await unreadBadge(SUBJECT)) === '2', `avant action, le badge de non-lus affiche 2 (${await unreadBadge(SUBJECT)})`);
/**
 * L'HEURE NE CHANGE PAS DE COULEUR AVEC LE NON-LU (#5694, écart 8) —
 * `LentilleConversationRow.timestampColor` rend TOUJOURS l'encre tertiaire,
 * « le timestamp rouge sur non-lu est supprimé ». Mesurée AVANT et APRÈS le
 * même aller-retour « Lu »/« Non lu » que le badge, sur le MÊME sujet.
 */
/**
 * L'HEURE EST RELATIVE, PAS UNE HORLOGE (#5694, écart 8 — critère (d)) —
 * `LentilleRowTimestamp` sert `RelativeTimeFormatter.shortString`
 * (« maintenant » / « 45s » / « 5 min » / « 2h » / « 3j » / « 2sem » /
 * « 2 mois » / date absolue), jamais le `HH:MM` que la Lentille rendait
 * avant ce lot. Le témoin refuse explicitement la forme horaire : c'est
 * elle, et elle seule, que la régression rétablirait.
 */
const timeLabel = await page.$eval(`[data-row="${SUBJECT}"] [data-time]`, (el) => el.textContent ?? '');
check(
  !/^\d{1,2}:\d{2}$/.test(timeLabel.trim()),
  `l'heure de la rangée est RELATIVE, pas une horloge HH:MM (« ${timeLabel} »)`,
);
check(
  /^(maintenant|\d+\s?(s|min|h|j|sem|mois)|\d{1,2} [^ ]+\.?( \d{4})?)$/.test(timeLabel.trim()),
  `l'heure suit l'échelle de RelativeTimeFormatter.shortString (« ${timeLabel} »)`,
);

const timeColorBefore = await rowTimeColor(SUBJECT);
await act(SUBJECT, 'Lu');
check((await unreadBadge(SUBJECT)) === null, 'après « Lu », le badge de non-lus disparaît');
const timeColorAfterRead = await rowTimeColor(SUBJECT);
check(
  timeColorAfterRead === timeColorBefore,
  `l'heure ne change PAS de couleur après « Lu » (${timeColorBefore} → ${timeColorAfterRead})`,
);
await act(SUBJECT, 'Non lu');
check((await unreadBadge(SUBJECT)) === '1', `après « Non lu », le badge revient à 1 (${await unreadBadge(SUBJECT)})`);
const timeColorAfterUnread = await rowTimeColor(SUBJECT);
check(
  timeColorAfterUnread === timeColorBefore,
  `l'heure ne change PAS de couleur après « Non lu » (${timeColorBefore} → ${timeColorAfterUnread})`,
);
await act(SUBJECT, 'Lu');

await act(SUBJECT, 'Archiver');
check(!(await rowIds(page)).includes(SUBJECT), 'après « Archiver », la rangée quitte le corpus « Tous »');

// ------------------------------------------------------- 5. les chips filtrent
await page.click('button:text-is("Archivées")');
await page.waitForTimeout(150);
const archived = await rowIds(page);
check(archived.includes(SUBJECT), `la rangée archivée apparaît sous « Archivées » (${JSON.stringify(archived)})`);
check(archived.length === 2, `« Archivées » ne rend QUE les archivées (${archived.length} attendues : 2)`);

await page.click('button:text-is("Épinglés")');
await page.waitForTimeout(150);
const pinned = await rowIds(page);
check(pinned.length === 1 && pinned[0] === 'c-amina', `« Épinglés » ne rend que l’épinglée du jeu (${JSON.stringify(pinned)})`);

// ------------------------------------------------------- 6. l'état vide tient dans l'écran
await page.fill('input[type="search"]', 'zzzzzz');
await page.waitForTimeout(200);
const empty = await page.evaluate(() => {
  const li = [...document.querySelectorAll('li')].find((x) => x.textContent?.includes('Aucune conversation'));
  if (li === undefined) return { present: false };
  const box = li.getBoundingClientRect();
  const exit = li.querySelector('button');
  const exitBox = exit?.getBoundingClientRect();
  return {
    present: true,
    bottom: Math.round(box.bottom),
    viewport: window.innerHeight,
    exitBottom: exitBox === undefined ? null : Math.round(exitBox.bottom),
  };
});
check(empty.present, "l'état vide est rendu quand rien ne correspond");
check(
  empty.present && empty.exitBottom !== null && empty.exitBottom <= empty.viewport,
  `la SORTIE de l'état vide (« Tout afficher ») tient dans l'écran (${JSON.stringify(empty)})`,
);

// ------------------------------------------------------- 7. le second schéma
await page.close();
await context.close();
const light = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
const pageLight = await light.newPage();
await pageLight.goto(`${BASE}/`, { waitUntil: 'load' });
await pageLight.waitForSelector('[data-row]');
await pageLight.waitForTimeout(200);
const mutedLight = await pageLight.$eval('[data-row="c-annonces"] .avatar-root', (el) => Number(getComputedStyle(el).opacity));
check(mutedLight === 0.55, `schéma clair : le CHROME de la rangée en sourdine se fond aussi à 0.55 (${mutedLight})`);
/**
 * L'opacité CSS de l'élément de texte reste à 1 — c'est ce que prouve cette
 * paire d'assertions, ni plus ni moins : que le fondu de sourdine ne
 * s'applique PAS au nœud `[data-name]`/`[data-line2]`. Ça ne dit RIEN de
 * l'encre elle-même, qui porte SA PROPRE translucidité dans le token
 * (`--color-ios-ink-2` = `color-mix(… 80% …)`) — d'où `checkRowInkMeetsAA`
 * juste après, seule assertion qui mesure ce que l'ŒIL reçoit (#5559
 * revue-correction, défaut 1 bis).
 */
const mutedLightTitle = await pageLight.$eval('[data-row="c-annonces"] [data-name]', (el) => Number(getComputedStyle(el).opacity));
const mutedLightPreview = await pageLight.$eval('[data-row="c-annonces"] [data-line2]', (el) => Number(getComputedStyle(el).opacity));
check(
  mutedLightTitle === 1 && mutedLightPreview === 1,
  `schéma clair : le titre et l'aperçu de la rangée en sourdine ne portent pas le fondu de CHROME au niveau CSS (${mutedLightTitle}, ${mutedLightPreview})`,
);
await checkRowInkMeetsAA(pageLight, 'c-annonces', 'schéma clair, rangée MUETTE');
await checkRowInkMeetsAA(pageLight, 'c-deploiement', 'schéma clair, rangée ordinaire');
await checkLensInkMeetsAA(pageLight, 'schéma clair');

await pageLight.close();
await light.close();

// --------------------------------------------- 8. contexte TACTILE (défaut 6, bloquant)
/**
 * `hasTouch` + `isMobile` — la MÊME combinaison que la revue-correction a
 * mesurée en Chromium mobile (`{anyHover:false, hover:false,
 * pointerCoarse:true}`) : sans elle, ce gate ouvre un contexte de BUREAU
 * (survol + clavier), jamais tactile, et c'est exactement pourquoi il ne
 * voyait pas la régression avant cette section.
 */
const touchContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  colorScheme: 'dark',
});
const touchPage = await touchContext.newPage();
await touchPage.goto(`${BASE}/`, { waitUntil: 'load' });
await touchPage.waitForSelector('[data-row]');
await touchPage.waitForTimeout(300);

const media = await touchPage.evaluate(() => ({
  anyHover: matchMedia('(any-hover: none)').matches,
  pointerCoarse: matchMedia('(pointer: coarse)').matches,
}));
check(media.anyHover && media.pointerCoarse, `le contexte est bien TACTILE (${JSON.stringify(media)})`);

const touchRows = await rowIds(touchPage);
/** N'IMPORTE QUELLE rangée NON magnifiée : au chargement, seule la PREMIÈRE
 *  l'est — toutes les autres sont le cas exact du défaut rapporté. */
const nonMagnified = touchRows[touchRows.length - 1];
const touchButtonState = await touchPage.evaluate((row) => {
  const btn = document.querySelector(`[data-row="${row}"] button[aria-label="Actions de conversation"]`);
  if (btn === null) return null;
  const style = getComputedStyle(btn);
  return { opacity: Number(style.opacity), pointerEvents: style.pointerEvents };
}, nonMagnified);
check(
  touchButtonState !== null && touchButtonState.opacity === 1 && touchButtonState.pointerEvents === 'auto',
  `sur un contexte tactile, le bouton d'actions d'une rangée NON magnifiée (« ${nonMagnified} ») est visible et cliquable (${JSON.stringify(touchButtonState)})`,
);

/** Le TAP réel — pas un focus/clic programmatique — sur le CENTRE de la zone
 *  du bouton, exactement le geste que le doigt fait. */
const tapResult = await touchPage.evaluate(async (row) => {
  const btn = document.querySelector(`[data-row="${row}"] button[aria-label="Actions de conversation"]`);
  if (btn === null) return { ok: false, why: 'bouton absent' };
  /**
   * LA RANGÉE EST D'ABORD AMENÉE SOUS L'ŒIL. `elementFromPoint` interroge le
   * point de l'ÉCRAN : sur une rangée hors du cadre visible, il rend ce qui
   * est peint là (la barre de recherche), et le témoin accuse le bouton d'un
   * défaut qui n'est pas le sien. Ce qu'on mesure ici, c'est que le CENTRE du
   * bouton retombe sur le bouton — jamais sur son conteneur muet —, pas que
   * la dernière rangée du corpus tienne par hasard dans l'écran au repos.
   * (Relevé #5694 : la jonction de 8 px entre sections, ajoutée par la revue,
   * a déplacé cette rangée de 24 px et fait rougir le témoin sans qu'aucun
   * bouton n'ait bougé dans sa rangée.)
   */
  btn.scrollIntoView({ block: 'center' });
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { ok: hit === btn || (btn.contains(hit) ?? false), tag: hit?.tagName ?? null };
}, nonMagnified);
check(
  tapResult.ok,
  `au centre du bouton d'actions (rangée « ${nonMagnified} »), le point retombe sur le BOUTON, jamais sur son conteneur muet (${JSON.stringify(tapResult)})`,
);

await touchPage.tap(`[data-row="${nonMagnified}"] button[aria-label="Actions de conversation"]`);
await touchPage.waitForSelector('[role="menu"]', { timeout: 2000 }).catch(() => null);
const touchMenuOpened = (await touchPage.$('[role="menu"]')) !== null;
check(touchMenuOpened, `un TAP sur le bouton d'actions d'une rangée non magnifiée (« ${nonMagnified} ») ouvre RÉELLEMENT son menu`);

await touchContext.close();

// ---------------------------------------- 9. le menu ne déborde jamais du bas
/**
 * LA GÉOMÉTRIE EXACTE DU DÉFAUT RAPPORTÉ — #5559 revue-correction, défaut 7 :
 * 390×640 (un Android d'entrée de gamme, ou tout téléphone en paysage), menu
 * de la DERNIÈRE rangée. Avant le correctif, « Non lu » et « Archiver »
 * tombaient hors écran et rien — pas même un défilement, qui REFERME le
 * menu — ne les ramenait.
 */
const shortContext = await browser.newContext({ viewport: { width: 390, height: 640 }, colorScheme: 'dark' });
const shortPage = await shortContext.newPage();
await shortPage.goto(`${BASE}/`, { waitUntil: 'load' });
await shortPage.waitForSelector('[data-row]');
await shortPage.waitForTimeout(300);

const shortRows = await rowIds(shortPage);
const lastShortRow = shortRows[shortRows.length - 1];
await shortPage.evaluate(
  (row) => document.querySelector(`[data-row="${row}"] button[aria-label="Actions de conversation"]`)?.focus(),
  lastShortRow,
);
await shortPage.keyboard.press('Enter');
await shortPage.waitForSelector('[role="menu"]');
await shortPage.waitForTimeout(120);

const menuFit = await shortPage.evaluate(() => {
  const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')];
  return {
    viewport: window.innerHeight,
    count: items.length,
    allInView: items.every((el) => {
      const r = el.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      return cy >= 0 && cy <= window.innerHeight;
    }),
  };
});
check(
  menuFit.count === 4 && menuFit.allInView,
  `à 390×640, les QUATRE lignes du menu de la dernière rangée ont leur centre dans l'écran (${JSON.stringify(menuFit)})`,
);

await shortContext.close();

// --------------- 10. les contrôles de l'EN-TÊTE ont un effet, le rail n'en a aucun
/**
 * « 0 CONTRÔLE SANS GESTIONNAIRE » SUR L'ÉCRAN (#5652, critère de fin).
 *
 * L'en-tête de la Lentille porte TROIS boutons ronds (lien de partage,
 * nouvelle conversation, Progression) et le rail de stories porte des
 * pastilles. La question est la même pour les quatre — « cliquer change-t-il
 * quelque chose ? » — et elle ne se répond pas dans le code : un `onClick`
 * déclaré peut ouvrir une feuille qui ne se monte pas, une route peut ne pas
 * être inscrite à la table. D'où la mesure DANS le navigateur.
 *
 * Le rail, lui, est mesuré par l'inverse : ses pastilles ne doivent porter
 * AUCUN contrôle tant que le viewer `/story/:postId` n'existe pas (règle
 * #5765 — un bouton sans porte est un bouton mort). CLIQUET : le jour où la
 * porte arrive, cette assertion rougit et impose de mesurer l'effet du tap,
 * plutôt que de laisser passer une pastille cliquable qui ne mène nulle part.
 */
const enTeteContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const enTetePage = await enTeteContext.newPage();
await enTetePage.goto(`${BASE}/`, { waitUntil: 'load' });
await enTetePage.waitForSelector('[data-row]');
await enTetePage.waitForTimeout(300);

const railControles = await enTetePage.evaluate(() => {
  const rail = document.querySelector('[data-rail="grande"]');
  if (rail === null) return null;
  return {
    pastilles: rail.querySelectorAll('[data-rail-tile]').length,
    focalisables: rail.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"]),[role="button"]').length,
  };
});
check(railControles !== null, 'le rail de stories est PRÉSENT dans la Lentille — ses contrôles sont mesurables');
check(
  railControles !== null && railControles.pastilles > 0,
  `le rail de stories rend ses pastilles (${JSON.stringify(railControles)})`,
);
check(
  railControles !== null && railControles.focalisables === railControles.pastilles,
  `chaque pastille du rail est ATTEIGNABLE — la porte de story existe désormais (\`routes/stories.tsx\`, #6080) ` +
    `(${JSON.stringify(railControles)})`,
);

/** Le rail SERT ce que ses ports résolvent (#5652, revue) : une couverture ou
 *  des initiales dans chaque pastille, et le badge d'humeur du corpus. */
const railVisuel = await enTetePage.evaluate(() => {
  const rail = document.querySelector('[data-rail="grande"]');
  return rail === null
    ? null
    : {
        anneaux: rail.querySelectorAll('[data-anneau]').length,
        accentues: rail.querySelectorAll('[data-anneau][data-accented="true"]').length,
        moods: rail.querySelectorAll('[data-mood]').length,
      };
});
check(
  railVisuel !== null && railVisuel.anneaux === railControles?.pastilles,
  `chaque pastille porte son anneau (${JSON.stringify(railVisuel)})`,
);
check(
  railVisuel !== null && railVisuel.accentues >= 1,
  `au moins un anneau est ACCENTUÉ — une story non vue existe dans le corpus (${JSON.stringify(railVisuel)})`,
);
check(
  railVisuel !== null && railVisuel.moods >= 1,
  "le badge d'humeur du corpus est PEINT — sinon le port ?scope=statuses ne sert aucun pixel " +
    `(${JSON.stringify(railVisuel)})`,
);

/**
 * LE CLIQUET DU §10 EST TOMBÉ (#5765) — LA PORTE EST ARRIVÉE (#6080) : chaque
 * pastille mène désormais à `/stories?author=…` (`routes/stories.tsx`). Ce
 * que ce témoin mesure maintenant n'est plus « zéro contrôle » mais l'EFFET
 * du tap — une pastille cliquable qui ne mène nulle part serait pire que
 * l'ancien état sans porte du tout.
 */
const premierAuteur = await enTetePage.evaluate(
  () => document.querySelector('[data-rail="grande"] a[data-story-author]')?.getAttribute('data-story-author') ?? null,
);
await enTetePage.click('[data-rail="grande"] a[data-story-author]');
await enTetePage.waitForFunction(() => window.location.pathname === '/stories', undefined, { timeout: 3000 }).catch(() => {});
/* La route `/stories` est chargée à la DEMANDE (`screen: () => import(...)`,
   `route-table.tsx`) : le changement de `pathname` ci-dessus ne dit rien de
   l'arrivée du chunk. Attendre le `<h1>` lui-même, pas seulement l'URL. */
await enTetePage.waitForSelector('h1', { timeout: 3000 }).catch(() => {});
const surStories = await enTetePage.evaluate(() => ({
  pathname: window.location.pathname,
  search: window.location.search,
  titre: document.querySelector('h1')?.textContent ?? null,
}));
check(
  surStories.pathname === '/stories' && premierAuteur !== null && surStories.search.includes(`author=${premierAuteur}`),
  `un tap sur la première pastille du rail ouvre RÉELLEMENT la story de SON auteur (${JSON.stringify({ premierAuteur, ...surStories })})`,
);
check(
  surStories.titre !== null && surStories.titre !== 'Stories' && surStories.titre !== "Aucune story pour l'instant",
  `l'écran ouvert nomme l'auteur tapé, pas un titre générique (titre : « ${surStories.titre} »)`,
);
await enTetePage.goto(`${BASE}/`, { waitUntil: 'load' });
await enTetePage.waitForSelector('[data-row]');

/** 1) « Créer un lien de partage » ⇒ une feuille OUVERTE, et choisir une
 *     conversation éligible produit un RETOUR annoncé (`role="status"`). */
await enTetePage.click('header button[aria-label="Créer un lien de partage"]');
await enTetePage.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {});
const feuilleOuverte = await enTetePage.locator('dialog[open]').count();
check(feuilleOuverte === 1, `« Créer un lien de partage » ouvre une feuille (dialogues ouverts : ${feuilleOuverte})`);

const eligibles = await enTetePage.locator('dialog[open] li button').count();
check(eligibles >= 1, `la feuille liste au moins une conversation éligible (obtenu : ${eligibles})`);
if (eligibles >= 1) {
  await enTetePage.locator('dialog[open] li button').first().click();
  await enTetePage
    .waitForFunction(() => (document.querySelector('[role="status"]')?.textContent ?? '').trim().length > 0, undefined, {
      timeout: 3000,
    })
    .catch(() => {});
  const retour = await enTetePage.evaluate(() => (document.querySelector('[role="status"]')?.textContent ?? '').trim());
  check(
    retour.length > 0,
    `choisir une conversation ANNONCE le résultat du lien (obtenu : « ${retour} ») — un geste invisible sans retour est un geste perdu`,
  );
  const feuilleFermee = await enTetePage.locator('dialog[open]').count();
  check(feuilleFermee === 0, `la feuille se referme après le choix (dialogues ouverts : ${feuilleFermee})`);
}

/** 2) « Nouvelle conversation » ⇒ la route `/conversations/new` RÉPOND (elle
 *     est inscrite à la table, son écran se monte, son champ existe). */
await enTetePage.click('header a[aria-label="Nouvelle conversation"]');
await enTetePage.waitForSelector('input[aria-label="Rechercher un contact"]', { timeout: 3000 }).catch(() => {});
const apresNouvelle = await enTetePage.evaluate(() => ({
  path: window.location.pathname,
  champ: document.querySelector('input[aria-label="Rechercher un contact"]') !== null,
}));
check(
  apresNouvelle.path === '/conversations/new' && apresNouvelle.champ,
  `« Nouvelle conversation » ouvre son écran (${JSON.stringify(apresNouvelle)})`,
);

/** 3) La recherche de contacts a un EFFET : deux caractères rendent des
 *     résultats cliquables, jamais un écran blanc. */
await enTetePage.fill('input[aria-label="Rechercher un contact"]', 'am');
await enTetePage.waitForSelector('ul li button', { timeout: 3000 }).catch(() => {});
const resultats = await enTetePage.locator('ul li button').count();
check(resultats >= 1, `deux caractères rendent au moins un contact cliquable (obtenu : ${resultats})`);

/** 4) « Progression » ⇒ sa route répond aussi. */
await enTetePage.goto(`${BASE}/`, { waitUntil: 'load' });
await enTetePage.waitForSelector('[data-row]');
await enTetePage.click('header a[aria-label^="Progression"]');
await enTetePage.waitForTimeout(400);
const apresProgression = await enTetePage.evaluate(() => window.location.pathname);
check(
  apresProgression !== '/',
  `« Progression » quitte la liste (obtenu : ${apresProgression})`,
);

await enTeteContext.close();

// --------------- 11. la barre de recherche ne vole jamais un contrôle en bas de liste
/**
 * LE DÉFAUT EXACT DE #6220 — la barre de recherche est posée EN BAS,
 * FLOTTANTE au-dessus de `#contenu` (`routes/conversations.tsx`) : avant
 * correction, elle occupait sa propre place EN FLUX, réduisant d'autant la
 * boîte défilante — la rangée qui tombait pile sur cette frontière avait
 * son centre, et celui de son bouton « Actions de conversation », VOLÉ par
 * la barre elle-même, SANS qu'aucun défilement supplémentaire ne puisse
 * jamais l'en sortir (la frontière DE DÉFILEMENT était la barre). `#contenu`
 * réserve désormais sa hauteur MESURÉE en `padding-block-end` — le critère
 * de fin de #6220 : au bas RÉEL du défilement, la dernière rangée et son
 * bouton se touchent au centre.
 *
 * Un `wheel` RÉEL, jamais un `scrollTop` programmé assigné directement : ce
 * dernier s'est mesuré instable ici (une valeur inférieure au maximum,
 * vraisemblablement reprise par un écouteur de défilement de l'écran) — le
 * même geste que #5648 impose déjà pour armer une scène, pour la même
 * raison : seul un défilement REÇU COMME UNE INTENTION vaut le geste d'un
 * doigt.
 */
const bottomContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const bottomPage = await bottomContext.newPage();
await bottomPage.goto(`${BASE}/`, { waitUntil: 'load' });
await bottomPage.waitForSelector('[data-row]');
await bottomPage.waitForTimeout(300);

/**
 * LA RÉSERVE, MESURÉE DIRECTEMENT — le témoin de bout en bout ci-dessous ne
 * ROUGIT PAS sur l'ancien code pour CE corpus précis : `QuickActions`
 * (`components/quick-actions.tsx`, 50dvh dès qu'une rangée est visible)
 * laisse toujours une marge géante après la dernière conversation, quel que
 * soit le filtre — le défaut RÉEL (une frontière de défilement qui EST la
 * barre, donc plus jamais franchissable) ne dépend pas de ce hasard de
 * corpus. Cette assertion mesure la CAUSE structurelle, indépendamment de
 * tout contenu : `#contenu` doit réserver AU MOINS la hauteur RENDUE de la
 * barre en `padding-block-end`, sans quoi le défaut revient dès qu'un écran
 * (une recherche à un seul résultat sans `QuickActions`, un autre corpus)
 * n'offre plus cette marge fortuite.
 */
const reserve = await bottomPage.evaluate(() => {
  const ul = document.getElementById('contenu');
  const bar = document.querySelector('[data-search-bar]');
  return {
    barHeight: bar === null ? null : bar.getBoundingClientRect().height,
    padBottom: parseFloat(getComputedStyle(ul).paddingBottom) || 0,
  };
});
check(reserve.barHeight !== null, 'la barre de recherche (`[data-search-bar]`) est bien présente pour la mesure');
check(
  reserve.barHeight !== null && reserve.padBottom >= reserve.barHeight - 1,
  `#contenu réserve AU MOINS la hauteur RENDUE de la barre en padding-block-end (${JSON.stringify(reserve)})`,
);

await bottomPage.hover('#contenu');
for (let i = 0; i < 40; i += 1) {
  await bottomPage.mouse.wheel(0, 400);
  await bottomPage.waitForTimeout(30);
}
await bottomPage.waitForTimeout(500);
/** Le bouton n'est peint QU'AU SURVOL/FOCUS d'une rangée non magnifiée (§2 ci-
 *  dessus) — le survoler d'abord est la même précaution que la section 2. */
await bottomPage.locator('[data-row]').last().hover();
await bottomPage.waitForTimeout(150);

const bottomOverlap = await bottomPage.evaluate(() => {
  const ul = document.getElementById('contenu');
  const rows = [...document.querySelectorAll('[data-row]')];
  const last = rows[rows.length - 1];
  const btn = last?.querySelector('button[aria-label="Actions de conversation"]');
  const centerHitsSelf = (el) => {
    if (el === null || el === undefined) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  };
  return {
    atMax: ul.scrollTop >= ul.scrollHeight - ul.clientHeight - 1,
    rowOk: centerHitsSelf(last),
    buttonOk: centerHitsSelf(btn),
  };
});
check(bottomOverlap.atMax, 'le défilement RÉEL (wheel) atteint le bas MAXIMAL de la liste');
check(
  bottomOverlap.rowOk === true,
  `au bas MAXIMAL du défilement, le centre de la DERNIÈRE rangée retombe sur elle-même, jamais sur la barre de recherche (${JSON.stringify(bottomOverlap)})`,
);
check(
  bottomOverlap.buttonOk === true,
  `au bas MAXIMAL du défilement, le centre du bouton d'actions de la DERNIÈRE rangée retombe sur LUI, jamais sur la barre de recherche (${JSON.stringify(bottomOverlap)})`,
);

await bottomContext.close();

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} constat(s) en défaut :`);
  for (const e of failures) console.error(`    · ${e}`);
  console.error("\n  Une action de rangée sans effet observable est une action ABSENTE.\n");
  process.exit(1);
}
console.log(
  '\n  Les actions de rangée sont atteignables (souris, clavier, lecteur d’écran) et' +
    '\n  chacune change quelque chose à l’écran ; les chips filtrent, l’état vide tient.\n',
);
