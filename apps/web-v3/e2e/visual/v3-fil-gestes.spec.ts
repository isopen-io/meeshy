import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { ciblesMesurees, ciblesTropPetites, LARGEURS, TARGET_MIN } from './lib/cibles';
import { CONVERSATION_DU_LECTEUR, passerelleDeBouchon, RACINE_V3, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * RÉPONDRE, MODIFIER, RETIRER (issue #5163, § 12.10.1) — sur la chaîne réelle :
 * le serveur de la v3 tel que `next build` l'a émis, la passerelle de bouchon
 * qui MIME `PUT`/`DELETE /api/v1/messages/:id` et `POST …/messages` avec son
 * `replyToId`, et le bouchon socket qui rejoue `message:edit` /
 * `message:delete` et diffuse `message:edited` / `message:deleted`.
 *
 * Les DEUX chemins, dans cet ordre : le formulaire SANS JavaScript — celui qui
 * marche partout et qui reste la vérité — puis le module, qui doit faire la
 * MÊME chose sans rechargement.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-fil-gestes.spec.ts';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;
const CHEMIN_DES_MESSAGES = `/api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`;

const contexteDuMembre = async (navigateur: Browser, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext(options);
  await contexte.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return contexte;
};

const ouvreLeFil = async (contexte: BrowserContext, suffixe = ''): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(`${FIL()}${suffixe}`, { waitUntil: 'load' });
  return page;
};

const attendLeTempsReel = async (page: Page): Promise<void> => {
  await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
};

/** Le menu d'une ligne — `<details>` fermé par défaut : on l'ouvre comme un doigt l'ouvre. */
const ouvreLeMenu = async (page: Page, id: string) => {
  const menu = page.locator(`li[data-id="${id}"] details.actions`);
  await menu.locator('summary').click();
  return menu;
};

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.oublie();
  passerelle.remets();
});

test.describe('sans JavaScript — le formulaire fait les trois gestes', () => {
  test('répondre : POST avec replyToId, puis la citation SAUTE vers le message visé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    // Le menu d'une ligne d'AUTRUI n'offre que « Répondre » (régime de la § 2).
    const menu = await ouvreLeMenu(page, 'm1');
    await expect(menu.locator('button[name="repondre"]')).toBeVisible();
    await expect(menu.locator('button[name="modifier"]')).toHaveCount(0);
    await expect(menu.locator('button[name="retirer"]')).toHaveCount(0);

    await menu.locator('button[name="repondre"]').click();
    await expect(page).toHaveURL(new RegExp(`\\?repondre=m1$`));

    // Le composeur est ARMÉ par le SERVEUR : le bandeau porte la citation, et
    // son aperçu est le texte LU (le Prisme du lecteur), pas l'original.
    const bandeau = page.locator('#contexte-du-composeur');
    await expect(bandeau).toBeVisible();
    await expect(bandeau.locator('li.citation .apercu')).toHaveText('On se cale à 15 h pour la revue ?');

    await page.locator('#champ-texte').fill('Ça marche pour 15 h.');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url().startsWith(FIL())),
      page.locator('button.envoyer').click(),
    ]);

    const envoi = passerelle.journal.find((a) => a.methode === 'POST' && a.chemin === CHEMIN_DES_MESSAGES);
    expect(envoi, `aucun POST observé — ${COMMANDE}`).toBeDefined();
    expect(JSON.parse(envoi!.corps).replyToId).toBe('m1');

    // La page RELUE porte la bulle avec sa citation, et le saut mène à la cible.
    const neuve = page.locator('li.ligne').first();
    await expect(neuve.locator('.texte')).toHaveText('Ça marche pour 15 h.');
    const saut = neuve.locator('li.citation a.saut');
    await expect(saut).toHaveAttribute('href', '#m-m1');
    await saut.click();
    await expect(page.locator('li[data-id="m1"]')).toHaveClass(/ligne/);
    expect(page.url()).toMatch(/#m-m1$/);

    await contexte.close();
  });

  test('modifier : PUT observé, et la bulle relue porte « modifié »', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    const menu = await ouvreLeMenu(page, 'm4');
    await expect(menu.locator('button[name="modifier"]')).toBeVisible();
    await menu.locator('button[name="modifier"]').click();
    await expect(page).toHaveURL(new RegExp(`\\?modifier=m4$`));

    // Le champ porte l'ORIGINAL, jamais une traduction ; aucun trombone.
    await expect(page.locator('#champ-texte')).toHaveValue('Parfait, je crée le lien pour Marta.');
    await expect(page.locator('form.composeur label.joindre')).toHaveCount(0);

    await page.locator('#champ-texte').fill('Parfait, je crée le lien pour Marta et Ibrahim.');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url().startsWith(FIL())),
      page.locator('button.envoyer').click(),
    ]);

    const mutation = passerelle.journal.find((a) => a.methode === 'PUT' && a.chemin === '/api/v1/messages/m4');
    expect(mutation, `aucun PUT observé — ${COMMANDE}`).toBeDefined();
    expect(JSON.parse(mutation!.corps).content).toBe('Parfait, je crée le lien pour Marta et Ibrahim.');
    expect(mutation!.statut).toBe(200);

    const bulle = page.locator('li[data-id="m4"]');
    await expect(bulle.locator('.texte')).toHaveText('Parfait, je crée le lien pour Marta et Ibrahim.');
    await expect(bulle.locator('.modifie')).toBeVisible();

    await contexte.close();
  });

  test('retirer : DELETE observé, et la bulle relue porte sa mention de retrait', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    const menu = await ouvreLeMenu(page, 'm4');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url().startsWith(FIL())),
      menu.locator('button[name="retirer"]').click(),
    ]);

    const mutation = passerelle.journal.find((a) => a.methode === 'DELETE' && a.chemin === '/api/v1/messages/m4');
    expect(mutation, `aucun DELETE observé — ${COMMANDE}`).toBeDefined();
    expect(mutation!.statut).toBe(200);

    const bulle = page.locator('li[data-id="m4"]');
    await expect(bulle).toHaveClass(/supprime/);
    await expect(bulle.locator('.texte')).toHaveText('Ce message a été supprimé');
    // Une ligne retirée n'offre plus aucun geste.
    await expect(bulle.locator('details.actions')).toHaveCount(0);

    await contexte.close();
  });
});

