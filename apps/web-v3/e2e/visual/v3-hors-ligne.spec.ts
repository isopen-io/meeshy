import { expect, test } from '@playwright/test';

import { porteInvitee } from './lib/porte-invitee';
import {
  type PasserelleDeBouchon,
  type ServeurV3,
  passerelleDeBouchon,
  serveurDeLaV3,
} from './lib/serveurs';

/**
 * LE TRAVAILLEUR DE ZONE, DE BOUT EN BOUT (#4473, critère de fin ; #4472,
 * portées étroites) — la chaîne réelle : `next start` sur l'artefact du build,
 * `V3_SW_PORTEES` posée comme le compose de staging la pose, un NAVIGATEUR qui
 * enregistre, met en cache, et RESTE LISIBLE hors ligne.
 *
 * Le scénario est celui de l'issue : un invité a ouvert son fil par un lien
 * partagé (là où la 302 de `/l/:token` atterrit) ; le réseau tombe ENTIER
 * (`context.setOffline`, serveurs coupés du navigateur) ; la lecture reste
 * servie — le dernier document connu, pas une page d'erreur du navigateur.
 */

const PORTEES_DU_TEST = '/l/,/chats,/chat/';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base, { V3_SW_PORTEES: PORTEES_DU_TEST });
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.describe('le travailleur de zone — enregistré étroit, lisible hors ligne', () => {
  test("le script est servi DANS la zone, avec l'en-tête qui autorise les portées de la racine", async ({
    request,
  }) => {
    const reponse = await request.get(`${v3.base}/__v3/sw`);
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()['content-type']).toContain('text/javascript');
    expect(reponse.headers()['service-worker-allowed']).toBe('/');
    expect(reponse.headers()['cache-control']).toBe('no-cache');
    const corps = await reponse.text();
    expect(corps).toContain('meeshy-v3-sw-');
    // L'empreinte est SUBSTITUÉE au service — un marqueur qui survivrait
    // nommerait un cache jamais versionné.
    expect(corps).not.toContain('__V3_SW_EMPREINTE__');
  });

  test("le document invité porte la registration, une portée par préfixe, jamais '/'", async ({
    browser,
  }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);
    const scripts = await page.locator('script').allTextContents();
    const registration = scripts.find((s) => s.includes('serviceWorker'));
    expect(registration).toBeDefined();
    expect(registration).toContain('/__v3/sw?portees=');
    expect(registration).not.toContain("scope:'/'");
    await contexte.close();
  });

  test('hors ligne, le fil invité déjà visité reste LISIBLE — le dernier document connu, pas une page d’erreur', async ({
    browser,
  }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);

    // La registration attend `load` puis l'oisiveté ; on attend le worker ACTIF
    // — c'est lui qui met le document en cache à la navigation suivante.
    await page.evaluate(async () => {
      await (navigator as Navigator).serviceWorker.ready;
    });

    // Une navigation SOUS le worker actif : c'est ELLE qui entre au cache
    // (la première arrivait avant qu'un worker ne contrôle la page).
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', {
      timeout: 15_000,
    });

    await contexte.setOffline(true);
    await page.reload({ waitUntil: 'load' });

    // La coquille ET le dernier bout du fil sont là — servis par le worker.
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('#champ-texte')).toBeVisible();

    await contexte.setOffline(false);
    await contexte.close();
  });
});
