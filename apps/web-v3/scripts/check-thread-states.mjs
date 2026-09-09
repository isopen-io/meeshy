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
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

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
 * L'ANNONCE LECTEUR D'ÉCRAN (#5813, § 6.3) — `[aria-live="polite"]` porte
 * « Message non envoyé » dès qu'une entrée d'outbox passe `failed`, dérivée
 * de l'outbox (jamais un second état).
 */
expect(
  (await page.locator('[aria-live="polite"]').innerText()).toLowerCase().includes('non envoyé'),
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
    await protectionPage.clock.runFor(1000);
    const after6 = await ephemeralBadge.first().innerText();
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
console.log('\n  Les états du fil tiennent : vide dessiné, coupure annoncée sans bloquer, échec attaché à sa bulle et reprise honnête,\n  et la protection (flou, vue unique, éphémère, supprimé) ne fuit jamais sur les deux peaux.\n');
