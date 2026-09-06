import { expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { MOT_DE_PASSE_DU_BOUCHON } from './lib/bouchon-compte';
import {
  CONVERSATION_DU_LECTEUR,
  messagesRiches,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LES QUATRE RÉGLAGES-DÉTAILS, SUR LA CHAÎNE RÉELLE — ce que le rapport de
 * revue nommait « jamais REGARDÉ » (défaut 1) : l'EFFET de
 * `document.autoDownloadEnabled` sur la galerie (assertion CDP, critère de
 * fin de `detail-media`), le rendu du `<details>` d'édition DND
 * (`detail-notification`), et le tour complet confidentialité / export /
 * suppression (`detail-privacy`).
 *
 * `__tests__/reglages-details-{vue,porte}.test.ts` jugent déjà chaque
 * document et chaque décision de porte dans jsdom, avec un `recuperer`
 * bouchonné en mémoire — ce fichier les rejoue sur la CHAÎNE (passerelle de
 * bouchon RÉELLE, artefact `next build` RÉEL), la seule façon de mesurer un
 * OCTET transféré.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-reglages-details.spec.ts --project=chaines';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  messagesRiches(CONVERSATION_DU_LECTEUR.id).forEach((message) => passerelle.ajouteUnMessage(message));
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(({}, testInfo) => {
  passerelle.oublie();
  testInfo.annotations.push({ type: 'commande', description: COMMANDE });
});

const contexteDuMembre = async (navigateur: Browser, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext(options);
  await contexte.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return contexte;
};

const adresseDesMedias = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}/medias`;

/** Les requêtes CDP vers UN chemin donné — la même technique que `v3-medias.spec.ts` › `compteLesOctetsDeMedia`. */
const compteLesRequetesVers = async (page: Page, fragment: string): Promise<{ readonly nombre: () => number }> => {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const vues: string[] = [];
  cdp.on('Network.requestWillBeSent', ({ request }) => {
    if (request.url.includes(fragment)) vues.push(request.url);
  });
  return { nombre: () => vues.length };
};

test.describe('detail-media — le réglage a un EFFET observable sur la galerie', () => {
  test('« jamais » (le défaut du schéma) : 0 requête vers la vignette', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const compteur = await compteLesRequetesVers(page, 'tableau-thumb.jpg');

    await page.goto(adresseDesMedias(), { waitUntil: 'load' });
    await expect(page.locator('li[data-piece="ar1"] .vignette img')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(compteur.nombre()).toBe(0);

    await contexte.close();
  });

  test('« automatique » : la tuile d’image rend sa vignette et le navigateur la demande', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();

    // Le geste RÉEL : le commutateur de `/settings/media/document`, jamais un
    // état injecté par-dessous — c'est CE POST que le critère de fin nomme.
    await page.goto(`${v3.base}/settings/media/document`, { waitUntil: 'load' });
    await expect(page.locator('button.commutateur')).toHaveAttribute('aria-checked', 'false');
    await page.locator('button.commutateur').click();
    await expect(page).toHaveURL(`${v3.base}/settings/media/document?regle`);
    await expect(page.locator('button.commutateur')).toHaveAttribute('aria-checked', 'true');

    const compteur = await compteLesRequetesVers(page, 'tableau-thumb.jpg');
    await page.goto(adresseDesMedias(), { waitUntil: 'load' });

    await expect(page.locator('li[data-piece="ar1"] .vignette img')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(compteur.nombre()).toBeGreaterThanOrEqual(1);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('tableau-thumb.jpg'))).not.toEqual([]);

    await contexte.close();
  });
});

test.describe('detail-notification — la fenêtre DND s’édite, pas seulement une valeur', () => {
  test('modifier l’heure et le fuseau les PERSISTE, relus au chargement suivant', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/notifications/preferences`, { waitUntil: 'load' });
    const details = page.locator('details.fenetre-edition');
    await expect(details).toBeVisible();
    await details.locator('summary').click();

    await page.locator('#dnd-debut').fill('23:00');
    await page.locator('#dnd-fin').fill('07:00');
    await page.locator('#dnd-fuseau').selectOption('0');
    await page.locator('details.fenetre-edition button[type="submit"]').click();

    await expect(page).toHaveURL(`${v3.base}/notifications/preferences?regle=fenetre-dnd`);

    // RELU DU SERVEUR — un rechargement SANS JavaScript prouve que la valeur
    // est bien écrite côté passerelle, pas seulement reposée par le formulaire.
    await page.goto(`${v3.base}/notifications/preferences`, { waitUntil: 'load' });
    await page.locator('details.fenetre-edition summary').click();
    await expect(page.locator('#dnd-debut')).toHaveValue('23:00');
    await expect(page.locator('#dnd-fin')).toHaveValue('07:00');

    await contexte.close();
  });

  /**
   * UNE HEURE ILLISIBLE SE DIT, ELLE NE REND PAS UN ÉCRAN BLANC (§ doc-comment
   * de `prefs-porte.ts` › geste `fenetre`) — posté directement en `fetch`, pas
   * via `<input type="time">` : un navigateur RÉEL normalise ou refuse toute
   * saisie qui ne respecte pas son propre format avant même la soumission,
   * ce que `.fill('9:00')` ne peut pas contourner sur un `<input>` natif —
   * seul un POST brut atteint la porte avec un corps que la RegExp refuse.
   */
  test('une heure hors format se dit, et ne rend pas un écran blanc', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications/preferences`, { waitUntil: 'load' });

    const reponse = await page.request.post(`${v3.base}/notifications/preferences`, {
      form: { geste: 'fenetre', dndStartTime: '9:00', dndEndTime: '08:00', fuseau: 'auto' },
    });
    expect(reponse.status()).toBe(422);
    const corps = await reponse.text();
    expect(corps).toContain('main');
    expect(corps).toMatch(/role="alert"/);

    await contexte.close();
  });
});

test.describe('detail-privacy — bascule, export, suppression', () => {
  test('une bascule de confidentialité MUTE et se RELIT du serveur', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/settings/privacy`, { waitUntil: 'load' });
    // `showTypingIndicator` naît VRAI (`PRIVACY_PREFERENCE_DEFAULTS`, le
    // schéma) — le seul des quatre bascules exposées dont le défaut est
    // ACTIVÉ, ce qui rend ce témoin distinct des trois autres.
    const interrupteur = page.locator('form:has(input[name="cle"][value="showTypingIndicator"]) button.commutateur');
    await expect(interrupteur).toHaveAttribute('aria-checked', 'true');
    await interrupteur.click();

    await expect(page).toHaveURL(`${v3.base}/settings/privacy?regle=showTypingIndicator`);
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false');

    await page.goto(`${v3.base}/settings/privacy`, { waitUntil: 'load' });
    await expect(interrupteur).toHaveAttribute('aria-checked', 'false');

    await contexte.close();
  });

  test('exporter mes données télécharge une pièce jointe JSON réelle', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/settings/privacy/export`, { waitUntil: 'load' });

    const [telechargement] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button.action.primaire').click(),
    ]);
    expect(telechargement.suggestedFilename()).toBe('meeshy-export.json');
    const chemin = await telechargement.path();
    expect(chemin).not.toBeNull();

    await contexte.close();
  });

  test('un mot de passe invalide REFUSE, nomme le motif, et garde la phrase tapée', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/settings/privacy/delete`, { waitUntil: 'load' });

    await page.locator('#phrase').fill('SUPPRIMER MON COMPTE');
    await page.locator('#motdepasse').fill('un-mauvais-mot-de-passe');
    await page.locator('button.action.attention').click();

    await expect(page.locator('.avis[role="alert"]')).toContainText('mot de passe est incorrect');
    await expect(page.locator('#phrase')).toHaveValue('SUPPRIMER MON COMPTE');
    await expect(page.locator('#motdepasse')).toHaveValue('');

    await contexte.close();
  });

  test('le bon mot de passe DEMANDE la suppression — le compte n’est pas supprimé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/settings/privacy/delete`, { waitUntil: 'load' });

    await page.locator('#phrase').fill('SUPPRIMER MON COMPTE');
    await page.locator('#motdepasse').fill(MOT_DE_PASSE_DU_BOUCHON);
    await page.locator('button.action.attention').click();

    await expect(page.locator('main.reglages')).toContainText('Votre compte n’est pas encore supprimé');
    expect(passerelle.journal.filter((appel) => appel.chemin === '/api/v1/me/account/deletion' && appel.methode === 'POST')).toHaveLength(1);

    await contexte.close();
  });
});
