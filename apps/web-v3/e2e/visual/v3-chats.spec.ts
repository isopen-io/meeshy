import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { SEUIL_DE_RATTRAPAGE_MS } from '../../lib/realtime/reconnect-policy';
import { avance, figeLHorloge, installeLHorloge } from './lib/navigateur-cycle';
import {
  AUTRE_CONVERSATION,
  CINQUIEME_CONVERSATION,
  CONVERSATION_DU_LECTEUR,
  LIGNES_DE_CONVERSATIONS_SERVIES,
  passerelleDeBouchon,
  QUATRIEME_CONVERSATION,
  serveurDeLaV3,
  TROISIEME_CONVERSATION,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LES DOUZE LIGNES SERVIES (spécification « le rond flottant ne recouvre plus
 * le pied de page », § T2) — `ORDRE_AU_REPOS` est ce que `/chats` sert avant
 * tout événement temps réel, DÉRIVÉ de `LIGNES_DE_CONVERSATIONS_SERVIES`
 * (`bouchon-monde.ts`) plutôt que recopié : la fixture est la SOURCE, ce spec
 * l'AFFIRME. Un littéral jumeau aurait dérivé au premier ajout de ligne — ce
 * qui est arrivé une fois déjà (#5164 → cette spécification).
 */
const ORDRE_AU_REPOS: readonly string[] = LIGNES_DE_CONVERSATIONS_SERVIES.map((ligne) => ligne.id);

/**
 * L'ORDRE ATTENDU APRÈS QU'UNE LIGNE REMONTE EN TÊTE — la ligne déplacée,
 * puis le RESTE dans l'ordre au repos. Remplace les deux littéraux à quatre
 * identifiants que douze lignes auraient rendus MENSONGERS (les huit lignes
 * de garnissage manquaient à l'appel).
 */
const apresRetri = (idEnTete: string): readonly string[] => [
  idEnTete,
  ...ORDRE_AU_REPOS.filter((id) => id !== idEnTete),
];

/**
 * `/chats` — LA LISTE DES CONVERSATIONS, EN DIRECT (issue #4753, § 12.4,
 * § 12.10.2, § 12.10.4).
 *
 * UNE SUITE DE CHAÎNE, comme le tableau de bord : l'écran n'existe que si une
 * passerelle répond, et tout ce qui est mesuré ici — le re-tri, la pastille, la
 * frappe, le balayage, le 304 du retour de focus — passe par elle.
 *
 * Chaque événement poussé par le bouchon nomme l'émetteur RÉEL qu'il copie ;
 * un vert obtenu contre une charge inventée ne prouverait rien.
 */

const LARGEURS = [360, 390] as const;
const TARGET_MIN = 44;
const CIBLES = 'a, button, input, select, summary, [role="button"]';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const contexteDuLecteur = async (
  browser: Browser,
  options: {
    readonly largeur?: number;
    readonly javaScriptEnabled?: boolean;
    readonly colorScheme?: 'light' | 'dark';
  } = {},
): Promise<BrowserContext> => {
  const contexte = await browser.newContext({
    viewport: { width: options.largeur ?? 390, height: 844 },
    ...(options.javaScriptEnabled === undefined ? {} : { javaScriptEnabled: options.javaScriptEnabled }),
    ...(options.colorScheme === undefined ? {} : { colorScheme: options.colorScheme }),
  });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

const ouvreLaListe = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  const reponse = await page.goto(`${v3.base}/chats`, { waitUntil: 'domcontentloaded' });
  expect(reponse?.status(), '/chats n’a pas servi la liste').toBe(200);
  return page;
};

const ouvre = async (browser: Browser, largeur = 390): Promise<Page> =>
  ouvreLaListe(await contexteDuLecteur(browser, { largeur }));

/** Le module arrive APRÈS le premier pixel : on l'attend par son EFFET, jamais par une minuterie. */
const attendsLeModule = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  await page.waitForTimeout(1_200);
};

const ordre = (page: Page): Promise<readonly string[]> =>
  page.$$eval('.liste ul > li', (lignes) => lignes.map((li) => (li as HTMLElement).dataset.conversation ?? ''));

test.describe('la liste des conversations', () => {
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
      const page = await ouvre(browser, largeur);

      const mesurees = await page.evaluate(
        (selecteur) =>
          [...document.querySelectorAll(selecteur)]
            .map((noeud) => {
              const rect = noeud.getBoundingClientRect();
              return {
                nom: noeud.tagName + (noeud.className === '' ? '' : `.${String(noeud.className).split(' ')[0]}`),
                h: rect.height,
                w: rect.width,
              };
            })
            .filter((cible) => cible.h > 0 && cible.w > 0)
            .filter((cible) => cible.h < 44 || cible.w < 44),
        CIBLES,
      );

      expect(mesurees, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(mesurees)}`).toEqual([]);
      await page.context().close();
    });

    /**
     * ET RIEN NE DÉBORDE (charte : « le corps de la page ne défile jamais
     * horizontalement »). Les DEUX puces d'action se partagent la largeur en
     * `flex:1` avec `white-space:nowrap` : c'est exactement la disposition qui
     * déborde en silence dès qu'un libellé s'allonge d'un mot ou qu'une police
     * système est plus large — et 360 px est le premier écran où ça se voit.
     */
    test(`ne déborde pas horizontalement à ${largeur} px`, async ({ browser }) => {
      const page = await ouvre(browser, largeur);

      const debord = await page.evaluate(() => ({
        corps: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        coupables: [...document.querySelectorAll<HTMLElement>('main *')]
          .filter((noeud) => noeud.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .map((noeud) => `${noeud.tagName}.${String(noeud.className).split(' ')[0]}`),
      }));

      expect(debord.corps, `débord horizontal : ${JSON.stringify(debord.coupables)}`).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  });

  /**
   * CHARTE RÈGLE 12 — « le premier écran d'un écran de LISTE montre au moins
   * TROIS lignes actionnables, à 360 × 844 » (`matrice.json#chats.critere_de_
   * fin`, `conception-web-v3.md:1214`).
   *
   * CE QUE CE TÉMOIN COMPTE, ET POURQUOI CE N'EST PAS LE COMPTE « PLEINE
   * LARGEUR » AU SENS LE PLUS STRICT : la règle 12 nomme des `<a>` « pleine
   * largeur ». Ici, `a.ligne` porte déjà tout le CONTENU de la ligne (nom,
   * méta, aperçu, compte de non-lus) — seul le bouton du MENU (`<details
   * class="actions">`) vit hors de lui, en flex à côté, pour rester un
   * contrôle NOMMÉ séparément (§ 12.10.4 : le menu est le chemin clavier /
   * lecteur d'écran du même geste que le balayage). Une ligne actionnable se
   * mesure donc ici par la hauteur de son `<a>` (≥ 56 px, le plancher que la
   * règle nomme) et par le fait qu'elle est ENTIÈREMENT contenue dans les 844
   * premiers pixels — la largeur relative de `a.ligne` dans sa `li` ne change
   * pas ce qu'un pouce peut toucher.
   *
   * ÉTENDU (spécification « le rond flottant ne recouvre plus le pied de
   * page », § T3, règle 12) : ce témoin affirme AUSSI que la fixture sert
   * bien AU MOINS DOUZE lignes et que le document DÉFILE — la preuve que la
   * volumétrie est RÉELLE, et que « au moins trois visibles » n'est pas
   * silencieusement devenu « toutes visibles » sur une fixture trop courte
   * pour défiler.
   */
  test('règle 12 — montre au moins trois lignes actionnables au premier écran, à 360 × 844', async ({ browser }) => {
    const page = await ouvre(browser, 360);

    const mesure = await page.evaluate(() => {
      const HAUTEUR_MIN = 56;
      const lignesDeLaListe = [...document.querySelectorAll<HTMLElement>('.liste > ul > li')];
      const actionnables = lignesDeLaListe
        .filter((li) => !li.hidden)
        .map((li) => {
          const lien = li.querySelector<HTMLElement>('a.ligne');
          const rectLi = li.getBoundingClientRect();
          const rectLien = lien?.getBoundingClientRect() ?? null;
          return {
            basDeLaLigne: rectLi.bottom,
            hauteurDuLien: rectLien?.height ?? 0,
          };
        })
        .filter((ligne) => ligne.hauteurDuLien >= HAUTEUR_MIN && ligne.basDeLaLigne <= 844);
      return {
        actionnablesAuPremierEcran: actionnables.length,
        totalDesLignes: lignesDeLaListe.length,
        defile: document.body.scrollHeight > window.innerHeight,
      };
    });

    expect(mesure.actionnablesAuPremierEcran, `lignes actionnables entièrement visibles à 844 px`).toBeGreaterThanOrEqual(3);
    expect(mesure.totalDesLignes, 'la fixture doit servir au moins douze lignes').toBeGreaterThanOrEqual(12);
    expect(mesure.defile, 'douze lignes doivent faire défiler le document').toBe(true);
    await page.context().close();
  });

  /**
   * § 12.10.3, LE COMPTE — pas « au moins une » (correction de revue,
   * défaut 3 : `ligneServie` ne pouvait pas porter `participants`, et la
   * volumétrie ne servait donc le profil que sur UNE ligne tête-à-tête sur
   * quatre, six une fois passée à douze). `homologueDe` élit l'autre
   * personne d'un tête-à-tête PARMI les `participants` de la ligne : une
   * ligne à deux membres SANS ce champ n'ouvre PAS de profil, exactement
   * comme la passerelle réelle qui ne le sert pas ne le ferait pas
   * (`core-list.ts:781`, `participants` inconditionnel). Ce témoin arrime
   * donc la fixture ELLE-MÊME — il rougit le jour où une ligne à deux
   * membres oublie `participants`, pas seulement le jour où le rendu casse.
   */
  test('toute ligne à deux membres porte un lien vers le profil de l’homologue', async ({ browser }) => {
    const page = await ouvre(browser);

    const tetesATete = LIGNES_DE_CONVERSATIONS_SERVIES.filter((ligne) => ligne.memberCount === 2);
    const groupes = LIGNES_DE_CONVERSATIONS_SERVIES.filter((ligne) => ligne.memberCount !== 2);
    expect(tetesATete.length, 'la fixture doit compter au moins un tête-à-tête').toBeGreaterThan(0);

    await expect(page.locator('a.avatar-lien')).toHaveCount(tetesATete.length);

    for (const ligne of tetesATete) {
      await expect(
        page.locator(`li[data-conversation="${ligne.id}"] a.avatar-lien`),
        `« ${ligne.title} » (2 membres) doit porter un lien vers le profil de l’homologue`,
      ).toHaveCount(1);
    }
    for (const ligne of groupes) {
      await expect(
        page.locator(`li[data-conversation="${ligne.id}"] a.avatar-lien`),
        `« ${ligne.title} » (${ligne.memberCount} membres) n’a personne à montrer`,
      ).toHaveCount(0);
    }
    await page.context().close();
  });

  test('ne porte aucune violation axe serious/critical', async ({ browser }) => {
    const page = await ouvre(browser);

    const rapport = await new AxeBuilder({ page }).analyze();
    const graves = rapport.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

    expect(graves.map((v) => `${v.id} — ${v.help}`)).toEqual([]);
    await page.context().close();
  });

  /**
   * LA CONVERSATION MISE EN AVANT (#5164, `cible/chats.png`) — la PREMIÈRE non
   * lue de l'ordre servi (`CONVERSATION_DU_LECTEUR`, `nonLus:3`) devient une
   * carte ; `AUTRE_CONVERSATION` (`nonLus:0`) reste une ligne plate.
   */
  test('rend la première conversation non lue en carte, et les autres à plat', async ({ browser }) => {
    const page = await ouvre(browser);

    await expect(page.locator('li.vedette')).toHaveCount(1);
    await expect(page.locator('li.vedette')).toHaveAttribute('data-conversation', CONVERSATION_DU_LECTEUR.id);
    await expect(page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`)).not.toHaveClass(/vedette/);

    // L'AVATAR DE LA CARTE A LA TAILLE DE CELUI D'UNE LIGNE PLATE. La cible est
    // capturée à `deviceScaleFactor: 2` (`compare-rendu.js:194-195`) : le disque
    // « ÉL » y mesure 92 px D'APPAREIL, soit 46 px CSS — `--avatar`. Un premier
    // jet avait lu le chiffre BRUT et posé 96 px CSS, deux fois trop grand.
    const avatarVedette = await page.locator('li.vedette .avatar').boundingBox();
    const avatarAPlat = await page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] .avatar`).boundingBox();
    expect(avatarVedette?.width, 'avatar de la vedette').toBe(avatarAPlat?.width);
    expect(avatarVedette?.height, 'avatar de la vedette').toBe(avatarAPlat?.height);

    // ET LES PISTES DU BALAYAGE NE DÉBORDENT PAS DE LA CARTE AU REPOS : la
    // glissière couvre le `li` sur toute sa largeur — un `padding` posé sur le
    // `li` laissait les deux teintes peindre ses marges (mesuré sur
    // `rendu/chats.dark.png`, rgb(44,31,43) à x=55 et x=725).
    const carte = await page.locator('li.vedette').boundingBox();
    const glissiere = await page.locator('li.vedette .glissiere').boundingBox();
    expect(glissiere?.width, 'la glissière couvre la carte').toBe(carte?.width);

    // L'APERÇU EST SUR SA PROPRE LIGNE, PLEINE LARGEUR (cible chats.png) : il
    // commence au bord GAUCHE de l'avatar et court jusqu'au bord droit de la
    // carte — c'est ce que la mise en avant donne de plus qu'une ligne plate,
    // où l'aperçu partage sa colonne avec le nom.
    const ligneVedette = await page.locator('li.vedette a.ligne').boundingBox();
    const apercu = await page.locator('li.vedette .apercu').boundingBox();
    expect(apercu?.x, 'l’aperçu part du bord de l’avatar').toBeCloseTo(avatarVedette?.x ?? -1, 0);
    expect(apercu?.width, 'l’aperçu court sur toute la ligne').toBe(ligneVedette?.width);

    const apercuAPlat = await page
      .locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] .apercu`)
      .boundingBox();
    expect(apercuAPlat?.x ?? 0, 'la ligne plate garde sa colonne').toBeGreaterThan(avatarAPlat?.x ?? 0);

    const ligneAPlat = await page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] a.ligne`).boundingBox();
    expect(ligneAPlat?.height, 'ligne plate').toBeGreaterThanOrEqual(80);
    await page.context().close();
  });

  /**
   * LA VEDETTE SE DÉPLACE EN DIRECT, SANS RECHARGEMENT — la MÊME règle que le
   * document servi (`vedetteDe`), rejouée à chaque `conversation:updated` +
   * `conversation:unread-updated` (`MeeshySocketIOManager.ts:3216`,
   * `emitUnreadCountsToRecipients.ts:214-217`).
   */
  test('la vedette se déplace en direct quand une autre conversation devient non lue', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);

    await expect(page.locator('li.vedette')).toHaveAttribute('data-conversation', CONVERSATION_DU_LECTEUR.id);

    passerelle.socket.diffuseLaLigne({
      conversationId: AUTRE_CONVERSATION.id,
      pour: 'u1',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Le fichier est parti',
      lastMessageOriginalLanguage: 'fr',
      unreadCount: 4,
    });

    await expect
      .poll(() => page.locator('li.vedette').getAttribute('data-conversation'))
      .toBe(AUTRE_CONVERSATION.id);
    await expect(page.locator(`li[data-conversation="${CONVERSATION_DU_LECTEUR.id}"]`)).not.toHaveClass(/vedette/);

    // Et la vedette REVIENT quand cette conversation retombe à zéro non lu —
    // celle qui reste non lue (CONVERSATION_DU_LECTEUR, toujours 3) la reprend.
    passerelle.socket.diffuseLaLigne({
      conversationId: AUTRE_CONVERSATION.id,
      pour: 'u1',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Le fichier est parti',
      lastMessageOriginalLanguage: 'fr',
      unreadCount: 0,
    });

    await expect
      .poll(() => page.locator('li.vedette').getAttribute('data-conversation'))
      .toBe(CONVERSATION_DU_LECTEUR.id);
    await page.context().close();
  });

  /**
   * § 12.10.2 — « le nombre de participants ne s'affiche pas dans une
   * conversation à deux ». Le témoin porte sur le DOM SERVI, et il oppose les
   * deux moitiés de la règle sur le même écran.
   */
  test('tait le compte de participants à deux, et le dit à partir de trois', async ({ browser }) => {
    const page = await ouvre(browser);

    const aDeux = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] .meta`);
    const aDouze = page.locator(`li[data-conversation="${CONVERSATION_DU_LECTEUR.id}"] .meta`);

    await expect(aDouze).toContainText('participants');
    expect(await aDeux.textContent()).not.toContain('participants');
    await page.context().close();
  });

  /**
   * LE PRISME AU RANG 1 — le lecteur du bouchon porte un prisme `['fr', 'es']`
   * (`systemLanguage: 'fr'`, `regionalLanguage: 'es'`, `bouchon-compte.ts:
   * 761-762`) ; `AUTRE_CONVERSATION` a une traduction FRANÇAISE, servie dès le
   * rang 1. Ce qui se mesure au NAVIGATEUR est ce que le lecteur VOIT : le
   * texte servi est la traduction, pas l'original, et la pastille annonce la
   * langue d'ORIGINE. Le rang ≠ 1 (leçon 261 — un court-circuit sur le rang 1
   * rendrait le MÊME verdict qu'une descente juste) est mesuré au navigateur
   * par `CINQUIEME_CONVERSATION`, deux témoins plus bas — ce commentaire
   * disait autrefois que le rang ≠ 1 « n'était pas mesurable ici », ce qui
   * n'était vrai que faute d'une ligne qui manque au rang 1.
   */
  test('sert la traduction et annonce la langue d’origine', async ({ browser }) => {
    const page = await ouvre(browser);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);

    await expect(ligne.locator('.apercu .texte')).toHaveText(AUTRE_CONVERSATION.traductions.fr);
    await expect(ligne.locator('.langue .code')).toHaveText(AUTRE_CONVERSATION.langueOriginale);
    // `lang` n'est PAS posé : la langue servie est celle du document. Un `lang`
    // redondant serait du bruit pour un lecteur d'écran — la règle est « sur
    // tout nœud rendu dans une langue ≠ <html lang> », pas « sur tout nœud ».
    expect(await ligne.locator('.apercu .texte').getAttribute('lang')).toBeNull();
    await page.context().close();
  });

  /**
   * CHARTE RÈGLE 30, LE RANG ≠ 1 AU NAVIGATEUR (§ T3 de la spécification « le
   * rond flottant ne recouvre plus le pied de page ») — `CINQUIEME_CONVERSATION`
   * n'a AUCUNE traduction française, seulement espagnole : la descente
   * ordonnée du prisme `['fr', 'es']` doit donc servir le RANG 2 — texte
   * espagnol, `lang="es"`, pastille annonçant `en` (la langue d'ORIGINE,
   * jamais celle qu'elle sert). Un court-circuit qui testerait seulement « la
   * langue d'origine appartient au prisme » rendrait le même résultat qu'une
   * descente juste au rang 1 (leçon 261) ; c'est cette ligne, au rang 2, qui
   * les sépare.
   */
  test('descend le prisme au rang 2 quand le rang 1 n’est pas servi', async ({ browser }) => {
    const page = await ouvre(browser);
    const ligne = page.locator(`li[data-conversation="${CINQUIEME_CONVERSATION.id}"]`);

    await expect(ligne.locator('.apercu .texte')).toHaveText(CINQUIEME_CONVERSATION.traductions?.es ?? '');
    expect(await ligne.locator('.apercu .texte').getAttribute('lang')).toBe('es');
    await expect(ligne.locator('.langue .code')).toHaveText(CINQUIEME_CONVERSATION.langueOriginale);
    await page.context().close();
  });

  /**
   * CHARTE RÈGLE 30, SANS PASTILLE (§ T3) — quand l'original gagne déjà son
   * rang (`resolvePrismTranslation` rend `null`), la fente `.langue` reste
   * SERVIE mais MASQUÉE (`hidden`) : elle existe pour que le module de
   * participation puisse l'annoncer plus tard sans créer de nœud sous le
   * doigt du lecteur, mais rien ne l'affiche aujourd'hui.
   * `QUATRIEME_CONVERSATION` (original français, aucune traduction) est cette
   * ligne — la SEULE des cinq lignes nommées sans pastille.
   */
  test('sans traduction, la pastille de langue reste servie mais masquée', async ({ browser }) => {
    const page = await ouvre(browser);
    const ligne = page.locator(`li[data-conversation="${QUATRIEME_CONVERSATION.id}"]`);

    await expect(ligne.locator('.apercu .texte')).toHaveText(QUATRIEME_CONVERSATION.apercu);
    expect(await ligne.locator('.apercu .texte').getAttribute('lang')).toBeNull();
    await expect(ligne.locator('.langue')).toBeHidden();
    await expect(ligne.locator('.langue .code')).toHaveText('');
    await page.context().close();
  });

  /**
   * CHARTE RÈGLE 15, LES DEUX RANGS DE HAUTEUR (§ T3) — les puces d'action
   * tertiaires ≥ 52 px (`--action-height-secondary`, `.action.contour`), les
   * lignes plates ≥ 80 px (`--row-height`, `.liste a.ligne`). Les deux
   * planchers sont posés par la feuille (`enveloppe/feuille.ts`,
   * `liste-feuille.ts`) mais aucun témoin ne les mesurait encore au PIXEL, au
   * navigateur.
   */
  test('règle 15 — puces d’action ≥ 52 px, ligne plate ≥ 80 px', async ({ browser }) => {
    const page = await ouvre(browser);

    const puces = await page.locator('.actions-rapides .action').all();
    // DEUX, jamais « au moins une » : la règle 15 nomme DEUX puces (« Créer
    // un lien » / « Conversation »), et un `> 0` aurait laissé passer la
    // disparition de l'une d'elles — c'est le compte, autant que la hauteur,
    // que la règle porte. Leurs LIBELLÉS et leur ORDRE sont tenus par
    // `__tests__/chats.test.ts` § « deux puces contour de même rang ».
    expect(puces.length, 'la règle 15 nomme DEUX puces d’action').toBe(2);
    for (const puce of puces) {
      const boite = await puce.boundingBox();
      expect(boite?.height, 'puce d’action tertiaire').toBeGreaterThanOrEqual(52);
    }

    const ligne = await page.locator(`li[data-conversation="${TROISIEME_CONVERSATION.id}"] a.ligne`).boundingBox();
    expect(ligne?.height, 'ligne plate').toBeGreaterThanOrEqual(80);
    await page.context().close();
  });

  /**
   * LE RE-TRI EN DIRECT — `conversation:updated` vers la room PERSONNELLE
   * (`MeeshySocketIOManager.ts:3216`), suivi de `conversation:unread-updated`
   * (`emitUnreadCountsToRecipients.ts`). Aucun rechargement, aucune requête de
   * liste : la ligne bouge sur l'événement seul.
   */
  test('remonte la conversation et bouge sa pastille, sans rechargement', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);

    expect(await ordre(page)).toEqual(ORDRE_AU_REPOS);

    passerelle.socket.diffuseLaLigne({
      conversationId: AUTRE_CONVERSATION.id,
      pour: 'u1',
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Le fichier est parti',
      lastMessageOriginalLanguage: 'fr',
      unreadCount: 4,
    });

    await expect
      .poll(() => ordre(page))
      .toEqual(apresRetri(AUTRE_CONVERSATION.id));
    await expect(page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] .compte`)).toContainText('4');
    await expect(page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] .apercu .texte`)).toHaveText('Le fichier est parti');
    await page.context().close();
  });

  /**
   * LA FRAPPE SE VOIT — `typing:start` est poussé à la room de CONVERSATION
   * (`StatusHandler.ts:292`), que la passerelle joint à l'authentification
   * (`AuthHandler._joinUserConversations`) : la liste n'émet aucune jonction.
   */
  test('montre la frappe à la place de l’aperçu, puis la rend', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const ligne = page.locator(`li[data-conversation="${CONVERSATION_DU_LECTEUR.id}"]`);

    const evenement = { userId: 'u3', username: 'marta', displayName: 'Marta Ruiz', conversationId: CONVERSATION_DU_LECTEUR.id, isTyping: true };
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'typing:start', evenement);

    await expect(ligne.locator('.frappe')).toBeVisible();
    await expect(ligne.locator('.frappe')).toContainText('Marta Ruiz');
    await expect(ligne.locator('.apercu')).toBeHidden();

    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'typing:stop', { ...evenement, isTyping: false });
    await expect(ligne.locator('.frappe')).toBeHidden();
    await expect(ligne.locator('.apercu')).toBeVisible();
    await page.context().close();
  });

  /**
   * § 12.10.4 — LE GESTE AU DOIGT, ET SON JUMEAU AU CLAVIER. Les deux passent
   * par le MÊME formulaire, donc par la même route : c'est ce qui garantit
   * qu'aucun chemin n'est réservé au doigt.
   */
  test('archive au clavier, par le menu de la ligne', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);

    await ligne.locator('summary').click();
    await ligne.getByRole('button', { name: 'Archiver' }).click();

    await expect(ligne).toBeHidden();
    await expect(page.locator('#journal-des-gestes')).toContainText('archivée');
    // RÉVERSIBLE tant que le serveur n'a pas confirmé : le bouton est là, et
    // rien n'est encore parti.
    await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible();
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('user-preferences'))).toEqual([]);

    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(ligne).toBeVisible();
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('user-preferences'))).toEqual([]);
    await page.context().close();
  });

  /**
   * L'AVATAR N'EST PAS UN QUART DE LIGNE SANS BALAYAGE (correction de revue,
   * #5164) — `a.avatar-lien` (le disque qui ouvre le profil de l'autre
   * personne d'un tête-à-tête, § 12.10.3) occupe tout le bord gauche de la
   * ligne, l'endroit le plus naturel où un pouce amorce un balayage vers la
   * droite. Sans `draggable="false"`, Chromium ouvrait un glisser-déposer
   * natif dès que le pointeur bougeait, ce qui annulait le geste — mesuré :
   * AUCUN effet. Même geste, même ligne (`AUTRE_CONVERSATION` porte un
   * `a.avatar-lien` — `homologueDe` l'élit sur un tête-à-tête), amorcé sur
   * l'avatar plutôt que sur le corps.
   */
  test('archive au doigt même quand le balayage part de l’avatar', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);
    const avatar = ligne.locator('a.avatar-lien');

    await expect(avatar).toHaveAttribute('draggable', 'false');

    const boite = await avatar.boundingBox();
    expect(boite).not.toBeNull();

    const y = (boite?.y ?? 0) + (boite?.height ?? 0) / 2;
    await page.mouse.move((boite?.x ?? 0) + (boite?.width ?? 0) / 2, y);
    await page.mouse.down();
    await page.mouse.move((boite?.x ?? 0) + (boite?.width ?? 0) + 140, y, { steps: 10 });
    await page.mouse.up();

    await expect(ligne).toBeHidden();
    await expect(page.locator('#journal-des-gestes')).toContainText('archivée');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(ligne).toBeVisible();
    await page.context().close();
  });

  test('supprime au doigt, par un balayage vers la gauche', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);
    // Le geste part du CORPS de la ligne, jamais de son menu : un balayage né
    // sur un contrôle appartient au contrôle, et le module le lui laisse.
    const boite = await ligne.locator('a.ligne').boundingBox();
    expect(boite).not.toBeNull();

    const y = (boite?.y ?? 0) + (boite?.height ?? 0) / 2;
    await page.mouse.move((boite?.x ?? 0) + (boite?.width ?? 0) / 2, y);
    await page.mouse.down();
    await page.mouse.move((boite?.x ?? 0) + 8, y, { steps: 10 });
    await page.mouse.up();

    await expect(ligne).toBeHidden();
    await expect(page.locator('#journal-des-gestes')).toContainText('supprimée');

    try {
      /**
       * LA FENÊTRE PASSÉE, LE GESTE PART — et « Annuler » DISPARAÎT.
       *
       * Le bouton survivait à sa fenêtre : `defais` sortait aussitôt (le
       * différé étant soldé), donc il restait à l'écran sans aucun effet — ce
       * que la charte interdit. Et il emportait le focus du clavier avec lui
       * quand la région changeait.
       *
       * Le témoin attend la sortie RÉELLE plutôt que la fermeture de l'onglet :
       * un geste encore en vol à la fermeture retombait sur le spec SUIVANT,
       * dont la ligne disparaissait pour une raison qui n'était pas la sienne
       * (mesuré). D'où aussi la remise d'aplomb du `finally` — la porte est à
       * SENS UNIQUE, y compris pour la suite.
       */
      await expect
        .poll(() => passerelle.journal.filter((appel) => appel.methode === 'DELETE' && appel.chemin.endsWith('/delete-for-me')).length, {
          timeout: 15_000,
        })
        .toBe(1);
      await expect(page.getByRole('button', { name: 'Annuler' })).toHaveCount(0);
    } finally {
      passerelle.masquees.delete(AUTRE_CONVERSATION.id);
      await page.context().close();
    }
  });

  /**
   * LE RETOUR DE FOCUS NE REFAIT PAS LA LISTE (§ 7, critère de fin de #4753) :
   * il demande `/sync` avec son validateur, et la passerelle rend 304 SANS
   * corps. Un `GET /conversations` complet à chaque bascule d'onglet serait la
   * lenteur que la directive appelle un bug.
   */
  test('au retour de focus, demande /sync — et jamais la liste entière', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    passerelle.oublie();

    // Deux allers-retours : le premier pose le validateur, le second doit rendre 304.
    for (let tour = 0; tour < 2; tour += 1) {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(600);
    }

    const sync = passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/v1/sync'));
    const listes = passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/v1/conversations?'));

    expect(sync.length, 'le retour de focus doit demander /sync').toBeGreaterThanOrEqual(2);
    /**
     * LE STATUT EST LU, PAS SUPPOSÉ. Ce témoin ne regardait que les CHEMINS
     * appelés : un `/sync` qui aurait répondu 401 ou 500 — et que le module
     * avale en silence (`.catch(() => null)`) — l'aurait laissé vert, en
     * prouvant seulement qu'une requête part.
     *
     * LE PREMIER appel n'a aucun validateur à annoncer (rien n'a encore posé
     * `If-None-Match`) et rend donc 200. LE SECOND est exigé 304 : `ETag` est
     * désormais exposé par CORS (`CORS_EXPOSED_HEADERS`, `server.ts`, #5015 —
     * avant ce correctif, `reponse.headers.get('etag')` rendait `null` depuis
     * une autre origine et le module n'avait aucun validateur à renvoyer, d'où
     * l'admission de 200 que ce témoin portait). Le court-circuit du 304 est,
     * lui, tenu aussi sans navigateur — `__tests__/liste-rattrapage.test.ts`.
     */
    expect(sync[0]?.statut).toBe(200);
    expect(sync[1]?.statut, 'le second /sync doit rendre 304 — l’ETag exposé par CORS le permet').toBe(304);
    /**
     * ET LE CURSEUR PART. Le premier tour n'en a aucun à annoncer ; les
     * suivants renvoient le `checkpointSeq` reçu — sans quoi la passerelle ne
     * peut JAMAIS signaler de trou (`routes/sync/index.ts:360`), et le bandeau
     * de la liste reste une promesse morte. Le témoin qui le PEINT est plus bas.
     */
    const seq = (appel: (typeof sync)[number]): string | null =>
      new URL(appel.chemin, 'http://bouchon').searchParams.get('seq');
    expect(seq(sync[0]!)).toBeNull();
    expect(seq(sync[sync.length - 1]!)).not.toBeNull();
    /**
     * ET SEULS SES CHAMPS PARTENT (#5088). Le rattrapage corrige le RANG : il
     * lit l'identifiant et l'instant, la passerelle rétrécit sa requête autant
     * que sa réponse (`SYNC_FIELD_VOCABULARY`, #4173). Sans ce paramètre,
     * chaque retour de focus repayait les ~12 colonnes de
     * `syncConversationSelect` — description, avatar, banner — pour n'en lire
     * que deux.
     */
    sync.forEach((appel) => {
      expect(new URL(appel.chemin, 'http://bouchon').searchParams.get('fields')).toBe(
        'conversations.id,conversations.lastMessageAt',
      );
    });
    // La collection DEMANDÉE est `conversations`, et elle seule : la liste n'a
    // que faire des messages, et les demander ferait payer au retour de focus
    // ce que le fil paie déjà de son côté.
    expect(sync.every((appel) => appel.chemin.includes('collections=conversations'))).toBe(true);
    expect(sync.some((appel) => appel.chemin.includes('collections=messages'))).toBe(false);
    // ET AUCUN REFETCH COMPLET — c'est la moitié du critère qui porte la
    // LENTEUR. `GET /conversations` à chaque bascule d'onglet est exactement ce
    // que la directive appelle un bug.
    expect(listes, 'aucun refetch complet de la liste au retour de focus').toEqual([]);
    await page.context().close();
  });

  /** Un onglet caché n'émet RIEN (§ 8.5, gate de cycle de vie). */
  test('ne demande rien pendant que l’onglet est caché', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    passerelle.oublie();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(800);

    expect(passerelle.journal.map((appel) => appel.chemin)).toEqual([]);
    await page.context().close();
  });

  /**
   * `hasGap` PEINT SON SÉPARATEUR — et il ne le pouvait pas.
   *
   * La passerelle ne calcule le trou QUE si le client annonce son curseur
   * (`routes/sync/index.ts:360` : `seq !== undefined && seq < checkpointSeq -
   * GAP_THRESHOLD`). La liste n'envoyait aucun `seq` : `montreLeTrou` était une
   * branche que le serveur ne pouvait pas atteindre, et le bandeau « Des
   * messages manquent » une promesse morte. Le jumeau de ce témoin vit sur le
   * fil (`v3-fil.spec.ts`), qui, lui, annonçait déjà son curseur.
   *
   * DEUX retours, parce que le premier n'a aucun curseur à annoncer.
   */
  test('un trou creusé par la passerelle peint son bandeau — /sync annonce le dernier seq connu', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const retourDeFocus = async (): Promise<void> => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(600);
    };

    try {
      await retourDeFocus();
      expect(await page.locator('.manque').count(), 'aucun trou sans curseur annoncé').toBe(0);

      passerelle.creuseUnTrou();
      await retourDeFocus();

      await expect(page.locator('.manque a[href]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.manque')).toContainText('Recharger');
    } finally {
      passerelle.sync.curseur = 0;
      await page.context().close();
    }
  });

  /**
   * LA CHUTE DU SOCKET, L'ONGLET RESTÉ À L'ÉCRAN — le cas de la 3G rurale, et
   * celui que la liste ne rattrapait pas.
   *
   * Socket.IO NE REJOUE RIEN : chaque `conversation:updated` de la fenêtre est
   * perdu pour de bon. Le fil rattrapait déjà après une absence de plus de
   * `SEUIL_DE_RATTRAPAGE_MS` ; la liste n'écoutait ni `disconnect` ni
   * `authenticated`, et son seul déclencheur était le retour de VISIBILITÉ —
   * c'est-à-dire l'événement qui, ici, ne vient jamais.
   *
   * La coupure est celle de la PASSERELLE (`socket.coupe()`), pas celle du
   * navigateur : `setOffline` produirait un `online` au retour, donc une
   * `reprise`, donc un rattrapage — et le témoin serait vert sans rien prouver.
   */
  test('rattrape le rang après une chute du socket, sans masquage ni rechargement', async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    await installeLHorloge(contexte);
    const page = await ouvreLaListe(contexte);
    await attendsLeModule(page);
    await figeLHorloge(contexte);

    try {
      await expect.poll(() => passerelle.socket.connectes()).toBe(1);
      expect(await ordre(page)).toEqual(ORDRE_AU_REPOS);

      passerelle.socket.coupe();
      await expect.poll(() => passerelle.socket.connectes()).toBe(0);
      // Ce qui se dit pendant l'absence : la seconde conversation prend la tête.
      // Aucun socket ne le portera — seul `/sync` peut le rendre.
      passerelle.sync.conversations = [{ id: AUTRE_CONVERSATION.id, lastMessageAt: new Date(Date.now() + 60_000).toISOString() }];

      await avance(contexte, SEUIL_DE_RATTRAPAGE_MS + 5_000);
      passerelle.socket.retablis();

      /**
       * LE RETOUR SE JOUE À DEUX HORLOGES, et il faut les faire alterner.
       *
       * Le backoff de reconnexion est une minuterie de PAGE : elle ne bat que
       * pendant `avance`. La poignée de main, elle, est RÉELLE : elle a besoin
       * de millisecondes machine que `runFor`, qui comprime le temps de page,
       * ne donne pas. Avancer d'un seul bloc puis attendre en temps réel ne
       * marche donc pas — la minuterie a battu, mais la connexion qu'elle a
       * lancée n'a jamais eu le temps d'aboutir.
       */
      for (let essai = 0; essai < 8 && passerelle.socket.connectes() === 0; essai += 1) {
        await avance(contexte, 30_000);
        await page.waitForTimeout(300);
      }

      expect(passerelle.socket.connectes(), 'le socket doit s’être rétabli').toBe(1);
      await expect.poll(() => ordre(page), { timeout: 20_000 }).toEqual(apresRetri(AUTRE_CONVERSATION.id));
    } finally {
      passerelle.socket.retablis();
      passerelle.sync.conversations = [];
      await contexte.close();
    }
  });

  /**
   * § 12.10.4 — LA FENÊTRE D'ANNULATION EST ATTEIGNABLE AU CLAVIER.
   *
   * Le geste part du menu ; la ligne est ensuite CACHÉE, donc le
   * `<button>Archiver</button>` qui tenait le focus disparaît avec elle et le
   * focus retombait sur `<body>`. Le bouton « Annuler » naissait sans focus :
   * il fallait re-tabuler depuis le haut du document en moins de cinq secondes
   * — et pour `supprimer`, manquer la fenêtre, c'est franchir une porte à SENS
   * UNIQUE côté serveur. Le geste était RÉVERSIBLE au doigt et IRRÉVERSIBLE au
   * clavier (WCAG 2.4.3) ; le témoin de clic à la souris ne pouvait pas le voir.
   */
  test('donne le focus à « Annuler », et le rend à la ligne quand elle revient', async ({ browser }) => {
    const page = await ouvre(browser);
    await attendsLeModule(page);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);

    const nomDuFocus = (): Promise<string> =>
      page.evaluate(() => {
        const actif = document.activeElement as HTMLElement | null;
        if (actif === null) return 'aucun';
        const li = actif.closest('li[data-conversation]') as HTMLElement | null;
        return `${actif.tagName}${li === null ? '' : `@${li.dataset.conversation ?? ''}`}`;
      });

    await ligne.locator('summary').click();
    await ligne.getByRole('button', { name: 'Archiver' }).click();
    await expect(ligne).toBeHidden();

    // LE FOCUS EST SUR « ANNULER » — sans le nommer par un sélecteur : c'est le
    // nœud ACTIF qui doit être ce bouton, sinon le clavier ne l'atteint pas.
    await expect(page.locator('#journal-des-gestes button:focus')).toHaveText('Annuler');

    await page.keyboard.press('Enter');
    await expect(ligne).toBeVisible();
    // ET IL REVIENT SUR LA LIGNE, jamais sur `<body>` : le clavier reprend là
    // où le geste était parti.
    expect(await nomDuFocus()).toBe(`SUMMARY@${AUTRE_CONVERSATION.id}`);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('user-preferences'))).toEqual([]);
    await page.context().close();
  });

  /**
   * « ARCHIVER » A UN EFFET QUI SURVIT AU RECHARGEMENT — sans un octet de
   * JavaScript, c'est-à-dire sur le chemin qui marche partout.
   *
   * `GET /conversations` NE FILTRE PAS les archivées : `whereClause`
   * (`routes/conversations/core-list.ts:176-247`) ne mentionne pas
   * `isArchived`, dont la seule occurrence de la route est le `select` qui le
   * SERT (`core-selects.ts:65`). C'est au CLIENT d'écarter la ligne — la
   * webapp legacy le fait déjà (`useConversationFiltering.ts:56-59`). Tant que
   * la v3 ne relisait pas ce champ, le `POST` menait à un `303` puis à un `GET`
   * qui re-servait la ligne SOUS la bannière « Conversation archivée. » : un
   * contrôle qui MENT.
   *
   * Le bouchon ne filtre plus non plus (il le faisait, et rendait cette suite
   * verte contre un serveur qui n'existe pas) : ce témoin ne peut plus passer
   * qu'en mesurant le client.
   */
  test('sans JavaScript, une conversation archivée ne revient pas au rechargement', async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser, { javaScriptEnabled: false });
    const page = await ouvreLaListe(contexte);
    const ligne = page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`);

    try {
      await expect(ligne).toBeVisible();
      await page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"] summary`).click();
      await page.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`).getByRole('button', { name: 'Archiver' }).click();

      // Post/Redirect/Get : la porte a appliqué le geste et re-servi la liste.
      await page.waitForURL(/\/chats\?fait=/);
      expect(passerelle.journal.some((appel) => appel.methode === 'PUT' && appel.chemin.includes('user-preferences'))).toBe(true);
      await expect(page.locator('#journal-des-gestes')).toContainText('archivée');
      await expect(ligne).toHaveCount(0);

      // ET AU RECHARGEMENT SUIVANT, elle est toujours partie — c'est là que le
      // défaut se voyait : la passerelle la ressert, le client doit l'écarter.
      const rechargee = await ouvreLaListe(contexte);
      await expect(rechargee.locator(`li[data-conversation="${AUTRE_CONVERSATION.id}"]`)).toHaveCount(0);
      await expect(rechargee.locator(`li[data-conversation="${CONVERSATION_DU_LECTEUR.id}"]`)).toBeVisible();
    } finally {
      passerelle.preferences.delete(AUTRE_CONVERSATION.id);
      await contexte.close();
    }
  });
});
