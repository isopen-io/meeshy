#!/usr/bin/env node
/**
 * MES LIENS SE LISENT, SE COPIENT, SE DÉSACTIVENT ET SE CRÉENT — et on peut les atteindre (#6361).
 *
 * Les témoins `bun test` du lot prouvent les LOIS : la projection de `GET /links`
 * (onze clés, rien du créateur ni de la politique), le résumé lu dans `meta`, le
 * brouillon validé (aucun `identifier`, « compte requis » qui éteint ses voisins),
 * le geste optimiste et son retour arrière, le refus qui n'est dit qu'après la
 * dernière page. Aucun ne traverse le CÂBLAGE ni la FEUILLE DE STYLE — une ligne
 * qu'un disque flottant recouvre, un « copier » qui ne met rien dans le
 * presse-papiers, une désactivation qui attend la réponse, une adresse composée
 * sur l'origine de la page ou `/links/share/new` lu comme un linkId les laissent
 * tous verts. Ce gate les mesure dans un navigateur réel, sur le `dist` construit
 * (source fixtures : cinq liens), dans les DEUX schémas et aux deux gabarits de la
 * charte (390 × 844, 320 × 568) :
 *
 *  1. `/links` rend le hub — plus l'écran d'attente — avec UNE seule famille
 *     (les liens de partage), et « + » mène à la création ;
 *  2. AU REPOS, chaque contrôle et chaque texte visible retombe sur lui-même à
 *     son centre (`elementFromPoint`) — aucun disque flottant n'en vole un — et
 *     chaque contrôle fait au moins 44 de haut ; chaque ligne s'atteint une fois
 *     amenée au milieu de l'écran ; les textes tiennent AA dans les deux schémas ;
 *  3. la liste : les cinq liens dans l'ordre servi, les agrégats de la passerelle,
 *     « Inactif » écrit sur les trois liens inactifs ;
 *  4. « copier » met `https://meeshy.me/chat/<identifiant>` dans le presse-papiers
 *     (l'origine PUBLIQUE, jamais celle de la page) et le dit, visiblement ;
 *  5. le détail (la page du créateur, #7797) : la carte du lien, ses
 *     statistiques et sa configuration se lisent ; « Désactiver » se lit AU
 *     GESTE (moins de 500 ms), la liste le relit, « Activer » le rend ; un lien
 *     dont la conversation est fermée n'offre aucune des deux et dit pourquoi ;
 *     « Enregistrer » change la page au geste ; un linkId inconnu rend le refus ;
 *  6. la création : pas de slug, bouton désactivé tant qu'aucune conversation
 *     n'est choisie, aucun DM proposé, « compte requis » éteint ses voisins, une
 *     limite hors bornes se refuse SOUS son champ, puis le lien créé REMPLACE
 *     l'écran et se lit en tête de liste au retour ;
 *  7. hors ligne, la liste reste lisible et le dit, et « Désactiver » ne change
 *     rien et le dit ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { contrastOf } from './lib/contrast.mjs';
import { startDistServer } from './lib/gate-server.mjs';
import { reachAtRest, resumeExclusions } from './lib/reach-at-rest.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;

/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici repliait
   TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture échouait,
   et le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire. Ce gate en a rougi trois fois. */
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
const PUBLIC_ORIGIN = 'https://meeshy.me';
const DEPLOIEMENT = 'mshy_equipe-deploiement_7f3a';
const ANNONCES = 'mshy_annonces_2b91';
const SALON = 'mshy_salon-ete_91e2';
const ALL = [DEPLOIEMENT, 'mshy_newsletter_5c21', ANNONCES, SALON, 'mshy_atelier-juin_c4d0'];
const INACTIVE = ['mshy_newsletter_5c21', SALON, 'mshy_atelier-juin_c4d0'];
const DIRECT_CONVERSATIONS = ['c-amina', 'c-kwame', 'c-nouvelle'];

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const textOf = (page, selector) => page.$eval(selector, (el) => (el.textContent ?? '').trim()).catch(() => null);
const textsOf = (page, selector) => page.$$eval(selector, (els) => els.map((el) => (el.textContent ?? '').trim()));
const shownLinks = (page) => page.$$eval('[data-share-link]', (els) => els.map((el) => el.getAttribute('data-share-link')));
const actionsOf = (page) => page.$$eval('[data-share-link-action]', (els) => els.map((el) => el.getAttribute('data-share-link-action')));
const announced = (page, text, timeout = 1500) =>
  page.waitForFunction((expected) => document.querySelector('[data-links-announcement]')?.textContent === expected, text, { timeout }).then(
    () => true,
    () => false,
  );

