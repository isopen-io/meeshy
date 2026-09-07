import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { chargeDeMessage, JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { ciblesMesurees, ciblesTropPetites } from './lib/cibles';
import { estMutante, rapporteRequetesInterdites, requetesPendantOngletCache } from './lib/lifecycle';
import { DELAI_D_OBSERVATION_MS, enregistre, occulte, revele } from './lib/navigateur-cycle';
import { CONVERSATION_DU_LECTEUR, PAIR_ANGLOPHONE, passerelleDeBouchon, RACINE_V3, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * LE COMPOSEUR ENREGISTRE UN VOCAL ET PARTAGE LA POSITION, ET UNE POSITION
 * REÇUE SE LIT COMME UN LIEU — PAS COMME DES COORDONNÉES (#5061).
 *
 * Sur la chaîne réelle : le serveur de la v3 tel que `next build` l'a émis,
 * la passerelle de bouchon (`e2e/visual/lib/serveurs.ts`, chaque route cite
 * l'émetteur qu'elle copie) et le bouchon socket. `navigator.mediaDevices`,
 * `MediaRecorder` et `navigator.geolocation` n'existent pas dans le
 * navigateur headless sans matériel : posés ici par `addInitScript`, avant
 * que le module de participation ne les interroge — jamais en
 * ré-implémentant `capture.ts` à côté.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-fil-capture.spec.ts';

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

const ouvreLeFil = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(FIL(), { waitUntil: 'load' });
  return page;
};

const attendLeTempsReel = async (page: Page): Promise<void> => {
  await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
};

/**
 * `MediaRecorder` posé À LA MAIN dans la page — un flux bidon, un
 * `dataavailable` porteur d'un vrai `Blob` audio, un `stop` qui le livre.
 * `accorde` gouverne `getUserMedia` : refusé, il rejette comme un navigateur
 * dont le lecteur a dit non.
 */
const poseLeMicro = (contexte: BrowserContext, accorde: boolean) =>
  contexte.addInitScript(
    ({ accordeVoix }) => {
      class FauxMediaRecorder extends EventTarget {
        readonly mimeType = 'audio/webm;codecs=opus';
        start(): void {
          /* rien à faire — le faux flux ne produit rien tant que stop() n'est pas appelé */
        }
        stop(): void {
          const donnee = new Blob(['un-octet-de-vocal-de-test'], { type: this.mimeType });
          this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: donnee }));
          this.dispatchEvent(new Event('stop'));
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FauxMediaRecorder;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: () =>
            accordeVoix ? Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }) : Promise.reject(new Error('Permission denied')),
        },
        configurable: true,
      });
    },
    { accordeVoix: accorde },
  );

/** `navigator.geolocation` posé à la main — succès à un point fixe, ou refus. */
const poseLaGeolocalisation = (contexte: BrowserContext, issue: 'succes' | 'refus') =>
  contexte.addInitScript(
    ({ estUnSucces }) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition: (succes: (p: unknown) => void, echec: (e: unknown) => void) => {
            if (estUnSucces) succes({ coords: { latitude: 48.8566, longitude: 2.3522 } });
            else echec(new Error('User denied Geolocation'));
          },
        },
        configurable: true,
      });
    },
    { estUnSucces: issue === 'succes' },
  );

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

