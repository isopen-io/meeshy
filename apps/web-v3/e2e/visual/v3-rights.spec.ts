// GATE de l'écran `rights` (matrice `rights`, issue #4523) — « après avoir rejoint, on voit
// exactement ce qu'on a le droit de faire dans la conversation ».
//
// Ce que ce fichier mesure, et que le témoin unitaire (`__tests__/droits.test.tsx`) ne peut pas
// mesurer : la CHAÎNE de bout en bout. Les quatre droits sont des booléens qui naissent dans la
// réponse de la passerelle, traversent une action de serveur, se rangent dans un cookie, puis
// sont relus par un RENDU SERVEUR à l'adresse suivante. Cinq maillons, dont aucun n'existe dans
// jsdom — et un seul d'entre eux qui casse rend l'écran des droits muet ou menteur.
//
// DEUX ENTRÉES MESURABLES, ET LA TROISIÈME QUI NE L'EST PAS — dit à voix haute
//
// Le critère de fin demande l'écran « atteint depuis join, depuis login et depuis signup, avec le
// pseudo saisi restitué ». Les écrans `login` et `signup` de la v3 sont P1 (lot L4) et ne sont
// servis par AUCUNE règle du routeur `frontend-v3` : ce que le legacy sert à ces deux adresses
// n'est pas exercé ici, et le prétendre serait un gate qui atteste ce qu'il n'a pas vu.
//
// La version précédente de ce fichier le prétendait. Son test « depuis LOGIN » ne visitait aucun
// `/login` : il construisait une URL locale avec `?returnUrl=<chemin>`, relisait ce même paramètre
// sur ce même objet — un aller-retour de `URLSearchParams` qui ne peut RIEN rendre d'autre que ce
// qu'on vient d'y écrire, et qui n'exerce aucune ligne de code applicatif — puis visitait la clé
// canonique que le test « depuis JOIN » avait déjà visitée. Un défaut sur la vraie porte `/login`
// ne l'aurait jamais fait rougir, et il remplissait pourtant la case « recette depuis login ».
//
// Ce que la v3 possède VRAIMENT, et qui est mesuré en entier, ce sont DEUX adresses d'arrivée :
//
//   1. la clé CANONIQUE — celle vers laquelle l'action de serveur redirige, et celle que
//      `?returnUrl=` rapporterait telle quelle depuis `/login` (`apps/web/app/login/page.tsx` la
//      lit, `components/auth/login-form.tsx` y renvoie — mesuré, mais hors de ce harnais) ;
//   2. l'adresse PARTAGÉE, dont le segment n'est PAS la clé canonique : `/l/:token` redirige vers
//      `/chats/<token>` (`app/(public)/l/[token]/destination.ts`) et la passerelle accepte trois
//      formes pour un même lien (§ 6.1 point 2 bis). C'est l'entrée réelle de `signup`, qui ne
//      rapporte rien (`window.location.href = '/dashboard'` sans condition,
//      `apps/web/hooks/use-registration-submit.ts`) — et le cas où la place doit se retrouver sous
//      un nom qui n'est pas celui de l'adresse.
//
// L'écart avec le critère de fin est donc DÉCLARÉ ici et acté sur l'issue #4523 : deux entrées
// éprouvées, la troisième hors périmètre v3 tant que L4 n'a pas livré `/login`.
//
// LA PLACE PRIME SUR LA PORTE — ce que la seconde moitié de ce fichier garde
//
// Une place et un lien sont deux objets qui ne meurent pas ensemble : la seule condition de
// validité d'un jeton est `Participant.isActive`, tandis que l'aperçu du lien refuse 410
// `LINK_MAX_USES` dès que `currentUses >= maxUses` — compteur que le JOIN incrémente. L'écran
// conditionnait la PLACE à l'état de la PORTE : sur un lien `maxUses: 1`, la redirection du join
// atterrissait sur un 410 et le visiteur qui venait d'entrer lisait « ce lien a atteint sa
// limite ». Les témoins de « la place tient » jouent donc des chaînes que le bouchon nominal ne
// produit jamais : lien mort + cookie présent, passerelle muette + cookie présent.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import {
  CLE_DU_LIEN,
  NOM_DU_LIEN,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type DroitsServis,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';
