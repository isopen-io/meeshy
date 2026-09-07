// GATE — `/composer` porte ses MÉDIAS (#5390). `v3-composer.spec.ts` garde le
// texte, l'audience, l'humeur et le brouillon ; ce fichier garde ce qu'un
// VRAI navigateur fait d'une photo : le chemin SANS JavaScript (un
// `<input type="file">` dans un `<form multipart>`, § critère de fin), et
// l'AMÉLIORATION PROGRESSIVE (l'aperçu avant l'envoi).
//
// Le bouchon TUS (`lib/bouchon-uploads.ts`) copie
// `services/gateway/src/routes/uploads/tus-handler.ts` — la garde d'identité
// (`onUploadCreate:297-343`), le corps de fin (`:581-622`) — et
// `POST /api/v1/posts` (`bouchon-compte.ts`) réclame `mediaIds` pour composer
// le post que `GET /api/v1/social/posts` sert à `/feed`, exactement ce que
// `PostFeedService.getFeed` ferait d'une publication fraîche.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { COMPOSER } from '../../lib/contenu/composer';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME } from './lib/verdict-axe';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const PNG = join(__dirname, 'fixtures', 'vue-composer.png');
const TXT = join(__dirname, 'fixtures', 'notes-composer.txt');

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
  options: { readonly schema?: 'light' | 'dark'; readonly javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return ctx;
};

/**
 * E1 — LE CŒUR DU CRITÈRE, SANS JAVASCRIPT. Le formulaire multipart poste sa
 * photo ; le fil la sert. `javaScriptEnabled: false` prouve que le chemin
 * NATIF marche seul — `setInputFiles` agit par le protocole du navigateur,
 * pas par un script de page, exactement comme un doigt qui choisit un
 * fichier.
 */
test('SANS JavaScript : une photo part par le formulaire et apparaît dans /feed', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.locator('#c-texte').fill('Avec une photo, sans script.');
  await page.locator('#c-medias').setInputFiles(PNG);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/publie=1/);
  await expect(page.getByRole('status')).toContainText(COMPOSER.publie);

  const derniere = passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1];
  expect(Array.isArray(derniere?.mediaIds) ? (derniere.mediaIds as unknown[]).length : 0).toBe(1);

  await page.goto(`${v3.base}/feed`);
  const image = page.locator('article.post figure.media img').first();
  await expect(image).toBeVisible();
  const src = await image.getAttribute('src');
  expect(src).not.toBeNull();
  const reponseFichier = await page.request.get(src as string);
  expect(reponseFichier.ok()).toBe(true);

  await ctx.close();
});

/** E2 — AVEC JavaScript, l'aperçu s'affiche AVANT tout envoi réseau. */
test('AVEC JavaScript : sélectionner un fichier montre son aperçu avant l’envoi', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  const avantUploads = passerelle.journal.filter((a) => a.chemin.includes('/api/v1/uploads')).length;

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-medias').setInputFiles(PNG);

  const apercu = page.locator('.composer .apercus li').first();
  await expect(apercu).toBeVisible();
  await expect(apercu.locator('img')).toBeVisible();

  const apresUploads = passerelle.journal.filter((a) => a.chemin.includes('/api/v1/uploads')).length;
  expect(apresUploads).toBe(avantUploads);

  await ctx.close();
});

/**
 * E3 — L'ÉCHEC RÉSEAU CONSERVE LE BROUILLON. La règle 3 réécrite du module
 * (`lib/realtime/composer.ts`) : le brouillon ne s'efface plus au `submit`,
 * seulement quand le document SERVI dit que la publication est partie.
 */
test('un échec réseau à la soumission conserve le texte tapé', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-texte').fill('ce texte doit survivre à la panne');

  await ctx.setOffline(true);
  await page.locator('button[type="submit"]').click().catch(() => undefined);
  await ctx.setOffline(false);

  await page.goto(`${v3.base}/composer?format=post`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await expect(page.locator('#c-texte')).toHaveValue('ce texte doit survivre à la panne');

  await ctx.close();
});

/** E4 — un type refusé se peint DANS le formulaire, et rien ne part. */
test('un type de fichier refusé se refuse À L’ÉCRAN, sans upload ni publication', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  const avantPublications = passerelle.publicationsRecues.length;
  const avantUploads = passerelle.journal.filter((a) => a.chemin.includes('/api/v1/uploads')).length;

  await page.goto(`${v3.base}/composer?format=post`);
  await page.locator('#c-texte').fill('ceci reste');
  await page.locator('#c-medias').setInputFiles(TXT);
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole('alert')).toContainText('notes-composer.txt');
  await expect(page.locator('#c-texte')).toHaveValue('ceci reste');
  expect(passerelle.publicationsRecues.length).toBe(avantPublications);
  expect(passerelle.journal.filter((a) => a.chemin.includes('/api/v1/uploads')).length).toBe(avantUploads);

  await ctx.close();
});

