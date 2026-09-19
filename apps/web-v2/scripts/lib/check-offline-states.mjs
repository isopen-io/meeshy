/**
 * 1-4 — LES ÉTATS HORS RÉSEAU DU FIL — ceux qu'on oublie parce qu'ils ne sont
 * pas le cas nominal, et qui sont pourtant le cas NOMINAL du réseau visé.
 * EXTRAIT de `check-thread-states.mjs` (#7054) : l'hôte était hors du budget
 * de 1000-1200 lignes (`CLAUDE.md` § Code Style), on extrait AVANT d'ajouter.
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
 *
 * POURQUOI `await-fact.mjs`, JAMAIS `waitForTimeout` (#7054). Aucune horloge
 * truquée n'est en jeu ici (ni `install` ni `setFixedTime`) : les minuteurs de
 * ce contexte sont les VRAIS minuteurs du navigateur, donc `awaitFact` sonde
 * directement, sans passer par `paused-chronology.mjs`. Chaque lecture d'état
 * qui suivait un délai fixe attend désormais le FAIT qu'elle nomme — la
 * constante mesurait la machine, jamais le produit (leçon 590).
 */
import { awaitFact } from './await-fact.mjs';

/**
 * Cliquer une cible qui peut légitimement manquer — parce que le défaut qu'on
 * cherche est justement son absence. On rend `false` plutôt que de laisser
 * Playwright lever : un témoin doit nommer le défaut trouvé, jamais l'endroit
 * où il a buté.
 *
 * `click()` SEUL, plus aucun délai après (#7054) : l'EFFET du clic est
 * attendu par l'APPELANT, sur le fait qu'il nomme — jamais ici, où aucun fait
 * générique ne conviendrait à tous les appels.
 */
const clickIfPresent = async (page, label) => {
  const target = page.getByText(label);
  if ((await target.count()) === 0) return false;
  await target.first().click();
  return true;
};

export async function checkOfflineStates({ browser, BASE, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  // --- 1 : la conversation sans historique.
  const empty = await context.newPage();
  await empty.goto(`${BASE}/c/c-nouvelle`, { waitUntil: 'load' });
  await awaitFact(empty.getByText('Aucun message pour l’instant'));
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

  /* « en ligne, aucun bandeau » est une ABSENCE, qu'aucun délai ne mesure —
     l'assertion suit directement le montage de `main li` (#7054, la ligne
     mesurait la machine : combien de temps la page met à NE PAS afficher un
     bandeau qui n'existe déjà plus depuis le premier rendu). */
  expect(
    (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
    "en ligne, aucun bandeau de coupure",
  );

  await context.setOffline(true);
  await awaitFact(page.locator('[data-sync-pill="offline"]'));
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
  await awaitFact(page.getByText('Non envoyé').first());

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
   *
   * L'ANNONCE EST POSÉE PAR UN EFFET (#7054) — `use-send.ts:162-172` — donc
   * asynchrone par nature : on attend le NŒUD qui porte le texte, jamais un
   * délai après l'envoi.
   */
  await awaitFact(page.locator('.offscreen[aria-live="polite"]').filter({ hasText: /non envoyé/i }));
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
    /**
     * --- 4 : réessayer sans réseau ne promet rien.
     *
     * AUCUN délai après `clickIfPresent` (#7054) : hors ligne, `retrySend`
     * (`src/lib/send/perform-send.ts:387-388`, D-16 « reste en échec, aucun
     * appel ») rend AVANT tout `await` — l'absence de changement est donc
     * déjà vraie dès que `click()` a résolu.
     */
    await clickIfPresent(page, 'Réessayer');
    expect(
      (await page.getByText('Non envoyé').count()) > 0,
      "réessayer TOUJOURS hors ligne laisse le message en échec",
    );

    await context.setOffline(false);
    /* Le fait est la FIN de l'état `offline` de la pastille, jamais
       l'absence de pastille : avec une entrée en échec, `sync-pill.ts`
       bascule vers `failed` (« Envoi échoué »), elle ne disparaît pas. */
    await awaitFact(page.locator('[data-sync-pill="offline"]'), { state: 'detached' });
    expect(
      (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
      "le bandeau disparaît au retour du réseau",
    );
    const clicked = await clickIfPresent(page, 'Réessayer');
    await awaitFact(page.getByText('Non envoyé').first(), { state: 'detached' });
    expect(
      clicked && (await page.getByText('Non envoyé').count()) === 0,
      clicked
        ? "réessayer une fois le réseau revenu retire l'échec"
        : "réessayer une fois le réseau revenu retire l'échec — la bande avait déjà disparu hors ligne",
    );
  }

  await page.close();
  await context.close();
}
