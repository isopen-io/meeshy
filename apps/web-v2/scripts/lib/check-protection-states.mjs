import { pausedChronology } from './paused-chronology.mjs';

/**
 * EXTRAIT de `check-thread-states.mjs` (revue-correction #7054) : poser ici la
 * preuve mesurée de l'horloge en pause repassait l'hôte au-dessus du seuil de
 * 1000 lignes, et le § Code Style du `CLAUDE.md` l'interdit — on extrait AVANT
 * d'ajouter. Même motif que `check-offline-states.mjs`, extrait par le même lot.
 *
 * Les ids et les CHAÎNES du corpus `/c/c-protection` sont EXPORTÉS d'ici plutôt
 * que recopiés chez l'hôte : son § 6.12 (la copie d'une sélection mixte)
 * interroge le MÊME corpus, et deux définitions du même secret dériveraient le
 * jour où la fixture change — laissant l'un des deux témoins chercher une
 * chaîne que plus personne ne sert, donc verdir sur une fuite réelle.
 */

/**
 * --- 5 : LA PROTECTION (D-23, #5676) ---
 *
 * Sur `/c/c-protection`, jouée DEUX FOIS — peau Focal (défaut) puis peau
 * Bulles (menu « Mode de lecture » → « Bulles ») — pour prouver que le
 * cycle de révélation vit dans UNE loi partagée (`reading-mode/protection.ts`)
 * et non deux copies par peau.
 *
 * `pausedChronology(page, { time: INSTANT })` AVANT `goto` : les fixtures
 * calculent leurs horodatages RELATIFS à `Date.now()` au chargement du
 * module — l'horloge truquée doit donc être en place avant que le bundle ne
 * s'évalue, pas seulement avant les assertions. `advanceBy(≥250)` après chaque
 * action laisse Preact (React en runtime de test, `avatar.test.tsx`) rejouer
 * son `afterPaint` avant la lecture suivante (§5.8 de la spécification).
 *
 * L'HORLOGE EST EN PAUSE, JAMAIS `install` SEUL (revue-correction #7054).
 * Cette suite posait l'horloge truquée SANS la mettre en pause, et la
 * révélation d'un message
 * flouté n'a que 400 ms de marge (fenêtre de 5 s + 400 ms de fermeture du
 * brouillard, contre 4 950 ms simulées) : sous `install` seul, l'horloge
 * truquée de Playwright 1.62.1 AVANCE avec le temps MURAL (mesuré ici même :
 * +3 004 ms d'horloge page pour 3 005 ms de mur), donc chaque aller-retour
 * CDP entre le clic et l'assertion ronge cette marge. Mesuré sur le dist de
 * cette branche, en émulant la contention par un arrêt mural avant chaque
 * avancée :
 *
 *     install seul, arrêt   0 ms → horloge à 5 082 ms  — 5 témoins verts
 *     install seul, arrêt 200 ms → horloge à 5 547 ms  — « le brouillard ferme
 *                                  mais le texte est ENCORE là » et
 *                                  `data-fog="closing"` ROUGES
 *     install seul, arrêt 400 ms → horloge à 6 275 ms  — « à 4,95 s, toujours
 *                                  révélé » ROUGE en plus
 *     install + pauseAt, arrêts 0 / 200 / 400 ms → horloge à 5 050 ms À CHAQUE
 *                                  FOIS, 5 témoins verts
 *
 * C'est le MÊME mécanisme que les deux rouges de #7054, dans le fichier que
 * #7054 réécrivait — laissé derrière parce qu'il n'appelait aucun délai
 * NOMMÉ et passait donc sous le critère de fin, qui est un `grep` sur le nom
 * d'une méthode. Une horloge qui suit le mur est un délai fixe qui ne dit pas
 * son nom : c'est pourquoi la garde `no-fixed-delays.test.ts` ne suffit pas
 * seule, et pourquoi ce module déclare sa doctrine d'horloge ici, en toutes
 * lettres.
 *
 * Sous horloge EN PAUSE, la page ne démarre pas toute seule (le démarrage
 * consomme des minuteurs) : le montage s'attend par `factBefore`, qui avance
 * par pas — mesuré, `[data-message]` est monté après 150 à 200 ms simulées.
 *
 * Les CHAÎNES cherchées sont dupliquées ICI, à côté de l'id du témoin — si
 * elles bougent dans `fixtures.ts`, ce gate bouge avec elles (le but : le
 * texte protégé doit pouvoir manquer, pas seulement le nœud structurel).
 */
