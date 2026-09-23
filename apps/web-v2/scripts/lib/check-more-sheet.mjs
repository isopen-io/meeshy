/**
 * « PLUS… » OUVRE SA FEUILLE, ET LA FEUILLE POSSÈDE LE RETOUR (#7415).
 *
 * LA SEULE ENTRÉE DU MENU QU'AUCUN TÉMOIN DE NAVIGATEUR N'OUVRAIT. Les § 6.6
 * à 6.10 de `check-thread-states.mjs` couvrent Copier, Traduire, Réagir,
 * Composer et Sélectionner ; « Plus… » manquait — et c'est précisément celle
 * qui a été mesurée INERTE sur staging : le menu se refermait, rien ne
 * s'ouvrait. Un contrôle qui annonce une action qu'il n'accomplit pas est
 * exactement ce que la loi 4 du dépôt interdit, et le § 6.2 (« 0 contrôle du
 * menu sans gestionnaire ») ne pouvait pas le voir : le gestionnaire ÉTAIT
 * là, câblé, appelé. C'est son EFFET qui n'atteignait pas l'écran.
 *
 * LE DÉFAUT VIVAIT DANS L'HISTORIQUE, PAS DANS LE CÂBLAGE. Le menu et la
 * feuille sont deux couches modales, et le clic les échange dans un SEUL
 * commit — qui joue TOUS les nettoyages avant TOUS les effets. Le menu
 * rendait donc son entrée (`history.back()`) juste avant que la feuille ne
 * pose la sienne ; or le navigateur ne dispatche pas `popstate` pendant
 * `history.back()`, il le POSTE (HTML, « traverse the history by a delta »).
 * Le retour arrivait quand la feuille était seule à l'écouter, et c'est elle
 * qu'il fermait. `use-back-dismiss.ts` § « une couche qui en remplace une
 * autre adopte son entrée » le corrige ; ce fichier est ce qui l'EMPÊCHE de
 * revenir.
 *
 * POURQUOI CE TÉMOIN EST DANS LE NAVIGATEUR, ALORS QUE DEUX TÉMOINS
 * UNITAIRES DISENT DÉJÀ LA MÊME PHRASE (`use-back-dismiss.test.tsx`,
 * `message-detail-handoff.test.tsx`). Pour deux raisons qu'aucun d'eux ne
 * peut lever :
 *
 *   1. ils SIMULENT le report du `popstate` — happy-dom le dispatche
 *      SYNCHRONEMENT, ce qui fait disparaître la fenêtre où le défaut vit ;
 *      un témoin qui doit fabriquer la condition du défaut ne prouve pas que
 *      le navigateur la produit encore ainsi ;
 *   2. `bun test` n'applique aucun alias : ils tournent sur React 19, quand
 *      le dist SERVI est compilé sur `preact/compat` (`vite.config.ts`
 *      § runtime, valeur par défaut). Deux runtimes, deux ordonnancements de
 *      nettoyage, d'effet de mise en page et de micro-tâche — le vert de l'un
 *      ne dit rien de l'autre.
 *
 * Ici, ni simulation ni jumeau de runtime : c'est Chromium qui poste son
 * `popstate`, et c'est le bundle LIVRÉ qui l'écoute.
 *
 * TROIS FAITS, PAS UN. « La feuille s'ouvre » n'est qu'un tiers du critère.
 * Une feuille qui s'ouvre sans POSSÉDER l'entrée d'historique courante rend
 * le retour au fil : le geste suivant quitte l'écran au lieu de fermer la
 * couche — un défaut que le symptôme visible ne montre pas, et que seule une
 * mesure de l'historique attrape. On vérifie donc qu'elle s'ouvre, qu'elle
 * TIENT une fois le retour du menu arrivé, qu'elle possède l'entrée, et
 * qu'un retour matériel la ferme SANS quitter le fil.
 */

import { awaitFact } from './await-fact.mjs';

