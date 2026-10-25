#!/usr/bin/env node
/**
 * UN MESSAGE MASQUÉ « POUR MOI » SORT DU FIL EN SE REPLIANT — VU AU NAVIGATEUR (#12634).
 *
 * `bun test` prouve l'état (les rangées sortantes, revenantes, l'instant où le
 * cache les perd) ; il ne voit aucun pixel. Le défaut que ce témoin attrape
 * n'existe qu'à l'écran : un fil calé EN BAS — sa position ordinaire — perd la
 * hauteur de la rangée qui sort, le navigateur rabat `scrollTop` d'autant, et
 * une transition déclarative sur `transform` ne voyait que le changement de
 * `row.start` : les rangées du dessus sautaient d'un coup, celles du dessous
 * descendaient puis remontaient en glissant.
 *
 * CE QU'IL MESURE, image par image (`requestAnimationFrame`, DANS la page —
 * un aller-retour CDP par échantillon ne verrait pas une image isolée) :
 *
 * 1. EN BAS DU FIL, puis APRÈS UN DÉFILEMENT VERS LE HAUT : chaque voisine qui
 *    se déplace se montre EN CHEMIN sur plusieurs images (`MIN_IN_FLIGHT`),
 *    et sans rebond (aucun aller-retour) ;
 * 2. la rangée qui sort s'efface sur plusieurs images, puis quitte le fil ;
 * 3. un refus du serveur la fait REVENIR, dépliée sur plusieurs images, et ses
 *    voisines regagnent leur place en glissant ;
 * 4. le focus, posé sur la rangée au geste, passe à une VOISINE — jamais au
 *    `<body>`, jamais à la rangée qui sort ;
 * 5. « Réduire les animations » : aucune image intermédiaire, la rangée part
 *    dans l'image du geste.
 *
 * La requête est servie par `page.route` : le client de fixtures ne sert pas
 * `delete-for-me`, et le témoin doit jouer l'accord ET le refus.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { awaitCondition } from './lib/await-fact.mjs';
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CONVERSATION = 'c-deploiement';
/** Une rangée du MILIEU, au texte court : ses deux voisines sont à l'écran dans les deux positions. */
const TARGET = 'm6';
/**
 * Combien d'images doivent montrer une voisine EN CHEMIN (entre 5 et 95 % de
 * son trajet). Un saut n'en montre aucune ; le rabat du défilement d'avant ce
 * lot, joué en deux images, en montrait une. Le critère se compte en images
 * VUES, pas en part du trajet par image : une machine chargée (images de
 * 60 ms, mesuré) peint un glissement juste en quatre images, dont la
 * première porte déjà plus de la moitié du trajet — la courbe est un « ease-out ».
 */
const MIN_IN_FLIGHT = 2;
/** En deçà, une voisine ne s'est pas déplacée (arrondis, sous-pixels). */
const STILL_PX = 2;
/** La latence du refus — au-delà du repli, pour que le retour se joue sur une rangée PARTIE. */
const REFUSAL_LATENCY_MS = 450;
const SAMPLE_MS = Number(process.env.ROW_EXIT_SAMPLE_MS ?? 1100);

const served = await startDistServer(DIST, { serviceWorker: false });
const browser = await launchChromium();

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/**
 * L'enregistreur, posé DANS la page avant le geste : une ligne par image. Le
 * temps se compte depuis le CLIC qui confirme (capturé dans la page) — jamais
 * depuis l'appel CDP, dont la latence varie d'une machine à l'autre.
 */
const RECORD = ({ target, ms }) => {
  const frames = [];
  window.__rowExitFrames = frames;
  window.__rowExitDone = false;
  const clock = { clickedAt: null };
  document.addEventListener('click', () => (clock.clickedAt = performance.now()), { capture: true, once: true });
  const tick = () => {
    const now = performance.now();
    const rows = {};
    document.querySelectorAll('[data-row]').forEach((node) => {
      const li = node.closest('li');
      if (li === null) return;
      const box = li.getBoundingClientRect();
      rows[node.dataset.row] = { top: box.top, opacity: Number(getComputedStyle(li).opacity) * Number(getComputedStyle(node).opacity) };
    });
    const active = document.activeElement;
    if (clock.clickedAt !== null) {
      frames.push({
        at: now - clock.clickedAt,
        rows,
        scrollTop: document.querySelector('main#contenu')?.scrollTop ?? null,
        scrollHeight: document.querySelector('main#contenu')?.scrollHeight ?? null,
        focus: active?.dataset?.row ?? active?.tagName ?? null,
        target: target in rows,
      });
    }
    if (clock.clickedAt === null || now - clock.clickedAt < ms) requestAnimationFrame(tick);
    else window.__rowExitDone = true;
  };
  requestAnimationFrame(tick);
};

