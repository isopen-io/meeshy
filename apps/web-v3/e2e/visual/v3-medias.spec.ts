import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import { CHEMIN_DU_FIL, monte, ouvreLeFil, type Chaine } from './lib/fil-recette';
import { NOM_DU_LIEN, type MediaDeBouchon } from './lib/serveurs';

/**
 * L'ÉCRAN `media` — `/chats/:lien/medias` (matrice ordre 7, issue #4525).
 *
 * Le critère de fin de cette issue est une phrase composée, et chacune de ses
 * moitiés est jouée ici :
 *
 *   1. « chaque tuile est cliquable et OUVRE le média » — loi 4 : un contrôle
 *      existe s'il a un effet. Les tuiles de la planche sont inertes ; celles-ci
 *      naviguent, et le témoin le mesure par la navigation elle-même, pas par la
 *      présence d'un attribut ;
 *   2. « le poids est affiché AVANT le téléchargement et AUCUN octet de média
 *      n'est transféré à l'ouverture de la grille » — les deux moitiés se
 *      tiennent : un poids affiché après le chargement ne servirait à rien, et
 *      un chargement silencieux rendrait le chiffre décoratif ;
 *   3. « l'audio rend sa transcription au Prisme avec `lang=` » ;
 *   4. « grille atteignable au clavier ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER REFAIT UN AUDIT QUE `v3-a11y.spec.ts` FAIT DÉJÀ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le balayage du § 8.5 visite cette route SANS place — c'est le seul état qu'un
 * serveur sans passerelle puisse servir. Il audite donc une page qui ne porte NI
 * tuile, NI carte audio : les deux surfaces où cet écran met du texte sur des
 * plans, c'est-à-dire exactement ce que `color-contrast` mesure. Un vert obtenu
 * là ne dit rien de la galerie SERVIE, et le témoin sans navigateur ne peut pas
 * combler le trou — jsdom ne résout aucun module CSS, donc aucune couleur.
 *
 * Les quatre colonnes sont donc rejouées ici sur la galerie PLEINE. Elles ne
 * sont pas recopiées : `COLONNES_DE_THEME` et le verdict viennent de
 * `lib/a11y.ts`, le site unique du § 9.6.
 *
 * COMMENT ON LE LANCE : `bun run test:pages -- --grep media`. Cette suite monte
 * sa PROPRE chaîne (serveur `next start` + passerelle de bouchon) comme
 * `v3-join` et `v3-rights`, et appartient malgré tout au projet `pages` : elle
 * importe `lib/a11y.ts`, donc `scripts/lib/routes-emises.mjs`, statiquement
 * (§ config, partition des deux régimes de chargeur).
 */

/**
 * La locale est POSÉE, et ce n'est pas un confort : la langue déclarée par
 * l'invité au formulaire d'entrée est le rang 1 de son Prisme, et elle est
 * proposée depuis l'`Accept-Language` du navigateur. Sans locale fixe, le rang 1
 * changerait avec la machine, et les deux témoins de Prisme ci-dessous
 * mesureraient un prisme différent à chaque exécution.
 */
test.use({ locale: 'fr-FR' });

const CHEMIN_DES_MEDIAS = `${CHEMIN_DU_FIL}/medias`;

/** Le fragment qui NOMME un octet de média dans le journal réseau. */
const FICHIER = '/api/v1/attachments/file/';

/**
 * LES MÉDIAS DU BOUCHON — dans la forme que la BASE porte, jamais dans celle
 * qui arrange le témoin.
 *
 * `MessageAttachment.fileUrl` est un CHEMIN relatif
 * (`UploadProcessor.getAttachmentPath`), et les pistes TTS aussi
 * (`/api/v1/attachments/file/translated/…`, `MessageTranslationService`). Les
 * fixtures d'origine posaient des URL ABSOLUES : le témoin « une tuile OUVRE le
 * média » ne passait alors que parce que le bouchon avait fabriqué l'origine
 * que la production ne porte pas. Sur la forme réellement servie, il TOMBE tant
 * que la projection ne donne pas l'origine publique de la passerelle.
 */
