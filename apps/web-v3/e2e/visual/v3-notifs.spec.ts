import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  CONVERSATION_DU_LECTEUR,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';
import { UTILISATEUR_DU_MEMBRE } from './lib/bouchon-socket';

/**
 * `/notifications` — LA BOÎTE, EN DIRECT (issue #4898, § 12.4).
 *
 * UNE SUITE DE CHAÎNE : l'écran n'existe que si une passerelle répond, et tout
 * ce qui est mesuré ici — l'arrivée d'une ligne, la lecture par un autre
 * appareil, le compteur, « Tout lire » optimiste — passe par elle et par son
 * socket de bouchon. Chaque événement poussé nomme l'émetteur RÉEL qu'il
 * copie ; un vert obtenu contre une charge inventée ne prouverait rien.
 *
 * LE CRITÈRE CENTRAL EST NÉGATIF : les événements mettent la liste à jour
 * SANS refetch. Le journal des requêtes de la page en est le témoin — après le
 * chargement, AUCUNE nouvelle requête vers `/api/v1/notifications` ne part,
 * quel que soit le nombre d'événements reçus.
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

type PageSuivie = { readonly page: Page; readonly demandesDeBoite: () => number };

const ouvreLaBoite = async (browser: Browser): Promise<PageSuivie> => {
  const contexte = await contexteDuLecteur(browser);
  const page = await contexte.newPage();
  let demandes = 0;
  page.on('request', (requete) => {
    if (requete.method() === 'GET' && requete.url().includes('/api/v1/notifications')) demandes += 1;
  });
  const reponse = await page.goto(`${v3.base}/notifications`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), '/notifications n’a pas servi la boîte').toBe(200);
  return { page, demandesDeBoite: () => demandes };
};

/** Le module arrive APRÈS le premier pixel : on l'attend par son EFFET, jamais par une minuterie seule. */
const attendsLeModule = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => document.querySelector('main[data-participation="notifs"]') !== null);
  await page.waitForTimeout(1_200);
};

/**
 * `notification:new` tel que `NotificationService` l'émet (`:1650`) : la forme
 * `{...formatted}` — l'état sous `state`, le contexte sous `context`.
 */
const CHARGE_NEUVE = {
  id: 'notif-direct',
  userId: UTILISATEUR_DU_MEMBRE,
  type: 'friend_request',
  title: 'Marta veut vous ajouter',
  subtitle: null,
  content: 'Marta Ruiz vous a envoyé une demande',
  actor: { id: 'u9', displayName: 'Marta Ruiz' },
  context: { friendRequestId: 'fr-1' },
  state: { isRead: false, readAt: null, createdAt: '2026-09-04T08:00:00.000Z' },
};

test.describe('la boîte de notifications, en direct', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test.beforeEach(() => {
    passerelle.boite.remets();
    passerelle.oublie();
  });

  test('une notification qui arrive se peint — texte servi, compteur monté, AUCUN refetch', async ({ browser }) => {
    const { page, demandesDeBoite } = await ouvreLaBoite(browser);
    await attendsLeModule(page);
    const avant = demandesDeBoite();

    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', CHARGE_NEUVE);

    const neuve = page.locator('li[data-id="notif-direct"]');
    await expect(neuve).toBeVisible();
    await expect(neuve.locator('.primaire')).toHaveText('Marta veut vous ajouter');
    // Le corps est celui SERVI — jamais recomposé côté client.
    await expect(neuve.locator('.secondaire')).toHaveText('Marta Ruiz vous a envoyé une demande');
    await expect(neuve).toHaveClass(/non-lue/);
    // La ligne naît EN TÊTE.
    await expect(page.locator('ul.notifs > li').first()).toHaveAttribute('data-id', 'notif-direct');
    // Le compteur suit, et rien n'a été redemandé.
    await expect(page.locator('.fil-tete .sous')).toHaveText('2 non lues');
    expect(demandesDeBoite()).toBe(avant);
  });

  test('lue par un AUTRE appareil, la ligne s’éteint — `notification:read` puis `counts`, sans refetch', async ({ browser }) => {
    const { page, demandesDeBoite } = await ouvreLaBoite(browser);
    await attendsLeModule(page);
    const avant = demandesDeBoite();

    // `markAsRead` : `{ notificationId }` à la room personnelle, puis les comptes.
    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:read', { notificationId: 'notif-1' });
    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:counts', { unread: 0, total: 2 });

    await expect(page.locator('li[data-id="notif-1"]')).not.toHaveClass(/non-lue/);
    await expect(page.locator('.fil-tete .sous')).toBeHidden();
    await expect(page.locator('form.tout-lire')).toBeHidden();
    expect(demandesDeBoite()).toBe(avant);
  });

  test('un `read-bulk` de contexte rejoue le prédicat partagé sur le document', async ({ browser }) => {
    const { page } = await ouvreLaBoite(browser);
    await attendsLeModule(page);

    // `announceReadBulk` : `{ scope }` — le prédicat, jamais des ids.
    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:read-bulk', {
      scope: { kind: 'context', contextKey: 'conversationId', contextValue: CONVERSATION_DU_LECTEUR.id },
    });

    await expect(page.locator('li[data-id="notif-1"]')).not.toHaveClass(/non-lue/);
  });

  test('« Tout lire » est optimiste — compteur à zéro AVANT la réponse, POST parti, aucune navigation', async ({ browser }) => {
    const { page, demandesDeBoite } = await ouvreLaBoite(browser);
    await attendsLeModule(page);
    const adresse = page.url();

    await page.locator('form.tout-lire button').click();

    // L'effet est IMMÉDIAT : le compteur s'éteint, la région de statut le dit.
    await expect(page.locator('.fil-tete .sous')).toBeHidden();
    await expect(page.locator('.avis')).toHaveText(/Tout est marqué comme lu/);
    await expect(page.locator('li.notif.non-lue')).toHaveCount(0);
    // Le POST est parti vers la passerelle — et vers elle SEULE (pas de PRG).
    await expect
      .poll(() => passerelle.journal.filter((appel) => appel.chemin.includes('/notifications/read-all')).length)
      .toBe(1);
    expect(page.url()).toBe(adresse);
    // AUCUN GET de boîte depuis le navigateur : la porte l'a demandée CÔTÉ
    // SERVEUR au chargement, et l'action n'a rien refait.
    expect(demandesDeBoite()).toBe(0);
  });

  test('sans JavaScript, « Tout lire » reste un Post/Redirect/Get qui marche', async ({ browser }) => {
    const contexte = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    await contexte.addCookies(cookiesDuLecteur(v3.base));
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications`, { waitUntil: 'domcontentloaded' });

    await page.locator('form.tout-lire button').click();
    await page.waitForURL(/tout-lu/);

    await expect(page.locator('.avis')).toContainText('Tout est marqué comme lu');
  });

  test('le document en direct ne porte aucune violation axe grave', async ({ browser }) => {
    const { page } = await ouvreLaBoite(browser);
    await attendsLeModule(page);
    passerelle.socket.emetsAuLecteur(UTILISATEUR_DU_MEMBRE, 'notification:new', CHARGE_NEUVE);
    await expect(page.locator('li[data-id="notif-direct"]')).toBeVisible();

    const rapport = await new AxeBuilder({ page }).analyze();
    const graves = rapport.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
  });
});
