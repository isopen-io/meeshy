import { join } from 'node:path';

import { contrastOf } from './contrast.mjs';
/* L'HORLOGE ÉPINGLÉE (#6130) — voir `instant.mjs`. Ce module partage le corpus
   du fil, donc la même fenêtre de rouge nocturne que son hôte. */
import { pageÀInstantFigé } from './instant.mjs';

/**
 * LA MISE EN ÉVIDENCE D'UN SAUT SE MESURE PAR CONDITION, JAMAIS AU CHRONOMÈTRE
 * (#6115) — `routes/thread.tsx:444` l'efface au bout de **1600 ms**, à dessein
 * (« elle s'efface d'elle-même, jamais un état qui s'accumule sans fin »).
 *
 * Une lecture SYNCHRONE placée derrière un délai fixe plus quelques allers-retours
 * Playwright franchit cette fenêtre sur un runner chargé et rend un fond
 * transparent alors que l'écran a parfaitement sauté : la PR #6079 en a fait les
 * frais sans toucher un seul fichier de `apps/web-v2`, pendant que `dev` restait
 * vert au même contenu. Même loi que l'attente de PEINTURE de `check-media.mjs`
 * (§ « ON ATTEND QUE LA PEINTURE ARRIVE ») — ne jamais confondre un DÉCALAGE
 * avec une ABSENCE d'effet. Citée par son TITRE et non par son numéro de ligne :
 * `check-media.mjs:161` ne désignait plus rien après le lot suivant (#6155), et
 * une citation par numéro ne se vérifie jamais à la lecture.
 *
 * ON ENREGISTRE L'ÉTAT, ON NE LE GUETTE PLUS (revue du 2026-09-12, #6148). Lire
 * en PREMIER et borner SOUS 1600 ms réduisait la course sans la fermer : la borne
 * de 1200 ms court depuis le clic, donc elle suppose que la mise en évidence
 * ARRIVE en moins de 1200 ms. Sur un runner chargé elle arrive plus tard — l'écran
 * a parfaitement sauté, et le témoin a déjà renoncé. Mesuré : VERT sur `dev` à
 * 23:49 (`da280ca2f5`), ROUGE sur le même contenu quelques heures plus tard.
 *
 * Un observateur ARMÉ AVANT le geste convertit un état qui PART en un fait qui
 * EST ARRIVÉ : il note la transition au moment où elle se produit, et l'on peut
 * alors attendre ce FAIT aussi longtemps qu'on veut — l'effacement à 1600 ms ne
 * l'efface plus. C'est ce qui renverse la règle de bornage : la générosité
 * devient sûre parce que la cible ne peut plus disparaître.
 *
 * Le fond est posé en style INLINE sur la rangée (`focal-row.tsx:508`,
 * `backgroundColor: highlighted ? … : …`), d'où `attributeFilter: ['style']` ;
 * `childList` couvre le cas où un rendu REMPLACE le nœud plutôt que de le muter.
 *
 * Les deux sorties du Résumé qui SAUTENT — le visage et l'épisode — s'arment
 * avant leur clic ; l'expression du fond n'est écrite qu'ici.
 */
async function armHighlightRecorder(page) {
  await page.evaluate(() => {
    /* L'EXPRESSION DU FOND, écrite UNE fois — et écrite ICI, dans la page, parce
       qu'une fonction ne se sérialise pas jusqu'à `evaluate`. La passer en CHAÎNE
       à `new Function` marcherait et serait un mauvais motif : une expression
       reconstruite depuis du texte ne se relit pas, ne se type pas, et invite
       l'interpolation le jour où quelqu'un voudra la paramétrer. */
    const voit = () =>
      [...document.querySelectorAll('main li [data-reading-mode]')].some((row) => {
        const bg = getComputedStyle(row).backgroundColor;
        return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      });

    const état = { vu: false, observateur: null };
    window.__miseEnEvidence = état;
    if (voit() === true) {
      état.vu = true;
      return;
    }
    état.observateur = new MutationObserver(() => {
      if (voit() === true) {
        état.vu = true;
        état.observateur?.disconnect();
      }
    });
    état.observateur.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: true,
      subtree: true,
    });
  });
}