import { THEME_STORAGE_KEY } from '../../app/theme-script';

/** L'adresse CANONIQUE de la place — celle que le 201 nomme. */
const CHEMIN = `/chats/${CLE_DU_LIEN}`;

/**
 * L'adresse PARTAGÉE, qui n'est pas la clé canonique.
 *
 * `resolveShareLinkId` accepte `linkId`, `identifier` et l'ObjectId pour le même lien physique ;
 * le bouchon rend toujours `linkId: mshy_lagos`, donc une arrivée par l'ObjectId doit retrouver
 * la MÊME place. C'est le cas qui a coûté cher au legacy : deux entrées pour une place, un
 * re-join silencieux, et le § 6.1 point 3 payé en entier.
 */
const CHEMIN_PARTAGE = '/chats/507f1f77bcf86cd799439011';

type Chaine = {
  readonly passerelle: PasserelleDeBouchon;
  readonly serveur: ServeurV3;
  readonly ferme: () => Promise<void>;
};

const monte = async (options?: { readonly droits?: DroitsServis | null }): Promise<Chaine> => {
  const passerelle = await passerelleDeBouchon(options);
  const serveur = await serveurDeLaV3(passerelle.base);

  return {
    passerelle,
    serveur,
    ferme: async () => {
      await serveur.ferme();
      await passerelle.ferme();
    },
  };
};

/**
 * Le geste NOMINAL : on tape un pseudo, on appuie, et la redirection de l'action de serveur
 * dépose le visiteur sur l'écran des droits.
 *
 * L'attente du TITRE n'est pas décorative, et elle a coûté un rouge : lorsque le contexte a du
 * JavaScript (les deux colonnes de thème explicites se posent par `localStorage`, ce qu'un
 * contexte sans script ne peut pas faire), la réponse de l'action est suivie par une navigation
 * DOUCE pendant laquelle Next remplace les balises de `<head>`. `axe` lancé dans cette fenêtre
 * rend `document-title` — d'impact `serious`, c'est-à-dire exactement la barre du § 8.5 — sur une
 * page qui en a un une milliseconde plus tard. Attendre le titre attend précisément ce qui
 * manque ; s'il ne revenait pas, l'attente échouerait au lieu de masquer le défaut.
 */
const rejointDepuis = async (
  page: Page,
  chaine: Chaine,
  depuis: string,
  pseudo: string,
): Promise<void> => {
  await page.goto(`${chaine.serveur.base}${depuis}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Rejoindre la conversation' }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(pseudo);
  await expect(page).toHaveTitle(/Rejoindre une conversation/);
};

const rejoint = (page: Page, chaine: Chaine, pseudo: string): Promise<void> =>
  rejointDepuis(page, chaine, CHEMIN, pseudo);

/** Ce que les quatre lignes DISENT, dans l'ordre du document. */
const lignes = (page: Page): Promise<readonly string[]> =>
  page.locator('main li').evaluateAll((noeuds) =>
    noeuds.map((noeud) => [...noeud.querySelectorAll('p')].map((p) => p.textContent ?? '').join(' · ')),
  );

test.describe('§ P0 — l’écran des droits, atteint par ses trois entrées', () => {
  test('depuis JOIN : la redirection de l’action de serveur mène aux droits, pseudo restitué', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      expect(new URL(page.url()).pathname).toBe(CHEMIN);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('h1 + p')).toHaveText(
        `Voilà ce que ce lien vous ouvre dans ${NOM_DU_LIEN}.`,
      );
      await expect(page.locator('main li')).toHaveCount(4);
      // La place est prise : plus AUCUN champ d'entrée, et RIEN n'est reposté.
      await expect(page.locator('main input:not([type="hidden"]), main select')).toHaveCount(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * LE RECHARGEMENT (§ 6.3 B) — la place se retrouve, et rien ne repart en `join`.
   *
   * C'est aussi l'adresse que `/login` rapporterait par `?returnUrl=` : le paramètre est une
   * chaîne, et l'éprouver ici reviendrait à relire ce qu'on vient d'y écrire. Ce qui est mesuré
   * est ce qui peut casser — la place retrouvée sous son nom, sans seconde admission.
   */
  test('AU RECHARGEMENT : la clé canonique rouvre la place, sans repasser par `join`', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      chaine.passerelle.oublie();
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('main li')).toHaveCount(4);
      // Aucune SECONDE admission : une place de plus coûte une identité neuve et trois compteurs.
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/join/')),
      ).toHaveLength(0);
      // Et AUCUN aperçu du lien : la place est dans les cookies, la porte du lien n'en sait rien.
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/link/')),
      ).toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });

  test('depuis le lien PARTAGÉ : re-ouvert, il retrouve la place rangée sous la clé canonique', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');
      chaine.passerelle.oublie();

      await page.goto(`${chaine.serveur.base}${CHEMIN_PARTAGE}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('main li')).toHaveCount(4);
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/join/')),
      ).toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });
});

