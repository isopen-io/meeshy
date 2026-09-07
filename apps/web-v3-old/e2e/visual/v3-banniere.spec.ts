import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { DUREE_DE_LA_BANNIERE_MS } from '../../lib/contenu/banniere';
import { UTILISATEUR_DU_MEMBRE } from './lib/bouchon-socket';
import {
  CONVERSATION_DU_LECTEUR,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LA BANNIÈRE EN APPLICATION (#4454) — DANS UN NAVIGATEUR, sur les deux écrans
 * qui la servent.
 *
 * CE QU'AUCUN TÉMOIN JSDOM NE PEUT PROUVER, ET QUI EST L'OBJET DE CETTE SUITE :
 * que le module DIFFÉRÉ, arrivé après le premier pixel, a bien trouvé la
 * région que le document a servie, et branché sa porte sur le socket. La
 * région est une chaîne dans `banniere-vue.ts` et une requête `querySelector`
 * dans `banniere.ts` : un renommage de classe d'un côté sans l'autre laisse les
 * deux fichiers verts et la bannière muette. Seul le navigateur les confronte.
 *
 * LA CHARGE POUSSÉE COPIE `NotificationService` (`:1650`, la forme
 * `{...formatted}`) — un vert obtenu contre une charge inventée ne prouverait
 * rien.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

/** Le module arrive APRÈS le premier pixel : on l'attend par son EFFET, jamais par une minuterie seule. */
const attendsLeModule = async (page: Page, participation: string): Promise<void> => {
  await page.waitForFunction(
    (nom) => document.querySelector(`main[data-participation="${nom}"]`) !== null,
    participation,
  );
  await page.waitForTimeout(1_200);
};

const ECRANS = [
  {
    nom: 'le fil',
    participation: 'fil',
    chemin: (): string => `/chats/${CONVERSATION_DU_LECTEUR.id}`,
  },
  { nom: '/chats', participation: 'liste', chemin: (): string => '/chats' },
] as const;

const ouvre = async (browser: Browser, ecran: (typeof ECRANS)[number]): Promise<Page> => {
  const page = await (await contexteDuLecteur(browser)).newPage();
  const reponse = await page.goto(`${v3.base}${ecran.chemin()}`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), `${ecran.nom} n’a pas servi son document`).toBe(200);
  await attendsLeModule(page, ecran.participation);
  return page;
};

/** Un message privé : la loi rend le nom de l'acteur en titre, l'extrait en corps. */
const MESSAGE_PRIVE = {
  id: 'notif-banniere-1',
  userId: UTILISATEUR_DU_MEMBRE,
  type: 'new_message',
  title: 'Marta Ruiz',
  subtitle: null,
  content: 'on décale à 18 h ?',
  actor: { id: 'u9', displayName: 'Marta Ruiz' },
  context: { conversationType: 'direct', conversationTitle: 'Marta Ruiz' },
  state: { isRead: false, readAt: null, createdAt: '2026-09-04T08:00:00.000Z' },
};

test.describe('la bannière en application', () => {
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
  });

  for (const ecran of ECRANS) {
    test(`${ecran.nom} — la région est servie MASQUÉE et le module la remplit`, async ({ browser }) => {
      const page = await ouvre(browser, ecran);
      const banniere = page.locator('output.banniere');

      // AVANT : servie, donc présente dans l'arbre d'accessibilité — et muette.
      await expect(banniere).toHaveCount(1);
      await expect(banniere).toBeHidden();

      passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', MESSAGE_PRIVE);

      await expect(banniere).toBeVisible();
      await expect(banniere.locator('.banniere-titre')).toHaveText('Marta Ruiz');
      await expect(banniere.locator('.banniere-corps')).toHaveText('on décale à 18 h ?');
    });
  }

  test('la croix la retire — un contrôle qui n’aurait aucun effet ne serait pas un contrôle', async ({
    browser,
  }) => {
    const page = await ouvre(browser, ECRANS[0]);
    const banniere = page.locator('output.banniere');

    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', MESSAGE_PRIVE);
    await expect(banniere).toBeVisible();

    await banniere.locator('.banniere-fermer').click();
    await expect(banniere).toBeHidden();
  });

  /**
   * SEPT SECONDES, PAS DAVANTAGE. Le témoin ne les attend pas : il vérifie que
   * la bannière est ENCORE là bien après le temps d'une image, puis avance
   * l'horloge du navigateur — la valeur mesurée est celle du dépôt, importée,
   * jamais recopiée dans le spec.
   */
  test('elle se retire d’elle-même après la durée décidée', async ({ browser }) => {
    const page = await ouvre(browser, ECRANS[0]);
    const banniere = page.locator('output.banniere');

    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', MESSAGE_PRIVE);
    await expect(banniere).toBeVisible();

    await page.waitForTimeout(500);
    await expect(banniere, 'elle est partie trop tôt').toBeVisible();

    await expect(banniere).toBeHidden({ timeout: DUREE_DE_LA_BANNIERE_MS + 2_000 });
  });

  /**
   * LA RÈGLE 8 b/c — un élément fixe ne couvre AUCUN contrôle AU REPOS. La
   * bannière est en haut, donc au-dessus de l'en-tête ; masquée, elle ne doit
   * intercepter aucun clic. Le témoin le prouve par le geste : un contrôle de
   * l'en-tête reste cliquable pendant que la région est là mais muette —
   * `/chats` (ECRANS[1]) sert désormais le raccourci d'en-tête vers l'espace
   * membre, JAMAIS le rond flottant `.flottante.droite` que la règle 8 en a
   * retiré (revue de #5164, la mesure ayant trouvé le rail couvrant le pied
   * sur CET écran).
   */
  test('masquée, elle n’intercepte rien — la règle 8 b/c au repos', async ({ browser }) => {
    const page = await ouvre(browser, ECRANS[1]);

    await expect(page.locator('output.banniere')).toBeHidden();
    await page.locator('.raccourcis-entete a[href="/chats?espace"]').click();
    await expect(page.locator('dialog.espace')).toBeVisible();
  });

  test('elle n’ajoute aucune violation axe grave', async ({ browser }) => {
    const page = await ouvre(browser, ECRANS[0]);
    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', MESSAGE_PRIVE);
    await expect(page.locator('output.banniere')).toBeVisible();

    const rapport = await new AxeBuilder({ page }).analyze();
    const graves = rapport.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} — ${violation.help}`);

    expect(graves).toEqual([]);
  });
});