/**
 * LE RELEVÉ AU REPOS vit dans `lib/reach-at-rest.mjs`, SITE UNIQUE depuis #7040.
 *
 * Ce fichier en portait une copie, comme six autres gates. Toutes ouvraient sur
 * un `visible()` qui RENVOYAIT UN TABLEAU VIDE pour un élément dont le centre
 * sortait du viewport : un contrôle hors cadre ne cassait rien, n'apparaissait
 * nulle part, et le gate restait vert avec un contrôle de moins. Un tel élément
 * est désormais MESURÉ et rendu `ok: false` — et ce qui est légitimement hors
 * cadre (écrêté par un conteneur, déclaré `inert`/`aria-hidden`) s'écarte sous
 * une raison ÉCRITE, comptée par `resumeExclusions()`.
 */

const assertReach = (label, screen, rest, { controls, texts, tapFloor = true }) => {
  const blocked = rest.controls.filter((c) => !c.ok);
  check(rest.controls.length >= controls && blocked.length === 0, `${label} : ${screen}, aucun contrôle volé à son centre au repos (${rest.controls.length} mesurés, ${resumeExclusions(rest)}) — ${JSON.stringify(blocked)}`);
  const stolen = rest.texts.filter((t) => !t.ok);
  check(rest.texts.length >= texts && stolen.length === 0, `${label} : ${screen}, aucun texte volé à son centre au repos (${rest.texts.length} mesurés) — ${JSON.stringify(stolen)}`);
  if (!tapFloor) return;
  const small = rest.controls.filter((c) => c.hauteur < TAP_FLOOR);
  check(small.length === 0, `${label} : ${screen}, chaque contrôle fait au moins ${TAP_FLOOR} de haut — ${JSON.stringify(small)}`);
};

const assertInks = async (label, screen, page, selectors) => {
  const inks = Object.fromEntries(await Promise.all(Object.entries(selectors).map(async ([name, selector]) => [name, await contrastOf(page, selector)])));
  const weak = Object.entries(inks).filter(([, ratio]) => ratio === null || ratio < WCAG_AA);
  check(weak.length === 0, `${label} : ${screen}, chaque texte tient AA — ${JSON.stringify(inks)}`);
};

