// GATE — `/composer` (#4966) : ce qu'on publie, et pour qui.
//
// `__tests__/composer.test.ts` juge le document servi et le corps envoyé dans
// un serveur cousu. Ce fichier juge ce qu'un VRAI navigateur en fait, et il
// porte les trois choses qu'aucun témoin de nœud ne peut dire :
//
//   1. **La chaîne entière** — le champ « Quoi de neuf ? » du fil, l'écran, la
//      publication, le retour. Une porte qui ne s'ouvre pas ne se voit pas dans
//      un `expect(html).toContain('href=…')`.
//   2. **Ce que la PASSERELLE reçoit** — l'audience, l'emoji, la langue
//      revendiquée, lus sur le corps que le bouchon a retenu. Le critère de fin
//      porte sur ce qui PART, jamais sur le `<select>` rendu : une confidentialité
//      se vérifie sur la charge.
//   3. **La survie du BROUILLON** — un rechargement, un changement de format,
//      un aller-retour : la saisie revient. C'est le module qui la tient
//      (`lib/realtime/composer.ts`, `sessionStorage`), le document étant
//      `no-store` donc hors bfcache ; seule une vraie session de navigateur
//      peut le dire.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { COMPOSER } from '../../lib/contenu/composer';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME } from './lib/verdict-axe';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

/** Le module arrive APRÈS le premier pixel : on l'attend par son EFFET, jamais par une minuterie seule. */
/**
 * ATTENDRE UNE OBSERVATION, JAMAIS UNE HORLOGE.
 *
 * `data-participation` est servi par le document (`app/connecte/composer-vue.ts`)
 * et existe donc dès le premier pixel : l'attendre ne prouve rien sur le module,
 * qui arrive après. Ce témoin complétait par `waitForTimeout(1_200)` — un pari
 * sur la vitesse de la machine, tenu en local (2,8 s au total) et perdu en CI le
 * 2026-09-04, où le champ relu après rechargement était encore vide.
 *
 * `data-brouillon="arme"` est posé par la DERNIÈRE ligne de `demarre()`
 * (`lib/realtime/composer.ts`), une fois le brouillon restauré et les écouteurs
 * posés. L'attendre, c'est attendre le fait plutôt qu'un délai qui l'approche.
 */
const attendsLeModule = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.waitForFunction(
    () => document.querySelector('main[data-participation="composer"][data-brouillon="arme"]') !== null,
  );
};

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

const contexte = async (
  navigateur: Browser,
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    viewport: { width: 390, height: 844 },
  });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  if (options.stockage !== undefined && options.stockage !== null) {
    await ctx.addInitScript(
      ([cle, valeur]) => {
        try {
          window.localStorage.setItem(cle, valeur);
        } catch {
          /* le script anti-flash retombe sur la préférence système */
        }
      },
      [THEME_STORAGE_KEY, options.stockage] as const,
    );
  }
  return ctx;
};

/** La dernière publication REÇUE par la passerelle — le sujet du critère de fin. */
const derniereRecue = (): Record<string, unknown> | undefined =>
  passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1];

/**
 * LA CHAÎNE ENTIÈRE — du fil au composer, du composer à la publication reçue.
 * Deux gestes : ouvrir, publier.
 */
