// GATE de l'écran `join` (matrice `join`, issue #4522) — « un visiteur sans compte rejoint la
// conversation depuis son téléphone, MÊME SANS JAVASCRIPT ».
//
// Ce que ce fichier mesure, et que rien d'autre ne peut mesurer : la CHAÎNE. Le témoin unitaire
// (`__tests__/join-vue.test.tsx`) juge le HTML servi ; celui de la passerelle
// (`__tests__/adhesion.test.ts`) juge les appels. Entre les deux vit la seule chose qui décide
// vraiment du critère — un navigateur AVEC JAVASCRIPT DÉSACTIVÉ qui SOUMET le formulaire, une
// action de serveur qui atteint la passerelle, un 201 observé sur le fil, un cookie posé et une
// redirection suivie. Aucun de ces cinq maillons n'existe dans un test unitaire.
//
// La passerelle de bouchon est donc un TÉMOIN, pas une commodité : c'est son journal qui prouve
// le 201, et lui seul.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import { contoursDeControle, contrasteDeLaLimite } from './lib/contours';
import {
  CLE_DU_LIEN,
  NOM_DU_LIEN,
  CREATEUR_DU_LIEN,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ReponseDadmission,
  type ServeurV3,
} from './lib/serveurs';
import { THEME_STORAGE_KEY } from '../../app/theme-script';

const CHEMIN = `/chats/${CLE_DU_LIEN}`;

type Chaine = {
  readonly passerelle: PasserelleDeBouchon;
  readonly serveur: ServeurV3;
  readonly ferme: () => Promise<void>;
};

const monte = async (options?: {
  readonly admission?: ReponseDadmission;
  readonly lien?: Readonly<Record<string, unknown>>;
}): Promise<Chaine> => {
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

const joins = (passerelle: PasserelleDeBouchon): readonly string[] =>
  passerelle.journal
    .filter((appel) => appel.methode === 'POST' && appel.chemin.includes('/anonymous/join/'))
    .map((appel) => appel.corps);

/**
 * Le geste NOMINAL, tel qu'un pouce le fait : on tape un pseudo, on appuie.
 *
 * `fill` puis `click` passent par l'entrée du navigateur, pas par du script de page — c'est ce
 * qui les garde valables quand le contexte a `javaScriptEnabled: false`.
 */
const soumet = async (page: Page, pseudo: string): Promise<void> => {
  await page.locator('#pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Rejoindre la conversation' }).click();
  await page.waitForLoadState('domcontentloaded');
};

