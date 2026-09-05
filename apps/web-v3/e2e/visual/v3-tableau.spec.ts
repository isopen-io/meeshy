import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  AUTRE_CONVERSATION,
  CONVERSATION_DU_LECTEUR,
  LIEN_DU_FIL,
  PRENOM_DU_LECTEUR,
  chargeMesureReseau,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';
import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { CHATS } from '../../lib/contenu/liste';

/**
 * LE TABLEAU DE BORD — `/` pour un lecteur CONNECTÉ (conception § 12.2, cible
 * `home.png`, matrice ordre 13).
 *
 * POURQUOI UNE SUITE À PART, ET PAS DEUX LIGNES DANS `v3-a11y` ET `v3-cibles`.
 * Ces deux-là mesurent la page que le `webServer` global lève, avec un
 * `MEESHY_GATEWAY_URL` qui ne pointe sur rien : `/` y sert la VITRINE, et
 * l'écran connecté y répondrait 503. Le tableau de bord est une CHAÎNE — le
 * serveur de la v3 ET la passerelle qu'il interroge —, exactement ce que le
 * projet `chaines` monte (`playwright.config.ts`).
 *
 * LES COOKIES SONT LE SUJET, PAS UN DÉTAIL DE MONTAGE. `/` sert deux écrans
 * selon ce que le lecteur porte : sans eux la vitrine, avec eux le tableau de
 * bord. Chaque témoin ci-dessous vérifie donc, AVANT de mesurer, que c'est bien
 * l'écran connecté qui a été servi — sans quoi un vert dirait « la vitrine est
 * accessible », ce que `v3-a11y` dit déjà.
 */

const LARGEURS = [360, 390] as const;
const TARGET_MIN = 44;
const ACTION_PRIMAIRE = 56;

const CIBLES = 'a, button, input, select, summary, [role="button"]';

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