/** Attend le FAIT enregistré — borne généreuse, puisque le fait ne s'efface pas. */
async function highlightWasRecorded(page) {
  return page
    .waitForFunction(() => window.__miseEnEvidence?.vu === true, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * LE RÉSUMÉ VIVANT, SECTION 14 DU GATE DE MODE DE LECTURE (#5695) — EXTRAIT
 * de `check-reading-mode.mjs` (revue #5695).
 *
 * Le fichier hôte portait 1 278 lignes AVANT ce lot, déjà au-dessus du budget
 * de 1 000-1 200 (`CLAUDE.md` § Code Style) ; y ajouter 265 lignes l'aurait
 * porté à 1 552. La règle est explicite — « ajouter à un fichier déjà hors
 * budget est interdit : on extrait d'abord, on ajoute ensuite » — et elle vaut
 * pour toute source écrite à la main, un gate `.mjs` compris.
 *
 * Découpé PAR RESPONSABILITÉ (une section du gate, la seule qui parle du
 * Résumé Vivant), jamais par tranche : l'hôte garde son serveur, son
 * navigateur, son compteur de défauts, et ne remet ici que ce que cette
 * section lit.
 *
 * `expect` et `setScheme` sont REMIS par l'hôte plutôt que redéfinis : deux
 * compteurs de défauts rendraient un gate vert avec des échecs dedans, et deux
 * poses de schéma divergeraient à la première correction de l'une.
 */
export async function checkLivingSummary({ browser, BASE, CAPTURES, setScheme, expect, AA_THRESHOLD }) {
  /**
   * --- 14 : LE RÉSUMÉ VIVANT (#5695) — `/c/c-rattrapage`, le SEUL corpus du
   * jeu qui ATTEINT `summary` (26 non-lus > 25, D-21). Sombre puis clair.
   */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setScheme(context, 'dark');
    const page = await pageÀInstantFigé(context);
    await page.goto(`${BASE}/c/c-rattrapage`, { waitUntil: 'load' });
    await page.waitForSelector('main [data-summary]');
    await page.waitForTimeout(200);

    // --- 14.1 : la puce dit AUTO + Résumé.
    const chip = page.getByRole('button', { name: 'Mode de lecture : Résumé' });
    expect((await chip.count()) > 0, 'la puce nomme « Résumé »');
    expect((await chip.textContent())?.includes('AUTO') === true, 'la puce porte le préfixe AUTO (élue par la loi, pas un choix collant)');

    // --- 14.2 : aucune rangée plate ni bulle — la scène est INERTE en summary.
    expect((await page.locator('main [data-summary]').count()) === 1, 'main [data-summary] est monté');
    expect((await page.locator('main li [data-reading-mode]').count()) === 0, 'aucune rangée plate en mode summary');
    expect((await page.locator('.rounded-bubble').count()) === 0, 'aucune bulle en mode summary');

    /*
      --- 14.2 bis : LE COMPOSEUR NE SE MONTE JAMAIS EN RÉSUMÉ
      (revue-correction #5813, défaut BLOQUANT 4). Avant ce correctif, le
      composeur restait monté SOUS le Résumé : un envoi y partait, la
      passerelle confirmait, mais l'écran Résumé ne rend AUCUNE rangée de
      message (14.2, juste au-dessus) — le message publié n'était visible
      NULLE PART avant le prochain chargement complet du fil. Miroir du
      recouvrement iOS : `LivingSummaryHost` est posé à `zIndex(80)`,
      AU-DESSUS du composeur (`zIndex(60)`,
      `ConversationView.swift:1409-1418, 1516, 1967`).
    */
    expect(
      (await page.getByLabel('Écrire un message').count()) === 0,
      'en Résumé, aucun champ de saisie n’est atteignable — le composeur ne se monte pas',
    );
    expect(
      (await page.getByLabel('Envoyer').count()) === 0,
      'en Résumé, aucun bouton d’envoi n’est atteignable',
    );

    // --- 14.3 : en-tête du Résumé — comptes ET ligne partielle.
    const h2 = await page.locator('[data-summary] h2').first().textContent();
    expect((h2 ?? '').trim() === 'Résumé Vivant', `le titre est « Résumé Vivant » (lu : ${JSON.stringify(h2)})`);
    const summaryText = (await page.locator('[data-summary]').first().textContent()) ?? '';
    expect(/messages? ·/.test(summaryText), 'la ligne de comptes « N messages · P personnes » est rendue');
    expect(summaryText.includes('Sur les') && summaryText.includes('derniers messages'), 'la ligne partielle « Sur les N derniers messages » est rendue (la fenêtre de rattrapage est déclarée PARTIELLE)');

    // --- 14.4 : au moins deux épisodes, chacun titré « … · N messages ».
    const episodeCount = await page.locator('[data-episode]').count();
    expect(episodeCount >= 2, `au moins deux épisodes sont rendus (${episodeCount} trouvés)`);
    for (let i = 0; i < episodeCount; i += 1) {
      const text = (await page.locator('[data-episode]').nth(i).textContent()) ?? '';
      expect(text.includes('·'), `l'épisode #${i} porte un titre « … · N messages » (lu : ${JSON.stringify(text)})`);
    }

    // --- 14.5 : la Rampe — Amina en tête, badge affiché, JAMAIS le score.
    const faceCount = await page.locator('[data-face-ramp] [data-face]').count();
    expect(faceCount >= 1, `au moins un visage dans la Rampe (${faceCount} trouvés)`);
    const firstFaceUser = await page.locator('[data-face-ramp] [data-face]').first().getAttribute('data-user');
    expect(firstFaceUser === 'u-amina', `le premier visage de la Rampe est Amina (lu : ${firstFaceUser})`);
    const rampText = (await page.locator('[data-face-ramp]').first().textContent()) ?? '';
    expect(!/\d\.\d/.test(rampText), `aucun score (needScore) n'est écrit dans la Rampe — seul le compte affiché (badge) l'est (lu : ${JSON.stringify(rampText)})`);

    // --- 14.6 : SORTIE 1 — tap d'un visage ⇒ script + saut + citation pré-adressée.
    /*
      L'ÉVIDENCE S'ENREGISTRE AVANT LE GESTE (#6115, puis #6148) — sa fenêtre de
      1600 ms se fermait pendant que les autres mesures de cette sortie
      s'exécutaient. La lire en PREMIER (#6115) a réduit la course sans la
      fermer : la borne courait depuis le clic, donc elle supposait une arrivée
      en moins de 1200 ms. L'observateur est armé AVANT le clic, et l'on attend
      ensuite un FAIT qui ne s'efface plus.
    */
    await armHighlightRecorder(page);
    await page.locator('[data-face-ramp] [data-face]').first().click();
    const highlightedAfterFace = await highlightWasRecorded(page);
    expect(highlightedAfterFace, 'sortie « visage » : une rangée est mise en évidence (même mesure que le défaut 10)');
    await page.waitForTimeout(300);
    expect((await page.locator('main li [data-reading-mode="script"]').count()) > 0, 'sortie « visage » : le fil rend la rangée plate SCRIPT');
    const chipAfterFace = await page.getByRole('button', { name: /Mode de lecture/ }).textContent();
    expect(chipAfterFace?.includes('AUTO') === false, 'sortie « visage » : la puce ne porte plus AUTO (choix collant)');
    expect(chipAfterFace?.includes('Script') === true, 'sortie « visage » : la puce dit Script');
    expect((await page.locator('[data-composer-reply]').count()) === 1, 'sortie « visage » : le composeur affiche la citation pré-adressée');
    /*
      LE PRISME VOYAGE AVEC SA LANGUE (revue #5695) — l'extrait est servi par
      `served()`, donc il peut être dans une langue AUTRE que celle du document :
      sans `lang`, un lecteur d'écran le prononce avec la voix du document.
      `bubble.tsx` et `focal-row.tsx` posent déjà cet attribut.
    */
    const quotedLang = await page.evaluate(() => {
      const node = document.querySelector('[data-composer-reply] [lang]');
      return node ? node.getAttribute('lang') : null;
    });
    expect(
      quotedLang !== null && quotedLang.length > 0,
      `sortie « visage » : la citation DIT la langue dans laquelle elle est servie (lu : ${JSON.stringify(quotedLang)})`,
    );

    // --- 14.7 : retour au Résumé par le menu, puis SORTIE 2 (épisode) et SORTIE 3 (reprendre le fil).
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    const summaryRowActive = page.getByRole('menuitemradio', { name: /Résumé/ });
    expect((await summaryRowActive.count()) === 1, 'la ligne « Résumé » du menu existe');
    await summaryRowActive.click();
    await page.waitForTimeout(300);
    expect((await page.locator('main [data-summary]').count()) === 1, 'le menu ramène au Résumé Vivant');

    // MÊME FENÊTRE FUGACE QUE LA SORTIE « visage » (#6115, puis #6148) :
    // l'épisode saute aussi, donc met aussi en évidence, donc courait aussi
    // contre les 1600 ms. Elle était un aller-retour plus près de la limite —
    // jamais tombée, mais du même défaut, et une seule loi les couvre. Elle
    // s'arme donc avant son clic, comme l'autre.
    await armHighlightRecorder(page);
    await page.locator('[data-episode]').first().click();
    const highlightedAfterEpisode = await highlightWasRecorded(page);
    expect(highlightedAfterEpisode, 'sortie « épisode » : une rangée est mise en évidence');
    await page.waitForTimeout(300);
    expect((await page.locator('main li [data-reading-mode="script"]').count()) > 0, 'sortie « épisode » : le fil rend la rangée plate SCRIPT');

    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /Résumé/ }).click();
    await page.waitForTimeout(300);
    const resumeButton = page.getByRole('button', { name: 'Reprendre le fil, retourner à la conversation' });
    expect((await resumeButton.count()) === 1, 'le bouton « Reprendre le fil » est rendu, nommé en entier');
    await resumeButton.click();
    await page.waitForTimeout(300);
    expect((await page.locator('main li [data-reading-mode="script"]').count()) > 0, 'sortie « Reprendre le fil » : le fil rend la rangée plate SCRIPT');
    const firstOtherVisible = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('main li [data-reading-mode]')];
      return rows.length > 0;
    });
    expect(firstOtherVisible, 'sortie « Reprendre le fil » : le premier message d’un autre est visible dans le fil');

    // --- 14.8 : Automatique ⇒ la puce redit « AUTO Résumé ».
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitem', { name: 'Automatique' }).click();
    await page.waitForTimeout(300);
    const chipAfterAuto = await page.getByRole('button', { name: /Mode de lecture/ }).textContent();
    expect(chipAfterAuto?.includes('AUTO') === true && chipAfterAuto?.includes('Résumé') === true, `« Automatique » redonne la main à la loi, qui réélit Résumé (lu : ${JSON.stringify(chipAfterAuto)})`);

    // --- 14.9 : clavier — Tab jusqu'au premier visage, Entrée a le MÊME effet que le clic.
    await page.waitForSelector('[data-face-ramp] [data-face]');
    await page.evaluate(() => {
      const face = document.querySelector('[data-face-ramp] [data-face]');
      face?.focus();
    });
    const focusedIsFace = await page.evaluate(
      () => document.activeElement === document.querySelector('[data-face-ramp] [data-face]'),
    );
    expect(focusedIsFace, 'le premier visage de la Rampe est FOCALISABLE (bouton natif)');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    expect((await page.locator('main li [data-reading-mode="script"]').count()) > 0, 'Entrée sur le visage focalisé a le MÊME effet que le clic (script rendu)');

    // --- 14.11 : cibles ≥ 44 px — visages, épisodes, « Reprendre le fil ».
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.waitForTimeout(150);
    await page.getByRole('menuitemradio', { name: /Résumé/ }).click();
    await page.waitForTimeout(300);
    const targetHeights = await page.evaluate(() => {
      const heights = (selector) => [...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect().height);
      return {
        faces: heights('[data-face-ramp] [data-face]'),
        episodes: heights('[data-episode]'),
        resume: heights('button[aria-label="Reprendre le fil, retourner à la conversation"]'),
      };
    });
    for (const [name, heights] of Object.entries(targetHeights)) {
      expect(
        heights.length > 0 && heights.every((h) => h >= 44),
        `« ${name} » mesure au moins 44 px de haut (${JSON.stringify(heights)})`,
      );
    }

    /*
      --- 14.12 : contraste de la ligne partielle, SCHÉMA SOMBRE — même barre AA
      que la citation.

      LE SÉLECTEUR EST NOMMÉ, PAS POSITIONNEL (revue #5695). Il valait
      `[data-summary] p`, donc `querySelector` rendait le PREMIER `p` — la ligne
      de COMPTES (encre neutre à 0,7, mesurée 8,79:1), jamais la ligne partielle
      que ce témoin prétend mesurer. Le témoin ne pouvait donc pas tomber sur ce
      qu'il nommait, et il cachait le défaut réel : `indigo500` en texte de 12 px
      valait 4,45:1 en sombre et 4,47:1 en clair — SOUS la barre. `data-partial-window`
      est le repère de la ligne elle-même.
    */
    const partialSelector = '[data-summary] [data-partial-window]';
    expect((await page.locator(partialSelector).count()) === 1, 'la ligne partielle porte son repère [data-partial-window]');
    const partialContrastDark = await contrastOf(page, partialSelector);
    expect(
      partialContrastDark !== null && partialContrastDark >= AA_THRESHOLD,
      `« Sur les N derniers messages » tient la barre AA en SOMBRE (${partialContrastDark}:1)`,
    );

    // --- 14.12 bis : « Reprendre le fil » est POSÉ EN BAS (iOS : VStack { Spacer(); … }).
    const resumeAnchor = await page.evaluate(() => {
      const main = document.querySelector('main');
      const btn = document.querySelector('button[aria-label^="Reprendre le fil"]');
      if (!main || !btn) return null;
      return Math.round(main.getBoundingClientRect().bottom - btn.getBoundingClientRect().bottom);
    });
    expect(
      resumeAnchor !== null && resumeAnchor <= 32,
      `« Reprendre le fil » est collé au BAS de la zone de lecture, jamais laissé au milieu du vide (${resumeAnchor} px sous le bouton)`,
    );

    // --- 14.13 : arbre d'accessibilité — noms REPÈRES présents (structure, jamais les nombres — le corpus web diffère du corpus iOS de la cible).
    /*
      LES DESCRIPTIONS COMPTENT (revue #5695) — l'indice d'un épisode
      (« Ouvre les messages de cet épisode ») voyage par `aria-describedby`,
      jamais par le texte du bouton. Ne collecter que `aria-label`/`textContent`
      obligeait le motif à s'écrire en ALTERNATIVE avec « · », ce qui le rendait
      vrai par le seul titre : un repère qui ne peut pas manquer ne prouve rien.
    */
    const a11yNames = await page.evaluate(() => {
      const described = (el) =>
        (el.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');
      return [...document.querySelectorAll('[aria-label], [aria-describedby], h1, h2, h3, p, button')]
        .flatMap((el) => [el.getAttribute('aria-label') ?? el.textContent ?? '', described(el)])
        .map((s) => s.trim())
        .filter(Boolean);
    });
    const landmarks = [
      /Retour/,
      /Rechercher dans la conversation/,
      /Mode de lecture/,
      /Résumé Vivant/,
      /messages? ·/,
      /Ce qui s'est passé|Ce qui s’est passé/,
      /Ouvre les messages de cet épisode/,
      /Reprendre le fil, retourner à la conversation/,
    ];
    for (const pattern of landmarks) {
      expect(
        a11yNames.some((n) => pattern.test(n)),
        `l'arbre d'accessibilité porte un nom repère de la cible ${pattern} (targets/thread.summary.dark.a11y.txt)`,
      );
    }

    // --- 14.14 : capture sombre.
    await page.screenshot({ path: join(CAPTURES, 'thread-summary-dark.png') });

    await context.close();
  }

  /**
   * --- 14 (suite) : SCHÉMA CLAIR — capture + contraste AA de la ligne
   * partielle (même barre que le sombre ci-dessus, D-4 interdisant de
   * corriger la couleur ici si elle tombait sous AA).
   */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setScheme(context, 'light');
    const page = await pageÀInstantFigé(context);
    await page.goto(`${BASE}/c/c-rattrapage`, { waitUntil: 'load' });
    await page.waitForSelector('main [data-summary]');
    await page.waitForTimeout(200);

    const partialContrastLight = await contrastOf(page, '[data-summary] [data-partial-window]');
    expect(
      partialContrastLight !== null && partialContrastLight >= AA_THRESHOLD,
      `« Sur les N derniers messages » tient la barre AA en CLAIR (${partialContrastLight}:1) — si ROUGE, D-4 interdit d'inventer une couleur ici : servir un jeton GÉNÉRÉ qui passe (comme --color-day-ink), ou ouvrir l'issue MeeshyColors (comme #5625) — jamais baisser le seuil`,
    );

    await page.screenshot({ path: join(CAPTURES, 'thread-summary-light.png') });
    await context.close();
  }

  /**
   * --- 14.10 : HORS LIGNE — le digest est LOCAL, il reste affiché ; et la
   * coupure est ANNONCÉE.
   *
   * L'annonce ne vient plus d'un bandeau dans l'en-tête du fil (retiré #6080 :
   * il ne disait rien qu'un écran voisin ne disait autrement) mais de la
   * PASTILLE de synchronisation de la coquille, identique sur tous les écrans.
   * Ce témoin n'a pas changé de propriété pour autant — « hors ligne, quelque
   * chose le dit » — et c'est lui qui a attrapé le piège : chargée
   * paresseusement, la pastille allait chercher son chunk SUR LE RÉSEAU au
   * moment précis où il n'y en a plus (`net::ERR_INTERNET_DISCONNECTED`,
   * `Suspense` jamais résolu, `fallback={null}` — donc rien à l'écran, et
   * aucune erreur). Elle est désormais préchargée pendant qu'on est en ligne.
   */
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setScheme(context, 'dark');
    const page = await pageÀInstantFigé(context);
    await page.goto(`${BASE}/c/c-rattrapage`, { waitUntil: 'load' });
    await page.waitForSelector('main [data-summary]');
    await context.setOffline(true);
    await page.waitForTimeout(200);
    expect((await page.locator('main [data-summary]').count()) === 1, 'hors ligne : le Résumé Vivant reste rendu (le digest est LOCAL)');
    expect((await page.locator('text=Hors ligne').count()) > 0, 'hors ligne : le bandeau de coupure est présent');
    await context.setOffline(false);
    await context.close();
  }
}