/** E5 — 0 violation axe serious/critical, l'état de refus peint, deux thèmes. */
COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /composer avec refus de médias (${theme.id})`, async ({ browser }) => {
    // JavaScript RESTE ACTIVÉ ICI — AxeBuilder injecte et évalue son script
    // DANS la page ; le désactiver casserait le témoin lui-même, pas l'écran
    // qu'il audite. Le refus de médias, lui, est une réponse SERVEUR : il se
    // peint identiquement avec ou sans script.
    const ctx = await contexte(browser, { schema: theme.colorScheme });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/composer?format=post`);
    await page.locator('#c-medias').setInputFiles(TXT);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/composer refus médias (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});

/**
 * E6 — ADAPTATION d'un témoin EXISTANT (`v3-composer.spec.ts`) : la
 * publication PARTIE efface le brouillon, jamais la soumission elle-même.
 * Gardé ICI aussi pour documenter le lien avec E3 ci-dessus — les deux
 * moitiés d'une même règle.
 */
test('la publication PARTIE efface le brouillon (pas la soumission)', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-texte').fill('ceci part au monde');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/publie=1/);
  // Le module de la page `?publie=1` DOIT avoir tourné — c'est LUI qui lit
  // `data-publie="1"` et efface — avant de partir : sans cette attente, la
  // navigation suivante peut couper le script avant qu'il n'ait effacé.
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);

  await page.goto(`${v3.base}/composer?format=post`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await expect(page.locator('#c-texte')).toHaveValue('');

  await ctx.close();
});

/**
 * E7 (revue #5390) — LE VERDICT D'UNE SÉLECTION NE SURVIT PAS À LA SUIVANTE,
 * et une sélection VALIDE ne peint aucune alerte.
 *
 * Le module créait son `<p class="alerte">` à CHAQUE `change`, refus ou non,
 * puis n'y écrivait un texte que sur refus : une barre rouge VIDE sous la
 * grille dès la première photo choisie (mesuré sur la capture des deux
 * schémas), et — pire — le refus d'une sélection PRÉCÉDENTE restait affiché
 * au-dessus de l'aperçu VALIDE de la suivante. Un refus qui ment sur ce qui
 * est sélectionné, à côté de la preuve du contraire.
 *
 * Le témoin joue les DEUX moitiés dans l'ordre où un doigt les produit :
 * un fichier refusé, puis une photo.
 */
test('une sélection neuve efface le verdict de l’ancienne, et n’en peint aucun si tout va bien', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);

  // 1. Une photo SEULE : aucun texte d'alerte VISIBLE dans le bloc des médias.
  await page.locator('#c-medias').setInputFiles(PNG);
  await expect(page.locator('.composer .apercus li img')).toBeVisible();
  await expect(page.locator('.champ.medias p.alerte:visible')).toHaveCount(0);

  // 2. Un fichier refusé : le pré-contrôle du module le dit, DANS le bloc.
  await page.locator('#c-medias').setInputFiles(TXT);
  await expect(page.locator('.champ.medias p.alerte')).toContainText('notes-composer.txt');

  // 3. Une photo à nouveau : le verdict de l'étape 2 a disparu.
  await page.locator('#c-medias').setInputFiles(PNG);
  await expect(page.locator('.composer .apercus li img')).toBeVisible();
  await expect(page.locator('.champ.medias p.alerte:visible')).toHaveCount(0);

  await ctx.close();
});

/**
 * E8 (revue #5390, défaut 1) — RETIRER UNE PHOTO SUR DEUX NE PERD PAS
 * L'AUTRE. Les deux sélections partagent le MÊME nom (`vue-composer.png`
 * choisi deux fois) — délibérément : le témoin qui compterait sur le nom
 * pour distinguer les deux fichiers passerait à tort. Il ne survit qu'à une
 * identité PAR FICHIER, jamais par son nom.
 */
