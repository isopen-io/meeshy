import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { ciblesMesurees, ciblesTropPetites, LARGEURS } from './lib/cibles';
// La loi du verdict et les quatre colonnes viennent de `verdict-axe.ts`, pas de
// `lib/a11y.ts` qui les ré-exporte : ce spec monte sa propre chaîne (projet
// `chaines`), et `lib/a11y.ts` importe un `.mjs` que le transpile CommonJS de
// Playwright ne charge pas là — la même frontière que `v3-fil-a11y.spec.ts`
// nomme dans son en-tête.
import { COLONNES_DE_THEME, violationsBloquantes } from './lib/verdict-axe';
import {
  CONVERSATION_DU_LECTEUR,
  CONVERSATION_RICHE,
  messagesRiches,
  passerelleDeBouchon,
  PISTE_TRADUITE,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LES SIX FORMES D'UN MESSAGE (issue #4835, `cible/rich.png`) — sur la chaîne
 * réelle : le serveur de la v3 tel que `next build` l'a émis et la passerelle de
 * bouchon, qui sert ici les six charges que la passerelle sert (chaque champ
 * cite son émetteur dans `lib/bouchon-monde.ts`).
 *
 * Ce que ces témoins gardent :
 *
 *   • les quatre genres de pièce et les trois genres de citation sont rendus par
 *     le MÊME élément, distingué par `data-genre` — et le glyphe élu est le SEUL
 *     qui ait une boîte, ce qu'aucune lecture de source ne peut prouver ;
 *   • rien ne se télécharge avant un geste : zéro requête vers un fichier, sur
 *     un fil qui porte une image, une vidéo et un vocal ;
 *   • le vocal joue la piste de la langue SERVIE, jamais l'originale (cycle 128) ;
 *   • aucune cible sous 44 px et aucun débordement horizontal à 360 comme à
 *     390 px (charte règles 4 et 9), sur l'écran le plus dense du fil ;
 *   • les deux captures 390×844, claire et sombre, que le rapport REGARDE.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-fil-riche.spec.ts';

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;

const contexteDuMembre = async (
  navigateur: Browser,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> => {
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

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  messagesRiches(CONVERSATION_DU_LECTEUR.id).forEach((message) => passerelle.ajouteUnMessage(message));
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.oublie();
});

test.describe('six formes, deux tables — sans JavaScript', () => {
  test('rend chaque pièce et chaque citation par le même élément, et n’élit qu’UN glyphe', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li[data-id="r1"] ul.pieces > li')).toHaveAttribute('data-genre', 'image');
    await expect(page.locator('li[data-id="r2"] ul.pieces > li')).toHaveAttribute('data-genre', 'video');
    await expect(page.locator('li[data-id="r3"] ul.pieces > li')).toHaveAttribute('data-genre', 'audio');
    await expect(page.locator('li[data-id="r4"] li.citation')).toHaveAttribute('data-genre', 'transfert');
    await expect(page.locator('li[data-id="r5"] li.citation')).toHaveAttribute('data-genre', 'reponse');
    await expect(page.locator('li[data-id="r6"] li.citation')).toHaveAttribute('data-genre', 'story');

    // UN BLOC par pièce, et le genre le choisit : une affiche pour ce qui se
    // télécharge, un lecteur pour ce qui se lit. La cible ne dessine JAMAIS une
    // affiche de téléchargement PUIS un lecteur natif — et seul le navigateur
    // peut dire lequel des deux a une boîte.
    const blocs = await page.evaluate(() =>
      [...document.querySelectorAll('ul.pieces > li')].map((item) => ({
        genre: (item as HTMLElement).dataset.genre ?? '',
        vus: ['a.media', 'details.lecteur']
          .filter((selecteur) => ((item.querySelector(selecteur) as HTMLElement | null)?.getBoundingClientRect().height ?? 0) > 0)
          .map((selecteur) => selecteur),
      })),
    );
    // Le DOM va du plus récent au plus ancien (`column-reverse`, feuille du fil).
    expect(blocs).toEqual([
      { genre: 'audio', vus: ['details.lecteur'] },
      { genre: 'video', vus: ['details.lecteur'] },
      { genre: 'image', vus: ['a.media'] },
    ]);

    // UN glyphe élu par porteur : les autres sont dans le DOM (c'est ce qui
    // permet au module de changer un attribut plutôt que de redessiner) mais
    // n'ont AUCUNE boîte. La lecture de la feuille ne le prouve pas ; le
    // navigateur, oui.
    const visibles = await page.evaluate(() =>
      [...document.querySelectorAll('ul.pieces > li[data-genre=image], ul.pieces > li[data-genre=fichier], li.citation')].map((porteur) => ({
        genre: (porteur as HTMLElement).dataset.genre ?? '',
        elus: [...porteur.querySelectorAll('.glyphe')]
          .filter((glyphe) => (glyphe as HTMLElement).getBoundingClientRect().width > 0)
          .map((glyphe) => (glyphe as HTMLElement).dataset.genre ?? ''),
      })),
    );
    expect(visibles).toHaveLength(4);
    visibles.forEach(({ genre, elus }) => expect(elus).toEqual([genre]));
    await contexte.close();
  });

  test('annonce durée et poids, et ne télécharge RIEN avant un geste', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li[data-id="r1"] .poids')).toHaveText('420 Ko');
    await expect(page.locator('li[data-id="r2"] .poids')).toHaveText('0:42 · 3,0 Mo');
    await expect(page.locator('li[data-id="r3"] .poids')).toHaveText('0:21 · 94 Ko');
    expect(await page.locator('img').count()).toBe(0);

    await page.waitForTimeout(500);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/'))).toEqual([]);
    await contexte.close();
  });

  /**
   * LA PISTE SUIT LE TEXTE (cycle 128) : le vocal est transcrit en yoruba,
   * servi en français, et c'est la piste FRANÇAISE qui est prête à jouer. Une
   * seconde descente aurait attaché l'originale sous un texte français.
   */
  test('joue la piste de la langue servie, et sous-titre la vidéo dans la même', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li[data-id="r3"] audio')).toHaveAttribute('src', `${passerelle.base}${PISTE_TRADUITE}`);
    await expect(page.locator('li[data-id="r3"] .transcription')).toContainText('J’apporte les chiffres de mars');
    // Le transcrit DIT ce qu'il sert — il ne PROMET pas des sous-titres que le
    // `<video>` ne porte pas (la passerelle n'expose aucun WebVTT, régime 3).
    await expect(page.locator('li[data-id="r2"] .transcrit')).toHaveText('Transcrit du es · lire en fr');
    expect(await page.locator('track').count()).toBe(0);
    expect(await page.getByText('Sous-titres').count()).toBe(0);
    // Un vocal sans texte annonce quand même son Prisme, et son original est à un geste.
    await expect(page.locator('li[data-id="r3"] .meta .langue .code')).toHaveText('yo');
    await expect(page.locator('li[data-id="r3"] details.transcrit-original')).toBeVisible();
    // La citation d'un message QUI EST DANS LA PAGE sert ce que sa bulle affiche,
    // jamais l'original que la passerelle a servi sous `replyTo` (cycle 122).
    await expect(page.locator('li[data-id="r5"] .citation .apercu')).toHaveText('Le tableau final de la revue.');
    await expect(page.locator('li[data-id="r1"] .texte')).toHaveText('Le tableau final de la revue.');
    await contexte.close();
  });

  /**
   * LA VUE `rich` A SON PROPRE JETON, ET DE LA DONNÉE DERRIÈRE.
   * `vues.json` déclare `rich` sur `/chats/:id`, distincte du `/chats/:cle` de
   * `thread` : les deux ne sont pas en collision, elles n'avaient simplement
   * aucune conversation adressable derrière leur jeton dans la passerelle
   * PARTAGÉE. `jetons-de-vues.json` déclare désormais `{"id": "fil-riche"}`, et
   * ce témoin prouve que l'adresse rend bien les six formes — sans quoi
   * `compare-rendu.js` comparerait la cible à un écran qui n'est pas le sien.
   */
  test('sert les six formes à l’adresse que la vue `rich` déclare', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/chats/${CONVERSATION_RICHE.id}`, { waitUntil: 'load' });

    await expect(page.locator('.fil-tete h1')).toHaveText(CONVERSATION_RICHE.titre);
    expect(await page.locator('ul.pieces > li, li.citation').count()).toBe(6);
    await expect(page.locator('li[data-id="r3"] .transcrit')).toHaveText('Transcrit du yo · lire en fr');
    await contexte.close();
  });

  /**
   * TOUCHER UNE PIÈCE JOINTE NE QUITTE PAS LA CONVERSATION. `download` est
   * IGNORÉ hors origine — et la passerelle EST une autre origine que le
   * document —, si bien que le clic NAVIGUAIT l'onglet vers le fichier brut :
   * fil, position de lecture et socket perdus, et rien ne l'annonçait. Le
   * témoin porte sur l'EFFET du geste, pas sur un attribut.
   */
  test('ouvre une pièce jointe SANS quitter le fil, et nomme le geste', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);
    const avant = page.url();

    const affiche = page.locator('li[data-id="r1"] a.media');
    await expect(affiche).toHaveAttribute('aria-label', /Télécharger tableau\.jpg · 420 Ko/);
    expect(await affiche.getAttribute('download')).toBeNull();

    const [ouvert] = await Promise.all([contexte.waitForEvent('page'), affiche.click()]);
    await ouvert.waitForLoadState('domcontentloaded').catch(() => undefined);
    expect(page.url()).toBe(avant);
    expect(ouvert.url()).toContain('/api/v1/attachments/file/');
    await contexte.close();
  });

  test('cite la provenance, la réponse et la publication avec leurs libellés', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li[data-id="r4"] .citation .quoi')).toHaveText('Transféré depuis Diaspora FR-EN');
    await expect(page.locator('li[data-id="r5"] .citation .quoi')).toHaveText('En réponse à Ibrahim');
    await expect(page.locator('li[data-id="r6"] .citation .quoi')).toHaveText('A répondu à votre story');
    // Une citation n'est PAS un contrôle : ses destinations (`/stories/:id`,
    // `/chats/:id/medias`) ne sont pas servies par la v3 (charte règle 7).
    expect(await page.locator('li.citation a, li.citation button').count()).toBe(0);
    await contexte.close();
  });
});

/**
 * EN DIRECT — le module de participation PEINT ces formes, il ne les recompose
 * pas : il clone le gabarit que le serveur a rendu et remplit ses fentes
 * (`lib/realtime/fil-peinture.ts`). Le témoin oppose donc la bulle PEINTE à une
 * bulle SERVIE du même genre : mêmes classes, même `data-genre`, même libellé.
 */
test.describe('en direct — une bulle riche qui arrive', () => {
  test('peint la citation et la pièce d’un message reçu, avec la piste de la langue servie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });

    const [modele] = messagesRiches(CONVERSATION_DU_LECTEUR.id).filter((m) => m.id === 'r3');
    const [cite] = messagesRiches(CONVERSATION_DU_LECTEUR.id).filter((m) => m.id === 'r5');
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', { ...modele, id: 'r301', createdAt: new Date().toISOString() });
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', { ...cite, id: 'r305', createdAt: new Date().toISOString() });

    const vocal = page.locator('li[data-id="r301"]');
    await expect(vocal).toBeVisible({ timeout: 10_000 });
    await expect(vocal.locator('ul.pieces > li')).toHaveAttribute('data-genre', 'audio');
    await expect(vocal.locator('.poids')).toHaveText('0:21 · 94 Ko');
    await expect(vocal.locator('audio')).toHaveAttribute('src', `${passerelle.base}${PISTE_TRADUITE}`);
    await expect(vocal.locator('.transcription')).toContainText('J’apporte les chiffres de mars');

    const reponse = page.locator('li[data-id="r305"]');
    await expect(reponse.locator('li.citation')).toHaveAttribute('data-genre', 'reponse');
    await expect(reponse.locator('.citation .quoi')).toHaveText('En réponse à Ibrahim');
    // La cible `r1` est dans le fil : la citation PEINTE sert ce que sa bulle affiche,
    // exactement comme la citation SERVIE — un seul texte par message.
    await expect(reponse.locator('.citation .apercu')).toHaveText('Le tableau final de la revue.');

    // La bulle PEINTE et la bulle SERVIE du même genre portent le même balisage.
    const memeForme = await page.evaluate(() =>
      ['r305', 'r5'].map((id) => document.querySelector(`li[data-id="${id}"] li.citation`)?.outerHTML.replace(/data-cite="[^"]*"/, '') ?? ''),
    );
    expect(memeForme[0]).toBe(memeForme[1]);
    await contexte.close();
  });
});

test.describe('la charte, sur l’écran le plus dense du fil', () => {
  for (const largeur of LARGEURS) {
    test(`aucune cible sous 44 px et aucun débordement horizontal à ${largeur} px`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { viewport: { width: largeur, height: 844 } });
      const page = await ouvreLeFil(contexte);
      await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });

      // Le SITE UNIQUE de la mesure (`lib/cibles.ts`) : deux specs qui
      // recopieraient le sélecteur des cibles divergeraient au premier écran.
      expect(ciblesTropPetites(await ciblesMesurees(page))).toEqual([]);

      const debordement = await page.evaluate(() => ({
        contenu: document.documentElement.scrollWidth,
        cadre: document.documentElement.clientWidth,
      }));
      expect(debordement.contenu).toBeLessThanOrEqual(debordement.cadre);
      await contexte.close();
    });
  }
});

/**
 * LES QUATRE COLONNES DE THÈME du § 9.6 (critère de fin de l'écran). Deux
 * mesurent la préférence de l'OS, deux la mettent EN CONTRADICTION avec le
 * choix stocké — la seule façon d'attraper une jumelle entre la classe posée
 * par le script anti-flash et une requête de média qui l'ignorerait. Le fil
 * riche est l'écran qui porte le plus de plans à la fois (affiche, lecteur,
 * citation, transcription) : c'est là qu'une palette non conforme se voit.
 */
test.describe('les quatre colonnes de thème', () => {
  COLONNES_DE_THEME.forEach((theme) => {
    test(`les six formes tiennent, sans violation grave (${theme.id})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { colorScheme: theme.colorScheme, viewport: { width: 390, height: 844 } });
      const page = await contexte.newPage();
      if (theme.stockage !== null) {
        await page.addInitScript(
          ([cle, valeur]) => {
            try {
              window.localStorage.setItem(cle, valeur);
            } catch {
              /* le script anti-flash retombe sur la préférence système, la colonne le dira */
            }
          },
          [THEME_STORAGE_KEY, theme.stockage] as const,
        );
      }
      await page.goto(FIL(), { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      // Les six porteurs sont bien dans le document, quelle que soit la colonne.
      expect(await page.locator('ul.pieces > li, li.citation').count()).toBe(6);

      const rapport = await new AxeBuilder({ page }).include('main').analyze();
      expect(violationsBloquantes(rapport.violations)).toEqual([]);
      await contexte.close();
    });
  });
});