/** Le trajet d'une voisine : sa position image par image, tant qu'elle est montée. */
const trajectoryOf = (frames, id) => frames.map((f) => f.rows[id]?.top).filter((top) => top !== undefined);

const motionVerdict = (tops) => {
  const steps = tops.slice(1).map((top, i) => top - (tops[i] ?? top));
  const travel = steps.reduce((sum, step) => sum + Math.abs(step), 0);
  const net = (tops.at(-1) ?? 0) - (tops[0] ?? 0);
  const first = tops[0] ?? 0;
  const inFlight = tops.filter((top) => {
    const progress = net === 0 ? 0 : (top - first) / net;
    return progress > 0.05 && progress < 0.95;
  }).length;
  return { travel, net, inFlight, bounced: travel - Math.abs(net) > STILL_PX * 2 };
};

const checkNeighbours = (frames, label, { from, to }) => {
  const window = frames.filter((f) => f.at >= from && f.at <= to);
  const ids = Object.keys(window[0]?.rows ?? {}).filter((id) => id !== TARGET);
  const moved = ids.filter((id) => {
    const verdict = motionVerdict(trajectoryOf(window, id));
    if (verdict.travel <= STILL_PX) return false;
    expect(
      verdict.inFlight >= MIN_IN_FLIGHT,
      `[${label}] ${id} glisse : ${verdict.inFlight} image(s) en chemin sur ${Math.round(Math.abs(verdict.net))} px (au moins ${MIN_IN_FLIGHT})`,
    );
    expect(!verdict.bounced, `[${label}] ${id} ne rebondit pas (parcouru ${Math.round(verdict.travel)} px pour ${Math.round(verdict.net)} px nets)`);
    return true;
  });
  expect(moved.length > 0, `[${label}] au moins une voisine regagne la place libérée (${moved.join(', ') || 'aucune'})`);
};

/** Les images où la rangée est À MI-FONDU, dans le bon sens. */
const fadeFrames = (frames, { rising }) => {
  const values = frames.map((f) => f.rows[TARGET]?.opacity).filter((v) => v !== undefined);
  return values.filter((v, i) => v > 0.05 && v < 0.95 && (i === 0 || (rising ? v >= (values[i - 1] ?? 0) - 0.01 : v <= (values[i - 1] ?? 1) + 0.01))).length;
};

const scenario = async ({ label, position, answer, reducedMotion = 'no-preference' }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', reducedMotion });
  const page = await context.newPage();
  await page.route('**/delete-for-me', (route) =>
    answer === 'ok'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) })
      : /* Le refus tombe APRÈS le repli : la rangée a quitté le fil, et revient. */
        new Promise((resolve) => setTimeout(resolve, REFUSAL_LATENCY_MS)).then(() =>
          route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'refusé' }) }),
        ),
  );
  await page.goto(`${served.base}/c/${CONVERSATION}`, { waitUntil: 'load' });
  /* La chronologie des fixtures fait écrire Amina dans ce fil toutes les 3 s
     (`fixtures-realtime.ts`) : sa cellule de frappe pousse le fil et le
     réancre en bas — un mouvement indépendant du repli, que le témoin ne doit
     pas lui attribuer. */
  await page.addStyleTag({ content: '[data-typing-cell] { display: none !important; }' });
  await page.waitForSelector(`[data-row="${TARGET}"]`, { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.click(`[data-row="${TARGET}"]`, { button: 'right' });
  await page.locator('[role="menu"] button', { hasText: /^\s*Supprimer\s*$/ }).click();
  const forMe = page.locator('dialog button', { hasText: 'pour moi' });
  await forMe.waitFor({ timeout: 5_000 });
  /* La position se pose dialogue OUVERT : le menu et sa feuille déplacent le fil
     en s'ouvrant (relèvement de la rangée), et c'est la position AU GESTE qui compte. */
  await page.evaluate((top) => {
    const main = document.querySelector('main#contenu');
    main?.scrollTo({ top: top === 'bottom' ? main.scrollHeight : 0, behavior: 'instant' });
  }, position);
  await awaitCondition(
    page,
    (top) => {
      const main = document.querySelector('main#contenu');
      return main !== null && (top === 'bottom' ? main.scrollHeight - main.scrollTop - main.clientHeight < 2 : main.scrollTop === 0);
    },
    position,
  );
  /* Le menu RELÈVE la rangée dans son aperçu et masque l'originale le temps de
     sa sortie : on confirme une fois l'originale rendue au fil, sans quoi le
     fondu se jouerait sur une rangée encore invisible. */
  await awaitCondition(
    page,
    (target) => {
      const node = document.querySelector(`[data-row="${target}"]`);
      return node !== null && Number(getComputedStyle(node).opacity) === 1;
    },
    TARGET,
  );
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main#contenu');
    return main === null ? null : { bottomGap: main.scrollHeight - main.scrollTop - main.clientHeight, top: main.scrollTop };
  });
  expect(
    position === 'bottom' ? (geometry?.bottomGap ?? 99) < 8 : geometry?.top === 0,
    `[${label}] au geste, le fil est ${position === 'bottom' ? 'calé en bas' : 'remonté en haut'} (${JSON.stringify(geometry)})`,
  );
  await page.evaluate(RECORD, { target: TARGET, ms: SAMPLE_MS });
  await forMe.click();
  await awaitCondition(page, () => window.__rowExitDone === true);
  const frames = await page.evaluate(() => window.__rowExitFrames);
  if (process.env.ROW_EXIT_TRACE === '1') {
    frames.forEach((f) =>
      console.log(
        `    ${f.at.toFixed(0).padStart(5)} ms  scroll ${f.scrollTop}/${f.scrollHeight}  ${Object.entries(f.rows)
          .map(([id, r]) => `${id}:${Math.round(r.top)}${r.opacity < 0.99 ? `@${r.opacity.toFixed(2)}` : ''}`)
          .join(' ')}`,
      ),
    );
  }
  await context.close();
  return frames;
};