test.describe('le vocal — MediaRecorder, POST /attachments/upload puis le message avec attachmentIds', () => {
  test('tap micro → état d’enregistrement visible → stop → upload puis envoi observés → bulle audio optimiste puis confirmée', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await poseLeMicro(contexte, true);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const micro = page.locator('#bouton-micro');
    await expect(micro).toBeVisible();
    await micro.click();

    const zone = page.locator('#enregistrement');
    await expect(zone).toBeVisible();
    await expect(page.locator('form.composeur')).toHaveClass(/enregistre/);

    await page.locator('.envoyer-vocal').click();

    // La bulle apparaît OPTIMISTE (en attente) avant l'accusé.
    const mienne = page.locator('li.mien[data-cid]').last();
    await expect(mienne.locator('.pieces')).toBeVisible({ timeout: 10_000 });
    await expect(mienne).toHaveAttribute('data-id', /^m\d+$/, { timeout: 10_000 });

    await expect(page.locator('form.composeur')).not.toHaveClass(/enregistre/);

    const posts = passerelle.journal.filter((a) => a.methode === 'POST').map((a) => a.chemin);
    expect(posts.indexOf('/api/v1/attachments/upload')).toBeGreaterThanOrEqual(0);
    expect(posts.indexOf(CHEMIN_DES_MESSAGES)).toBeGreaterThan(posts.indexOf('/api/v1/attachments/upload'));
    const envoi = passerelle.journal.find((a) => a.methode === 'POST' && a.chemin === CHEMIN_DES_MESSAGES);
    expect(JSON.parse(envoi?.corps ?? '{}')).toMatchObject({ attachmentIds: [expect.stringMatching(/^a\d+$/)] });

    await contexte.close();
  });

  test('getUserMedia refusé — la voix du geste sert le refus, le composeur reste intact', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await poseLeMicro(contexte, false);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    await page.locator('#bouton-micro').click();

    await expect(page.locator('#refus-du-composeur')).toBeVisible();
    await expect(page.locator('#refus-du-composeur')).toContainText('microphone');
    await expect(page.locator('form.composeur')).not.toHaveClass(/enregistre/);
    // Le texte reste utilisable — le composeur n'a pas planté.
    await page.locator('#champ-texte').fill('Toujours là');
    await expect(page.locator('#champ-texte')).toHaveValue('Toujours là');

    await contexte.close();
  });
});

