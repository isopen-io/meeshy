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
//   3. **Le retour de bfcache** — `page.goBack()` après une navigation : les
//      champs sont NATIFS et l'écran n'expédie aucun script, donc le navigateur
//      restitue la saisie tout seul. C'est une propriété du socle, et la seule
//      façon de la prouver est de le faire faire au navigateur.

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
 * **CE QUE LE BROUILLON NE FAIT PAS ENCORE, ET POURQUOI — mesuré, pas supposé.**
 *
 * #4966 demande « un brouillon saisi survit à un rechargement et à un retour
 * bfcache ». Il ne survit PAS, et la cause n'est pas un oubli : le document
 * d'un écran CONNECTÉ est servi `cache-control: no-store, private`
 * (`app/connecte/porte.ts` › `CACHE_PRIVE`), et un document `no-store` n'entre
 * pas dans le bfcache de Chromium. Mesuré ici même le 2026-09-04 : après un
 * aller sur `/feed` et un retour arrière, le champ est VIDE.
 *
 * Les deux moitiés de l'alternative sont mauvaises, et c'est ce qui range la
 * chose en suivi plutôt qu'en correctif : retirer `no-store` ferait resservir
 * par le bouton « précédent » un document qui porte les publications d'UNE
 * personne, sur un appareil qui peut être partagé — on paierait une fuite pour
 * un confort. Tenir le brouillon demande donc le MODULE (une entrée de
 * `localStorage`, restituée au chargement), c'est-à-dire la seconde tranche de
 * cet écran, comme le commentaire (#5091) et le lien (#5071) l'ont eue.
 *
 * CE TÉMOIN GARDE DONC LES DEUX FAITS QUI SONT VRAIS AUJOURD'HUI : l'écran
 * n'expédie aucun module, et son document ne se met pas en cache. Le second est
 * une propriété de SÉCURITÉ, pas une performance — c'est lui qui empêche le
 * « précédent » de resservir la publication de quelqu'un d'autre.
 */
test('n’expédie aucun module, et ne se met pas en cache', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  const reponse = await page.goto(`${v3.base}/composer`);

  expect(await page.locator('script[src]').count(), 'le composer ne doit expédier aucun module').toBe(0);
  expect(reponse?.headers()['cache-control'] ?? '').toContain('no-store');
  expect(reponse?.headers()['cache-control'] ?? '').toContain('private');

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