const goneAt = (frames) => frames.find((f) => !f.target)?.at ?? null;

// --- 1, 2, 4 : en bas du fil, puis remonté — la sortie.
for (const position of ['bottom', 'top']) {
  const label = position === 'bottom' ? 'en bas, accord' : 'remonté, accord';
  const frames = await scenario({ label, position, answer: 'ok' });
  const gone = goneAt(frames);
  expect(gone !== null && gone >= 150, `[${label}] la rangée reste montée pendant son repli, puis quitte le fil (partie à ${Math.round(gone ?? -1)} ms)`);
  expect(fadeFrames(frames.filter((f) => gone === null || f.at < gone), { rising: false }) >= MIN_IN_FLIGHT, `[${label}] la rangée s'efface sur plusieurs images`);
  checkNeighbours(frames, label, { from: 0, to: (gone ?? 0) + 300 });
  expect(frames.at(-1)?.target === false, `[${label}] à la fin, la rangée n'est plus au fil`);
  const focus = frames.at(-1)?.focus;
  expect(focus !== TARGET && focus !== 'BODY' && focus !== null, `[${label}] le focus passe à une voisine (${focus})`);
}

// --- 3 : un refus la fait revenir, dépliée. On lit son OPACITÉ plutôt que sa
// présence : un refus tombé pendant le repli la rend sans qu'elle ait quitté
// le DOM.
for (const position of ['bottom', 'top']) {
  const label = position === 'bottom' ? 'en bas, refus' : 'remonté, refus';
  const frames = await scenario({ label, position, answer: 'refuse' });
  const faded = frames.findIndex((f) => (f.rows[TARGET]?.opacity ?? 0) < 0.05);
  const back = faded < 0 ? -1 : frames.findIndex((f, i) => i > faded && (f.rows[TARGET]?.opacity ?? 0) > 0.05);
  expect(back > 0, `[${label}] la rangée refusée revient au fil (${back < 0 ? 'jamais' : `${Math.round(frames[back]?.at ?? -1)} ms`})`);
  const after = back < 0 ? [] : frames.slice(back);
  expect(fadeFrames(after, { rising: true }) >= MIN_IN_FLIGHT, `[${label}] la rangée revenue se déplie sur plusieurs images`);
  expect((after.at(-1)?.rows[TARGET]?.opacity ?? 0) > 0.99, `[${label}] à la fin, la rangée revenue est pleinement lisible`);
  checkNeighbours(after, `${label}, retour`, { from: after[0]?.at ?? 0, to: SAMPLE_MS });
}

// --- 5 : Réduire les animations.
{
  const label = 'réduire les animations';
  const frames = await scenario({ label, position: 'bottom', answer: 'ok', reducedMotion: 'reduce' });
  const gone = goneAt(frames);
  expect(gone !== null && gone < 120, `[${label}] la rangée part dans l'image du geste (${Math.round(gone ?? -1)} ms)`);
  expect(fadeFrames(frames, { rising: false }) === 0, `[${label}] aucune image intermédiaire`);
}

await browser.close();
served.close();
if (failures.length > 0) {
  console.error(`\n  ${failures.length} échec(s) — un message masqué pour moi ne sort pas du fil en se repliant.`);
  process.exit(1);
}
console.log('\n  le repli d’un message masqué pour moi est fluide, dans les deux positions du fil.');
process.exit(0);