test.describe('les rendus que le rapport regarde', () => {
  /**
   * TROIS cadrages par schéma, parce que le fil est ancré en bas et que les six
   * formes ne tiennent pas dans un écran : `rich-*` cadre l'IMAGE et sa légende
   * (le premier message de la cible), `rich-media-*` la VIDÉO et le VOCAL, et
   * `rich-citations-*` le bas du fil, où vivent le transfert, la réponse et la
   * story. Un rapport qui ne montre qu'un cadrage ne montre qu'une forme.
   */
  test(`captures 390×844 — clair et sombre (${COMMANDE})`, async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await ouvreLeFil(contexte);
      await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });

      const bas = join(DOSSIER_DES_RENDUS, `rich-citations-${schema}.png`);
      await page.screenshot({ path: bas });
      info.annotations.push({ type: `rendu citations ${schema}`, description: bas });

      for (const [ancre, nom] of [
        ['r2', `rich-media-${schema}`],
        ['r1', `rich-${schema}`],
      ] as const) {
        await page.locator(`li[data-id="${ancre}"]`).scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const chemin = join(DOSSIER_DES_RENDUS, `${nom}.png`);
        await page.screenshot({ path: chemin });
        info.annotations.push({ type: `rendu ${nom}`, description: chemin });
      }
      await contexte.close();
    }
  });
});