test.describe('le tableau de bord garni', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  LARGEURS.forEach((largeur) => {
    test(`aucune cible sous ${TARGET_MIN} px à ${largeur} px`, async ({ browser }) => {
      const contexte = await browser.newContext({ viewport: { width: largeur, height: 844 } });
      await contexte.addCookies(cookiesDuLecteur(v3.base));
      const page = await contexte.newPage();

      const reponse = await page.goto(`${v3.base}/`, { waitUntil: 'domcontentloaded' });
      expect(reponse?.status(), '/ n’a pas servi le tableau de bord').toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(PRENOM_DU_LECTEUR);

      const mesurees = await page.evaluate(
        (selecteur) =>
          [...document.querySelectorAll(selecteur)]
            .map((noeud) => {
              const rect = noeud.getBoundingClientRect();
              return {
                selecteur: `${noeud.tagName.toLowerCase()}.${noeud.className || '(sans classe)'}`,
                texte: (noeud.textContent ?? '').trim().slice(0, 40),
                largeur: Math.round(rect.width),
                hauteur: Math.round(rect.height),
              };
            })
            .filter((cible) => cible.largeur > 0 && cible.hauteur > 0),
        CIBLES,
      );

      // Un balayage VIDE sortirait vert sans avoir rien mesuré : l'écran porte au
      // moins la marque, « Tout voir », trois cartes de fil, deux cartes de lien
      // et les cinq liens du pied.
      expect(mesurees.length, "aucune cible mesurée — le balayage n'a rien vu").toBeGreaterThan(8);

      const petites = mesurees.filter(
        (cible) => cible.hauteur < TARGET_MIN || cible.largeur < TARGET_MIN,
      );

      expect(petites, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(petites)}`).toEqual([]);
      await contexte.close();
    });
  });

  /**
   * Charte règle 6 — un raccourci d'en-tête est un `<a href>` vers une route
   * SERVIE.
   *
   * **SA PRÉMISSE A BOUGÉ DEUX FOIS, PAS LA RÈGLE.** #5093 l'écrivait pour
   * « aucun rond » : la v3 ne servait alors ni compte ni réglages. Elle sert
   * désormais les six écrans de `/settings`, `/feed`, `/contacts`,
   * `/notifications`, `/search` et `/links` — donc la règle 6 veut que les
   * deux cibles soient RENDUES. La revue de #5164 a ensuite déplacé CES deux
   * cibles hors du flottant : le rail `position:fixed` recouvrait la carte de
   * conversation mise en avant dès que la liste sert plus de deux lignes, à
   * n'importe quel défilement (charte règle 8 b/c) — `.raccourci`, DANS le
   * flux de l'en-tête, ne peut plus recouvrir quoi que ce soit. Ce que la
   * règle 6 interdit — une cible inerte, un `href="#"`, un `onclick` — est
   * gardé ligne pour ligne.
   */
  test('rend les deux raccourcis vers des routes servies, et aucune cible inerte', async ({ browser }) => {
    const contexte = await browser.newContext();
    await contexte.addCookies(cookiesDuLecteur(v3.base));
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/`, { waitUntil: 'domcontentloaded' });

    const raccourcis = page.locator('.raccourcis-entete .raccourci');
    await expect(raccourcis).toHaveCount(2);
    await expect(raccourcis.first()).toHaveAttribute('href', '/feed');
    await expect(raccourcis.last()).toHaveAttribute('href', '/?espace');
    expect(await page.locator('[href="#"], [onclick]').count()).toBe(0);
    await contexte.close();
  });

  /**
   * Le lien de partage MÈNE quelque part — c'est la loi 4 (« un contrôle existe
   * s'il a un effet ») posée sur la carte que la charte règle 12 dessine. Le
   * texte est l'adresse que le lecteur COPIE (`/chat/:lien`, la porte de
   * l'invité) ; la destination est la conversation du MEMBRE (`/chats/:cle`).
   * Les confondre enverrait le membre refaire une jonction déjà faite.
   *
   * L'ADRESSE COPIÉE PORTE LE `linkId` (#5077), jamais le slug `identifier` :
   * la route d'aperçu anonyme prenait tout `mshy_*` pour un linkId, et une
   * adresse composée du slug rendait « Ce lien ne mène nulle part » — mesuré
   * sur staging. `IDENTIFIANT_DU_LIEN_PARTAGE` reste ce que la porte de
   * l'invité REÇOIT en URL ; ce que la carte AFFICHE est la clé canonique.
   */
  test('la carte d’un lien mène à la conversation, pas à la porte de l’invité', async ({ browser }) => {
    const contexte = await browser.newContext();
    await contexte.addCookies(cookiesDuLecteur(v3.base));
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/`, { waitUntil: 'domcontentloaded' });

    const carte = page.locator(`a.carte[href="/chats/${CONVERSATION_DU_LECTEUR.id}"]`).last();
    await expect(carte).toContainText(`/chat/${LIEN_DU_FIL}`);
    await contexte.close();
  });

  /**
   * **L'APERÇU AU PRISME, AU PIXEL** (`cible/home.png` : la carte « Marta Ruiz »
   * porte la pastille `ES` puis « Merci, je t'envoie le fichier »). Le bouchon
   * sert sur cette conversation un dernier message ESPAGNOL avec sa carte de
   * traductions (`bouchon-compte.ts`, copié sur `lastMessage` /
   * `lastMessageOriginalLanguage` / `lastMessageTranslations` de `GET
   * /api/v1/conversations`) : la lectrice francophone doit lire le FRANÇAIS.
   *
   * LES DEUX MOITIÉS SONT EXIGÉES, et la seconde n'est pas décorative : la
   * carte du groupe porte un aperçu déjà français, donc AUCUNE pastille — sans
   * elle, une pastille rendue TOUJOURS resterait verte (charte règle 22).
   *
   * § 12.10.2 — le compte de participants a QUITTÉ cette carte : la cible met
   * l'aperçu à sa place, et la méta ne revient que sur une conversation qui n'a
   * encore rien dit (état gardé en unitaire, `__tests__/connecte.test.ts`). Le
   * témoin de la règle AU PIXEL vit là où l'écran l'affiche encore :
   * `v3-chats.spec.ts` (la ligne de `/chats`) et `v3-fil.spec.ts` (l'en-tête du
   * fil).
   */
  test('la carte sert l’aperçu du dernier message au Prisme, et n’annonce une langue que s’il est traduit', async ({ browser }) => {
    const contexte = await browser.newContext();
    await contexte.addCookies(cookiesDuLecteur(v3.base));
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/`, { waitUntil: 'domcontentloaded' });

    const carte = (id: string) => page.locator(`a.carte[href="/chats/${id}"]`).first();

    await expect(carte(AUTRE_CONVERSATION.id).locator('.apercu .texte')).toHaveText(AUTRE_CONVERSATION.traductions.fr);
    await expect(carte(AUTRE_CONVERSATION.id).locator('.apercu .langue .code')).toHaveText(AUTRE_CONVERSATION.langueOriginale);
    await expect(carte(AUTRE_CONVERSATION.id)).not.toContainText(AUTRE_CONVERSATION.apercu);
    await expect(carte(AUTRE_CONVERSATION.id)).not.toContainText(CHATS.participants);

    await expect(carte(CONVERSATION_DU_LECTEUR.id).locator('.apercu .texte')).toHaveText('On se cale à 15 h pour la revue ?');
    await expect(carte(CONVERSATION_DU_LECTEUR.id).locator('.apercu .langue')).toHaveCount(0);
    await contexte.close();
  });

  ([
    { id: 'clair', stockage: 'light', classe: 'light' },
    { id: 'sombre', stockage: 'dark', classe: 'dark' },
  ] as const).forEach((theme) => {
    test(`0 violation axe serious/critical (${theme.id})`, async ({ browser }) => {
      const contexte = await browser.newContext();
      await contexte.addCookies(cookiesDuLecteur(v3.base));
      const page = await contexte.newPage();
      await page.addInitScript(
        ([cle, valeur]) => {
          try {
            window.localStorage.setItem(cle, valeur);
          } catch {
            /* le script anti-flash retombe sur la préférence système */
          }
        },
        [THEME_STORAGE_KEY, theme.stockage] as const,
      );

      const reponse = await page.goto(`${v3.base}/`, { waitUntil: 'domcontentloaded' });
      expect(reponse?.status()).toBe(200);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classe}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      expect(
        bloquantes.map((violation) => `${violation.id} — ${violation.help}`),
        `axe [${theme.id}]`,
      ).toEqual([]);
      await contexte.close();
    });
  });

  /**
   * Gate § 12.6 — « `/` : requêtes avant le premier pixel = 1 ». Le document
   * porte sa table de jetons, sa feuille et ses glyphes ; aucune image, aucune
   * police, aucun script hors le ThemeScript inline.
   *
   * La comparaison n'est pas réécrite ici : `franchissementsReseau` est le site
   * unique du § 9.2, et il lit `budgets.json`.
   */
  test('tient le plafond réseau de `/` avec les cookies du lecteur', async ({ browser }) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({
      url: `${v3.base}/`,
      commande: 'bunx playwright test e2e/visual/v3-tableau.spec.ts',
      navigateur: browser as unknown as Parameters<typeof mesurePage>[0]['navigateur'],
      cookies: cookiesDuLecteur(v3.base),
    });

    expect(mesure.statut).toBe('mesuré');
    expect(mesure.http).toBe(200);
    expect(mesure.requetes_avant_premier_pixel).toBe(1);

    const franchis = franchissementsReseau(mesure, budgets.reseau).filter(
      (franchissement) => franchissement.statut === 'GATE',
    );

    expect(franchis.map((franchissement) => franchissement.texte)).toEqual([]);
  });
});