test.describe('la position — un LIEU, jamais des coordonnées ; zéro tuile téléchargée à la lecture', () => {
  test('tap position → POST .../messages observé avec location.latitude/longitude → bulle « lieu » rendue', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await poseLaGeolocalisation(contexte, 'succes');
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const position = page.locator('#bouton-position');
    await expect(position).toBeVisible();
    await position.click();

    const mienne = page.locator('li.mien[data-cid]').last();
    await expect(mienne.locator('.lieu-lien')).toBeVisible({ timeout: 10_000 });
    await expect(mienne.locator('.lieu-lien')).toHaveAttribute('href', 'geo:48.8566,2.3522');

    const envoi = passerelle.journal.find((a) => a.methode === 'POST' && a.chemin === CHEMIN_DES_MESSAGES);
    expect(JSON.parse(envoi?.corps ?? '{}')).toMatchObject({ location: { latitude: 48.8566, longitude: 2.3522 } });

    await contexte.close();
  });

  /**
   * LE NOM D'UN LIEU SE LIT EN ENTIER (revue de #5061). La fiche est aussi
   * large que sa bulle (mesuré 178 px dans une colonne de 298 : la datation
   * et le menu prennent le reste) ; le nom y était en `white-space:nowrap`
   * et « Position partagée » se rendait « Position part… » — le contenu
   * MÊME de la bulle, tronqué. Il passe à la ligne : un lieu se lit comme un
   * lieu, jamais comme un début de lieu.
   */
  test('le nom du lieu n’est jamais rogné — il passe à la ligne', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    await poseLaGeolocalisation(contexte, 'succes');
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await page.locator('#bouton-position').click();
    const nom = page.locator('li.mien[data-cid] .nom-du-lieu').last();
    await expect(nom).toBeVisible({ timeout: 10_000 });

    const mesure = await nom.evaluate((noeud) => ({ largeur: noeud.clientWidth, largeurDuTexte: noeud.scrollWidth, texte: noeud.textContent }));
    expect(mesure.texte).toBe('Position partagée');
    expect(mesure.largeurDuTexte, `${COMMANDE} — le nom du lieu déborde de sa fiche et se fait rogner`).toBeLessThanOrEqual(mesure.largeur);

    await contexte.close();
  });

  test('geolocation refusée → phrase de refus dans la région d’alerte, composeur intact', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await poseLaGeolocalisation(contexte, 'refus');
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    await page.locator('#bouton-position').click();

    await expect(page.locator('#refus-du-composeur')).toBeVisible();
    await expect(page.locator('#refus-du-composeur')).toContainText('position');
    await page.locator('#champ-texte').fill('Le composeur marche encore');
    await expect(page.locator('#champ-texte')).toHaveValue('Le composeur marche encore');

    await contexte.close();
  });

  test('aucun octet de carte téléchargé à la lecture d’un lieu (assertion CDP)', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await poseLaGeolocalisation(contexte, 'succes');
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    const cdp: CDPSession = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');
    const requetesDeCarte: string[] = [];
    cdp.on('Network.requestWillBeSent', ({ request }) => {
      if (request.url.includes('openstreetmap') || request.url.includes('tile')) requetesDeCarte.push(request.url);
    });

    await page.locator('#bouton-position').click();
    await expect(page.locator('li.mien[data-cid] .lieu-lien').last()).toBeVisible({ timeout: 10_000 });

    expect(requetesDeCarte, COMMANDE).toEqual([]);

    await contexte.close();
  });

  /**
   * TRAVAIL `rich` (2026-09-06) — GET /sync hisse désormais `location` en
   * champ de premier niveau (`services/gateway/src/routes/sync/messages.ts`),
   * la même forme que `message:new`. Patron de `v3-fil.spec.ts:605` (« hidden
   * ⇒ zéro requête, le socket se ferme ; visible ⇒ … arrive par UN /sync ») :
   * le socket est COUPÉ pendant l'absence, donc SEUL le rattrapage `/sync` au
   * retour peut faire arriver ce message — la preuve que la voie testée est
   * bien celle du travail, pas `message:new`.
   *
   * La fixture ci-dessous — `chargeDeMessage({ …, location })` — MIME
   * l'émetteur réel `services/gateway/src/routes/sync/messages.ts` (fonction
   * `syncMessages`, `serialize`) tel que corrigé par ce travail : `location`
   * au premier niveau, SANS `metadata.location` (`chargeDeMessage` ne pose
   * `location` que si on le lui passe, jamais sous `metadata` — même charge
   * que `messages-list.ts`/`message:new` hissent déjà).
   */
  test('un lieu reçu pendant l’absence arrive par UN /sync et se peint comme un LIEU', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const journal = enregistre(contexte);

    const cdp: CDPSession = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');
    const requetesDeCarte: string[] = [];
    cdp.on('Network.requestWillBeSent', ({ request }) => {
      if (request.url.includes('openstreetmap') || request.url.includes('tile')) requetesDeCarte.push(request.url);
    });

    const debut = Date.now();
    await occulte(page);
    await expect.poll(() => passerelle.socket.connectes()).toBe(0);

    passerelle.ajouteUnMessage(
      chargeDeMessage({
        id: 'm701',
        conversationId: CONVERSATION_DU_LECTEUR.id,
        senderId: PAIR_ANGLOPHONE.id,
        content: '',
        sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
        location: { latitude: 48.8566, longitude: 2.3522, name: 'Café de Flore', address: '172 bd Saint-Germain' },
      }),
    );
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    const fin = Date.now();
    await revele(page);

    const fenetres = [{ debut, fin }];
    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });
    expect(pendant, rapporteRequetesInterdites('fil du membre, lieu reçu onglet caché', pendant, fenetres)).toEqual([]);
    await expect.poll(() => passerelle.socket.connectes()).toBe(1);
    await attendLeTempsReel(page);

    // Une seule requête /sync a porté ce message — pas message:new (le socket
    // était fermé pendant l'absence).
    expect(journal().filter((e) => e.emiseA >= fin && e.url.includes('/api/v1/sync'))).toHaveLength(1);
    expect(journal().filter(estMutante)).toEqual([]);

    const bulle = page.locator('li[data-id="m701"]');
    await expect(bulle.locator('.lieu-lien')).toBeVisible({ timeout: 10_000 });
    await expect(bulle.locator('.lieu-lien')).toHaveAttribute('href', 'geo:48.8566,2.3522');
    await expect(bulle.locator('.nom-du-lieu')).toHaveText('Café de Flore');
    const texteDeLaBulle = await bulle.innerText();
    expect(texteDeLaBulle).not.toContain('48.85');
    expect(requetesDeCarte, COMMANDE).toEqual([]);

    await contexte.close();
  });
});

