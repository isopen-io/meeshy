import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  controlesCouvertsParUnFixe,
  interactifsSousUnFlottant,
  placeLeDefilement,
  POSITIONS_DE_DEFILEMENT,
  type PositionDeDefilement,
} from './lib/occlusion';
import {
  LIGNES_DE_CONVERSATIONS_SERVIES,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * `/chats` — CHARTE RÈGLE 8 b/c, LA FAMILLE OCCLUSION / PIED DE PAGE.
 *
 * EXTRAIT de `v3-chats.spec.ts` (spécification « le rond flottant ne recouvre
 * plus le pied de page », § 4 — le fichier hôte franchissait 1000 lignes ; la
 * décision d'extraire une famille COMPLÈTE plutôt qu'une tranche arbitraire
 * se prend au `wc -l`, pas au jugé). Même chaîne
 * (`passerelleDeBouchon` + `serveurDeLaV3`), même fixture DOUZE lignes
 * (`LIGNES_DE_CONVERSATIONS_SERVIES`) — un fichier séparé, jamais une
 * jumelle : ce fichier ne recopie AUCUN comportement que `v3-chats.spec.ts`
 * mesure déjà, il porte la famille « aucun élément fixe/sticky ne couvre un
 * contrôle » dans son entier — la mesure par CHEVAUCHEMENT DE RECTS
 * (`controlesCouvertsParUnFixe`) et la mesure par PILE DE HIT-TEST
 * (`interactifsSousUnFlottant`), les deux se COMPLÉTANT (question 1 de la
 * spécification).
 *
 * Cinq témoins :
 *   1. `/chats` ne sert plus `.flottantes` ; les deux raccourcis d'en-tête
 *      existent, ≥ 44 px, jamais `position:fixed` ;
 *   2. aucun contrôle couvert par un élément fixe, à trois défilements, deux
 *      largeurs, deux schémas (`controlesCouvertsParUnFixe`) ;
 *   3. le pied de page reste atteignable AU POINT (`elementsFromPoint`), à
 *      toute position où il est visible ;
 *   4. le cas « repos » LITTÉRAL du critère de fin (scroll 0), forcé par une
 *      liste VIDE ;
 *   5. la SONDE DE FALSIFIABILITÉ (`sondeLeRondHistorique`, jouée AU REPOS
 *      dans le témoin 4 et EN BAS ici) — sans elle, un témoin toujours vert
 *      serait indistinguable d'un témoin qui ne mesure plus rien.
 */

const LARGEURS = [360, 390] as const;

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
    readonly colorScheme?: 'light' | 'dark';
  } = {},
): Promise<BrowserContext> => {
  const contexte = await browser.newContext({
    viewport: { width: options.largeur ?? 390, height: 844 },
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

/**
 * LA SONDE DU ROND HISTORIQUE — un SEUL site, deux positions (correction de
 * revue, 2026-09-06).
 *
 * Elle injecte un occulteur `position:fixed;width:56px;height:56px` — la
 * FORME de `.flottante.droite` (git `5258f46d17`, retirée à la revue de
 * #5164) — CENTRÉ sur un lien réel du pied, mesure, RETIRE le rond, et
 * remesure.
 *
 * POURQUOI CENTRÉ, ET NON À LA POSITION LITTÉRALE `bottom:24px;right:24px`
 * (correction de revue, 2026-09-06 — la rédaction précédente invoquait
 * l'empaquetage du `<nav>`, une raison FAUSSE : mesuré sur les DOUZE lignes
 * de la fixture, la géométrie littérale ne tombe sur AUCUN lien du pied, à
 * aucune des trois positions de défilement, aux deux largeurs, sur liste
 * garnie comme sur liste vide — l'empaquetage n'entre jamais en jeu).
 *
 * Ce que cette sonde établit est la NON-VACUITÉ de la mesure par PILE DE
 * HIT-TEST elle-même (`interactifsSousUnFlottant`) : sans elle, l'assertion
 * « aucun contrôle couvert au repos » serait VRAIE et VIDE — `/chats` ne
 * porte au repos qu'un seul élément `position:fixed` (`output.banniere`, de
 * rect 0 × 0), donc `interactifsSousUnFlottant` y rendrait `[]` SANS jamais
 * entrer dans sa boucle. Centrer l'occulteur sur le lien garantit que
 * `elementsFromPoint` le trouve, quels que soient la largeur du viewport et
 * l'endroit où le dernier lien du pied tombe — la question posée n'est pas
 * « la géométrie historique littérale recouvre-t-elle encore un contrôle ? »
 * (elle ne recouvre plus rien, précisément parce que la revue de #5164 l'a
 * retirée) mais « le témoin sait-il rougir sur UN occulteur fixe qui
 * recouvre RÉELLEMENT un lien ? ». La régression `.flottantes` elle-même
 * reste attrapée ailleurs, PAR LA GÉOMÉTRIE LITTÉRALE : le témoin de compte
 * (« remplace le rail flottant… », plus haut) et `controlesCouvertsParUnFixe`
 * (mesure par CHEVAUCHEMENT DE RECTS, `lib/occlusion.ts`), qui trouve bien
 * la géométrie littérale au-dessus de sept contrôles sur la liste garnie au
 * repos et au-dessus de « Politique de confidentialité » sur la liste vide à
 * 390 px — mesuré le 2026-09-06.
 *
 * POURQUOI UN SITE PARTAGÉ (deux positions) : le critère de fin demande la
 * falsifiabilité AU REPOS (défilement 0) ; rejouer la même sonde EN BAS (où
 * le pied entre dans le viewport sans avoir à vider la liste) couvre le cas
 * le plus courant sans dupliquer la mécanique.
 */
const sondeLeRondHistorique = async (
  page: Page,
  position: PositionDeDefilement,
): Promise<{ readonly texteDuLien: string; readonly occupe: readonly string[]; readonly retire: readonly string[] }> => {
  await placeLeDefilement(page, position);

  const cible = await page.evaluate(() => {
    const lien = document.querySelector<HTMLAnchorElement>('footer.pied nav a:last-child');
    if (lien === null) return null;
    const rect = lien.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      texte: lien.textContent?.trim().slice(0, 40) ?? '',
    };
  });
  if (cible === null) throw new Error('le pied doit porter au moins un lien pour que la sonde ait un sens');

  await page.evaluate((c) => {
    const rond = document.createElement('div');
    rond.id = 'sonde-rond-historique';
    rond.style.cssText =
      `position:fixed;left:${(c.x - 28).toFixed(1)}px;top:${(c.y - 28).toFixed(1)}px;` +
      'width:56px;height:56px;z-index:99999;pointer-events:auto;background:transparent';
    document.body.appendChild(rond);
  }, cible);

  const occupe = await interactifsSousUnFlottant(page, position);
  await page.evaluate(() => document.getElementById('sonde-rond-historique')?.remove());
  const retire = await interactifsSousUnFlottant(page, position);

  return { texteDuLien: cible.texte, occupe, retire };
};

test.describe('/chats — occlusion et pied de page', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  /**
   * CHARTE RÈGLE 8 b/c, EXCEPTION NOMMÉE POUR `/chats` (correction de revue) —
   * la mesure a trouvé les liens du pied de l'enveloppe couverts par le rail
   * flottant, au repos ET à mi-défilement, aux deux largeurs et dans les deux
   * schémas (« À propos », « Conditions d'utilisation », « Politique de
   * confidentialité »). La règle nomme la sortie mot pour mot pour ce cas :
   * « le rail cède la place à deux raccourcis de 44 px dans l'en-tête ». Ce
   * témoin prouve les DEUX moitiés de la sortie : (1) `/chats` ne sert PLUS
   * `.flottantes` — rien qui puisse un jour recouvrir de nouveau le pied — et
   * (2) les deux raccourcis existent, à leur place, ≥ 44 px.
   */
  test('remplace le rail flottant par deux raccourcis d’en-tête, jamais fixes', async ({ browser }) => {
    const page = await ouvre(browser);

    await expect(page.locator('.flottantes')).toHaveCount(0);

    const raccourcis = page.locator('.raccourcis-entete .raccourci');
    await expect(raccourcis).toHaveCount(2);
    await expect(raccourcis.first()).toHaveAttribute('href', '/feed');
    await expect(raccourcis.last()).toHaveAttribute('href', '/chats?espace');

    for (const raccourci of await raccourcis.all()) {
      const boite = await raccourci.boundingBox();
      expect(boite?.width, 'raccourci d’en-tête').toBeGreaterThanOrEqual(44);
      expect(boite?.height, 'raccourci d’en-tête').toBeGreaterThanOrEqual(44);
      expect(
        await raccourci.evaluate((noeud) => getComputedStyle(noeud).position),
        'un raccourci d’en-tête reste DANS le flux, jamais fixe',
      ).not.toBe('fixed');
    }
    await page.context().close();
  });

  /**
   * CHARTE RÈGLE 8 b/c, LA MESURE ELLE-MÊME — « aucun élément FIXE ne couvre
   * un contrôle », à TROIS positions de défilement (haut, milieu, bas), aux
   * DEUX largeurs et dans les DEUX schémas — ce que la règle décrit, et ce que
   * le témoin retourné au développeur avait rétréci à une seule position (le
   * bas, la seule où le défaut n'apparaissait pas). `/chats` ne sert plus
   * `.flottantes`, mais la mesure reste GÉNÉRALE — tout élément dont le style
   * calculé est `position:fixed` (la bannière temps réel comprise) — pour
   * qu'un futur élément fixe reste tenu par le même témoin.
   *
   * `controlesCouvertsParUnFixe` (`lib/occlusion.ts`) est le site UNIQUE de
   * cette mesure : `v3-espace-membre.spec.ts` l'applique au TABLEAU DE BORD
   * avec le même prédicat.
   */
  LARGEURS.forEach((largeur) => {
    (['light', 'dark'] as const).forEach((schema) => {
      test(`aucun élément fixe ne couvre un contrôle, à trois défilements — ${largeur}px ${schema}`, async ({
        browser,
      }) => {
        const contexte = await contexteDuLecteur(browser, { largeur, colorScheme: schema });
        const page = await ouvreLaListe(contexte);

        for (const position of POSITIONS_DE_DEFILEMENT) {
          const couverts = await controlesCouvertsParUnFixe(page, position);
          expect(couverts, `contrôles couverts par un élément fixe — ${position}`).toEqual([]);
        }
        await contexte.close();
      });
    });
  });

  /**
   * CHARTE RÈGLE 8 b/c — LE PIED DE PAGE RESTE ATTEIGNABLE AU POINT, PAR PILE
   * DE HIT-TEST (spécification « le rond flottant ne recouvre plus le pied de
   * page », § T1 point 2 — l'instrument que la règle 8 nomme,
   * `conception-web-v3.md:1208`, jamais mesuré jusqu'ici : la mesure existante
   * ci-dessus part de l'OCCULTEUR, celle-ci part du LIEN lui-même).
   *
   * À CHAQUE position où au moins un lien du pied intersecte le viewport,
   * `elementsFromPoint` sur son CENTRE doit rendre le lien (ou un de ses
   * descendants) comme PREMIER nœud — jamais un étranger flottant. Avec douze
   * lignes, seule la position `bas` (et parfois `milieu`, selon la hauteur
   * réelle du document) porte le pied dans le viewport ; le cas « repos »
   * littéral du critère de fin (scroll 0) est le témoin suivant.
   */
  test('le pied de page reste atteignable au point, à toute position où il est visible', async ({ browser }) => {
    const page = await ouvre(browser);

    let vuAuMoinsUnLien = false;
    for (const position of POSITIONS_DE_DEFILEMENT) {
      await placeLeDefilement(page, position);
      const rapport = await page.evaluate(() => {
        const liens = [...document.querySelectorAll<HTMLAnchorElement>('footer.pied nav a')];
        return liens
          .map((lien) => {
            const rect = lien.getBoundingClientRect();
            const visible =
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top < window.innerHeight &&
              rect.bottom > 0 &&
              rect.left < window.innerWidth &&
              rect.right > 0;
            if (!visible) return null;
            const x = Math.min(Math.max((rect.left + rect.right) / 2, 0), window.innerWidth - 1);
            const y = Math.min(Math.max((rect.top + rect.bottom) / 2, 0), window.innerHeight - 1);
            const sommet = document.elementsFromPoint(x, y)[0] ?? null;
            const atteint = sommet !== null && (sommet === lien || lien.contains(sommet));
            return { texte: lien.textContent?.trim().slice(0, 40) ?? '', atteint };
          })
          .filter((r): r is { readonly texte: string; readonly atteint: boolean } => r !== null);
      });

      vuAuMoinsUnLien = vuAuMoinsUnLien || rapport.length > 0;
      rapport.forEach((r) => {
        expect(r.atteint, `lien du pied « ${r.texte} » atteignable au point — ${position}`).toBe(true);
      });
    }
    // NON-VACUITÉ : sans ce garde-fou, un pied qui cesserait d'être servi — ou
    // un sélecteur qui cesserait de le trouver — rendrait ce témoin vert en
    // n'affirmant plus rien. Mesuré : les cinq liens du pied sont visibles à
    // la position `bas` sur les douze lignes de la fixture.
    expect(vuAuMoinsUnLien, 'aucun lien du pied n’a été vu à AUCUNE position — le témoin n’affirme rien').toBe(true);
    await page.context().close();
  });

  /**
   * LE CAS « REPOS » LITTÉRAL DU CRITÈRE DE FIN (défilement 0) — sur les
   * DOUZE lignes de la fixture, le pied n'entre dans le premier écran qu'une
   * fois la liste VIDE (`passerelle.masquees`, § T1 point 2 de la
   * spécification). La liste est PARTAGÉE par toute la suite : chaque ligne
   * masquée est DÉMASQUÉE en `finally`, sans quoi un spec voisin verrait sa
   * ligne disparaître pour une raison qui n'est pas la sienne (même prudence
   * que documentée sur `passerelle.masquees` dans `serveurs.ts`).
   */
  test('au repos (scroll 0), sur une liste vide, le pied reste atteignable au point', async ({ browser }) => {
    LIGNES_DE_CONVERSATIONS_SERVIES.forEach((ligne) => passerelle.masquees.add(ligne.id));
    try {
      const page = await ouvre(browser);

      const scrollAuChargement = await page.evaluate(() => window.scrollY);
      expect(scrollAuChargement, 'la liste vide doit tenir dans le premier écran, sans défilement').toBe(0);

      const rapportAuRepos = await interactifsSousUnFlottant(page, 'haut');
      expect(rapportAuRepos, 'aucun contrôle couvert au repos, liste vide').toEqual([]);

      const piedDansLePremierEcran = await page.evaluate(() => {
        const pied = document.querySelector('footer.pied');
        if (pied === null) return false;
        return pied.getBoundingClientRect().top < window.innerHeight;
      });
      expect(piedDansLePremierEcran, 'le pied doit être dans le premier écran quand la liste est vide').toBe(true);

      // LA FALSIFICATION, À LA POSITION QUE LE CRITÈRE NOMME — sans elle,
      // l'assertion ci-dessus est vraie et VIDE (`/chats` ne porte au repos
      // qu'un `output.banniere` de rect 0 × 0 : la mesure n'entre jamais dans
      // sa boucle). La sonde prouve qu'au MÊME défilement 0, un rond
      // réintroduit SE VOIT — donc que le vert ci-dessus dit quelque chose.
      const sonde = await sondeLeRondHistorique(page, 'haut');
      expect(
        sonde.occupe,
        `au repos, un rond réintroduit doit couvrir « ${sonde.texteDuLien} » : ${JSON.stringify(sonde.occupe)}`,
      ).toContain(sonde.texteDuLien);
      expect(sonde.retire, 'au repos, le rapport doit redevenir vide une fois le rond retiré').toEqual([]);

      await page.context().close();
    } finally {
      LIGNES_DE_CONVERSATIONS_SERVIES.forEach((ligne) => passerelle.masquees.delete(ligne.id));
    }
  });

  /**
   * LA SONDE DE FALSIFIABILITÉ, SUR LA LISTE GARNIE (§ T1 point 3 de la
   * spécification) — la moitié du critère de fin qui manquait à TOUTE la
   * suite avant ce travail : un témoin qui ne peut JAMAIS rougir ne prouve
   * rien. La mécanique vit dans `sondeLeRondHistorique` (en tête de ce
   * fichier), partagée avec le témoin du REPOS ci-dessus ; ici elle s'exerce
   * à la position `bas`, la seule où le pied entre dans le viewport sur les
   * douze lignes servies. Si un futur diff réintroduit un flottant, les
   * témoins précédents rougissent ; si un futur diff casse la MESURE
   * elle-même, ce sont les deux sondes qui rougissent.
   */
  test('la sonde de falsifiabilité — un rond réintroduit se voit, retiré il redisparaît', async ({ browser }) => {
    const page = await ouvre(browser);

    const sonde = await sondeLeRondHistorique(page, 'bas');
    expect(sonde.occupe, `le rond injecté doit couvrir « ${sonde.texteDuLien} » : ${JSON.stringify(sonde.occupe)}`).toContain(
      sonde.texteDuLien,
    );
    expect(sonde.retire, 'le rapport doit redevenir vide une fois le rond retiré').toEqual([]);

    await page.context().close();
  });
});
