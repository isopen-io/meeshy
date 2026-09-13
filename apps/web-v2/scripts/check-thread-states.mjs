#!/usr/bin/env node
/**
 * VÉRIFIE LES ÉTATS DU FIL — ceux qu'on oublie parce qu'ils ne sont pas le cas
 * nominal, et qui sont pourtant le cas NOMINAL du réseau visé.
 *
 * CE QU'IL MESURE
 *
 * 1. Une conversation SANS HISTORIQUE dessine un état, pas du blanc. Un écran
 *    vide sur un réseau lent se lit comme un chargement qui ne finit pas —
 *    l'interprétation la plus naturelle, et la plus fausse.
 * 2. Hors ligne, l'application ANNONCE la coupure, sans bloquer : elle lit
 *    parfaitement depuis son précache, donc un voile ou une modale
 *    puniraient l'utilisateur pour un état où tout ce qu'il veut lire est là.
 * 3. Un message écrit hors ligne est marqué NON ENVOYÉ tout de suite, et sa
 *    reprise est DANS la bulle. C'est le point qui compte : une horloge qui
 *    tourne sur un envoi qui ne partira pas est un mensonge d'interface, et
 *    un bandeau global dirait « un envoi a échoué » sans dire lequel.
 * 4. « Réessayer » alors que l'appareil est TOUJOURS coupé ne promet rien : le
 *    message reste en échec. Repasser en « en attente » ferait tourner une
 *    horloge pour rien et l'utilisateur croirait que c'est parti.
 *
 * POURQUOI UN NAVIGATEUR RÉEL. `navigator.onLine`, les événements
 * `online`/`offline` et la coupure elle-même n'existent que là. Aucun test
 * unitaire ne peut couper un réseau.
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { checkThreadMedia } from './lib/check-media.mjs';
import { checkMessageStates } from './lib/check-message-states.mjs';
import { checkRealtimeEvents } from './lib/check-realtime-events.mjs';
import { checkTypingVisibility } from './lib/check-typing-visibility.mjs';

const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
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

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

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

/**
 * Cliquer une cible qui peut légitimement manquer — parce que le défaut qu'on
 * cherche est justement son absence. On rend `false` plutôt que de laisser
 * Playwright lever : un témoin doit nommer le défaut trouvé, jamais l'endroit
 * où il a buté.
 */
const clickIfPresent = async (page, label) => {
  const target = page.getByText(label);
  if ((await target.count()) === 0) return false;
  await target.first().click();
  await page.waitForTimeout(400);
  return true;
};

// --- 1 : la conversation sans historique.
const empty = await context.newPage();
await empty.goto(`${BASE}/c/c-nouvelle`, { waitUntil: 'load' });
await empty.waitForTimeout(700);
expect(
  (await empty.getByText('Aucun message pour l’instant').count()) > 0,
  "une conversation sans historique dessine son état vide",
);
expect(
  (await empty.locator('main li').count()) === 0,
  "l'état vide ne rend aucune bulle",
);
await empty.close();

// --- 2, 3, 4 : la coupure.
const page = await context.newPage();
await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
await page.waitForSelector('main li');
await page.waitForTimeout(500);

