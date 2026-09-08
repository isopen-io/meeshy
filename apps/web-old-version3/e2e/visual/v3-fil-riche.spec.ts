import { mkdirSync, readFileSync } from 'node:fs';
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
  chargeMesureReseau,
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

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

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
    // Depuis § 12.10.1, la VIDÉO est une AFFICHE comme l'image : son poster mène
    // au PLEIN ÉCRAN, où elle se joue. Reste un lecteur DANS la ligne ce qui
    // s'écoute sur place sans rien coûter — le vocal, et lui seul.
    expect(blocs).toEqual([
      { genre: 'audio', vus: ['details.lecteur'] },
      { genre: 'video', vus: ['a.media'] },
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
   * TOUCHER UNE PIÈCE JOINTE NE QUITTE PAS LA CONVERSATION — et depuis
   * § 12.10.1, une image n'ouvre même plus d'onglet : elle ouvre le PLEIN
   * ÉCRAN, un ÉTAT de l'adresse hôte. Le geste qui emporte encore un onglet est
   * celui de la surimpression (« Télécharger »), et il le fait pour la raison
   * qui l'a toujours fait : `download` est IGNORÉ hors origine — la passerelle
   * EST une autre origine que le document —, si bien qu'un lien du même onglet
   * NAVIGUERAIT vers le fichier brut, fil et position de lecture perdus. Le
   * témoin porte sur l'EFFET des deux gestes, pas sur un attribut.
   */
  test('ouvre une image SANS quitter le fil, et ne sort qu’au téléchargement', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    const affiche = page.locator('li[data-id="r1"] a.media');
    await expect(affiche).toHaveAttribute('aria-label', /Ouvrir tableau\.jpg · 420 Ko/);
    expect(await affiche.getAttribute('download')).toBeNull();
    expect(await affiche.getAttribute('target')).toBeNull();

    await affiche.click();
    // MÊME onglet, MÊME adresse : la conversation est toujours là, derrière.
    expect(contexte.pages()).toHaveLength(1);
    expect(new URL(page.url()).pathname).toBe(new URL(FIL()).pathname);

    const telecharger = page.locator('dialog.plein a.action');
    await expect(telecharger).toHaveText(/Télécharger tableau\.jpg/);
    await expect(page.locator('dialog.plein .poids')).toHaveText('420 Ko');
    expect(await telecharger.getAttribute('download')).toBeNull();
    const [ouvert] = await Promise.all([contexte.waitForEvent('page'), telecharger.click()]);
    await ouvert.waitForLoadState('domcontentloaded').catch(() => undefined);
    expect(ouvert.url()).toContain('/api/v1/attachments/file/');
    await contexte.close();
  });

  /**
   * LE PLEIN ÉCRAN D'UNE VIDÉO L'AGRANDIT. Mesuré avant : `<video
   * preload="none">` n'a AUCUNE métadonnée, donc aucun rapport intrinsèque, et
   * sans `width`/`height` ni règle de feuille le navigateur retombait sur ses
   * 300 × 150 par défaut — le geste « plein écran » RAPETISSAIT ce qu'on
   * regarde (294 × 165 en affiche dans le fil, 300 × 150 en plein écran).
   */
  test('agrandit la vidéo au lieu de la rapetisser, sans lire une métadonnée', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    const affiche = page.locator('li[data-id="r2"] a.media');
    const boiteDeLAffiche = await affiche.boundingBox();
    await affiche.click();

    const lecteur = page.locator('dialog.plein video.media-plein');
    await expect(lecteur).toHaveCount(1);
    // `readyState === 0` : rien n'a été chargé, donc la boîte ne vient PAS d'une métadonnée.
    expect(await lecteur.evaluate((noeud) => (noeud as HTMLVideoElement).readyState)).toBe(0);
    const boiteDuPlein = await lecteur.boundingBox();
    expect(boiteDuPlein?.width ?? 0).toBeGreaterThanOrEqual(boiteDeLAffiche?.width ?? 0);
    expect(boiteDuPlein?.height ?? 0).toBeGreaterThanOrEqual(boiteDeLAffiche?.height ?? 0);
    await contexte.close();
  });

  /**
   * SANS JAVASCRIPT, LA SURIMPRESSION RETIENT LE FOCUS. `showModal()` donne le
   * voile, le piège à focus et Échap — mais il n'y a pas de JavaScript sur le
   * chemin qui doit marcher partout. Mesuré avant : le `<dialog open>` était
   * servi APRÈS un `<main>` que rien ne rendait inerte, et le clavier
   * traversait vingt-et-un contrôles invisibles — retour, médias, composeur,
   * sauts de citation — avant d'atteindre la croix ; il pouvait poster un
   * message qu'il ne voyait pas.
   */
  test('sans JavaScript — le fil derrière la surimpression ne prend plus le focus', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);
    await page.locator('li[data-id="r1"] a.media').click();
    await expect(page.locator('dialog.plein')).toHaveCount(1);
    await expect(page.locator('main#main-content')).toHaveAttribute('inert', '');
    await expect(page.locator('dialog.plein')).toHaveAttribute('aria-modal', 'true');

    const parcours: string[] = [];
    for (let pression = 0; pression < 8; pression += 1) {
      await page.keyboard.press('Tab');
      parcours.push(
        await page.evaluate(() => {
          const actif = document.activeElement;
          if (actif === null || actif === document.body) return 'hors page';
          if (actif.closest('dialog.plein') !== null) return 'dialogue';
          return actif.closest('main') !== null ? 'fil' : 'autre';
        }),
      );
    }
    // La PREMIÈRE tabulation atteint le dialogue, et AUCUNE n'atteint le fil.
    expect(parcours[0]).toBe('dialogue');
    expect(parcours).not.toContain('fil');
    await contexte.close();
  });

  test('cite la provenance, la réponse et la publication avec leurs libellés', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li[data-id="r4"] .citation .quoi')).toHaveText('Transféré depuis Diaspora FR-EN');
    await expect(page.locator('li[data-id="r5"] .citation .quoi')).toHaveText('En réponse à Ibrahim');
    await expect(page.locator('li[data-id="r6"] .citation .quoi')).toHaveText('A répondu à votre story');
    // UNE citation est un contrôle : celle dont la CIBLE EST DANS LA PAGE, et
    // elle SAUTE vers elle (§ 12.10.1). Les deux autres citent ce que la v3 ne
    // sert pas (`/stories/:id`, une conversation d'origine) : elles sont
    // rendues sans `href`, donc sans rôle de lien (charte règle 7).
    expect(await page.locator('li.citation a[href], li.citation button').count()).toBe(1);
    await expect(page.locator('li[data-id="r5"] .citation a.saut')).toHaveAttribute('href', '#m-r1');
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

/**
 * CE QU'UN CHAT OFFRE, ET QUE LE FIL N'OFFRAIT PAS (§ 12.10.1, 2026-09-03) —
 * mesuré AU NAVIGATEUR, parce qu'aucune lecture de source ne peut dire qu'un
 * clic déplace la page, qu'une surimpression s'ouvre ou qu'Échap la ferme.
 *
 * LES QUATRE PREMIERS TÉMOINS TOURNENT SANS JAVASCRIPT : le saut est un lien de
 * fragment, le plein écran un ÉTAT de l'adresse hôte. C'est le chemin qui
 * marche partout, et c'est celui qu'on garde. Le cinquième mesure la seule
 * chose que le module AJOUTE : Échap.
 */
test.describe('les rendus du plein écran que le rapport regarde', () => {
  /**
   * LA FICHE D'UN VOCAL, en plein écran : ce que § 12.10.1 demande et ce
   * qu'aucune capture ne montrait — le lecteur, la transcription ENTIÈRE, son
   * Prisme (« Transcrit du yo · lire en fr »), l'original à un geste et le
   * poids annoncé avant tout téléchargement.
   */
  test('captures 390×844 de la fiche d’un vocal — clair et sombre', async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      // AVEC JavaScript : sans lui, le moteur de thème ne pose pas `.light` et
      // les deux colonnes rendraient la même image (le défaut par défaut est
      // `dark`). C'est aussi l'état que le lecteur voit — modale élevée.
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(`${FIL()}?media=ar3`, { waitUntil: 'load' });
      await expect(page.locator('dialog.plein')).toBeVisible();
      const chemin = join(DOSSIER_DES_RENDUS, `thread-fiche-${schema}.png`);
      await page.screenshot({ path: chemin });
      info.annotations.push({ type: `rendu fiche ${schema}`, description: chemin });
      await contexte.close();
    }
  });
});