/**
 * LA FENÊTRE DU DÉFAUT, ATTENDUE PAR SA MÉCANIQUE — pas par un délai.
 *
 * Le `popstate` d'un `history.back()` est POSTÉ : il est livré à une tâche
 * suivante, avant la prochaine peinture. Deux images encadrant une tâche
 * laissent donc passer la fenêtre ENTIÈRE. Ce n'est pas un temps d'attente
 * arbitraire (que #7054 a banni de ce gate) : c'est la fenêtre elle-même,
 * exprimée par les tours du navigateur qui la bornent. Et elle ne peut pas
 * s'écrire en `awaitFact`, parce que le fait à établir est une NON-occurrence
 * — la feuille ne doit RIEN faire.
 */
const letThePostedPopStateLand = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
      }),
  );

const THREAD_PATH = '/c/c-deploiement';

/**
 * Le geste complet, pour UNE porte du menu : ouvrir le menu sur une rangée,
 * franchir la porte, et mesurer les quatre faits. `openLayer` reçoit la page
 * et rend `true` quand la porte a été franchie — rendre `false` PLUTÔT QUE DE
 * LEVER quand l'entrée manque (§ `clickMenuItem` de l'hôte) : un témoin doit
 * nommer le défaut trouvé, jamais mourir dessus.
 */
async function checkHandoff({ page, expect, label, openLayer }) {
  const cluster = page.locator('[role="menu"]');
  const rows = page.locator('[data-row]');
  /* `dialog[open]` et non `dialog` : une `<dialog>` insérée mais pas encore
     modale est `display: none` — présente au DOM, invisible au lecteur. On
     mesure ce qui est VU, pas ce qui est monté. */
  const sheet = page.locator('dialog[open]');

  await rows.nth(0).scrollIntoViewIfNeeded();
  await rows.nth(0).click({ button: 'right' });
  if (!(await awaitFact(cluster))) return expect(false, `le menu s'ouvre avant « ${label} »`);

  if (!(await openLayer(page))) return expect(false, `l'entrée « ${label} » manque au menu`);

  await awaitFact(sheet);
  const opened = expect((await sheet.count()) === 1, `« ${label} » ouvre sa feuille`);
  expect((await cluster.count()) === 0, `« ${label} » : la feuille ouverte, le menu est parti`);
  if (!opened) return false;

  await letThePostedPopStateLand(page);
  expect(
    (await sheet.count()) === 1,
    `« ${label} » : elle RESTE ouverte une fois le retour du menu arrivé (#7415)`,
  );
  expect(
    await page.evaluate(() => typeof history.state?.backDismiss === 'string'),
    `« ${label} » : la feuille possède l'entrée d'historique COURANTE`,
  );

  await page.goBack();
  await awaitFact(sheet, { state: 'detached' });
  expect((await sheet.count()) === 0, `« ${label} » : un retour matériel ferme la feuille`);
  expect(
    new URL(page.url()).pathname === THREAD_PATH,
    `« ${label} » : le retour n'a PAS quitté le fil (${new URL(page.url()).pathname})`,
  );
  return true;
}

export async function checkMoreSheet({ browser, BASE, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}${THREAD_PATH}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');

  await checkHandoff({
    page,
    expect,
    label: 'Plus…',
    openLayer: async (p) => {
      const item = p.locator('.message-menu-list [role="menuitem"]').filter({ hasText: 'Plus…' }).first();
      if ((await item.count()) === 0) return false;
      await item.click();
      return true;
    },
  });

  /**
   * LE JUMEAU, parce que la loi n'a jamais été propre à « Plus… » : toute
   * paire « une couche se ferme, une autre s'ouvre dans le même geste » est
   * exposée au même échange d'entrée. « ＋ Ajouter une réaction » est la
   * seconde porte du menu qui en ouvre une — la mesurer ici est ce qui
   * distingue une garde de la RÈGLE d'une garde du SYMPTÔME.
   */
  await checkHandoff({
    page,
    expect,
    label: '＋ Ajouter une réaction',
    openLayer: async (p) => {
      const rail = p.locator('[role="group"][aria-label="Réagir"] [role="menuitem"]');
      if ((await rail.count()) === 0) return false;
      await rail.last().click();
      return true;
    },
  });

  await page.close();
  await context.close();
}