expect(
  (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
  "en ligne, aucun bandeau de coupure",
);

await context.setOffline(true);
await page.waitForTimeout(400);
expect(
  (await page.getByText('Hors ligne', { exact: false }).count()) > 0,
  "hors ligne, la coupure est ANNONCÉE",
);
/* Non bloquant : le fil reste lisible, et c'est tout l'intérêt du précache. */
expect(
  (await page.locator('main li').count()) > 0,
  "hors ligne, le fil reste lisible (aucun voile, aucune modale)",
);

const field = page.getByPlaceholder('Message…');
await field.fill('Un message écrit sans réseau');
await field.press('Enter');
await page.waitForTimeout(500);

const failedShown = expect(
  (await page.getByText('Non envoyé').count()) > 0,
  "un message écrit hors ligne est marqué NON ENVOYÉ",
);

/**
 * L'ANNONCE LECTEUR D'ÉCRAN (#5813, § 6.3) — la région HORS ÉCRAN du fil
 * (`routes/thread.tsx`, `role="status" aria-live="polite" class="offscreen"`)
 * porte « Message non envoyé » dès qu'une entrée d'outbox passe `failed`,
 * dérivée de l'outbox (jamais un second état).
 *
 * LE SÉLECTEUR EST SCOPÉ DEPUIS #6080 : `[aria-live="polite"]` nu résolvait
 * désormais DEUX nœuds — celui-ci et la pastille de synchronisation, qui
 * annonce elle aussi, et qui vit dans la coquille. Une annonce de plus sur
 * l'écran n'est pas une régression ; un témoin qui ne sait plus lequel des
 * deux il interroge en est une.
 */
expect(
  (await page.locator('.offscreen[aria-live="polite"]').innerText()).toLowerCase().includes('non envoyé'),
  "l'annonce aria-live signale « non envoyé » après un envoi hors ligne",
);

/**
 * La bande de reprise doit être DANS la bulle du message concerné — pas
 * ailleurs sur l'écran. On le vérifie par la parenté, pas par la présence :
 * un bandeau global passerait le test précédent sans rendre le service.
 */
expect(
  await page.evaluate(() => {
    const bands = [...document.querySelectorAll('main li button')].filter((b) =>
      (b.textContent ?? '').includes('Non envoyé'),
    );
    return bands.length === 1 && bands[0]?.closest('li') !== null;
  }),
  "la bande de reprise est DANS la bulle, une seule fois",
);

/**
 * LA CIBLE TACTILE DE LA BANDE DE REPRISE (revue-correction #5813, défaut
 * majeur 7) — mesurée à 27 px de haut en police 10 px avant ce correctif :
 * le SEUL contrôle de réparation du fil sous la règle « cibles >= 44 px »
 * (dimension 5) que ce gate tient déjà pour l'erreur de LISTE
 * (`routes/conversations.tsx`, `minHeight: 44`). Le geste qu'on rattrape est
 * souvent tapé en marchant, sur un réseau qui coupe — il ne peut pas être le
 * seul contrôle du chantier sous la règle.
 */
if (failedShown) {
  const band = page.locator('main li button', { hasText: 'Non envoyé' }).first();
  const box = await band.boundingBox();
  expect(
    box !== null && box.height >= 44,
    `la bande de reprise du fil couvre au moins 44 px de haut (obtenu : ${box?.height ?? 'absent'})`,
  );
}

/**
 * Les quatre vérifications suivantes DÉPENDENT de la précédente : sans bande
 * de reprise, il n'y a rien à cliquer. On les déclare non tenues plutôt que de
 * laisser Playwright rendre un « Timeout waiting for getByText » — un témoin
 * doit nommer le défaut qu'il a trouvé, pas l'endroit où il a buté. (Sa
 * première version le faisait, et une mutation l'a montré.)
 */
if (!failedShown) {
  for (const what of [
    "réessayer TOUJOURS hors ligne laisse le message en échec",
    "le bandeau disparaît au retour du réseau",
    "réessayer une fois le réseau revenu retire l'échec",
  ]) {
    expect(false, `${what} — non vérifiable : aucune bande de reprise`);
  }
} else {
  // --- 4 : réessayer sans réseau ne promet rien.
  await clickIfPresent(page, 'Réessayer');
  expect(
    (await page.getByText('Non envoyé').count()) > 0,
    "réessayer TOUJOURS hors ligne laisse le message en échec",
  );

  await context.setOffline(false);
  await page.waitForTimeout(400);
  expect(
    (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
    "le bandeau disparaît au retour du réseau",
  );
  const clicked = await clickIfPresent(page, 'Réessayer');
  expect(
    clicked && (await page.getByText('Non envoyé').count()) === 0,
    clicked
      ? "réessayer une fois le réseau revenu retire l'échec"
      : "réessayer une fois le réseau revenu retire l'échec — la bande avait déjà disparu hors ligne",
  );
}

await page.close();

/**
 * --- 5 : LA PROTECTION (D-23, #5676) ---
 *
 * Sur `/c/c-protection`, jouée DEUX FOIS — peau Focal (défaut) puis peau
 * Bulles (menu « Mode de lecture » → « Bulles ») — pour prouver que le
 * cycle de révélation vit dans UNE loi partagée (`reading-mode/protection.ts`)
 * et non deux copies par peau.
 *
 * `page.clock.install({ time: INSTANT })` AVANT `goto` : les fixtures
 * calculent leurs horodatages RELATIFS à `Date.now()` au chargement du
 * module — l'horloge truquée doit donc être en place avant que le bundle ne
 * s'évalue, pas seulement avant les assertions. `runFor(≥250)` après chaque
 * action laisse Preact (React en runtime de test, `avatar.test.tsx`) rejouer
 * son `afterPaint` avant la lecture suivante (§5.8 de la spécification).
 *
 * Les CHAÎNES cherchées sont dupliquées ICI, à côté de l'id du témoin — si
 * elles bougent dans `fixtures.ts`, ce gate bouge avec elles (le but : le
 * texte protégé doit pouvoir manquer, pas seulement le nœud structurel).
 */
const BLURRED_WITNESS_ID = 'prot-2';
const BLURRED_CONTENT = 'Le code du coffre est 4817-2290.';
const VIEW_ONCE_WITNESS_ID = 'prot-3';
const VIEW_ONCE_OFFLINE_WITNESS_ID = 'prot-4';
const EPHEMERAL_WITNESS_ID = 'prot-5';
const DELETED_WITNESS_ID = 'prot-6';
const DELETED_CONTENT = 'Ce texte ne doit jamais être rendu.';
const BURNED_WITNESS_ID = 'prot-7';
const TRANSLATED_UNVEILED_WITNESS_ID = 'prot-1';

const INSTANT = new Date('2026-09-08T12:00:00.000Z').getTime();

const runProtectionSuite = async (skin) => {
  const protectionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const protectionPage = await protectionContext.newPage();
  await protectionPage.clock.install({ time: INSTANT });
  await protectionPage.goto(`${BASE}/c/c-protection`, { waitUntil: 'load' });
  await protectionPage.waitForSelector('[data-message]');
  await protectionPage.clock.runFor(300);

  if (skin === 'bulles') {
    await protectionPage.getByRole('button', { name: /Mode de lecture/ }).click();
    await protectionPage.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await protectionPage.clock.runFor(300);
  }

  const mainInnerText = () => protectionPage.locator('main').innerText();
  /**
   * `innerHTML`, PAS `innerText` (revue) — le critère parle du texte visible,
   * mais une fuite peut voyager dans un ATTRIBUT (`title`, `aria-label`,
   * `data-*`, `alt`) que `innerText` ne montre pas. Le DOM entier est la
   * surface de fuite du web (§1.4 point 1) : c'est lui qu'il faut interroger
   * quand on affirme « rien du contenu ne part ».
   */
  const mainInnerHtml = () => protectionPage.locator('main').innerHTML();
  const rowOf = (id) => protectionPage.locator(`[data-message="${id}"]`);

  /**
   * 0 — LA BANDE DE DRAPEAUX, AVANT toute révélation et sur les DEUX peaux.
   *
   * LE TÉMOIN PORTE SUR `prot-3`, PAS SUR `prot-2` (revue) : `prot-2` n'a
   * AUCUNE traduction, donc `languageBand` rend `[]` et `PrismPastille` se
   * tait déjà quand la langue servie EST l'originale
   * (`message-blocks.tsx:60`) — mesuré, ce témoin restait VERT avec la garde
   * `isVeiled` RETIRÉE des deux peaux, c'est-à-dire qu'il ne prouvait rien.
   * `prot-3` est voilé ET traduit : sans la garde, sa bande porterait le
   * drapeau `en` de sa langue d'origine. Il faut le lire AVANT le § 5, qui
   * le consomme.
   */
  expect(
    (await rowOf(VIEW_ONCE_WITNESS_ID).locator('button[aria-pressed]').count()) === 0,
    `[${skin}] aucun drapeau sur la rangée voilée ET TRADUITE`,
  );
  expect(
    (await rowOf(TRANSLATED_UNVEILED_WITNESS_ID).locator('button[aria-pressed]').count()) > 0,
    `[${skin}] au moins un drapeau sur une rangée traduite non voilée`,
  );

  // 1 — au repos, aucune fuite du contenu flouté.
  expect(!(await mainInnerText()).includes(BLURRED_CONTENT), `[${skin}] le contenu flouté n'apparaît pas dans innerText au repos`);
  expect(
    !(await mainInnerHtml()).includes(BLURRED_CONTENT),
    `[${skin}] le contenu flouté n'est nulle part dans le DOM au repos — attributs compris`,
  );

  // 2 — le substitut est flouté et non sélectionnable.
  const surrogate = rowOf(BLURRED_WITNESS_ID).locator('[data-surrogate]');
  expect((await surrogate.count()) > 0, `[${skin}] le substitut flouté existe dans le DOM`);
  if ((await surrogate.count()) > 0) {
    const style = await surrogate.first().evaluate((el) => ({
      filter: getComputedStyle(el).filter,
      userSelect: getComputedStyle(el).userSelect,
    }));
    expect(style.filter.startsWith('blur('), `[${skin}] le substitut porte un filter: blur(…) (${style.filter})`);
    expect(style.userSelect === 'none', `[${skin}] le substitut n'est pas sélectionnable (user-select: ${style.userSelect})`);
  }

  // 3 — tap révèle, SANS déplacer la rangée (défaut #5676 revue 4 : un
  // `min-height: 44px` sur le seul voile faisait sauter la rangée de 24 px
  // au tap, puis remonter 5 s plus tard — voilé et révélé tiennent
  // maintenant le MÊME plancher, `thread-protection.css`).
  const veil = rowOf(BLURRED_WITNESS_ID).locator('[data-protected="hidden"]');
  const veilPresent = (await veil.count()) > 0;
  expect(veilPresent, `[${skin}] le bouton-voile du témoin flouté existe`);
  if (veilPresent) {
    const heightOf = async () => rowOf(BLURRED_WITNESS_ID).evaluate((el) => el.getBoundingClientRect().height);
    const heightBefore = await heightOf();

    await veil.first().click();
    await protectionPage.clock.runFor(250);
    expect((await mainInnerText()).includes(BLURRED_CONTENT), `[${skin}] le contenu est lisible après révélation`);
    expect(
      (await rowOf(BLURRED_WITNESS_ID).locator('[data-protected="revealed"]').count()) > 0,
      `[${skin}] la rangée porte data-protected="revealed" pendant la fenêtre`,
    );
    const heightRevealed = await heightOf();
    expect(
      Math.abs(heightRevealed - heightBefore) < 1,
      `[${skin}] la rangée ne saute pas au tap (avant ${heightBefore}px, révélé ${heightRevealed}px)`,
    );

    // 4 — les deux moitiés du seuil de 5 s.
    await protectionPage.clock.runFor(4700);
    expect((await mainInnerText()).includes(BLURRED_CONTENT), `[${skin}] à 4,95 s, toujours révélé`);
    await protectionPage.clock.runFor(100);
    // 4bis — le brouillard ferme APRÈS les 5 s, pas avant (défaut #5676
    // revue 5) : à 5,05 s la fenêtre de 5 s est éteinte mais le contenu
    // reste monté SOUS le brouillard qui l'obscurcit progressivement
    // (`fogging`, 400 ms) — le texte disparaît à la FIN de cette fermeture,
    // jamais avant.
    expect(
      (await mainInnerText()).includes(BLURRED_CONTENT),
      `[${skin}] à 5,05 s, le brouillard ferme mais le texte est ENCORE là (fogging)`,
    );
    expect(
      (await rowOf(BLURRED_WITNESS_ID).locator('[data-fog="closing"]').count()) > 0,
      `[${skin}] le brouillard porte data-fog="closing" pendant sa fermeture`,
    );
    await protectionPage.clock.runFor(400);
    expect(!(await mainInnerText()).includes(BLURRED_CONTENT), `[${skin}] à ≥ 5,4 s, re-voilé — le texte a disparu`);
    expect(
      (await rowOf(BLURRED_WITNESS_ID).locator('[data-protected="hidden"]').count()) > 0,
      `[${skin}] la rangée revient à data-protected="hidden"`,
    );
    const heightAfter = await heightOf();
    expect(
      Math.abs(heightAfter - heightBefore) < 1,
      `[${skin}] la rangée ne saute pas au re-voilement (avant ${heightBefore}px, après ${heightAfter}px)`,
    );
  }

  // 5 — vue unique : révélation puis consommation (5 s de fenêtre + 400 ms
  // de fermeture du brouillard, `FOG_DURATION_MS`), plus jamais révélable.
  const viewOnceVeil = rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="hidden"]');
  const viewOnceVeilPresent = (await viewOnceVeil.count()) > 0;
  expect(viewOnceVeilPresent, `[${skin}] le bouton-voile de la vue unique existe`);
  if (viewOnceVeilPresent) {
    await viewOnceVeil.first().click();
    await protectionPage.clock.runFor(250);
    expect(
      (await rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="revealed"]').count()) > 0,
      `[${skin}] la vue unique révèle son contenu au tap`,
    );
    await protectionPage.clock.runFor(5500);
    expect(
      (await rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="consumed"]').count()) > 0,
      `[${skin}] la vue unique consommée porte data-protected="consumed"`,
    );
    expect((await mainInnerText()).includes('Vu et supprimé'), `[${skin}] « Vu et supprimé » est affiché`);
    // Second clic sur la rangée — plus rien à cliquer, l'état reste consumed.
    await rowOf(VIEW_ONCE_WITNESS_ID).click({ force: true });
    await protectionPage.clock.runFor(250);
    expect(
      (await rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="consumed"]').count()) > 0,
      `[${skin}] un second clic ne révèle plus jamais la vue unique`,
    );
  }

  // 6 — éphémère : minuteur vivant, puis disparition.
  const ephemeralBadge = rowOf(EPHEMERAL_WITNESS_ID).locator('[data-ephemeral]');
  const before6 = await ephemeralBadge.count() > 0 ? await ephemeralBadge.first().innerText() : null;
  expect(before6 !== null, `[${skin}] le badge éphémère existe (${before6})`);
  if (before6 !== null) {
    /*
      AVANCER L'HORLOGE N'EST PAS AVOIR REPEINT (#6061) — `runFor` livre son tick
      au composant, qui PROGRAMME un rendu ; `innerText` peut lire avant que ce
      rendu ait atteint le DOM, et le gate accuse alors le minuteur de ne pas
      décroître alors qu'il a parfaitement décru. Rouge mesuré sur des PR
      strictement iOS (#6039, #6044), vert sur d'autres parties de la même base.

      Une horloge factice supprime la dépendance au temps qui PASSE, pas celle au
      travail qui RESTE à faire ; les deux se confondent tant que la machine est
      rapide.

      L'attente est donc CONDITIONNELLE, et sous horloge truquée elle ne peut pas
      s'écrire avec `waitForFunction` : `clock.install` truque aussi `rAF` et
      `setTimeout`, les deux seuls sondages dont Playwright dispose — l'attente
      n'y serait jamais réveillée. Ce qui fait avancer le rendu ici, c'est
      `runFor` lui-même, par pas de 250 ms : exactement le motif que le
      doc-comment de ce fichier déclare déjà (« `runFor(≥250)` après chaque action
      laisse Preact rejouer son `afterPaint` »). La borne est GÉNÉREUSE et
      anti-blocage, pas un budget : contrairement à une mise en évidence fugace
      (#6115), l'état visé ici n'est pas encore ARRIVÉ — il ne peut pas repartir,
      donc attendre plus longtemps ne mesure jamais autre chose.
    */
    await protectionPage.clock.runFor(1000);
    let after6 = await ephemeralBadge.first().innerText();
    for (let tick = 0; tick < 20 && after6 === before6; tick += 1) {
      await protectionPage.clock.runFor(250);
      after6 = await ephemeralBadge.first().innerText();
    }
    expect(after6 !== before6, `[${skin}] le minuteur éphémère décroît (${before6} → ${after6})`);
    await protectionPage.clock.runFor(2 * 60 * 1000);
    // « vide OU absente » (§4.8 §6) : la bulle DÉMONTE (`kind === 'expired' → null`),
    // la rangée plate garde une ANCRE vide (`data-protected="expired"`) — les
    // deux formes tiennent la promesse « plus aucun contenu, plus aucun badge ».
    const expiredRow = rowOf(EPHEMERAL_WITNESS_ID);
    const expiredRowCount = await expiredRow.count();
    const rowStillHasContent =
      expiredRowCount > 0 && (await expiredRow.first().evaluate((el) => (el.textContent ?? '').trim().length > 0));
    expect(!rowStillHasContent, `[${skin}] la rangée éphémère échue ne rend plus ni contenu ni badge`);
  }

  // 7 — supprimé : jamais le contenu.
  expect((await mainInnerText()).includes('Message supprimé'), `[${skin}] « Message supprimé » est affiché`);
  expect(!(await mainInnerText()).includes(DELETED_CONTENT), `[${skin}] le contenu supprimé ne fuit jamais`);
  expect(
    !(await mainInnerHtml()).includes(DELETED_CONTENT),
    `[${skin}] le contenu supprimé n'est nulle part dans le DOM — attributs compris`,
  );

  // 8 — brûlé à l'arrivée : aucune affordance.
  expect(
    (await rowOf(BURNED_WITNESS_ID).locator('[data-protected="hidden"]').count()) === 0,
    `[${skin}] le témoin brûlé à l'arrivée ne porte AUCUNE affordance`,
  );

  if (skin === 'focal') {
    // 9 — hors ligne : le tap sur un second témoin de vue unique échoue proprement.
    await protectionContext.setOffline(true);
    const offlineVeil = rowOf(VIEW_ONCE_OFFLINE_WITNESS_ID).locator('[data-protected="hidden"]');
    if ((await offlineVeil.count()) > 0) {
      await offlineVeil.first().click();
      await protectionPage.clock.runFor(250);
      expect(
        (await rowOf(VIEW_ONCE_OFFLINE_WITNESS_ID).locator('[data-protected="hidden"]').count()) > 0,
        `[${skin}] hors ligne, la vue unique reste voilée`,
      );
      expect(
        (await rowOf(VIEW_ONCE_OFFLINE_WITNESS_ID).locator('[role="status"]').count()) > 0,
        `[${skin}] hors ligne, une légende « Révélation impossible » apparaît`,
      );
      // LA GRAMMAIRE D'UN ÉCHEC, PAS CELLE D'UN CONTENU (revue #5676, défaut
      // 6) : la légende porte `--color-error`, jamais l'encre de corps —
      // sinon du texte pleine taille dans le rectangle gris se lit comme le
      // secret qu'on vient de refuser. On compare le `color` RÉSOLU de la
      // légende à celui d'une sonde posée `color: var(--color-error)`,
      // plutôt qu'à la valeur brute du jeton (qui peut être une référence
      // `color-mix`/`var` de plus, jamais le format que rend `getComputedStyle`).
      const [noticeColor, errorProbeColor] = await rowOf(VIEW_ONCE_OFFLINE_WITNESS_ID).evaluate((row) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-error)';
        document.body.appendChild(probe);
        const errorColor = getComputedStyle(probe).color;
        probe.remove();
        const notice = row.querySelector('[role="status"]');
        const noticeColorValue = notice ? getComputedStyle(notice).color : null;
        return [noticeColorValue, errorColor];
      });
      expect(
        noticeColor === errorProbeColor,
        `[${skin}] la légende d'échec porte --color-error (${noticeColor} attendu ${errorProbeColor})`,
      );
      await protectionPage.clock.runFor(2600);
      expect(
        (await rowOf(VIEW_ONCE_OFFLINE_WITNESS_ID).locator('[role="status"]').count()) === 0,
        `[${skin}] la légende disparaît après 2,5 s`,
      );
    } else {
      expect(false, `[${skin}] témoin hors ligne non vérifiable — aucune affordance trouvée`);
    }
    await protectionContext.setOffline(false);
  }

  await protectionPage.close();
  await protectionContext.close();
};