/**
 * L'ÉTAT VIDE EST UN ÉCRAN À PART ENTIÈRE — c'est celui qu'un compte neuf voit
 * en premier, et celui qu'un bouchon toujours garni ne fait jamais visiter.
 * C'est aussi le seul état du tableau de bord qui porte une action PRIMAIRE : la
 * charte règle 4 lui donne 56 px, et la règle 18 exige qu'elle ait un effet.
 */
test.describe('le tableau de bord vide', () => {
  let passerelleVide: PasserelleDeBouchon;
  let serveurVide: ServeurV3;

  test.beforeAll(async () => {
    passerelleVide = await passerelleDeBouchon({ lecteurSansRien: true });
    serveurVide = await serveurDeLaV3(passerelleVide.base);
  });

  test.afterAll(async () => {
    await serveurVide?.ferme();
    await passerelleVide?.ferme();
  });

  test('dessine ses cartes vides et sert une action primaire de 56 px', async ({ browser }) => {
    const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await contexte.addCookies(cookiesDuLecteur(serveurVide.base));
    const page = await contexte.newPage();

    const reponse = await page.goto(`${serveurVide.base}/`, { waitUntil: 'domcontentloaded' });
    expect(reponse?.status()).toBe(200);

    expect(await page.locator('.carte-vide').count()).toBe(2);

    const hauteurs = await page.evaluate(() =>
      [...document.querySelectorAll('.action.primaire')].map((noeud) =>
        Math.round(noeud.getBoundingClientRect().height),
      ),
    );

    expect(hauteurs.length).toBeGreaterThan(0);
    expect(Math.min(...hauteurs)).toBe(ACTION_PRIMAIRE);
    await contexte.close();
  });

  /**
   * Sans cookie, la MÊME adresse sert la vitrine. Ce témoin est ce qui empêche
   * tous les autres de sortir verts sur le mauvais écran.
   */
  test('sans cookie, `/` sert la vitrine et non le tableau de bord', async ({ page }) => {
    const reponse = await page.goto(`${serveurVide.base}/`, { waitUntil: 'domcontentloaded' });

    expect(reponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(PRENOM_DU_LECTEUR);
  });
});
