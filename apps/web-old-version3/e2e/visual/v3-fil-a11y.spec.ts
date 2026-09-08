// GATE § 9.5 sur LA PAGE VIVANTE du fil — « 0 violation axe serious/critical », clair ET sombre,
// aux deux portes et sur l'état CHOIX.
//
// `__tests__/fil-a11y.test.ts` juge le document SERVI dans jsdom ; ce fichier juge ce que le
// lecteur a sous les yeux une fois le module de participation greffé — les lignes PEINTES en
// direct, les séparateurs de jour qu'il repose dans le fuseau du lecteur, le bouton « Réagir »
// cloné dans chaque ligne, et le CONTRASTE que jsdom ne calcule pas. Mesuré avant ce témoin :
// les séparateurs peints portaient `role="separator"` dans l'`<ol>`, et axe rendait `list`
// (serious) sur `#lignes` — sur la page vivante seulement, que personne n'auditait.
//
// Il vit dans le projet `pages` parce qu'il importe `lib/a11y.ts` STATIQUEMENT (la loi du gate,
// gagée sans navigateur) — ce que le projet `chaines` ne peut pas faire (`playwright.config.ts`).
// Il monte pourtant sa propre chaîne, comme `v3-lifecycle.spec.ts` : la passerelle de bouchon et
// le serveur de la v3 construit.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { rapporteViolations, violationsBloquantes } from './lib/a11y';
import { chargeDeMessage, JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { porteInvitee } from './lib/porte-invitee';
import {
  CONVERSATION_DU_LECTEUR,
  INVITE,
  PAIR_ANGLOPHONE,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.placesActives.add(INVITE.session);
  passerelle.lien.actif = true;
  passerelle.oublie();
});

const contexteDuMembre = async (navigateur: Browser, schema: 'light' | 'dark'): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext({ colorScheme: schema });
  await contexte.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return contexte;
};

/** Une ligne PEINTE en direct — un jour de plus, un auteur de plus, une pastille de plus : ce que le module ajoute au document servi. */
const faisVivre = async (page: Page, id: string): Promise<void> => {
  passerelle.socket.emets(
    CONVERSATION_DU_LECTEUR.id,
    'message:new',
    chargeDeMessage({
      id,
      conversationId: CONVERSATION_DU_LECTEUR.id,
      senderId: PAIR_ANGLOPHONE.id,
      content: 'Painted live.',
      originalLanguage: 'en',
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
      translations: [{ language: 'fr', content: 'Peinte en direct.' }],
    }),
  );
  await expect(page.locator(`li[data-id="${id}"]`)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`li[data-id="${id}"] button.reagir`)).toBeVisible();
  await expect(page.locator('li.jour').first()).toBeVisible();
};

const audite = async (page: Page, ou: string): Promise<void> => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bloquantes = violationsBloquantes(violations);
  expect(bloquantes, rapporteViolations(ou, bloquantes)).toEqual([]);
};

(['light', 'dark'] as const).forEach((schema) => {
  test.describe(`thème ${schema}`, () => {
    test(`0 violation axe serious/critical — le fil du MEMBRE, vivant (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, schema);
      const page = await contexte.newPage();
      await page.goto(`${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`, { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${schema}\\b`));
      await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
      await faisVivre(page, `m-a11y-${schema}`);
      await audite(page, `/chats/:cle vivant [${schema}]`);
      await contexte.close();
    });

    test(`0 violation axe serious/critical — le fil de l’INVITÉ, vivant, droits ouverts (${schema})`, async ({ browser }) => {
      const contexte = await porte.contexteDeLInvite(browser, { colorScheme: schema });
      const page = await porte.ouvre(contexte, `${porte.adresse}?bienvenue=1`);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${schema}\\b`));
      await faisVivre(page, `m-a11y-invite-${schema}`);
      await audite(page, `/chat/:lien INVITÉ vivant [${schema}]`);
      await contexte.close();
    });

    test(`0 violation axe serious/critical — l’état CHOIX, la modale sur le cadre inerte (${schema})`, async ({ browser }) => {
      const contexte = await browser.newContext({ colorScheme: schema });
      const page = await contexte.newPage();
      await page.goto(porte.adresse, { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${schema}\\b`));
      await expect(page.locator('dialog[open]')).toBeVisible();
      await audite(page, `/chat/:lien CHOIX [${schema}]`);
      await contexte.close();
    });
  });
});