test.describe('avec JavaScript — les trois gestes, sans rechargement', () => {
  test('répondre : message:send porte replyToId, et la bulle garde sa citation', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm1');
    await menu.locator('button[name="repondre"]').click();

    // L'armement n'est PAS une navigation quand le module est là — et le
    // bandeau porte l'aperçu RÉSOLU, le même texte que la lecture affiche.
    expect(page.url()).toBe(FIL());
    await expect(page.locator('#contexte-du-composeur li.citation .apercu')).toHaveText('On se cale à 15 h pour la revue ?');

    await page.locator('#champ-texte').fill('En direct, avec sa citation.');
    await page.locator('button.envoyer').click();

    await expect
      .poll(() => passerelle.socket.recus.filter((r) => r.evenement === 'message:send').length, { timeout: 15_000, message: COMMANDE })
      .toBe(1);
    const envoye = passerelle.socket.recus.find((r) => r.evenement === 'message:send');
    expect((envoye!.charge as { replyToId?: string }).replyToId).toBe('m1');

    const neuve = page.locator('li.ligne').first();
    await expect(neuve.locator('.texte')).toHaveText('En direct, avec sa citation.');
    await expect(neuve.locator('li.citation')).toHaveAttribute('data-cite', 'm1');

    // Le bandeau se désarme après l'envoi : le message suivant n'est plus une réponse.
    await expect(page.locator('#contexte-du-composeur')).toBeHidden();

    await contexte.close();
  });

  /**
   * LA CITATION EST SUR LA BULLE AVANT L'ACCUSÉ. Le bouchon accuse en une
   * image : pour OBSERVER l'état optimiste, on coupe le réseau — la bulle naît
   * alors sans qu'un octet ne soit parti, ce que la § 12.10.1 demande de voir.
   */
  test('répondre hors ligne : la bulle porte sa citation sans qu’un octet ne parte', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm1');
    await menu.locator('button[name="repondre"]').click();
    await contexte.setOffline(true);

    await page.locator('#champ-texte').fill('Réponse écrite hors ligne.');
    await page.locator('button.envoyer').click();

    const optimiste = page.locator('li.ligne[data-cid]').first();
    await expect(optimiste.locator('.texte')).toHaveText('Réponse écrite hors ligne.');
    await expect(optimiste).toHaveClass(/envoi-(attente|hors-ligne)/);
    await expect(optimiste.locator('li.citation')).toHaveAttribute('data-cite', 'm1');
    await expect(optimiste.locator('li.citation .apercu')).toHaveText('On se cale à 15 h pour la revue ?');
    expect(passerelle.socket.recus.filter((r) => r.evenement === 'message:send')).toEqual([]);
    expect(passerelle.journal.filter((a) => a.methode === 'POST' && a.chemin === CHEMIN_DES_MESSAGES)).toEqual([]);

    await contexte.setOffline(false);
    await contexte.close();
  });

  test('modifier : optimiste, puis confirmé par message:edited du bouchon', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm4');
    await menu.locator('button[name="modifier"]').click();
    expect(page.url()).toBe(FIL());
    await expect(page.locator('#champ-texte')).toHaveValue('Parfait, je crée le lien pour Marta.');

    await page.locator('#champ-texte').fill('Corrigé en direct.');
    await page.locator('button.envoyer').click();

    const bulle = page.locator('li[data-id="m4"]');
    await expect(bulle.locator('.texte')).toHaveText('Corrigé en direct.');
    await expect(bulle).not.toHaveClass(/envoi-attente/, { timeout: 10_000 });

    const edition = passerelle.socket.recus.find((r) => r.evenement === 'message:edit');
    expect(edition, `aucun message:edit observé — ${COMMANDE}`).toBeDefined();
    expect(edition!.charge).toMatchObject({ messageId: 'm4', content: 'Corrigé en direct.' });
    await expect(bulle.locator('.modifie')).toBeVisible();

    await contexte.close();
  });

  test('retirer : optimiste, puis confirmé par message:deleted du bouchon', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm4');
    await menu.locator('button[name="retirer"]').click();

    const bulle = page.locator('li[data-id="m4"]');
    await expect(bulle).toHaveClass(/supprime/);
    await expect(bulle.locator('.texte')).toHaveText('Ce message a été supprimé');
    expect(page.url()).toBe(FIL());

    const retrait = passerelle.socket.recus.find((r) => r.evenement === 'message:delete');
    expect(retrait, `aucun message:delete observé — ${COMMANDE}`).toBeDefined();
    expect(retrait!.charge).toMatchObject({ messageId: 'm4' });

    await contexte.close();
  });

  /**
   * UN REFUS RÉTABLIT LA BULLE. Le scénario est celui de la passerelle RÉELLE :
   * la ligne a disparu côté serveur entre le rendu du document et le geste
   * (`editResult.count === 0`, `MessageHandler.ts:924-927`) — le lecteur, lui,
   * la voit toujours.
   */
  test('un refus rétablit la bulle, dit sa raison, et LAISSE le composeur armé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm4');
    await menu.locator('button[name="modifier"]').click();

    passerelle.retireUnMessage('m4');

    await page.locator('#champ-texte').fill('Une édition que la passerelle refuse.');
    await page.locator('button.envoyer').click();

    const bulle = page.locator('li[data-id="m4"]');
    await expect(bulle.locator('.texte')).toHaveText('Parfait, je crée le lien pour Marta.');
    await expect(page.locator('#refus-du-composeur')).toBeVisible();
    // La raison est TRADUITE (défaut §6) — jamais l'anglais que le bouchon
    // socket sert (« Message not found or you are not authorized to modify it »,
    // le MÊME que la passerelle réelle, `MessageHandler.ts:825`) —, ramenée à
    // la phrase générique déjà servie par le repli réseau (`REFUS_MODIFICATION`,
    // `lib/api/fil.ts`) plutôt qu'une formulation neuve non relue.
    await expect(page.locator('#refus-du-composeur')).toHaveText('Le message n’a pas pu être modifié.');
    // Le texte refusé n'est PAS perdu, et il reste une MODIFICATION : réessayer
    // n'y poste pas un message neuf.
    await expect(page.locator('#champ-texte')).toHaveValue('Une édition que la passerelle refuse.');
    await expect(page.locator('#contexte-du-composeur')).toHaveAttribute('data-genre', 'modification');

    await contexte.close();
  });
});