test.describe('§ P0 — ce que les droits DISENT vient de la passerelle, jamais de l’écran', () => {
  test('peint les quatre droits que le 201 a servis', async ({ page }) => {
    const chaine = await monte({
      droits: {
        canSendMessages: true,
        canSendFiles: false,
        canSendImages: false,
        allowViewHistory: false,
      },
    });

    try {
      await rejoint(page, chaine, 'Tolu');

      expect(await lignes(page)).toEqual([
        'L’historique reste masqué · Vous lisez la conversation à partir de votre arrivée.',
        'Écrire et répondre · Vos messages sont traduits, et tout vous revient en yoruba.',
        'Ni photo ni fichier · Ce lien n’ouvre que le texte.',
        'Pas d’appel, pas d’invitation · Réservé aux membres qui ont un compte.',
      ]);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * Une porte qui ne dit RIEN des droits n'en fait pas refuser quatre : l'écran retombe sur ce
   * que le LIEN déclare — la liste de l'accordéon d'avant l'entrée, du même module. Servir
   * quatre `false` retirerait au visiteur ce que l'hôte lui a accordé.
   */
  test('ne fabrique aucun droit quand la réponse n’en a dit aucun', async ({ page }) => {
    const chaine = await monte({ droits: null });

    try {
      await rejoint(page, chaine, 'Tolu');

      await expect(page.locator('main li')).toHaveCount(4);
      await expect(page.locator('main')).toContainText('Entrer sans compte');
      await expect(page.locator('main')).not.toContainText('Ni photo ni fichier');
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * L'écran de CONFIRMATION est aussi le seul qui parle après l'entrée : il ne doit pas
   * transporter l'identité du créateur du lien, que l'aperçu sert entière (§ 5.1).
   */
  test('ne transporte rien de l’identité du créateur du lien', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      expect(await page.content()).not.toContain('ibrahim');
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * LA PLACE PRIME SUR LA PORTE — les chaînes que le bouchon nominal ne produit jamais.
 *
 * Le bouchon sert `maxUses: 20, currentUses: 6` : l'aperçu y est TOUJOURS ouvert après le join, et
 * c'est ce qui a tenu le défaut hors recette. `refusParJeton` ferme la porte du LIEN sans toucher
 * à la place — c'est exactement ce que produit un lien `maxUses: 1` dès que quelqu'un est entré.
 */
test.describe('§ 6.3 B — un lien mort n’éjecte pas celui qui est déjà entré', () => {
  test('lien ÉPUISÉ après l’entrée : l’écran des droits est rendu, pas le refus', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      // Le lien se ferme derrière le visiteur : c'est le compteur que SON entrée a incrémenté.
      chaine.passerelle.regle({ refusParJeton: { [CLE_DU_LIEN]: 'LINK_MAX_USES' } });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('main')).not.toContainText('Ce lien a atteint sa limite');
      await expect(page.locator('main li')).toHaveCount(4);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * LE CAS NOMINAL DU DÉFAUT, joué de bout en bout : on entre par l'adresse PARTAGÉE — celle vers
   * laquelle `/l/:token` redirige, dont le segment n'est PAS la clé canonique —, le lien s'épuise
   * derrière soi, et on revient par cette même adresse partagée. Résoudre le segment demanderait
   * l'aperçu, qui refuse ; l'alias écrit à l'entrée le rend inutile.
   */
  test('lien ÉPUISÉ, retour par l’adresse PARTAGÉE : la place se retrouve sans aperçu', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejointDepuis(page, chaine, CHEMIN_PARTAGE, 'Tolu');

      chaine.passerelle.regle({
        refusParJeton: {
          [CLE_DU_LIEN]: 'LINK_MAX_USES',
          '507f1f77bcf86cd799439011': 'LINK_MAX_USES',
        },
      });
      chaine.passerelle.oublie();

      await page.goto(`${chaine.serveur.base}${CHEMIN_PARTAGE}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('main li')).toHaveCount(4);
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/link/')),
      ).toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * § 7 — « erreur réseau ≠ 401 ». La place ne peut pas disparaître de l'écran parce que la
   * passerelle n'a pas répondu : c'est le cache-first du § 6.3 B, et c'est le rôle premier sur un
   * téléphone en 3G.
   */
  test('passerelle MUETTE : la place se peint depuis le cookie, sans alerte', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      chaine.passerelle.regle({ revalidation: { muette: true } });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bienvenue Tolu !');
      await expect(page.locator('main li')).toHaveCount(4);
      await expect(page.locator('main [role="alert"]')).toHaveCount(0);
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * § 6.3 B, F, G — LES DROITS SONT RE-LUS, ET LA PLACE PEUT MOURIR.
 *
 * « Les droits sont RE-LUS de la réponse : l'hôte a pu les changer. » Un écran qui les servirait
 * d'un cookie non signé écrit une seule fois au join laisserait un invité lire « Écrire et
 * répondre » indéfiniment après que l'hôte le lui a retiré — et n'aurait aucun état à peindre pour
 * une place fermée.
 */
test.describe('§ 6.3 — ce que la place vaut ENCORE, relu à chaque rendu', () => {
  test('un droit retiré par l’hôte disparaît de l’écran au rechargement', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');
      await expect(page.locator('main')).toContainText('Écrire et répondre');

      chaine.passerelle.regle({
        revalidation: {
          droitsRelus: {
            canSendMessages: false,
            canSendFiles: true,
            canSendImages: true,
            allowViewHistory: true,
          },
        },
      });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('main')).toContainText('Lecture seule');
      await expect(page.locator('main')).not.toContainText('Écrire et répondre');
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * ÉTAT F — `isActive:false` (départ, bannissement, purge). Le § 6.3 F exige un BOUTON et
   * INTERDIT le re-join silencieux, mesure à l'appui : identité neuve, pseudo suffixé, trois
   * compteurs, et une boucle qui épuiserait le `maxUses` du créateur.
   */
  test('place FERMÉE (401) : l’écran le dit, ne peint plus aucun droit, et ne rejoint RIEN', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      chaine.passerelle.regle({ revalidation: { statut: 401 } });
      chaine.passerelle.oublie();
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await expect(page.locator('main [role="alert"]')).toContainText('Votre place a été fermée');
      await expect(page.locator('main li')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Reprendre ma place' })).toBeVisible();
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/join/')),
      ).toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * ÉTAT G — le lien meurt, la place tient. « Ce qui est déjà lu reste lu », la raison est NOMMÉE,
   * et il n'y a AUCUNE redirection automatique.
   */
  test('lien RÉVOQUÉ (410) : la raison est nommée, l’écran est CONSERVÉ', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      chaine.passerelle.regle({ revalidation: { statut: 410, code: 'LINK_EXPIRED' } });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      expect(new URL(page.url()).pathname).toBe(CHEMIN);
      await expect(page.locator('main [role="alert"]')).toContainText('Ce lien a expiré');
      await expect(page.locator('main li')).toHaveCount(4);
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * LE CONTRÔLE — la cible n'en dessine qu'un, et l'écran n'en avait AUCUN.
 *
 * Le CTA « Entrer dans la conversation » ouvrirait `thread`, que personne ne sert : il serait
 * inerte (loi 4). Mais la loi 4 interdit un contrôle sans effet, pas un écran sans contrôle — et
 * `rights` masque `join` à la même adresse tant que le cookie vit (400 jours). Le témoin ne
 * regarde pas le bouton : il regarde son EFFET, jusqu'au pixel.
 */
test.describe('§ loi 4 — l’écran des droits n’est pas un cul-de-sac', () => {
  test('« Quitter cette place » ferme la place et ROUVRE l’entrée à la même adresse', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');
      chaine.passerelle.oublie();

      await page.getByRole('button', { name: 'Quitter cette place' }).click();

      // L'entrée est rouverte : le formulaire est de retour, à la MÊME adresse. C'est cette
      // attente — et pas `waitForLoadState`, qui rend la main sans attendre l'action de serveur —
      // qui dit que le geste a ABOUTI ; le journal ne se lit qu'après, sinon il se lit trop tôt.
      await expect(page.locator('#pseudo')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rejoindre la conversation' })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(CHEMIN);

      // La passerelle a été PRÉVENUE — sinon la place resterait occupée jusqu'au bail (§ 6.4).
      expect(
        chaine.passerelle.journal.filter((appel) => appel.chemin.includes('/anonymous/leave')),
      ).not.toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * ÉTAT F, la reprise : le § 6.3 F demande que le bouton refasse le join « avec le pseudo
   * précédent pré-rempli ». C'est le visiteur qui appuie — jamais l'écran qui rejoint seul.
   */
  test('« Reprendre ma place » ramène au formulaire, pseudo pré-rempli', async ({ page }) => {
    const chaine = await monte();

    try {
      await rejoint(page, chaine, 'Tolu');

      chaine.passerelle.regle({ revalidation: { statut: 401 } });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });

      await page.getByRole('button', { name: 'Reprendre ma place' }).click();

      await expect(page.locator('#pseudo')).toHaveValue('Tolu');
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * GATE C, ligne ICONOGRAPHIE (§ 9.6) — « 100 % des icônes attendues présentes ET RENDUES ».
 *
 * C'est la seule des trois lignes du gate visuel qui soit une assertion DOM plutôt qu'un diff de
 * pixels, et c'est aussi celle que le § 8.5 nomme « assertion anti-panne cross-origin » : les N
 * `<use>` doivent rendre N symboles VISIBLES. Un `<use>` vers un sprite externe — que ni Chrome ni
 * Safari n'honorent — laisse un trou SILENCIEUX : la balise est là, l'attribut est juste, et rien
 * ne s'affiche. Mesurer la boîte du `<svg>` est ce qui distingue les deux.
 */
test.describe('§ 9.6 — les icônes de l’écran des droits sont rendues, pas seulement référencées', () => {
  test('rend un symbole visible pour chaque <use> attendu', async ({ page }) => {
    const chaine = await monte({
      droits: {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: false,
        allowViewHistory: true,
      },
    });

    try {
      await rejoint(page, chaine, 'Tolu');

      const attendus = ['#ph-ghost', '#ph-check-circle', '#ph-check-circle', '#ph-check-circle', '#ph-x-circle'];

      const rendus = await page.locator('main svg use').evaluateAll((noeuds) =>
        noeuds.map((noeud) => {
          const hote = noeud.parentElement;
          const boite = hote?.getBoundingClientRect();
          return {
            href: noeud.getAttribute('href') ?? '',
            // Le `<symbol>` référencé existe-t-il dans CE document ? Un `<use>` non résolu ne
            // dessine rien, et sa boîte reste celle du `<svg>` : les deux mesures sont
            // nécessaires, aucune ne suffit.
            resolu: document.getElementById((noeud.getAttribute('href') ?? '').slice(1)) !== null,
            visible: (boite?.width ?? 0) > 0 && (boite?.height ?? 0) > 0,
          };
        }),
      );

      expect(rendus.map((icone) => icone.href)).toEqual(attendus);
      expect(rendus.filter((icone) => icone.resolu && icone.visible)).toHaveLength(attendus.length);
    } finally {
      await chaine.ferme();
    }
  });
});

const RGB = (rgb: string): string => {
  const canaux = (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  return `#${canaux.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`;
};

const chargeContraste = async (): Promise<(a: string, b: string) => number> =>
  (
    (await import(pathToFileURL(join(RACINE_V3, 'scripts', 'lib', 'couleur.mjs')).href)) as {
      readonly contraste: (a: string, b: string) => number;
    }
  ).contraste;

/**
 * LES QUATRE COLONNES DE THÈME (§ 9.6) sur cet écran.
 *
 * Les deux colonnes EXPLICITES ne sont pas des variantes de confort : elles sont les seules qui
 * attrapent une jumelle media/classe — une table de jetons qui basculerait sur
 * `prefers-color-scheme` pendant que la classe dit l'inverse. Les colonnes « système » ne peuvent
 * pas la voir, les deux moteurs y disant la même chose.
 *
 * Ce qui est mesuré n'est pas un score de pixels : le harnais de diff par région
 * (`v3-visual.spec.ts`, § 9.2) n'est pas livré et `pixelmatch` n'est pas installé. C'est ce que
 * le score CHERCHE — la classe servie suit le stockage et non l'OS, et le texte de l'écran reste
 * lisible (WCAG AA, 4,5:1) dans les quatre colonnes. Sur cet écran le risque est concret : le
 * DÉTAIL de chaque droit est rendu en `--color-text-muted`, la teinte la plus proche du plan.
 */
test.describe('§ 8.5 / § 9.6 — accessibilité et thème de l’écran des droits', () => {
  COLONNES_DE_THEME.forEach((theme) => {
    test.describe(`thème ${theme.id}`, () => {
      test.use({ colorScheme: theme.colorScheme });

      const arme = async (page: Page): Promise<void> => {
        if (theme.stockage === null) return;
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
      };

      test(`0 violation axe serious/critical (${theme.id})`, async ({ page }) => {
        const chaine = await monte();

        try {
          await arme(page);
          await rejoint(page, chaine, 'Tolu');

          await expect(page.locator('html')).toHaveClass(
            new RegExp(`\\b${theme.classeAttendue}\\b`),
          );

          const { violations } = await new AxeBuilder({ page }).analyze();
          const bloquantes = violationsBloquantes(violations);

          expect(bloquantes, rapporteViolations(`${CHEMIN} [${theme.id}]`, bloquantes)).toEqual([]);
        } finally {
          await chaine.ferme();
        }
      });

      test(`le détail de chaque droit reste lisible (${theme.id})`, async ({ page }) => {
        const chaine = await monte();

        try {
          await arme(page);
          await rejoint(page, chaine, 'Tolu');

          const contraste = await chargeContraste();
          const lu = await page.evaluate(() => {
            const plan = getComputedStyle(document.body).backgroundColor;
            const paragraphes = [...document.querySelectorAll('main li p')];
            return paragraphes.map((p) => ({ encre: getComputedStyle(p).color, plan }));
          });

          expect(lu.length, `${theme.id} — aucun détail mesuré`).toBeGreaterThan(0);
          for (const { encre, plan } of lu) {
            expect(contraste(RGB(encre), RGB(plan)), theme.id).toBeGreaterThanOrEqual(4.5);
          }
        } finally {
          await chaine.ferme();
        }
      });
    });
  });
});