/** Chaque ligne, amenée au milieu de l'écran : son lien ET son « copier » s'atteignent. */
const reachRows = async (page) => {
  const out = [];
  for (const id of await shownLinks(page)) {
    out.push(
      await page.evaluate(async (linkId) => {
        const row = document.querySelector(`[data-share-link="${linkId}"]`);
        row.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const hits = [row.querySelector('a'), row.querySelector('[data-share-link-copy]')].map((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return hit !== null && el.contains(hit) && r.height >= 44;
        });
        return { lien: linkId, ok: hits.every(Boolean) };
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
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // ------------------------------------------------ 1. le hub, et plus l'écran d'attente
      await page.goto(`${BASE}/links`, { waitUntil: 'load' });
      await page.waitForSelector('[data-links-family="share"]');
      const menus = await page.waitForSelector('.floating-menus', { timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(300);
      check(menus, `${label} : les disques flottants sont posés sur le hub — l'atteignabilité se mesure contre eux`);
      check((await page.$('text=Cet écran arrive bientôt.')) === null, `${label} : l'écran d'attente a disparu`);
      check((await textOf(page, 'header h1')) === 'Mes liens', `${label} : le titre du hub`);
      check((await page.$$('[data-links-family]')).length === 1, `${label} : le hub ne montre que la famille servie`);
      check((await page.getAttribute('[data-links-family-create]', 'href')) === '/links/share/new', `${label} : « + » mène à la création`);
      await capture(page, `hub-${slug}`);
      assertReach(label, 'le hub', await reachAtRest(page, { controls: 'header a, [data-links-family] a', texts: 'header h1, [data-links-banner] .text-body, [data-links-banner] .text-caption, [data-links-family-title]' }), {
        controls: 3,
        texts: 4,
      });
      await assertInks(label, 'le hub', page, {
        titre: 'header h1',
        banniere: '[data-links-banner] .text-body',
        'banniere, sous-titre': '[data-links-banner] .text-caption',
        famille: '[data-links-family-title]',
        'famille, description': '[data-links-family] .text-caption',
      });

      // ------------------------------------------------ 2. la liste
      await page.click('[data-links-family-open]');
      await page.waitForURL('**/links/share');
      await page.waitForSelector('[data-share-link]');
      await page.waitForTimeout(250);
      check(JSON.stringify(await shownLinks(page)) === JSON.stringify(ALL), `${label} : les cinq liens, dans l'ordre servi (${JSON.stringify(await shownLinks(page))})`);
      check(JSON.stringify(await textsOf(page, '[data-share-links-stat] strong')) === JSON.stringify(['5', '2', '175']), `${label} : les agrégats de la passerelle — liens, actifs, rejoints`);
      const inactive = await page.$$eval('[data-share-link]', (els) => els.filter((el) => el.querySelector('[data-share-link-status]') !== null).map((el) => el.getAttribute('data-share-link')));
      check(JSON.stringify(inactive) === JSON.stringify(INACTIVE), `${label} : « Inactif » s'écrit sur les trois liens inactifs, et seulement eux (${JSON.stringify(inactive)})`);
      check((await textOf(page, `[data-share-link="${ANNONCES}"] [data-share-link-name]`)) === 'annonces-produit', `${label} : un lien sans nom se nomme par son identifiant`);
      check(
        (await page.getAttribute(`[data-share-link="${DEPLOIEMENT}"] a`, 'aria-label')) === 'Invitation de l’équipe, Actif, 12 rejoints et Équipe déploiement',
        `${label} : une ligne annonce nom, état, rejoints et conversation`,
      );
      await capture(page, `liste-${slug}`);
      assertReach(label, 'la liste', await reachAtRest(page, { controls: 'header a, [data-share-link] a, [data-share-link-copy]', texts: 'header h1, [data-share-links-stat] strong, [data-share-link-name], [data-share-link-joined]' }), {
        controls: 4,
        texts: 5,
      });
      const rows = await reachRows(page);
      check(rows.length === 5 && rows.every((r) => r.ok), `${label} : chaque ligne et son « copier » s'atteignent — ${JSON.stringify(rows)}`);
      await assertInks(label, 'la liste', page, {
        titre: 'header h1',
        'agrégat, valeur': '[data-share-links-stat] strong',
        'agrégat, libellé': '[data-share-links-stat] .text-chip',
        nom: `[data-share-link="${DEPLOIEMENT}"] [data-share-link-name]`,
        rejoints: `[data-share-link="${DEPLOIEMENT}"] [data-share-link-joined]`,
        conversation: `[data-share-link="${DEPLOIEMENT}"] [data-share-link-conversation]`,
        inactif: '[data-share-link-status]',
      });

      // ------------------------------------------------ 3. copier, avec l'origine publique
      await page.click(`[data-share-link="${DEPLOIEMENT}"] [data-share-link-copy]`);
      check(await announced(page, 'Lien copié'), `${label} : « copier » s'annonce « Lien copié »`);
      const clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
      check(clipboard === `${PUBLIC_ORIGIN}/chat/equipe-deploiement`, `${label} : le presse-papiers porte l'adresse PUBLIQUE du lien (${clipboard})`);
      check(
        (await page.$eval('[data-links-announcement]', (el) => !el.classList.contains('sr-only') && el.getBoundingClientRect().height > 0)) === true,
        `${label} : l'annonce se VOIT, pas seulement au lecteur d'écran`,
      );
      check(((await page.getAttribute(`[data-share-link="${DEPLOIEMENT}"] [data-share-link-copy]`, 'style')) ?? '').includes('--color-success'), `${label} : « copier » devient une coche`);
      await assertInks(label, "l'annonce", page, { annonce: '[data-links-announcement]' });
      await capture(page, `liste-copie-${slug}`);

      // ------------------------------------------------ 4. le détail, et la désactivation optimiste
      await page.click(`[data-share-link="${DEPLOIEMENT}"] a`);
      await page.waitForURL(`**/links/share/${DEPLOIEMENT}`);
      await page.waitForSelector('[data-share-link-hero]');
      check((await textOf(page, 'header h1')) === 'Invitation de l’équipe', `${label} : le détail porte le nom du lien`);
      check(
        JSON.stringify(await actionsOf(page)) === JSON.stringify(['share', 'copy', 'disable', 'delete']),
        `${label} : Partager et Copier le lien sur la carte, Désactiver et Supprimer sous l'édition (#7797) — ${JSON.stringify(await actionsOf(page))}`,
      );
      check((await textOf(page, '[data-share-link-url]')) === 'meeshy.me/chat/equipe-deploiement', `${label} : l'adresse du lien se lit, sans protocole`);
      check((await textOf(page, '[data-share-link-stat="arrivals"] strong')) === '412', `${label} : les arrivées servies se lisent`);
      check((await textOf(page, '[data-share-link-config="uses"] dd')) === '12 / 50', `${label} : utilisations et maximum dans la configuration`);
      check((await textOf(page, '[data-share-link-config="expires"] dd')) === 'Jamais', `${label} : aucune expiration inventée`);
      check((await page.$$('[data-share-link-arrival]')).length === 3, `${label} : les trois derniers arrivés`);
      await capture(page, `detail-${slug}`);
      assertReach(
        label,
        'le détail',
        await reachAtRest(page, {
          controls: 'header a, [data-share-link-hero] [data-share-link-action]',
          texts: 'header h1, [data-share-link-conversation], [data-share-link-status], [data-share-link-url]',
        }),
        { controls: 3, texts: 4 },
      );
      await assertInks(label, 'le détail', page, {
        conversation: '[data-share-link-hero] [data-share-link-conversation]',
        etat: '[data-share-link-status]',
        adresse: '[data-share-link-url]',
        partager: '[data-share-link-action="share"]',
        copier: '[data-share-link-action="copy"]',
        tuile: '[data-share-link-stat="visits"] strong',
        'tuile sans compte': '[data-share-link-stat="anonymous"] span',
        'configuration, libellé': '[data-share-link-config="uses"] dt',
        'configuration, valeur': '[data-share-link-config="uses"] dd',
      });

      /* ENREGISTRER EST OPTIMISTE (#7797) : le nom change dans la configuration
         AU GESTE, puis l'enregistrement s'annonce. Le nom est remis ensuite pour
         que la suite du parcours relise le lien d'origine. */
      await page.fill('#link-edit-message', 'Message du gate');
      await page.click('[data-share-link-save]');
      const savedAtOnce = await page
        .waitForFunction(() => document.querySelector('[data-share-link-message]')?.textContent?.includes('Message du gate') === true, null, { timeout: 500 })
        .then(() => true, () => false);
      check(savedAtOnce, `${label} : « Enregistrer » change la carte AU GESTE`);
      check(await announced(page, 'Modifications enregistrées.'), `${label} : l'enregistrement s'annonce`);

      /* UN DOUBLE TAP (#6417) : « Désactiver » devient « Activer » au premier
         tap, À LA MÊME PLACE ; le second tap, 120 ms plus tard, ne doit pas le
         réactiver. La porte (`tap-gate.ts`) retient 350 ms. */
      const disable = await page.$eval('[data-share-link-action="disable"]', (el) => {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.click(disable.x, disable.y);
      await page.waitForTimeout(120);
      await page.mouse.click(disable.x, disable.y);
      const optimistic = await page
        .waitForFunction(() => document.querySelector('[data-share-link-status]')?.textContent === 'Inactif' && document.querySelector('[data-share-link-action="activate"]') !== null, null, {
          timeout: 500,
        })
        .then(() => true, () => false);
      check(optimistic, `${label} : désactiver se lit AU GESTE — « Inactif » et « Activer » en moins de 500 ms`);
      await page.waitForTimeout(400);
      check(
        (await textOf(page, '[data-share-link-status]')) === 'Inactif' && (await page.$('[data-share-link-action="activate"]')) !== null,
        `${label} : le second tap d'un double tap ne réactive pas le lien`,
      );
      check(await announced(page, 'Lien désactivé'), `${label} : la désactivation s'annonce`);
      check((await textOf(page, '[data-share-link-reason]')) === 'Vous avez désactivé ce lien.', `${label} : la cause se lit sous l'état`);
      await capture(page, `detail-desactive-${slug}`);
      await page.click('[data-links-back]');
      await page.waitForURL('**/links/share');
      await page.waitForSelector('[data-share-link]');
      check((await page.getAttribute(`[data-share-link="${DEPLOIEMENT}"]`, 'data-share-link-active')) === 'false', `${label} : la liste relit la désactivation`);
      check((await textsOf(page, '[data-share-links-stat] strong'))[1] === '1', `${label} : le compte des actifs baisse`);
      await page.click(`[data-share-link="${DEPLOIEMENT}"] a`);
      await page.waitForSelector('[data-share-link-action="activate"]');
      await page.click('[data-share-link-action="activate"]');
      check(await announced(page, 'Lien activé'), `${label} : « Activer » rend le lien`);
      check((await textOf(page, '[data-share-link-status]')) === 'Actif', `${label} : et l'état redevient « Actif »`);

      // ------------------------------------------------ 5. conversation fermée, lien inconnu
      await page.goto(`${BASE}/links/share/${SALON}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-share-link-hero]');
      check(JSON.stringify(await actionsOf(page)) === JSON.stringify(['share', 'copy', 'delete']), `${label} : conversation fermée, ni « Activer » ni « Désactiver »`);
      check((await textOf(page, '[data-share-link-reason]')) === 'La conversation est fermée : ce lien ne permet plus d’entrer.', `${label} : et la cause se lit`);
      await page.goto(`${BASE}/links/share/mshy_inconnu`, { waitUntil: 'load' });
      await page.waitForSelector('[data-share-link-refused]');
      check((await page.getAttribute('[data-share-link-refused] a', 'href')) === '/links/share', `${label} : un linkId inconnu rend le refus, qui ramène à la liste`);
      await capture(page, `refus-${slug}`);

      // ------------------------------------------------ 6. la création
      await page.goto(`${BASE}/links/share`, { waitUntil: 'load' });
      await page.waitForSelector('[data-share-link]');
      await page.click('[data-links-create]');
      await page.waitForURL('**/links/share/new');
      await page.waitForSelector('[data-link-submit]');
      check((await page.$$('main input:not([type="number"])')).length === 2, `${label} : nom et description — aucun champ de slug, que la passerelle ignorerait`);
      check((await page.getAttribute('[data-link-submit]', 'aria-disabled')) === 'true', `${label} : sans conversation, le bouton est désactivé`);
      await capture(page, `creation-${slug}`);
      assertReach(label, 'la création', await reachAtRest(page, { controls: 'header a, [data-link-conversation], main input, main select, [data-link-rule]', texts: 'header h1, main h2' }), {
        controls: 4,
        texts: 3,
      });
      await assertInks(label, 'la création', page, {
        titre: 'header h1',
        section: 'main h2',
        choix: '[data-link-conversation] .text-body',
        bascule: '[data-link-rule-row="requireAccount"] .text-body',
        legende: '[data-link-rule-row="requireAccount"] .text-caption',
      });

      await page.click('[data-link-conversation]');
      await page.waitForSelector('[data-link-pick]');
      const picks = await page.$$eval('[data-link-pick]', (els) => els.map((el) => el.getAttribute('data-link-pick')));
      check(picks.length >= 1 && picks.every((id) => !DIRECT_CONVERSATIONS.includes(id)), `${label} : le choix ne propose aucun DM (${JSON.stringify(picks)})`);
      await capture(page, `creation-choix-${slug}`);
      await page.click(`[data-link-pick="${picks[0]}"]`);
      await page.waitForFunction(() => document.querySelector('[data-link-pick]') === null);
      check((await page.getAttribute('[data-link-conversation]', 'data-link-conversation')) === picks[0], `${label} : la conversation choisie se lit`);
      check((await page.getAttribute('[data-link-submit]', 'aria-disabled')) === 'false', `${label} : le bouton s'active`);

      await page.click('[data-link-rule="requireAccount"]');
      const nickname = await page.$eval('[data-link-rule="requireNickname"]', (el) => ({ checked: el.getAttribute('aria-checked'), disabled: el.hasAttribute('disabled') }));
      check(nickname.checked === 'false' && nickname.disabled, `${label} : « compte requis » éteint et grise le pseudonyme (${JSON.stringify(nickname)})`);
      await page.click('[data-link-rule="requireAccount"]');
      check((await page.getAttribute('[data-link-rule="requireNickname"]', 'aria-checked')) === 'true', `${label} : et le rend en se retirant`);

      await page.fill('#link-name', 'Recette du gate');
      await page.click('[data-link-rule="limitUses"]');
      await page.fill('#link-max-uses', '0');
      await page.click('[data-link-submit]');
      const refusedUnderField = await page.waitForSelector('#link-max-uses-error', { timeout: 1500 }).then(() => true, () => false);
      check(refusedUnderField && page.url().endsWith('/links/share/new'), `${label} : une limite hors bornes se refuse SOUS son champ, et rien ne part`);
      await page.fill('#link-max-uses', '25');
      check((await page.$('#link-max-uses-error')) === null, `${label} : corriger la limite retire le refus`);
      await page.selectOption('#link-expiration', 'd7');
      await page.click('[data-link-submit]');
      await page.waitForURL(/\/links\/share\/mshy_recette_\d+$/);
      await page.waitForSelector('[data-share-link-hero]');
      check((await textOf(page, 'header h1')) === 'Recette du gate', `${label} : le lien créé REMPLACE l'écran de création`);
      check((await textOf(page, '[data-share-link-config="uses"] dd')) === '0 / 25', `${label} : avec sa limite`);
      check(((await textOf(page, '[data-share-link-config="expires"] dd')) ?? 'Jamais') !== 'Jamais', `${label} : et son expiration`);
      await capture(page, `cree-${slug}`);
      await page.goBack();
      await page.waitForURL('**/links/share');
      await page.waitForSelector('[data-share-link]');
      check(((await shownLinks(page))[0] ?? '').startsWith('mshy_recette_'), `${label} : au retour, le lien créé est EN TÊTE`);
      check((await textsOf(page, '[data-share-links-stat] strong'))[0] === '6', `${label} : et le compte des liens monte`);

      // ------------------------------------------------ 7. hors ligne
      await context.setOffline(true);
      await page.waitForSelector('[data-links-offline]');
      check((await shownLinks(page)).length === 6, `${label} : hors ligne, la liste reste lisible et le dit`);
      await assertInks(label, 'hors ligne', page, { annonce: '[data-links-offline] .text-caption' });
      await page.click(`[data-share-link="${ANNONCES}"] a`);
      await page.waitForSelector('[data-share-link-action="disable"]');
      await page.click('[data-share-link-action="disable"]');
      check(await announced(page, 'Hors ligne : rien n’a été envoyé.'), `${label} : hors ligne, « Désactiver » le dit`);
      check((await textOf(page, '[data-share-link-status]')) === 'Actif', `${label} : et ne change rien`);
      await capture(page, `hors-ligne-${slug}`);
      await context.setOffline(false);

      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
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
console.log('\n  Mes liens se lisent, se copient, se désactivent, se créent, s’atteignent et tiennent AA.\n');