test.describe('la charte, sur les trois gestes', () => {
  LARGEURS.forEach((largeur) => {
    test(`aucune cible sous ${TARGET_MIN} px, menu OUVERT, à ${largeur} px`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { viewport: { width: largeur, height: 844 } });
      const page = await ouvreLeFil(contexte, '?repondre=m1');

      await ouvreLeMenu(page, 'm4');
      await expect(page.locator('li[data-id="m4"] button[name="retirer"]')).toBeVisible();
      await expect(page.locator('#contexte-du-composeur')).toBeVisible();

      const mesurees = await ciblesMesurees(page);
      expect(mesurees.length, "aucune cible mesurée — le balayage n'a rien vu").toBeGreaterThan(5);
      const petites = ciblesTropPetites(mesurees);
      expect(petites, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(petites)} — ${COMMANDE}`).toEqual([]);

      await contexte.close();
    });
  });

  (['light', 'dark'] as const).forEach((schema) => {
    test(`0 violation axe serious/critical — menu ouvert et composeur armé (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await ouvreLeFil(contexte, '?repondre=m1');
      await ouvreLeMenu(page, 'm4');

      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id} — ${v.nodes.length} nœud(s)`), COMMANDE).toEqual([]);

      await contexte.close();
    });
  });
});

test.describe('les rendus que le rapport regarde', () => {
  test('captures 390×844 — menu ouvert et composeur armé, clair et sombre', async ({ browser }) => {
    const dossier = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');
    mkdirSync(dossier, { recursive: true });

    for (const schema of ['light', 'dark'] as const) {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await ouvreLeFil(contexte, '?repondre=m1');
      await ouvreLeMenu(page, 'm4');
      await expect(page.locator('li[data-id="m4"] button[name="retirer"]')).toBeVisible();
      await page.screenshot({ path: join(dossier, `thread-gestes-${schema}.png`) });
      await contexte.close();
    }
  });
});

/**
 * LE PANNEAU DU MENU (défauts revus sur #5163, §4-5) — mesuré au navigateur,
 * comme la revue l'a mesuré : le panneau ne recouvre plus le TEXTE de sa
 * propre ligne, deux menus ouverts ne se superposent plus (le second referme
 * le premier), et un menu ouvert se referme au clic ailleurs comme à Échap.
 */
test.describe('le panneau du menu ne recouvre plus le fil (défaut §4), et se referme (défaut §5)', () => {
  test('le panneau ne chevauche pas le texte de SA PROPRE ligne', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm1');
    await expect(menu.locator('form')).toBeVisible();

    const texte = await page.locator('li[data-id="m1"] .texte').boundingBox();
    const panneau = await menu.locator('form').boundingBox();
    expect(texte, 'le texte de m1 est introuvable').not.toBeNull();
    expect(panneau, 'le panneau de m1 est introuvable').not.toBeNull();

    const chevauche =
      texte!.x < panneau!.x + panneau!.width &&
      texte!.x + texte!.width > panneau!.x &&
      texte!.y < panneau!.y + panneau!.height &&
      texte!.y + texte!.height > panneau!.y;
    expect(chevauche, `${COMMANDE} — texte=${JSON.stringify(texte)} panneau=${JSON.stringify(panneau)}`).toBe(false);

    await contexte.close();
  });

  test('ouvrir un second menu referme le premier — jamais deux panneaux empilés', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const m1 = await ouvreLeMenu(page, 'm1');
    await expect(m1.locator('form')).toBeVisible();
    const m4 = await ouvreLeMenu(page, 'm4');
    await expect(m4.locator('form')).toBeVisible();
    await expect(m1).not.toHaveAttribute('open', '');

    await contexte.close();
  });

  test('un clic hors de tout menu le referme', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm1');
    await expect(menu.locator('form')).toBeVisible();
    await page.locator('header').click();
    await expect(menu).not.toHaveAttribute('open', '');

    await contexte.close();
  });

  test('Échap referme le menu ouvert', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const menu = await ouvreLeMenu(page, 'm1');
    await expect(menu.locator('form')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');

    await contexte.close();
  });
});