const mediasDe = (): readonly MediaDeBouchon[] => [
  {
    id: 'att-photo',
    fileName: 'a-1.jpg',
    originalName: 'marche-de-lagos.jpg',
    mimeType: 'image/jpeg',
    fileSize: 420_000,
    fileUrl: `${FICHIER}2026/08/a-1.jpg`,
    createdAt: '2026-08-30T12:01:00.000Z',
  },
  {
    id: 'att-video',
    fileName: 'a-3.mp4',
    originalName: 'arrivee-du-camion.mp4',
    mimeType: 'video/mp4',
    fileSize: 8_400_000,
    fileUrl: `${FICHIER}2026/08/a-3.mp4`,
    duration: 12_000,
    createdAt: '2026-08-30T12:05:00.000Z',
  },
  /**
   * LE VOCAL TRADUIT — le témoin de la règle 3 du Prisme, écrit sur un rang
   * AUTRE que celui de la langue d'origine (leçon 261 : au rang 1, le
   * court-circuit interdit et la règle juste rendent le même verdict).
   *
   * Le prisme de cet invité est `['yo', 'fr']` — la passerelle lui déclare le
   * yoruba (`LANGUE_SERVIE`), la locale du navigateur donne le français. La
   * transcription est ESPAGNOLE et sa traduction yoruba : si l'espagnol
   * apparaît sous cette carte, c'est que la langue d'origine a court-circuité
   * le prisme au lieu de concourir à son rang.
   */
  {
    id: 'att-vocal',
    fileName: 'a-2.m4a',
    originalName: 'note-vocale.m4a',
    mimeType: 'audio/mp4',
    fileSize: 96_000,
    fileUrl: `${FICHIER}2026/08/a-2.m4a`,
    duration: 23_000,
    createdAt: '2026-08-30T12:02:00.000Z',
    transcription: { text: 'Ya llegué al lugar de la reunión.', language: 'es' },
    translations: {
      yo: {
        transcription: 'Mo ti de ibi ipade.',
        url: `${FICHIER}translated/a-2-yo.mp3`,
        format: 'mp3',
      },
    },
  },
  /**
   * LE VOCAL NON TRADUIT — l'ORIGINAL servi (règle 1 du Prisme), et son `lang`.
   * Ici la langue d'origine gagne à SON rang, ce qui est le verdict juste ; la
   * carte ci-dessus est celle qui distingue ce verdict d'un court-circuit.
   */
  {
    id: 'att-vocal-nu',
    fileName: 'a-4.m4a',
    mimeType: 'audio/mp4',
    fileSize: 48_000,
    fileUrl: `${FICHIER}2026/08/a-4.m4a`,
    duration: 9_000,
    createdAt: '2026-08-30T12:06:00.000Z',
    transcription: { text: 'Ẹ ku irọlẹ o.', language: 'yo' },
  },
];

/**
 * LES OCTETS DE MÉDIA RÉELLEMENT TRANSFÉRÉS, par CDP.
 *
 * `encodedDataLength` de `Network.loadingFinished` est la seule valeur qui dise
 * ce qui a traversé le RÉSEAU (le § 9.2 le pose déjà pour la mesure de poids).
 * La mesure du § 9.2 rend des totaux par TYPE de ressource et les compare aux
 * plafonds de `budgets.json` ; celle-ci répond à une autre question — « ce
 * fichier-là est-il parti ? » — et n'oppose aucun plafond : elle attend ZÉRO.
 * Elle demande donc l'URL de chaque requête, ce que la mesure partagée ne
 * conserve pas.
 */
const octetsDeMedia = async (
  page: Page,
  parcours: () => Promise<void>,
): Promise<{ readonly octets: number; readonly urls: readonly string[] }> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  const urlParRequete = new Map<string, string>();
  const octetsParRequete = new Map<string, number>();

  cdp.on('Network.requestWillBeSent', (evenement) => {
    urlParRequete.set(evenement.requestId, evenement.request.url);
  });
  cdp.on('Network.loadingFinished', (evenement) => {
    octetsParRequete.set(evenement.requestId, evenement.encodedDataLength ?? 0);
  });

  await parcours();
  await cdp.detach();

  const demandes = [...urlParRequete.entries()].filter(([, url]) => url.includes(FICHIER));

  return {
    octets: demandes.reduce((somme, [id]) => somme + (octetsParRequete.get(id) ?? 0), 0),
    urls: demandes.map(([, url]) => url),
  };
};