test('retirer une photo sur deux ne perd pas l’autre', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-texte').fill('deux photos, une seule doit partir');
  await page.locator('#c-medias').setInputFiles([PNG, PNG]);

  await expect(page.locator('.composer .apercus li:not(.tuile-ajouter)')).toHaveCount(2);
  const boutonsDeRetrait = page.locator('.composer .apercus li .retirer-media');
  await expect(boutonsDeRetrait).toHaveCount(2);
  await expect(boutonsDeRetrait.first()).toHaveAccessibleName(/Retirer/);

  await boutonsDeRetrait.first().click();

  // UNE SEULE vignette reste — DANS LE DOM, mais aussi dans l'INPUT lui-même
  // (§ défaut 1) : sans la reconstruction par `DataTransfer`, le navigateur
  // aurait quand même soumis les DEUX fichiers, la grille mentant sur ce qui
  // part réellement.
  await expect(page.locator('.composer .apercus li:not(.tuile-ajouter)')).toHaveCount(1);
  const nombreDeFichiers = await page.locator('#c-medias').evaluate((entree: HTMLInputElement) => entree.files?.length ?? -1);
  expect(nombreDeFichiers).toBe(1);

  // LE FOCUS REVIENT À LA TUILE D'AJOUT (charte règle 5) — le bouton qui
  // vient de disparaître ne peut plus le porter.
  await expect(page.locator('#c-medias')).toBeFocused();

  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/publie=1/);

  const derniere = passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1];
  expect(Array.isArray(derniere?.mediaIds) ? (derniere.mediaIds as unknown[]).length : 0).toBe(1);

  await ctx.close();
});

/**
 * E9 (revue #5390, défaut 3) — LA LÉGENDE SAISIE À CÔTÉ D'UNE VIGNETTE PART
 * AVEC LE POST, ET LE REPLI S'OUVRE TOUT SEUL — le lecteur n'a rien à
 * chercher pour la trouver.
 */
test('décrire une photo avant l’envoi pose sa légende sur le post publié', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-medias').setInputFiles(PNG);

  const repli = page.locator('details.medias-alt');
  await expect(repli).toHaveJSProperty('open', true);
  const champDeLegende = repli.locator('p.champ:visible input[type="text"]').first();
  await expect(champDeLegende).toBeVisible();
  await champDeLegende.fill('Un couché de soleil sur la plage');

  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/publie=1/);

  const derniere = passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1] as Record<string, unknown>;
  const mediaAlt = derniere.mediaAlt as Record<string, string> | undefined;
  expect(mediaAlt && Object.values(mediaAlt)).toEqual(['Un couché de soleil sur la plage']);

  await ctx.close();
});

/**
 * E10 (revue #5390, défaut 1) — DÉCRIRE DEUX PHOTOS PUIS RETIRER LA
 * PREMIÈRE N'ATTACHE PAS SA LÉGENDE À LA SECONDE. Les deux sélections
 * partagent le MÊME nom (`vue-composer.png` choisi deux fois), comme E8 —
 * délibérément : rien ne distingue les deux fichiers par leur nom, seule
 * leur IDENTITÉ (et l'ordre où on les décrit) le fait. Avant le correctif,
 * `accordeLesRangs` ne réécrivait que le LIBELLÉ des dix champs `medias-alt`,
 * jamais leur VALEUR : la légende tapée au rang 0 pour la première photo
 * restait dans l'input du rang 0 après son retrait, et se retrouvait zippée
 * — côté porte, `for (const [rang, fichier] of fichiers.entries())` — à la
 * photo qui a glissé à ce rang.
 */
test('décrire deux photos puis retirer la première n’attache pas sa légende à la seconde', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/composer?format=post`);
  await page.waitForFunction(() => document.querySelector('main[data-brouillon="arme"]') !== null);
  await page.locator('#c-medias').setInputFiles([PNG, PNG]);

  const champsDeLegende = page.locator('details.medias-alt p.champ:visible input[type="text"]');
  await expect(champsDeLegende).toHaveCount(2);
  await champsDeLegende.nth(0).fill('Légende de la première photo');
  // La seconde reste délibérément VIDE — c'est elle qui doit hériter du
  // rang 0 après le retrait, et son champ doit y rester vide.

  await page.locator('.composer .apercus li .retirer-media').first().click();
  await expect(page.locator('.composer .apercus li:not(.tuile-ajouter)')).toHaveCount(1);

  const champRestant = page.locator('details.medias-alt p.champ:visible input[type="text"]');
  await expect(champRestant).toHaveCount(1);
  await expect(champRestant).toHaveValue('');

  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/publie=1/);

  const derniere = passerelle.publicationsRecues[passerelle.publicationsRecues.length - 1] as Record<string, unknown>;
  // AUCUNE légende ne part : le seul média publié est la seconde photo, qui
  // n'en a jamais reçu. `mediaAlt` reste absent (la porte n'écrit une clé
  // que pour une légende non vide) — et surtout, la légende de la PREMIÈRE
  // photo n'apparaît nulle part dans le corps envoyé.
  expect(JSON.stringify(derniere)).not.toContain('Légende de la première photo');

  await ctx.close();
});

/** La source citée existe bien — un fichier de fixtures binaire, pas un texte inventé. */
test('les fixtures binaires existent', () => {
  expect(readFileSync(PNG).byteLength).toBeGreaterThan(0);
  expect(readFileSync(TXT, 'utf8')).toContain('photo');
});