test('le fil ouvre le composer, et publier envoie la charge', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed`);
  await page.getByRole('link', { name: 'Quoi de neuf ?' }).click();
  await expect(page).toHaveURL(`${v3.base}/composer`);

  await page.locator('#c-texte').fill('La revue de mars est prête.');
  await page.getByRole('button', { name: COMPOSER.publier }).click();

  await expect(page).toHaveURL(`${v3.base}/composer?format=post&publie=1`);
  await expect(page.getByRole('status')).toContainText(COMPOSER.publie);

  expect(derniereRecue()).toMatchObject({
    type: 'POST',
    content: 'La revue de mars est prête.',
    visibility: 'PUBLIC',
  });

  await ctx.close();
});

/**
 * L'AUDIENCE MUTE CE QUI PART. Le `<select>` est un contrôle, pas une mention
 * (charte règle 7) — et c'est une garde de CONFIDENTIALITÉ : la vérifier sur le
 * document rendu ne prouverait rien de ce qui quitte le navigateur.
 */
test('choisir « Contacts » envoie FRIENDS à la passerelle', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);
  await page.locator('#c-texte').fill('Pour mes contacts seulement.');
  await page.locator('#c-audience').selectOption('FRIENDS');
  await page.getByRole('button', { name: COMPOSER.publier }).click();

  await expect(page).toHaveURL(/publie=1/);
  expect(derniereRecue()).toMatchObject({ visibility: 'FRIENDS' });

  await ctx.close();
});

/**
 * UNE HUMEUR PART AVEC SON EMOJI, et sans texte : l'emoji EST le contenu.
 * Le radio est masqué (`.hors-ecran`) — il se coche donc par son LABEL, ce qui
 * est aussi la preuve que la cible de 44 px est bien le label et non un point.
 */
test('une humeur part avec son emoji, même sans un mot', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=humeur`);
  // ON COCHE PAR LE LABEL, comme un doigt le fait : le radio porte
  // `.hors-ecran` et l'emoji visible intercepte le pointeur. Viser l'`<input>`
  // ferait passer un témoin sur une cible qu'aucun lecteur n'atteint.
  await page.locator('.humeurs label').filter({ has: page.locator('input[value="☕"]') }).click();
  await expect(page.locator('input[value="☕"]')).toBeChecked();
  await page.getByRole('button', { name: COMPOSER.publier }).click();

  await expect(page).toHaveURL(/format=humeur&publie=1/);
  expect(derniereRecue()).toMatchObject({ type: 'STATUS', moodEmoji: '☕', content: '' });

  await ctx.close();
});

/**
 * **LE BROUILLON, ET LE CHOIX DE STOCKAGE QU'IL A FALLU FAIRE.**
 *
 * #4966 demande qu'« un brouillon saisi survive à un rechargement et à un
 * retour ». Il ne survivait pas, et la cause était MESURÉE : le document d'un
 * écran connecté est servi `cache-control: no-store, private`
 * (`app/connecte/porte.ts` › `CACHE_PRIVE`), et `no-store` exclut un document
 * du bfcache de Chromium. Retirer `no-store` ferait resservir par le bouton
 * « précédent » un document qui porte les publications d'UNE personne, sur un
 * appareil qui peut être partagé — une fuite payée pour un confort.
 *
 * D'où le module, et **`sessionStorage` plutôt que `localStorage`** : le
 * brouillon est le texte NON PUBLIÉ de quelqu'un, exactement ce que `no-store`
 * refuse de laisser resservir. `localStorage` recréerait cette exposition sans
 * borne de temps, lisible par la personne SUIVANTE qui ouvre l'écran sur le
 * même appareil — et la v3 n'a pas encore de route de déconnexion pour
 * l'effacer. `sessionStorage` meurt avec l'onglet : il couvre le critère
 * ENTIER, et rien de plus.
 *
 * CE QUE CE TÉMOIN PROUVE, ET QU'AUCUN TÉMOIN DE NŒUD NE PEUT DIRE : que le
 * module DIFFÉRÉ, arrivé après le premier pixel, a bien trouvé le champ, et que
 * le stockage choisi survit aux trois gestes que l'issue nomme.
 */
test('le brouillon survit à un rechargement', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);
  await attendsLeModule(page);
  await page.locator('#c-texte').fill('un brouillon qui doit revenir');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await attendsLeModule(page);

  await expect(page.locator('#c-texte')).toHaveValue('un brouillon qui doit revenir');

  await ctx.close();
});

test('le brouillon survit à un aller-retour, que le bfcache REFUSE à cet écran', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  const reponse = await page.goto(`${v3.base}/composer`);
  // Le document reste `no-store` : c'est une propriété de SÉCURITÉ, et c'est
  // elle qui rend le module nécessaire plutôt que redondant.
  expect(reponse?.headers()['cache-control'] ?? '').toContain('no-store');
  expect(reponse?.headers()['cache-control'] ?? '').toContain('private');

  await attendsLeModule(page);
  await page.locator('#c-texte').fill('écrit avant de partir');

  await page.goto(`${v3.base}/feed`, { waitUntil: 'domcontentloaded' });
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await attendsLeModule(page);

  await expect(page.locator('#c-texte')).toHaveValue('écrit avant de partir');

  await ctx.close();
});

/**
 * DEUX FORMATS, DEUX BROUILLONS. « post » et « humeur » sont deux
 * compositions ; passer de l'une à l'autre — une NAVIGATION, `?format=` — ne
 * doit pas déverser le texte de la première dans la seconde.
 */
