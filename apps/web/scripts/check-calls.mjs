#!/usr/bin/env node
/**
 * LE JOURNAL D'APPELS SE LIT, SE FILTRE ET S'ATTEINT (#6362).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la projection de la charge
 * de la passerelle, le curseur, la durée, le nom affiché, « Manqués » peint
 * depuis « Tous », ce qu'une ligne annonce et où elle mène. Aucun ne traverse le
 * CÂBLAGE ni la FEUILLE DE STYLE — une ligne qu'un disque flottant recouvre, un
 * nom manqué rouge illisible en clair, un filtre qui attend le réseau alors que
 * le cache répond, ou un « Rappeler » qui disparaîtrait ou n'ouvrirait aucun appel
 * les laissent tous verts. Ce gate les mesure dans un navigateur réel, sur le `dist`
 * construit (source fixtures : cinq appels), dans les DEUX schémas et aux deux
 * gabarits de la charte (390 × 844, 320 × 568) :
 *
 *  1. `/calls` rend le journal — plus l'écran d'attente — sous le titre
 *     « Appels », avec ses cinq appels dans l'ordre servi ;
 *  2. AU REPOS, chaque contrôle et chaque texte visible retombe sur lui-même à
 *     son centre (`elementFromPoint`) — aucun disque flottant n'en vole un — et
 *     chaque contrôle fait au moins 44 de haut ; chaque ligne s'atteint une fois
 *     amenée au milieu de l'écran ;
 *  3. les trois directions se distinguent par un glyphe PROPRE et un libellé
 *     VISIBLE, et chaque ligne porte UN bouton, « Rappeler », du type de l'appel
 *     d'origine, hors du bouton de la ligne (#6382, #8056) ;
 *  4. chaque texte tient AA dans les deux schémas — le nom ROUGE d'un manqué
 *     compris ;
 *  5. « Manqués » se peint en moins d'une seconde (depuis le cache de « Tous »),
 *     l'adresse porte `?filtre=missed`, et « Tous » rend les cinq ;
 *  6. une ligne ouvre la fiche de SON appel (#6383) — nom, type, durée, deux
 *     rappels —, la fiche le fil de sa conversation, et le retour ramène au journal ;
 *  6 bis. « Rappeler » a un EFFET (loi : un contrôle n'existe que s'il agit) —
 *     il ouvre l'écran d'appel vers la personne de la ligne, au-dessus du
 *     journal, et « Raccrocher » l'en retire ;
 *  7. hors ligne, le journal reste lisible et le dit ; la pastille de
 *     synchronisation ne recouvre aucun filtre du rail (#6401, #6387) ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { syncPillOverlap } from './lib/sync-pill-clearance.mjs';
import { reachAtRest, resumeExclusions } from './lib/reach-at-rest.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const WCAG_AA = 4.5;
const ALL = ['call-amina-manque', 'call-kwame-video', 'call-annonces-groupe', 'call-amina-recu', 'call-fatou-manque'];
const MISSED = ['call-amina-manque', 'call-fatou-manque'];

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);
const shownCalls = (page) => page.$$eval('[data-call]', (els) => els.map((el) => el.getAttribute('data-call')));

/**
 * LES CIBLES DU RELEVÉ AU REPOS — la mesure elle-même vit dans
 * `lib/reach-at-rest.mjs`, SITE UNIQUE depuis #7040.
 *
 * Ce fichier en portait une copie, comme six autres gates. Toutes ouvraient sur
 * un `visible()` qui RENVOYAIT UN TABLEAU VIDE pour un élément dont le centre
 * sortait du viewport : un contrôle hors cadre ne cassait rien, n'apparaissait
 * nulle part, et le gate restait vert avec un contrôle de moins. Un tel élément
 * est désormais MESURÉ et rendu `ok: false` — et ce qui est légitimement hors
 * cadre (écrêté par un conteneur, déclaré `inert`/`aria-hidden`) s'écarte sous
 * une raison ÉCRITE, comptée par `resumeExclusions()`.
 */