test.describe('§ P0 — rejoindre sans compte, JavaScript DÉSACTIVÉ', () => {
  test.use({ javaScriptEnabled: false, locale: 'yo-NG' });

  test('le formulaire se soumet, la place est créée (201 observé) et la page suivante l’annonce', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);
      await expect(page.locator('h1')).toHaveText(NOM_DU_LIEN);

      await soumet(page, 'Tolu');

      // LE critère : la passerelle a reçu l'admission, avec le pseudo tapé — donc le formulaire
      // est parti sans une ligne de JavaScript.
      const corps = joins(chaine.passerelle);
      expect(corps, 'aucune admission n’a atteint la passerelle').toHaveLength(1);
      expect(JSON.parse(corps[0] ?? '{}')).toMatchObject({ username: 'Tolu' });

      // Et la redirection a été SUIVIE : le visiteur voit sa place, jamais le formulaire à
      // nouveau — ce qui aurait eu l'air d'un échec sur une entrée réussie. Ce qui se compte est
      // le CHAMP d'entrée, pas le `<form>` : l'écran des droits en porte un, sans aucun champ,
      // pour son bouton de sortie — et c'est justement ce que cette colonne éprouve, puisqu'elle
      // tourne SANS JavaScript. Les `input[type=hidden]` sont exclus parce qu'ils ne sont PAS de
      // nous : c'est ainsi que Next transporte l'identifiant d'une action de serveur quand le
      // formulaire est posté par le navigateur — les compter ferait échouer le témoin sur la
      // preuve même qu'il cherche.
      expect(new URL(page.url()).pathname).toBe(CHEMIN);
      await expect(page.locator('h1')).toContainText('Tolu');
      await expect(page.locator('main input:not([type="hidden"]), main select')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Quitter cette place' })).toBeVisible();
    } finally {
      await chaine.ferme();
    }
  });

  test('la langue part pré-remplie depuis Accept-Language, jamais « fr » en dur', async ({ page }) => {
    const chaine = await monte();

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);
      await expect(page.locator('#langue')).toHaveValue('yo');

      await soumet(page, 'Tolu');

      expect(JSON.parse(joins(chaine.passerelle)[0] ?? '{}')).toMatchObject({ language: 'yo' });
    } finally {
      await chaine.ferme();
    }
  });

  test('l’accordéon des droits s’ouvre au CLAVIER, sans JavaScript', async ({ page }) => {
    const chaine = await monte();

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);

      const details = page.locator('details');
      await expect(details).not.toHaveAttribute('open', /.*/);

      // Le clavier seul : c'est le `<summary>` natif qui porte l'ouverture, donc elle survit à
      // l'absence de script. Un `<div onClick>` — ce que la planche dessine — n'aurait rien fait.
      await page.locator('summary').press('Enter');

      await expect(details).toHaveAttribute('open', /.*/);
      await expect(details).toContainText('Entrer sans compte');
    } finally {
      await chaine.ferme();
    }
  });

  test('ne transporte jamais l’identité du créateur du lien (§ 5.1)', async ({ page }) => {
    const chaine = await monte();

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);

      expect(await page.content()).not.toContain(CREATEUR_DU_LIEN);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * Les refus, chacun peint. La table est celle du critère de fin, dans ses DEUX vocabulaires :
   * ceux que le critère nomme (`REQUIRES_ACCOUNT`, `LINK_MAX_USES`, `MAX_CONCURRENT_USERS`) et
   * ceux que `admitLinkEntry` sert depuis #4167 (`ACCOUNT_REQUIRED`, `LINK_EXHAUSTED`,
   * `REGION_NOT_ALLOWED`). Les deux sont vrais aujourd'hui, selon la porte qui répond.
   */
  const REFUS: readonly (readonly [ReponseDadmission, string])[] = [
    [{ statut: 403, code: 'REQUIRES_ACCOUNT' }, 'Ce lien demande un compte'],
    [{ statut: 403, code: 'ACCOUNT_REQUIRED' }, 'Ce lien demande un compte'],
    [{ statut: 403, code: 'REGION_NOT_ALLOWED' }, 'Entrée non autorisée depuis ici'],
    [{ statut: 403, code: 'LANGUAGE_NOT_ALLOWED' }, 'Cette langue n’est pas acceptée'],
    [{ statut: 410, code: 'LINK_INACTIVE' }, 'Ce lien a été fermé'],
    [{ statut: 410, code: 'CONVERSATION_CLOSED' }, 'Cette conversation est terminée'],
    [{ statut: 410, code: 'LINK_EXPIRED' }, 'Ce lien a expiré'],
    [{ statut: 410, code: 'LINK_MAX_USES' }, 'Ce lien a atteint sa limite'],
    [{ statut: 409, code: 'LINK_EXHAUSTED' }, 'Ce lien a atteint sa limite'],
    [{ statut: 429, code: 'MAX_CONCURRENT_USERS' }, 'Ce lien a atteint sa limite'],
    [{ statut: 400, code: 'Donnees invalides' }, 'Il manque quelque chose'],
  ];

  REFUS.forEach(([admission, titre]) => {
    test(`peint le refus ${admission.statut} ${admission.code}`, async ({ page }) => {
      const chaine = await monte({ admission });

      try {
        await page.goto(`${chaine.serveur.base}${CHEMIN}`);
        await soumet(page, 'Tolu');

        await expect(page.getByRole('alert')).toContainText(titre);
      } finally {
        await chaine.ferme();
      }
    });
  });

  test('pré-remplit le pseudo que la passerelle propose sur un 409', async ({ page }) => {
    const chaine = await monte({
      admission: {
        statut: 409,
        code: 'USERNAME_TAKEN_IN_CONVERSATION',
        suggestedNickname: 'Tolu2',
      },
    });

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);
      await soumet(page, 'Tolu');

      await expect(page.getByRole('alert')).toContainText('Ce pseudo est déjà pris ici');
      await expect(page.locator('#pseudo')).toHaveValue('Tolu2');
      // Le formulaire reste ouvert : un autre pseudo passera, contrairement aux refus définitifs.
      await expect(page.locator('form')).toHaveCount(1);
    } finally {
      await chaine.ferme();
    }
  });

  test('le champ requis est tenu par le SERVEUR, pas seulement par le navigateur', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      // Un pseudo blanc passe la validation `required` du navigateur (elle n'exige pas un
      // caractère non blanc) : c'est le serveur qui refuse, et il refuse SANS toucher la
      // passerelle.
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);
      await soumet(page, '   ');

      await expect(page.getByRole('alert')).toContainText('Il manque quelque chose');
      expect(joins(chaine.passerelle)).toHaveLength(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * L'IDENTITÉ RÉSEAU DU VISITEUR, mesurée sur la CHAÎNE — la seule chose qu'un témoin unitaire
   * ne peut pas voir.
   *
   * L'appel de la v3 part serveur-à-serveur : sans transfert explicite, la passerelle voit
   * l'adresse du conteneur `meeshy-frontend-v3`, la MÊME pour tous. `admitLinkEntry` évalue
   * alors `allowedIpRanges` sur une constante, et `anonymousSession.ipAddress` — le signal
   * d'abus de tout invité de la v3 — en devient une aussi. Le legacy n'avait pas ce défaut : il
   * appelle `/anonymous/join` depuis le NAVIGATEUR.
   *
   * Le mandataire est ici joué par `extraHTTPHeaders` : c'est ce que Traefik pose devant la zone.
   */
  test('fait voyager l’adresse du visiteur jusqu’à la passerelle, et RIEN d’autre', async ({
    page,
  }) => {
    const chaine = await monte();

    try {
      await page.setExtraHTTPHeaders({ 'x-forwarded-for': '102.89.34.7' });
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);
      await soumet(page, 'Tolu');

      const admission = chaine.passerelle.journal.find(
        (appel) => appel.methode === 'POST' && appel.chemin.includes('/anonymous/join/'),
      );

      expect(admission, 'aucune admission n’a atteint la passerelle').toBeDefined();
      // Le DERNIER maillon de la chaîne est celui que notre propre mandataire a posé : c'est
      // exactement ce que la passerelle lit sous `TRUST_PROXY_HOPS`.
      expect((admission?.entetes['x-forwarded-for'] ?? '').split(',').at(-1)?.trim()).toBe(
        '102.89.34.7',
      );
      // Deux en-têtes NOMMÉS, jamais un `...headers` aveugle : la session d'un lecteur connecté
      // de la zone legacy n'a rien à faire sur une porte anonyme.
      expect(admission?.entetes).not.toHaveProperty('cookie');
      expect(admission?.entetes).not.toHaveProperty('authorization');
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * L'AUTORITÉ d'un refus — le défaut que le paramètre de requête portait.
   *
   * `?refus=` était borné à l'union FERMÉE des causes, donc inattaquable par injection, et
   * restait indistinguable d'un refus écrit par un tiers : un `/chats/mshy_lagos?refus=…` collé
   * dans une conversation affichait « Ce lien a été fermé », SANS formulaire, sur une invitation
   * parfaitement ouverte — n'importe qui pouvait supprimer le seul contrôle de l'écran.
   */
  test('un ?refus= ajouté à l’adresse partagée ne ferme PAS un lien ouvert', async ({ page }) => {
    const chaine = await monte();

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}?refus=lien-desactive&suggestion=Pirate`);

      await expect(page.locator('form')).toHaveCount(1);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Ce lien a été fermé');
      await expect(page.locator('#pseudo')).toHaveValue('');
    } finally {
      await chaine.ferme();
    }
  });

  test('un lien qui exige un compte n’offre aucun formulaire, seulement les deux portes', async ({
    page,
  }) => {
    const chaine = await monte({ lien: { requireAccount: true } });

    try {
      await page.goto(`${chaine.serveur.base}${CHEMIN}`);

      await expect(page.locator('form')).toHaveCount(0);
      // `returnUrl` — le paramètre que le DESTINATAIRE lit
      // (`apps/web/app/login/page.tsx:19`), jamais `next`, qu'aucun fichier de
      // la zone legacy ne lit : le premier était droppé en silence et le
      // visiteur atterrissait sur `/dashboard`.
      await expect(page.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
        'href',
        `/login?returnUrl=${encodeURIComponent(CHEMIN)}`,
      );
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * Le gate du § 8.5 sur CET écran, dans ses quatre colonnes de thème et sur DEUX états.
 *
 * `v3-a11y.spec.ts` balaie ce que `next build` a émis, mais son serveur ne connaît aucune
 * passerelle : sur `/chats/[lien]` il n'atteint que l'état « impossible de joindre la
 * conversation ». L'écran de jonction NOMINAL — son aperçu, son accordéon, son formulaire — n'a
 * de sujet que dans une chaîne, donc ici.
 *
 * ET L'ÉTAT REFUSÉ EST BALAYÉ AUSSI, POUR UNE RAISON MESURÉE.
 *
 * `__tests__/join-vue.test.tsx` audite les cinq états à `axe` — mais dans `jsdom`, où AUCUNE
 * feuille n'est chargée : `color-contrast` n'y a rien à évaluer et ne tombe jamais. Le bandeau
 * de refus a été écrit sur `--color-danger-soft`, un APLAT rouge, avec une encre
 * `--color-text-muted` : gris sur rouge vif, invisible pour ce témoin-là. Seul un vrai
 * navigateur, avec la vraie feuille et la vraie palette, le voit — d'où cette seconde colonne.
 */
const ETATS_AUDITES: readonly (readonly [string, ReponseDadmission | null])[] = [
  ['nominal', null],
  ['refusé', { statut: 409, code: 'USERNAME_TAKEN_IN_CONVERSATION', suggestedNickname: 'Tolu2' }],
];

/**
 * L'état REFUSÉ ne s'atteint plus par l'URL, et c'est le correctif lui-même.
 *
 * `?refus=` était borné à l'union fermée des causes — donc inattaquable par injection — et
 * restait indistinguable d'un `?refus=` écrit par un tiers, alors que l'écran RETIRE son
 * formulaire sur un refus définitif. Le verdict voyage désormais dans un cookie que seul le
 * serveur écrit : l'atteindre demande de SOUMETTRE, ce qui est aussi la chaîne réelle.
 */
const peintLEcran = async (
  page: Page,
  chaine: Chaine,
  refuse: ReponseDadmission | null,
): Promise<void> => {
  await page.goto(`${chaine.serveur.base}${CHEMIN}`, { waitUntil: 'domcontentloaded' });
  if (refuse !== null) {
    await soumet(page, 'Tolu');
    await expect(page.getByRole('alert')).toBeVisible();
  }

  // Le TITRE, et pas seulement l'alerte. Ces colonnes tournent avec JavaScript
  // (les deux thèmes explicites se posent par `localStorage`, ce qu'un contexte
  // sans script ne peut pas faire) : la réponse de l'action de serveur est donc
  // suivie par une navigation DOUCE, pendant laquelle Next remplace les balises
  // de `<head>`. `axe` lancé dans cette fenêtre rendait `document-title` —
  // « serious » — sur une page qui en a un une milliseconde plus tard. Attendre
  // le titre attend exactement ce qui manquait ; s'il ne revenait pas, ce serait
  // un vrai défaut, et l'attente échouerait au lieu de le masquer.
  await expect(page).toHaveTitle(/Rejoindre une conversation/);
};

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

test.describe('§ 8.5 — accessibilité de l’écran de jonction', () => {
  COLONNES_DE_THEME.forEach((theme) => {
    ETATS_AUDITES.forEach(([etat, refuse]) => {
    test.describe(`thème ${theme.id} — ${etat}`, () => {
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

      test(`0 violation axe serious/critical (${theme.id}, ${etat})`, async ({ page }) => {
        const chaine = await monte({ ...(refuse === null ? {} : { admission: refuse }) });

        try {
          await arme(page);
          await peintLEcran(page, chaine, refuse);

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

      /**
       * WCAG 1.4.11 — LA LIMITE DES CONTRÔLES, que `axe` ne mesure pas.
       *
       * `axe` n'évalue que le contraste du TEXTE : « 0 violation serious/critical » restait vrai
       * au-dessus de champs sans aucune frontière perceptible. Les champs de cet écran sont les
       * SEULS contrôles réels du rôle premier, et ils portaient `--color-neutral-900` — 1,11:1
       * en clair, 1,16:1 en sombre — sur un fond à 1,06:1 du plan. Le gate qui l'attrape existait
       * déjà (`lib/contours.ts`, écrit sur ce reproche exact) ; ce spec ne l'importait pas, et il
       * exemptait de surcroît les contrôles REMPLIS, c'est-à-dire exactement ceux d'ici.
       */
      test(`chaque contrôle a une limite perceptible (${theme.id}, ${etat})`, async ({ page }) => {
        const chaine = await monte({ ...(refuse === null ? {} : { admission: refuse }) });

        try {
          await arme(page);
          await peintLEcran(page, chaine, refuse);

          const contraste = await chargeContraste();
          const contours = await contoursDeControle(page);

          expect(contours.length, `${theme.id} — aucun contrôle mesuré`).toBeGreaterThan(0);
          for (const contour of contours) {
            expect(
              contrasteDeLaLimite(contour, contraste, RGB),
              `${theme.id} — ${contour.repere}`,
            ).toBeGreaterThanOrEqual(3);
          }
        } finally {
          await chaine.ferme();
        }
      });
    });
    });
  });
});