test('chaque format tient SON brouillon, et ne déborde pas sur l’autre', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await attendsLeModule(page);
  await page.locator('#c-texte').fill('le texte du post');

  await page.goto(`${v3.base}/composer?format=humeur`, { waitUntil: 'domcontentloaded' });
  await attendsLeModule(page);
  await expect(page.locator('#c-texte')).toHaveValue('');

  await page.goto(`${v3.base}/composer?format=post`, { waitUntil: 'domcontentloaded' });
  await attendsLeModule(page);
  await expect(page.locator('#c-texte')).toHaveValue('le texte du post');

  await ctx.close();
});

/**
 * PUBLIER FERME LE BROUILLON. Sans cet effacement, revenir au composer après
 * avoir publié reposerait le texte qu'on vient d'envoyer au monde — et le
 * geste suivant serait de le republier.
 */
test('publier efface le brouillon', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);
  await attendsLeModule(page);
  await page.locator('#c-texte').fill('ceci part au monde');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/publie=1/);

  await page.goto(`${v3.base}/composer`, { waitUntil: 'domcontentloaded' });
  await attendsLeModule(page);
  await expect(page.locator('#c-texte')).toHaveValue('');

  await ctx.close();
});

/**
 * **LE SERVEUR A TOUJOURS RAISON** — la règle la moins évidente du module.
 * Après un REFUS, la porte re-sert la saisie dans le document. Le module ne
 * doit PAS restaurer par-dessus : il écraserait la frappe par une version plus
 * ANCIENNE d'elle-même. Le témoin le prouve par la seule voie possible — taper
 * un texte, le laisser partir, et vérifier que ce qui revient est celui du
 * SERVEUR.
 */
test('après un refus, le module ne réécrit pas par-dessus la saisie que le serveur repose', async ({
  browser,
}) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);
  await attendsLeModule(page);
  await page.locator('#c-texte').fill('   ');
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('.alerte')).toContainText(COMPOSER.vide);
  await attendsLeModule(page);
  // Le champ porte ce que le SERVEUR a reposé (la saisie nettoyée), pas le
  // brouillon — que la soumission vient d'effacer.
  await expect(page.locator('#c-texte')).toHaveValue('');

  await ctx.close();
});

/** UN REFUS GARDE TOUT — et c'est au pire moment qu'un formulaire se juge. */
test('publier le vide se refuse à l’écran, sans rien envoyer', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  const avant = passerelle.publicationsRecues.length;

  await page.goto(`${v3.base}/composer`);
  await page.getByRole('button', { name: COMPOSER.publier }).click();

  await expect(page.getByRole('alert')).toContainText(COMPOSER.vide);
  expect(passerelle.publicationsRecues.length, 'rien ne doit partir').toBe(avant);

  await ctx.close();
});

/**
 * TROIS ONGLETS, DEUX NATURES, ET AUCUNE CIBLE INERTE.
 *
 * « Post » et « Humeur » sont des FORMATS de ce formulaire (`?format=`) ;
 * « Story » est un ÉCRAN, et son onglet MÈNE ailleurs — publier une story
 * demande un autre défaut d'audience et une durée de vie à annoncer (#5033).
 * « Réel » reste absent : il exigerait un téléversement que cet écran ne fait
 * pas, et le griser serait le contrôle sans effet de la règle 7.
 */
test('rend deux formats et un lien vers la story, sans cible inerte', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer`);

  await expect(page.locator('.onglets a')).toHaveCount(3);
  await expect(page.locator('.onglets a[href^="/composer?format="]')).toHaveCount(2);
  await expect(page.locator('.onglets a[href="/stories/new"]')).toHaveCount(1);
  await expect(page.locator('.onglets a[href*="reel"]')).toHaveCount(0);
  expect(await page.locator('[href="#"], [onclick], [aria-disabled="true"]').count()).toBe(0);

  await ctx.close();
});

COLONNES_DE_THEME.forEach((theme) => {
  ['post', 'humeur'].forEach((format) => {
    test(`0 violation axe serious/critical — /composer?format=${format} (${theme.id})`, async ({ browser }) => {
      const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
      const page = await ctx.newPage();

      await page.goto(`${v3.base}/composer?format=${format}`);
      await expect(page.locator('.composer')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/composer?format=${format} (${theme.id})`, bloquantes)).toEqual([]);

      await ctx.close();
    });
  });
});