const REACH = {
  controls: 'header a, header button, [data-call-filter], #contenu a, #contenu button',
  texts: 'header h1, [data-call-name], [data-call-direction], #contenu time, [data-call-duration]',
};

/** Chaque ligne, amenée au milieu de l'écran puis mesurée. */
const reachRows = async (page) => {
  const ids = await shownCalls(page);
  const out = [];
  for (const id of ids) {
    out.push(
      await page.evaluate(async (callId) => {
        const el = document.querySelector(`[data-call="${callId}"] [data-call-row]`);
        el.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { ligne: callId, ok: hit !== null && el.contains(hit), hauteur: r.height };
      }, id),
    );
  }
  await page.evaluate(() => document.getElementById('contenu')?.scrollTo({ top: 0 }));
  return out;
};

const browser = await launchChromium();
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. le journal, et plus l'écran d'attente
      await page.goto(`${BASE}/calls`, { waitUntil: 'load' });
      await page.waitForSelector('[data-call]');
      const menus = await page.waitForSelector('.floating-menus', { timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(300);
      check(menus, `${label} : les disques flottants sont posés — l'atteignabilité se mesure contre eux`);
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      check((await textOf(page, 'header h1')) === 'Appels', `${label} : le titre de l'écran`);
      const shown = await shownCalls(page);
      check(JSON.stringify(shown) === JSON.stringify(ALL), `${label} : les cinq appels, dans l'ordre servi (${JSON.stringify(shown)})`);
      check(
        (await page.getAttribute('[data-call-filter="all"]', 'aria-pressed')) === 'true',
        `${label} : « Tous » est le filtre du premier rendu`,
      );
      await capture(page, `appels-${slug}`);

      // ------------------------------------------------ 2. atteignabilité
      const rest = await reachAtRest(page, REACH);
      const blocked = rest.controls.filter((c) => !c.ok);
      check(rest.controls.length >= 4, `${label} : au repos, retour, deux filtres et au moins une ligne mesurés (${rest.controls.length}, ${resumeExclusions(rest)})`);
      check(blocked.length === 0, `${label} : aucun contrôle n'est volé à son centre au repos — ${JSON.stringify(blocked)}`);
      const stolen = rest.texts.filter((t) => !t.ok);
      check(rest.texts.length >= 4, `${label} : au moins quatre textes visibles mesurés au repos (${rest.texts.length})`);
      check(stolen.length === 0, `${label} : aucun texte n'est volé à son centre au repos — ${JSON.stringify(stolen)}`);
      const small = rest.controls.filter((c) => c.hauteur < TAP_FLOOR);
      check(small.length === 0, `${label} : chaque contrôle fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);
      const rows = await reachRows(page);
      check(rows.length === 5 && rows.every((r) => r.ok && r.hauteur >= TAP_FLOOR), `${label} : chaque ligne s'atteint — ${JSON.stringify(rows)}`);

      // ------------------------------------------------ 3. trois directions, sans la couleur, avec « Rappeler »
      const directions = await page.$$eval('[data-call]', (els) =>
        els.map((el) => ({
          ligne: el.getAttribute('data-call'),
          direction: el.querySelector('[data-call-direction]')?.getAttribute('data-call-direction') ?? null,
          libelle: (el.querySelector('[data-call-direction]')?.textContent ?? '').trim(),
          glyphe: el.querySelector('[data-call-meta] svg')?.innerHTML ?? '',
          boutons: el.querySelectorAll('button[data-call-back]').length,
          rappel: el.querySelector('button[data-call-back]')?.getAttribute('data-call-back') ?? null,
          rappelNomme: el.querySelector('button[data-call-back]')?.getAttribute('aria-label') ?? '',
          nom: (el.querySelector('[data-call-name]')?.textContent ?? '').trim(),
          horsDuLien: el.querySelector('[data-call-row] [data-call-back], [data-call-back] [data-call-row]') === null,
          video: el.querySelector('[data-call-video]') !== null,
        })),
      );
      const byDirection = (d) => directions.filter((row) => row.direction === d);
      check(
        byDirection('missed').every((r) => r.libelle === 'Manqué') && byDirection('incoming').every((r) => r.libelle === 'Reçu') && byDirection('outgoing').every((r) => r.libelle === 'Émis'),
        `${label} : chaque direction se NOMME en toutes lettres — ${JSON.stringify(directions.map(({ ligne, libelle }) => ({ ligne, libelle })))}`,
      );
      const glyphs = new Set(['missed', 'incoming', 'outgoing'].map((d) => byDirection(d)[0]?.glyphe ?? ''));
      check(glyphs.size === 3 && !glyphs.has(''), `${label} : les trois directions ont trois glyphes distincts`);
      check(
        directions.every((r) => r.boutons === 1 && r.horsDuLien && r.rappel === (r.video ? 'video' : 'audio') && r.rappelNomme === `Rappeler ${r.nom}`),
        `${label} : chaque ligne porte UN bouton « Rappeler <nom> », du type de l'appel d'origine, hors du lien — ${JSON.stringify(directions.map(({ ligne, boutons, rappel, rappelNomme, horsDuLien }) => ({ ligne, boutons, rappel, rappelNomme, horsDuLien })))}`,
      );
      const videos = await page.$$eval('[data-call-video]', (els) => els.map((el) => el.closest('[data-call]')?.getAttribute('data-call')));
      check(JSON.stringify(videos) === JSON.stringify(['call-kwame-video', 'call-fatou-manque']), `${label} : les appels vidéo portent leur glyphe (${JSON.stringify(videos)})`);
      check(
        (await page.getAttribute('[data-call="call-kwame-video"] [data-call-row]', 'aria-label')) === 'Kwame Mensah, appel émis, appel vidéo, 3h, durée 12:34',
        `${label} : une ligne annonce nom, direction, type, heure et durée`,
      );
      check((await textOf(page, '[data-call="call-annonces-groupe"] [data-call-name]')) === 'Annonces produit', `${label} : un appel de groupe se nomme par sa conversation`);
      check((await textOf(page, '[data-call="call-annonces-groupe"] [data-call-duration]')) === '1:02:05', `${label} : une durée passé l'heure se lit H:MM:SS`);

      // ------------------------------------------------ 4. contraste AA
      const inks = {
        titre: await contrastOf(page, 'header h1'),
        'filtre choisi': await contrastOf(page, '[data-call-filter="all"] span'),
        'filtre libre': await contrastOf(page, '[data-call-filter="missed"] span'),
        'nom manqué': await contrastOf(page, '[data-call="call-amina-manque"] [data-call-name]'),
        'direction manquée': await contrastOf(page, '[data-call="call-amina-manque"] [data-call-direction]'),
        nom: await contrastOf(page, '[data-call="call-kwame-video"] [data-call-name]'),
        heure: await contrastOf(page, '[data-call="call-kwame-video"] time'),
        duree: await contrastOf(page, '[data-call="call-kwame-video"] [data-call-duration]'),
      };
      const faibles = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
      check(faibles.length === 0, `${label} : chaque texte du journal tient AA — ${JSON.stringify(inks)}`);

      // ------------------------------------------------ 5. « Manqués », depuis le cache
      await page.click('[data-call-filter="missed"]');
      const fromCache = await page
        .waitForFunction(
          (expected) => {
            const ids = [...document.querySelectorAll('[data-call]')].map((el) => el.getAttribute('data-call'));
            return JSON.stringify(ids) === JSON.stringify(expected);
          },
          MISSED,
          { timeout: 1000 },
        )
        .then(() => true, () => false);
      check(fromCache, `${label} : « Manqués » ne laisse que les deux manqués, en moins d'une seconde`);
      check(new URL(page.url()).search === '?filtre=missed', `${label} : le filtre vit dans l'adresse (${new URL(page.url()).search})`);
      check((await page.getAttribute('[data-call-filter="missed"]', 'aria-pressed')) === 'true', `${label} : « Manqués » se dit choisi`);
      await capture(page, `appels-manques-${slug}`);
      await page.click('[data-call-filter="all"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-call]').length === 5);
      check(new URL(page.url()).search === '', `${label} : « Tous » retire le paramètre et rend les cinq`);

      // ------------------------------------------------ 6. une ligne ouvre SA fiche (#6383), la fiche SON fil
      await page.click('[data-call="call-kwame-video"] a');
      await page.waitForURL('**/call/call-kwame-video');
      const detail = await page
        .waitForSelector('[data-call-detail="call-kwame-video"] [data-call-detail-name]', { timeout: 5000 })
        .then(() =>
          page.$eval('[data-call-detail]', (el) => ({
            nom: (el.querySelector('[data-call-detail-name]')?.textContent ?? '').trim(),
            type: (el.querySelector('[data-call-detail-row="type"] dd')?.textContent ?? '').trim(),
            duree: (el.querySelector('[data-call-detail-row="duration"] dd')?.textContent ?? '').trim(),
            rappels: [...el.querySelectorAll('[data-call-detail-redial]')].map((b) => b.getAttribute('data-call-detail-redial')),
          })),
          () => null,
        );
      check(
        detail !== null && detail.nom === 'Kwame Mensah' && detail.type.toLowerCase() === 'appel vidéo' && detail.duree === '12:34' && JSON.stringify(detail.rappels) === '["audio","video"]',
        `${label} : une ligne ouvre la fiche de son appel — nom, type, durée, deux rappels (${JSON.stringify(detail)})`,
      );
      await page.click('[data-call-detail-open]');
      await page.waitForURL('**/c/c-kwame');
      check(true, `${label} : la fiche ouvre le fil de sa conversation`);
      await page.goBack();
      await page.waitForURL('**/call/call-kwame-video');
      await page.goBack();
      await page.waitForURL('**/calls');
      await page.waitForSelector('[data-call]');
      check((await shownCalls(page)).length === 5, `${label} : le retour ramène au journal`);

      // ------------------------------------------------ 6 bis. « Rappeler » a un EFFET
      for (const [ligne, nom] of [
        ['call-amina-manque', 'Amina Diallo'],
        ['call-kwame-video', 'Kwame Mensah'],
      ]) {
        await page.click(`[data-call="${ligne}"] [data-call-back]`);
        const opened = await page.waitForSelector('[data-call-screen]', { timeout: 5000 }).then(() => true, () => false);
        const screen = opened
          ? await page.$eval('[data-call-screen]', (el) => ({
              role: el.getAttribute('role'),
              nom: el.getAttribute('aria-label'),
              titre: (el.querySelector('h2')?.textContent ?? '').trim(),
            }))
          : null;
        check(
          screen !== null && screen.role === 'dialog' && screen.nom === `Appel avec ${nom}` && screen.titre === nom,
          `${label} : « Rappeler » sur ${ligne} ouvre l'écran d'appel vers ${nom} (${JSON.stringify(screen)})`,
        );
        check(new URL(page.url()).pathname === '/calls', `${label} : l'appel se pose AU-DESSUS du journal, sans quitter /calls (${new URL(page.url()).pathname})`);
        await capture(page, `appels-rappel-${ligne}-${slug}`);
        /* L'écran change de phase sous le doigt (sortant, échec d'accès aux
           médias sur un runner sans caméra, fin) : on vise par LOCATEUR, qui
           se re-résout, jamais par une poignée d'élément qui peut se détacher. */
        const tap = (name) =>
          page
            .locator(`[data-call-screen] button[aria-label="${name}"]`)
            .first()
            .click({ timeout: 2000 })
            .then(() => true, () => false);
        await tap('Raccrocher');
        if ((await page.$('[data-call-screen]')) !== null) await tap('Fermer');
        const gone = await page.waitForSelector('[data-call-screen]', { state: 'detached', timeout: 8000 }).then(() => true, () => false);
        check(opened && gone, `${label} : raccrocher retire l'écran d'appel de ${ligne} et rend le journal`);
      }
      check((await shownCalls(page)).length === 5, `${label} : après le rappel, le journal est intact`);

      // ------------------------------------------------ 7. hors ligne
      await context.setOffline(true);
      await page.waitForSelector('[data-calls-offline]');
      check((await shownCalls(page)).length === 5, `${label} : hors ligne, le journal reste lisible et le dit`);
      const offlineInk = await contrastOf(page, '[data-calls-offline] .text-caption');
      check(offlineInk !== null && offlineInk >= WCAG_AA, `${label} : et l'annonce tient AA (${offlineInk})`);

      // -------------------------------- 7 bis. la pastille ne recouvre pas le rail (#6401, #6387)
      await page.waitForSelector('.sync-pill');
      const callsOverlap = await syncPillOverlap(page, ['[data-call-filter]']);
      check(callsOverlap.pill !== null, `${label} : hors ligne, la pastille de synchronisation est posée`);
      check(
        callsOverlap.covers.length === 0,
        `${label} : hors ligne, la pastille ne recouvre aucun filtre du rail — ${JSON.stringify(callsOverlap.covers)}`,
      );

      await capture(page, `appels-hors-ligne-${slug}`);
      await context.setOffline(false);

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();

      // ------------------------------------------------ 8. hors ligne à cache FROID (#6419)
      /* Une coque qui perd le réseau garde ses fichiers : on émule la coupure
         telle que l'application la VOIT (`navigator.onLine` et l'événement
         `offline`), sans bloquer le chargement du chunk de l'écran. TanStack met
         alors la requête EN PAUSE — ni données, ni erreur. */
      const cold = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR' });
      const coldPage = await cold.newPage();
      coldPage.setDefaultTimeout(10_000);
      const coldErrors = [];
      coldPage.on('pageerror', (error) => coldErrors.push(error.message));
      await coldPage.goto(`${BASE}/`, { waitUntil: 'load' });
      await coldPage.waitForSelector('[data-floating-menu]');
      const setNetwork = (online) =>
        coldPage.evaluate((value) => {
          Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value });
          window.dispatchEvent(new Event(value ? 'online' : 'offline'));
        }, online);
      await setNetwork(false);
      await coldPage.click('[data-floating-menu]');
      await coldPage.click('[role="menuitem"][href="/calls"]');
      const saysOffline = await coldPage.waitForSelector('[data-calls-offline]', { timeout: 3000 }).then(() => true, () => false);
      const coldState = await coldPage.evaluate(() => ({
        squelette: document.querySelector('[data-calls-skeleton]') !== null,
        occupe: document.getElementById('contenu')?.getAttribute('aria-busy') ?? null,
      }));
      check(saysOffline && !coldState.squelette && coldState.occupe === null, `${label} : à cache froid hors ligne, le journal dit la coupure — ni squelette, ni aria-busy (${JSON.stringify(coldState)})`);
      const coldCopy = (await coldPage.textContent('[data-calls-offline]').catch(() => null)) ?? '';
      check(
        (await coldPage.getAttribute('[data-calls-offline]', 'data-calls-offline').catch(() => null)) === 'cold' && coldCopy.includes('Le journal se chargera dès le retour du réseau.') && !coldCopy.includes('dernier chargement'),
        `${label} : à cache froid, l'annonce ne promet aucun journal déjà chargé (« ${coldCopy} »)`,
      );
      await capture(coldPage, `appels-hors-ligne-froid-${slug}`);
      await setNetwork(true);
      const resumed = await coldPage.waitForSelector('[data-call]', { timeout: 5000 }).then(() => true, () => false);
      check(resumed && (await coldPage.$('[data-calls-offline]')) === null, `${label} : au retour du réseau, le journal se charge seul`);
      check(coldErrors.length === 0, `${label} : aucune erreur de page à cache froid — ${JSON.stringify(coldErrors)}`);
      await cold.close();
    }
  }
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  Le journal d’appels se lit, se filtre, s’atteint et tient AA.\n');
