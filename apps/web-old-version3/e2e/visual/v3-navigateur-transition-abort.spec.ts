import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * LA TRANSITION ABANDONNÉE (#5440) — `document.startViewTransition()` rend un
 * objet à TROIS promesses (`ready`, `updateCallbackDone`, `finished`).
 * `lib/realtime/navigateur.ts` n'attrapait que `updateCallbackDone` : quand
 * une SECONDE navigation appelle `startViewTransition` sur le MÊME document
 * avant que la PREMIÈRE n'ait atteint son état final, le navigateur ABANDONNE
 * la précédente — `ready` et `finished` rejettent avec `InvalidStateError`
 * (« Transition was aborted because of invalid state »), et rien ne les
 * attrapait : un « Uncaught (in promise) », vu sur staging /feed.
 *
 * Reproduction DÉTERMINISTE : `page.addInitScript` remplace
 * `document.startViewTransition` par un faux qui reproduit UNIQUEMENT le
 * comportement d'abandon (rejeter `ready`/`finished` de la transition
 * PRÉCÉDENTE dès qu'une nouvelle commence), sans dépendre du minutage réel
 * d'un navigateur — la fenêtre de course dépend de la vitesse d'affichage,
 * jamais garantie d'un run à l'autre. Le collecteur `window.onunhandledrejection`
 * est le verdict : aucune promesse orpheline, quel que soit ce que le vrai
 * navigateur aurait mesuré comme délai.
 */

const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

/**
 * Le faux `startViewTransition` — posé AVANT tout script de page
 * (`addInitScript`), donc en place avant que `lib/realtime/navigateur.ts` ne
 * lise la propriété. `updateCallbackDone` se règle tout de suite (le rappel a
 * tourné) ; `ready`/`finished` restent PENDANTES tant qu'aucune transition
 * suivante ne les abandonne — exactement l'ordre du navigateur réel.
 */
const poseLeFauxStartViewTransition = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    (window as unknown as { __rejetsNonGeres: string[] }).__rejetsNonGeres = [];
    window.addEventListener('unhandledrejection', (evenement) => {
      const raison = evenement.reason as { name?: string } | undefined;
      (window as unknown as { __rejetsNonGeres: string[] }).__rejetsNonGeres.push(
        raison?.name ?? String(evenement.reason),
      );
    });

    type TransitionPosee = {
      readonly ready: Promise<void>;
      readonly updateCallbackDone: Promise<void>;
      readonly finished: Promise<void>;
      rejetteReady: (erreur: unknown) => void;
      rejetteFinie: (erreur: unknown) => void;
    };

    let transitionActive: TransitionPosee | null = null;

    (document as unknown as { startViewTransition: (rappel: () => void) => TransitionPosee }).startViewTransition = function (
      rappel: () => void,
    ): TransitionPosee {
      const precedente = transitionActive;
      let rejetteReady!: (erreur: unknown) => void;
      let rejetteFinie!: (erreur: unknown) => void;
      const ready = new Promise<void>((_resoud, rejette) => {
        rejetteReady = rejette;
      });
      const finished = new Promise<void>((_resoud, rejette) => {
        rejetteFinie = rejette;
      });
      const transition: TransitionPosee = {
        ready,
        updateCallbackDone: Promise.resolve(),
        finished,
        rejetteReady,
        rejetteFinie,
      };
      transitionActive = transition;

      if (precedente !== null) {
        const erreur = new DOMException('Transition was aborted because of invalid state', 'InvalidStateError');
        precedente.rejetteReady(erreur);
        precedente.rejetteFinie(erreur);
      }

      rappel();
      return transition;
    };
  });
};

test.describe('la transition abandonnée par une seconde navigation ne laisse aucune promesse orpheline', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test("liste → fil → retour : l'abandon de la première transition n'émet aucun rejet non géré", async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();
    await poseLeFauxStartViewTransition(page);

    await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
    await page.waitForFunction(
      () => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined,
    );

    // ALLER — la transition de cette navigation reste PENDANTE (notre faux ne
    // la règle qu'en la faisant ABANDONNER par la suivante).
    await page.locator('a.ligne').first().click();
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);

    // RETOUR — une SECONDE transition sur le MÊME document : elle abandonne
    // la première AVANT que son `ready`/`finished` n'ait jamais été réglé.
    await page.evaluate(() => {
      const lien = document.createElement('a');
      lien.href = '/chats';
      lien.id = 'retour-vers-liste';
      lien.textContent = 'retour';
      document.querySelector('main')?.append(lien);
    });
    await page.locator('#retour-vers-liste').click();
    await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);

    // Marge : le rejet est synchrone dans le faux, mais laisser une tâche de
    // plus courir avant de lire le collecteur.
    await page.waitForTimeout(50);

    const rejets = await page.evaluate(
      () => (window as unknown as { __rejetsNonGeres: string[] }).__rejetsNonGeres,
    );
    expect(rejets).toEqual([]);

    await contexte.close();
  });
});