test.describe('javaScriptEnabled:false — ni micro ni position, texte et pièce jointe fonctionnent', () => {
  test('aucun des deux boutons n’est visible ; le composeur SANS JavaScript reste entier', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('#bouton-micro')).toBeHidden();
    await expect(page.locator('#bouton-position')).toBeHidden();
    await expect(page.locator('#champ-texte')).toBeVisible();
    await expect(page.locator('label.joindre')).toBeVisible();

    await page.locator('#champ-texte').fill('Un message sans JavaScript');
    await page.locator('button.envoyer').click();
    await expect(page).toHaveURL(/#m-m\d+$/);

    await contexte.close();
  });
});

test.describe('cibles et accessibilité', () => {
  test('aucune cible sous 44 px — micro, position, annuler et envoyer le vocal', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    await poseLeMicro(contexte, true);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await page.locator('#bouton-micro').click();
    await expect(page.locator('#enregistrement')).toBeVisible();

    const cibles = await ciblesMesurees(page);
    const trop_petites = ciblesTropPetites(cibles);
    expect(trop_petites, COMMANDE).toEqual([]);

    await contexte.close();
  });

  /**
   * LE CHAMP NE COUPE JAMAIS SON LIBELLÉ (revue de #5061). Deux ronds de plus
   * dans la rangée du composeur ramenaient le `<textarea>` à 134 px à 390 px
   * de large : « Écrire en français… » passait à la ligne et se coupait
   * (`clientHeight` 48 pour un `scrollHeight` de 73). Le témoin mesure ce que
   * l'œil voyait — une saisie plus haute que sa boîte est un libellé rogné.
   */
  test('le champ ne coupe jamais son libellé — mesuré à 390 px, micro et position révélés', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { viewport: { width: 390, height: 844 } });
    await poseLeMicro(contexte, true);
    await poseLaGeolocalisation(contexte, 'succes');
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await expect(page.locator('#bouton-micro')).toBeVisible();

    const champ = await page.locator('#champ-texte').evaluate((noeud) => ({
      largeur: noeud.clientWidth,
      hauteur: noeud.clientHeight,
      hauteurDuContenu: noeud.scrollHeight,
    }));
    expect(champ.hauteurDuContenu, `${COMMANDE} — le libellé du champ passe à la ligne et se coupe`).toBeLessThanOrEqual(champ.hauteur + 1);
    expect(champ.largeur, `${COMMANDE} — le champ de saisie est écrasé par les ronds du composeur`).toBeGreaterThanOrEqual(224);

    await contexte.close();
  });

  (['light', 'dark'] as const).forEach((schema) => {
    test(`0 violation axe serious/critical — composeur avec micro et position révélés (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      await poseLeMicro(contexte, true);
      await poseLaGeolocalisation(contexte, 'succes');
      const page = await ouvreLeFil(contexte);
      await attendLeTempsReel(page);
      await expect(page.locator('#bouton-micro')).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id} — ${v.nodes.length} nœud(s)`), COMMANDE).toEqual([]);

      await contexte.close();
    });
  });
});

test.describe('les rendus que le rapport regarde', () => {
  test('captures 390×844 — composeur avec micro et position révélés, clair et sombre', async ({ browser }) => {
    const dossier = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');
    mkdirSync(dossier, { recursive: true });

    for (const schema of ['light', 'dark'] as const) {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      await poseLeMicro(contexte, true);
      await poseLaGeolocalisation(contexte, 'succes');
      const page = await ouvreLeFil(contexte);
      await attendLeTempsReel(page);
      await expect(page.locator('#bouton-micro')).toBeVisible();
      await page.screenshot({ path: join(dossier, `rich-capture-${schema}.png`) });
      await contexte.close();
    }
  });
});