await runProtectionSuite('focal');
await runProtectionSuite('bulles');

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
  const menuContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await menuPage.waitForTimeout(300);

  const rows = menuPage.locator('[data-row]');
  const cluster = menuPage.locator('[role="menu"]');
  const listItems = menuPage.locator('.message-menu-list [role="menuitem"]');

  /**
   * Le fil est ANCRÉ EN BAS et VIRTUALISÉ : une rangée peut être montée sans
   * être à l'écran. `click()` fait défiler tout seul, `mouse.move()` non — on
   * amène donc la rangée en vue avant TOUT geste de bas niveau, sinon le
   * témoin mesure un pointeur posé dans le vide (mesuré en revue).
   */
  const openMenuOnRow = async (index) => {
    await rows.nth(index).scrollIntoViewIfNeeded();
    await rows.nth(index).click({ button: 'right' });
    await menuPage.waitForTimeout(250);
  };
  /** Rend `false` PLUTÔT QUE DE LEVER quand l'entrée manque — un témoin doit
   *  nommer le défaut trouvé, jamais mourir dessus (§ `clickIfPresent`). */
  const clickMenuItem = async (label) => {
    const item = listItems.filter({ hasText: label }).first();
    if ((await item.count()) === 0) return expect(false, `l'entrée « ${label} » manque au menu`);
    await item.click();
    await menuPage.waitForTimeout(250);
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
  await menuPage.waitForTimeout(200);
  expect((await cluster.count()) === 0, 'Échap ferme le menu');
  expect(
    await menuPage.evaluate(() => document.activeElement?.hasAttribute('data-row') === true),
    'Échap rend le focus à la rangée qui a ouvert le menu',
  );

  // 6.4 — LA TOUCHE MENU (Shift+F10) ouvre le MÊME menu depuis le clavier.
  await menuPage.keyboard.press('Shift+F10');
  await menuPage.waitForTimeout(250);
  expect((await cluster.count()) === 1, 'Shift+F10 sur la rangée focalisée ouvre le menu');

  // 6.4 bis — LE PARCOURS CLAVIER DU RAIL. `ArrowRight` y déplaçait le focus
  // par un événement RECOPIÉ (`{ ...event, key }`), qui perd `preventDefault`
  // — méthode de PROTOTYPE : le rail levait `TypeError` et restait inerte.
  const railFirst = menuPage.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]').first();
  await railFirst.focus();
  const focusedBefore = await menuPage.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await menuPage.keyboard.press('ArrowRight');
  await menuPage.waitForTimeout(120);
  const focusedAfter = await menuPage.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(
    focusedAfter !== null && focusedAfter !== focusedBefore,
    `ArrowRight déplace le focus sur le rail (${focusedBefore} → ${focusedAfter})`,
  );
  // 6.4 ter — TAB NE SORT PAS DU CLUSTER : derrière le voile, les rangées sont
  // focalisables et pourtant inatteignables.
  await menuPage.keyboard.press('Tab');
  await menuPage.waitForTimeout(120);
  expect(
    await menuPage.evaluate(() => document.querySelector('[role="menu"]')?.contains(document.activeElement) === true),
    'Tab garde le focus DANS le menu',
  );
  await menuPage.keyboard.press('Escape');
  await menuPage.waitForTimeout(150);

  // 6.5 — L'APPUI LONG (500 ms, souris tenue) ouvre le même menu, et le geste
  // ne laisse AUCUNE sélection de texte native derrière lui.
  await rows.nth(0).scrollIntoViewIfNeeded();
  await rows.nth(0).hover();
  await menuPage.mouse.down();
  await menuPage.waitForTimeout(700);
  await menuPage.mouse.up();
  await menuPage.waitForTimeout(250);
  const longPressOpened = expect((await cluster.count()) === 1, 'un appui tenu 500 ms ouvre le menu');
  expect(
    await menuPage.evaluate(() => (window.getSelection()?.toString() ?? '') === ''),
    "l'appui long ne sélectionne pas le texte de la rangée",
  );
  if (!longPressOpened) await openMenuOnRow(0);

  // 6.6 — COPIER écrit le texte SERVI dans le presse-papiers.
  const servedText = await rows.nth(0).innerText();
  if (await clickMenuItem('Copier')) {
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
    await menuPage.waitForTimeout(350);
    const langAfter = await rows.nth(0).locator('[lang]').first().getAttribute('lang');
    const textAfter = await rows.nth(0).innerText();
    expect(langAfter !== langBefore, `Traduire change lang (${langBefore} → ${langAfter})`);
    expect(textAfter !== textBefore, 'Traduire change le TEXTE servi, pas seulement son étiquette');
  }

  // 6.8 — UNE RÉACTION DU RAIL pousse une capsule OPTIMISTE sous la rangée.
  const chipsBefore = await rows.nth(0).locator('.rounded-chip').count();
  await openMenuOnRow(0);
  await menuPage.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]').first().click();
  await menuPage.waitForTimeout(300);
  expect(
    (await rows.nth(0).locator('.rounded-chip').count()) > chipsBefore,
    'une réaction du rail ajoute une capsule tout de suite (optimiste)',
  );

  // 6.9 — COMPOSER pré-adresse le composeur (la citation apparaît).
  await openMenuOnRow(0);
  if (await clickMenuItem('Composer')) {
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
      await menuPage.waitForTimeout(250);
      expect(
        (await second.getAttribute('aria-checked')) !== before,
        "la coche d'une AUTRE rangée bascule au clic (contrôle réel, pas un décor)",
      );
    }
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
    const leakContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    await leakPage.waitForTimeout(300);

    const rowFor = (id) => leakPage.locator(`[data-row]:has([data-message="${id}"])`);

    // (a) le menu d'un message PROTÉGÉ n'offre pas « Copier ».
    await rowFor(BLURRED_WITNESS_ID).click({ button: 'right' });
    await leakPage.waitForTimeout(250);
    const protectedLabels = await leakPage.locator('.message-menu-list [role="menuitem"]').allInnerTexts();
    expect(!protectedLabels.includes('Copier'), 'un message flouté n’offre pas « Copier »');
    expect(!protectedLabels.includes('Traduire'), 'un message flouté n’offre pas « Traduire »');
    await leakPage.keyboard.press('Escape');
    await leakPage.waitForTimeout(200);

    // (b) le SÉLECTIONNER + « Copier » de la barre ne fait pas sortir le secret.
    await rowFor(TRANSLATED_UNVEILED_WITNESS_ID).click({ button: 'right' });
    await leakPage.waitForTimeout(250);
    await leakPage.locator('.message-menu-list [role="menuitem"]').filter({ hasText: 'Sélectionner' }).first().click();
    await leakPage.waitForTimeout(250);
    const blurredCheckbox = rowFor(BLURRED_WITNESS_ID).getByRole('checkbox');
    if ((await blurredCheckbox.count()) === 0) {
      expect(false, 'la rangée floutée porte une coche de sélection');
    } else {
      await blurredCheckbox.first().click();
      await leakPage.waitForTimeout(250);
      await leakPage.getByRole('button', { name: 'Copier' }).click();
      await leakPage.waitForTimeout(250);
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
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await touchPage.waitForSelector('[data-row]');
  await touchPage.waitForTimeout(300);
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
  const composerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const composerPage = await composerContext.newPage();
  await composerPage.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await composerPage.waitForSelector('[data-message]');
  await composerPage.waitForTimeout(300);

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
  const tilesBefore = await composerPage.locator('[role="group"][aria-label="Types de pièces jointes"]').count();
  await plus.click();
  await composerPage.waitForTimeout(350);
  const tilesAfter = await composerPage.locator('[role="group"][aria-label="Types de pièces jointes"]').count();
  expect(tilesBefore === 0 && tilesAfter === 1, 'le « + » OUVRE le tiroir (le geste a un effet, loi 4)');

  const inertOpen = await inertInComposer();
  expect(inertOpen.length === 0, `0 contrôle du composeur sans gestionnaire, tiroir OUVERT (${inertOpen.join(', ')})`);

  // Les tuiles portent une cible d'au moins 44 px (dimension 5).
  const smallTargets = await composerPage.evaluate(() => {
    const panel = document.querySelector('[role="group"][aria-label="Types de pièces jointes"]');
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
server.close();

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