test.describe('l’écran media — la galerie d’une conversation partagée', () => {
  let chaine: Chaine;

  test.beforeAll(async () => {
    chaine = await monte();
    chaine.passerelle.regle({ medias: mediasDe() });
  });

  test.afterAll(async () => {
    await chaine.ferme();
  });

  test('la grille annonce le poids de chaque média, sans en transférer un octet', async ({
    page,
  }) => {
    await ouvreLeFil(page, chaine);

    const journal = await octetsDeMedia(page, async () => {
      await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}`, {
        waitUntil: 'networkidle',
      });
    });

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Médias partagés');
    await expect(page.locator('header')).toContainText(`${NOM_DU_LIEN} · 1 élément`);
    await expect(page.getByRole('link', { name: /marche-de-lagos\.jpg/ })).toContainText('420 Ko');

    expect(journal.urls, 'aucun média ne doit être demandé à l’ouverture de la grille').toEqual([]);
    expect(journal.octets).toBe(0);
  });

  test('une tuile OUVRE le média — la loi 4, mesurée par la navigation', async ({ page }) => {
    await ouvreLeFil(page, chaine);
    await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}`, { waitUntil: 'domcontentloaded' });

    /**
     * Le bouchon ne sert qu'un CHEMIN : cette adresse-là n'existe que si la
     * projection lui a donné l'origine publique de la passerelle. Sans elle, le
     * `href` pointerait sur le serveur v3 et `waitForURL` expirerait — c'est
     * exactement le 404 que la production servait.
     */
    const tuile = page.getByRole('link', { name: /marche-de-lagos\.jpg/ });
    const attendue = await tuile.getAttribute('href');

    await tuile.click();
    await page.waitForURL(`${chaine.passerelle.base}${FICHIER}2026/08/a-1.jpg`);

    expect(attendue).toBe(`${chaine.passerelle.base}${FICHIER}2026/08/a-1.jpg`);
  });

  test('la grille est atteignable au clavier', async ({ page }) => {
    await ouvreLeFil(page, chaine);
    await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}`, { waitUntil: 'domcontentloaded' });

    /**
     * On TABULE depuis le document, sans jamais poser le focus à la main : ce
     * qui est mesuré est l'ORDRE réel, pas la focusabilité d'un nœud choisi.
     */
    const atteinte = await (async (): Promise<string | null> => {
      for (let pas = 0; pas < 12; pas += 1) {
        await page.keyboard.press('Tab');
        const nom = await page.evaluate(() => {
          const actif = document.activeElement;
          return actif !== null && actif.closest('main ul') !== null
            ? actif.getAttribute('aria-label')
            : null;
        });
        if (nom !== null) return nom;
      }
      return null;
    })();

    expect(atteinte).toContain('marche-de-lagos.jpg');
  });

  test('les quatre puces trient, et chacune a un effet', async ({ page }) => {
    await ouvreLeFil(page, chaine);
    await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('link', { name: /marche-de-lagos\.jpg/ })).toBeVisible();

    await page.getByRole('link', { name: 'Vidéos', exact: true }).click();
    await expect(page.getByRole('link', { name: /arrivee-du-camion\.mp4/ })).toContainText('8,4 Mo');
    await expect(page.getByRole('link', { name: /marche-de-lagos\.jpg/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Fichiers', exact: true }).click();
    await expect(page.locator('main')).toContainText('Aucun média');
  });

  test('l’audio rend sa transcription au Prisme, et l’annonce par `lang`', async ({ page }) => {
    await ouvreLeFil(page, chaine);

    const journal = await octetsDeMedia(page, async () => {
      await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}?famille=audio`, {
        waitUntil: 'networkidle',
      });
    });

    const traduit = page.locator('li', { hasText: 'Transcrit · es → yo' });

    await expect(traduit).toContainText('Mo ti de ibi ipade.');
    await expect(traduit).not.toContainText('Ya llegué');
    await expect(traduit).toContainText('0:23');

    /**
     * `lang` — ce qui « part à côté » du texte servi (cycle 123). Le document
     * est en `fr` ; sans cet attribut, un lecteur d'écran prononcerait ces deux
     * lignes yoruba en phonétique française.
     */
    await expect(traduit.locator('[lang="yo"]')).toHaveText('Mo ti de ibi ipade.');

    const original = page.locator('li', { hasText: 'Transcrit · yo' });

    await expect(original.locator('[lang="yo"]')).toHaveText('Ẹ ku irọlẹ o.');

    /**
     * `preload="none"` : le contrôle est monté, et pourtant RIEN n'est parti.
     * Sans lui, quatre lecteurs audio ouvriraient quatre connexions sur l'écran
     * du rôle premier.
     */
    await expect(page.locator('audio').first()).toHaveAttribute('preload', 'none');
    expect(journal.urls).toEqual([]);
  });

  test('la piste JOUÉE est celle de la langue servie', async ({ page }) => {
    await ouvreLeFil(page, chaine);
    await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}?famille=audio`, {
      waitUntil: 'domcontentloaded',
    });

    /**
     * L'origine est celle de la PASSERELLE, pas celle du document : le bouchon
     * ne sert qu'un chemin, et une piste posée telle quelle se résoudrait contre
     * le serveur v3, où rien ne répond.
     */
    await expect(page.locator('audio[aria-label*="note-vocale.m4a"]')).toHaveAttribute(
      'src',
      `${chaine.passerelle.base}${FICHIER}translated/a-2-yo.mp3`,
    );
  });

  test('sans place, l’écran dit d’entrer et montre la porte', async ({ page }) => {
    await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('main')).toContainText('Entrez dans la conversation');
    await expect(page.getByRole('link', { name: 'Aller à la conversation' })).toHaveAttribute(
      'href',
      CHEMIN_DU_FIL,
    );
  });
});

/**
 * LES QUATRE COLONNES DE THÈME (§ 9.6) sur la galerie SERVIE.
 *
 * Les deux colonnes explicites mettent le stockage EN CONTRADICTION avec l'OS :
 * ce sont les seules qui attrapent une jumelle media/classe. Ce que le gate
 * cherche ici est concret : la puce OUVERTE peint un jeton primaire sur un
 * lavis du même jeton — la paire la plus serrée de l'écran —, et les tuiles
 * portent leur poids en `--color-text-muted`, la teinte la plus proche du plan.
 */
test.describe('§ 8.5 / § 9.6 — accessibilité et thème de la galerie servie', () => {
  let chaine: Chaine;

  test.beforeAll(async () => {
    chaine = await monte();
    chaine.passerelle.regle({ medias: mediasDe() });
  });

  test.afterAll(async () => {
    await chaine.ferme();
  });

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

      /**
       * Les DEUX familles sont auditées : la grille et les cartes audio ne
       * partagent aucun plan, aucune teinte de texte et aucun contrôle. Auditer
       * la seule grille laisserait la transcription — le texte le plus long de
       * l'écran — hors de portée du gate.
       */
      (['images', 'audio'] as const).forEach((famille) => {
        test(`0 violation axe serious/critical — ${famille} (${theme.id})`, async ({ page }) => {
          await arme(page);
          await ouvreLeFil(page, chaine);
          await page.goto(`${chaine.serveur.base}${CHEMIN_DES_MEDIAS}?famille=${famille}`, {
            waitUntil: 'domcontentloaded',
          });

          await expect(page.locator('html')).toHaveClass(
            new RegExp(`\\b${theme.classeAttendue}\\b`),
          );
          await expect(page.locator('main')).not.toContainText('Aucun média');

          const { violations } = await new AxeBuilder({ page }).analyze();
          const bloquantes = violationsBloquantes(violations);

          expect(
            bloquantes,
            rapporteViolations(`${CHEMIN_DES_MEDIAS} ${famille} [${theme.id}]`, bloquantes),
          ).toEqual([]);
        });
      });
    });
  });
});