/**
 * LE RÉGIME `?media=` EST MESURÉ, DONC GATÉ. La surimpression n'ajoute aucune
 * requête au document — elle est servie DEDANS —, mais l'ÉTAT étant dans
 * l'adresse, l'ouvrir est une navigation entière et la refermer une seconde :
 * un coût que le tour précédent déclarait « aucun » sans jamais le mesurer, et
 * qu'AUCUN témoin ne visitait (les vitals du fil ne connaissent que `/chats/:cle`
 * nu). Les plafonds opposés sont ceux de `/chats/*` — 4 requêtes avant le
 * premier pixel, LCP ≤ 2,2 s, CLS ≤ 0,05 —, pris tels quels : un état d'une
 * adresse n'a pas de budget à lui.
 */
test.describe('le coût du plein écran, mesuré', () => {
  test('le régime ?media= tient les plafonds de /chats/*, et son document est pesé', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const cookies = [
      { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
      { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
    ];
    const mesure = await mesurePage({
      url: `${FIL()}?autour=r1&media=ar1`,
      commande: COMMANDE,
      navigateur: browser,
      cookies,
      profil: budgets.reseau.profil,
    });
    info.annotations.push({
      type: 'plein écran d’un média en Fast 3G',
      description: `req. avant le premier pixel ${mesure.requetes_avant_premier_pixel ?? '?'} · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · CLS ${mesure.cls ?? '?'} · ${mesure.octets_transferes ?? '?'} o`,
    });
    console.log(
      `[mesure] /chats/:cle?media= Fast 3G — requêtes avant le premier pixel ${mesure.requetes_avant_premier_pixel} · FCP ${mesure.fcp_ms} ms · LCP ${mesure.lcp_ms} ms · CLS ${mesure.cls} · ${mesure.octets_transferes} o`,
    );
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
  });

  /**
   * OUVRIR UN MÉDIA N'ACCUSE PLUS LA LECTURE. Le fil est RECOUVERT par une
   * surimpression opaque et son `<main>` est inerte : il n'est pas affiché,
   * donc il n'est pas lu (`accuseCeQuiEstServi`). Chaque ouverture et chaque
   * fermeture re-postait la MÊME tranche — regarder trois photos coûtait six
   * écritures pour rien, sur la 3G rurale que la directive vise.
   */
  test('n’écrit aucun accusé de lecture pendant qu’un média recouvre le fil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const recus = (): number =>
      passerelle.journal.filter((appel) => appel.methode === 'POST' && appel.chemin.endsWith('/receipts')).length;

    await page.goto(FIL(), { waitUntil: 'load' });
    await expect.poll(recus).toBeGreaterThan(0);
    const apresLeFil = recus();

    await page.locator('li[data-id="r1"] a.media').click();
    await expect(page.locator('dialog.plein')).toHaveCount(1);
    await page.waitForTimeout(200);
    expect(recus()).toBe(apresLeFil);

    // Fermer DÉCOUVRE le fil : là, ce qui est affiché est lu.
    await page.locator('dialog.plein a.fermer').click();
    await expect(page.locator('dialog.plein')).toHaveCount(0);
    await expect.poll(recus).toBeGreaterThan(apresLeFil);
    await contexte.close();
  });
});