export const BLURRED_WITNESS_ID = 'prot-2';
export const BLURRED_CONTENT = 'Le code du coffre est 4817-2290.';
const VIEW_ONCE_WITNESS_ID = 'prot-3';
const VIEW_ONCE_OFFLINE_WITNESS_ID = 'prot-4';
const EPHEMERAL_WITNESS_ID = 'prot-5';
const DELETED_WITNESS_ID = 'prot-6';
const DELETED_CONTENT = 'Ce texte ne doit jamais être rendu.';
const BURNED_WITNESS_ID = 'prot-7';
export const TRANSLATED_UNVEILED_WITNESS_ID = 'prot-1';

const INSTANT = new Date('2026-09-08T12:00:00.000Z').getTime();

/** Le budget de DÉMARRAGE, en millisecondes SIMULÉES — généreux et
 *  anti-blocage, jamais un délai : `factBefore` s'arrête au fait, et ne
 *  consomme ce budget que si le fil ne monte pas du tout. */
const PROTECTION_BOOT_BUDGET_MS = 15_000;

const runProtectionSuite = async ({ browser, BASE, expect, skin }) => {
  const protectionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const protectionPage = await protectionContext.newPage();
  const chrono = await pausedChronology(protectionPage, { time: INSTANT });
  await protectionPage.goto(`${BASE}/c/c-protection`, { waitUntil: 'load' });
  const booted = await chrono.factBefore(chrono.now() + PROTECTION_BOOT_BUDGET_MS, () =>
    protectionPage.evaluate(() => document.querySelector('[data-message]') !== null),
  );
  expect(booted, `[${skin}] le fil protégé est monté sous horloge en pause (${chrono.now()} ms simulées)`);
  await chrono.advanceBy(300);

  if (skin === 'bulles') {
    await protectionPage.getByRole('button', { name: /Mode de lecture/ }).click();
    await protectionPage.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await chrono.advanceBy(300);
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
    await chrono.advanceBy(250);
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
    await chrono.advanceBy(4700);
    expect((await mainInnerText()).includes(BLURRED_CONTENT), `[${skin}] à 4,95 s, toujours révélé`);
    await chrono.advanceBy(100);
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
    await chrono.advanceBy(400);
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
    await chrono.advanceBy(250);
    expect(
      (await rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="revealed"]').count()) > 0,
      `[${skin}] la vue unique révèle son contenu au tap`,
    );
    await chrono.advanceBy(5500);
    expect(
      (await rowOf(VIEW_ONCE_WITNESS_ID).locator('[data-protected="consumed"]').count()) > 0,
      `[${skin}] la vue unique consommée porte data-protected="consumed"`,
    );
    expect((await mainInnerText()).includes('Vu et supprimé'), `[${skin}] « Vu et supprimé » est affiché`);
    // Second clic sur la rangée — plus rien à cliquer, l'état reste consumed.
    await rowOf(VIEW_ONCE_WITNESS_ID).click({ force: true });
    await chrono.advanceBy(250);
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

      L'attente est donc CONDITIONNELLE, et elle s'écrit en AVANÇANT l'horloge
      par pas. La réserve qui tenait ici (« sous horloge truquée, aucun sondage
      de Playwright n'est réveillé ») est FAUSSE pour 1.62.1 quant au sondage —
      `UtilityScript` lit les minuteurs ORIGINAUX capturés par l'horloge
      (#7054, § 1.2) — mais ce qu'elle disait de VRAI reste vrai, et c'est ce
      qui compte ici : ce qui fait avancer le PRODUIT sous horloge en pause,
      c'est l'avancée de l'horloge elle-même. Un sondage seul attendrait un
      minuteur que personne ne tire. Le pas vaut 250 ms, le motif que le
      doc-comment de ce fichier déclare déjà (« `advanceBy(≥250)` après chaque
      action laisse Preact rejouer son `afterPaint` »). La borne est GÉNÉREUSE et
      anti-blocage, pas un budget : contrairement à une mise en évidence fugace
      (#6115), l'état visé ici n'est pas encore ARRIVÉ — il ne peut pas repartir,
      donc attendre plus longtemps ne mesure jamais autre chose.
    */
    await chrono.advanceBy(1000);
    let after6 = await ephemeralBadge.first().innerText();
    for (let tick = 0; tick < 20 && after6 === before6; tick += 1) {
      await chrono.advanceBy(250);
      after6 = await ephemeralBadge.first().innerText();
    }
    expect(after6 !== before6, `[${skin}] le minuteur éphémère décroît (${before6} → ${after6})`);
    await chrono.advanceBy(2 * 60 * 1000);
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
      await chrono.advanceBy(250);
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
      await chrono.advanceBy(2600);
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

export async function checkProtectionStates({ browser, BASE, expect }) {
  await runProtectionSuite({ browser, BASE, expect, skin: 'focal' });
  await runProtectionSuite({ browser, BASE, expect, skin: 'bulles' });
}