test.describe('saut, plein écran et fiche — sans JavaScript', () => {
  test('la citation SAUTE vers le message cité, et la ligne visée se distingue', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    const saut = page.locator('li[data-id="r5"] .citation a.saut');
    await expect(saut).toHaveAttribute('href', '#m-r1');
    await saut.click();

    expect(new URL(page.url()).hash).toBe('#m-r1');
    await expect(page.locator('li[data-id="r1"]')).toBeInViewport();
    // `:target` est ce qui MET EN ÉVIDENCE la ligne visée — aucune atténuation
    // des voisines (le mode « focal » retiré au tour 2 reste retiré).
    expect(await page.evaluate(() => document.querySelector('li[data-id="r1"]')?.matches(':target') ?? false)).toBe(true);
    expect(await page.evaluate(() => [...document.querySelectorAll('li.ligne')].filter((l) => Number(getComputedStyle(l).opacity) < 1).length)).toBe(0);
    await contexte.close();
  });

  /**
   * UNE CITATION DONT LA CIBLE N'EST PAS DANS LA PAGE N'EST PAS UN CONTRÔLE
   * (charte règle 7) : ni `href`, ni focus, ni rôle de lien. Le transfert et la
   * story de la cible citent des choses que la v3 ne sert pas.
   */
  test('ne rend cliquable AUCUNE citation dont la cible n’est pas servie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    for (const id of ['r4', 'r6']) {
      const citation = page.locator(`li[data-id="${id}"] .citation a.saut`);
      await expect(citation).toHaveCount(1);
      expect(await citation.getAttribute('href')).toBeNull();
    }

    // ET ELLE SE VOIT (charte règle 16 : « une carte informe, un contour
    // déclare un contrôle ») : le filet de la citation qui SAUTE n'est pas
    // celui des deux qui ne mènent nulle part.
    const filets = await page.evaluate(() =>
      ['r5', 'r4', 'r6'].map((id) => getComputedStyle(document.querySelector(`li[data-id="${id}"] .citation .saut`) as Element).borderLeftColor),
    );
    expect(filets[0]).not.toBe(filets[1]);
    expect(filets[1]).toBe(filets[2]);
    await contexte.close();
  });

  test('une image s’ouvre en PLEIN ÉCRAN au tap, et la croix rend le fil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    // Rien n'est parti tant que personne n'a demandé.
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/'))).toEqual([]);

    await page.locator('li[data-id="r1"] a.media').click();
    expect(new URL(page.url()).searchParams.get('media')).toBe('ar1');

    const plein = page.locator('dialog.plein');
    await expect(plein).toBeVisible();
    await expect(plein.locator('h2')).toHaveText('tableau.jpg');
    await expect(plein.locator('.poids')).toHaveText('420 Ko');
    await expect(plein.locator('img.media-plein')).toHaveAttribute('alt', 'tableau.jpg');
    // Les octets ne partent qu'ICI — c'est le geste qui les a demandés.
    await expect
      .poll(() => passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/')).length)
      .toBeGreaterThan(0);

    await plein.locator('a.fermer').click();
    expect(new URL(page.url()).searchParams.get('media')).toBeNull();
    await expect(page.locator('dialog.plein')).toHaveCount(0);
    await contexte.close();
  });

  test('une vidéo s’ouvre en plein écran, et n’y coûte toujours aucun octet', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    // LA PASTILLE DE DURÉE·POIDS EST POSÉE SUR LE POSTER, pas au bas de la
    // pièce : elle est en `position:absolute`, et le seul ancêtre positionné à
    // sa portée doit être l'affiche. Mesuré sans cette ancre : elle tombait au
    // bas du `<li>`, PAR-DESSUS le « Voir l'original » du transcrit.
    const boites = await page.evaluate(() => {
      const item = document.querySelector('li[data-id="r2"] ul.pieces > li') as HTMLElement;
      const affiche = item.querySelector('a.media') as HTMLElement;
      const pastille = item.querySelector('.etiquette') as HTMLElement;
      return { affiche: affiche.getBoundingClientRect().bottom, pastille: pastille.getBoundingClientRect().bottom };
    });
    expect(boites.pastille).toBeLessThanOrEqual(boites.affiche);

    await page.locator('li[data-id="r2"] a.media').click();
    const plein = page.locator('dialog.plein');
    await expect(plein.locator('video.media-plein')).toHaveAttribute('preload', 'none');
    await expect(plein.locator('.poids')).toHaveText('0:42 · 3,0 Mo');
    await page.waitForTimeout(500);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/'))).toEqual([]);
    await contexte.close();
  });

  /**
   * LA FICHE D'UN VOCAL : la transcription ENTIÈRE (la ligne du fil la clampe à
   * quatre lignes), son original à un geste, et la piste de la langue SERVIE —
   * on entend ce qu'on lit (cycle 128).
   */
  test('un vocal ouvre sa FICHE : transcription entière, original, piste servie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await page.locator('li[data-id="r3"] a.fiche').click();
    const plein = page.locator('dialog.plein');
    await expect(plein).toBeVisible();
    await expect(plein.locator('audio.media-plein')).toHaveAttribute('src', `${passerelle.base}${PISTE_TRADUITE}`);
    await expect(plein.locator('.transcription')).toContainText('J’apporte les chiffres de mars');
    await expect(plein.locator('.transcrit')).toHaveText('Transcrit du yo · lire en fr');
    await expect(plein.locator('details.transcrit-original')).toBeVisible();
    // La fiche ne CLAMPE pas ce que la ligne clampe : c'est son effet mesurable.
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('dialog.plein .transcription') as Element).webkitLineClamp),
    ).toBe('none');
    await contexte.close();
  });
});

test.describe('ce que le module AJOUTE à la surimpression — et rien de plus', () => {
  test('Échap ferme le plein écran et rend le fil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await contexte.newPage();
    await page.goto(`${FIL()}?media=ar3`, { waitUntil: 'load' });

    // Le module élève le `<dialog open>` servi en MODALE : c'est ce qui donne
    // Échap, le voile et le piège à focus — jamais une seconde surimpression.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('dialog.plein')?.matches(':modal') ?? false), { timeout: 15_000 })
      .toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForURL((url) => url.searchParams.get('media') === null, { timeout: 15_000 });
    await expect(page.locator('li[data-id="r3"]')).toBeVisible();
    await contexte.close();
  });
});
