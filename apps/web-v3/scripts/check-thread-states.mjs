#!/usr/bin/env node
/**
 * VÉRIFIE LES ÉTATS DU FIL — ceux qu'on oublie parce qu'ils ne sont pas le cas
 * nominal, et qui sont pourtant le cas NOMINAL du réseau visé.
 *
 * CE QU'IL MESURE
 *
 * 1. Une conversation SANS HISTORIQUE dessine un état, pas du blanc. Un écran
 *    vide sur un réseau lent se lit comme un chargement qui ne finit pas —
 *    l'interprétation la plus naturelle, et la plus fausse.
 * 2. Hors ligne, l'application ANNONCE la coupure, sans bloquer : elle lit
 *    parfaitement depuis son précache, donc un voile ou une modale
 *    puniraient l'utilisateur pour un état où tout ce qu'il veut lire est là.
 * 3. Un message écrit hors ligne est marqué NON ENVOYÉ tout de suite, et sa
 *    reprise est DANS la bulle. C'est le point qui compte : une horloge qui
 *    tourne sur un envoi qui ne partira pas est un mensonge d'interface, et
 *    un bandeau global dirait « un envoi a échoué » sans dire lequel.
 * 4. « Réessayer » alors que l'appareil est TOUJOURS coupé ne promet rien : le
 *    message reste en échec. Repasser en « en attente » ferait tourner une
 *    horloge pour rien et l'utilisateur croirait que c'est parti.
 *
 * POURQUOI UN NAVIGATEUR RÉEL. `navigator.onLine`, les événements
 * `online`/`offline` et la coupure elle-même n'existent que là. Aucun test
 * unitaire ne peut couper un réseau.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await launchChromium();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

const failures = [];
/**
 * On imprime AU FIL DE L'EAU, pas à la fin. Un témoin qui garde son bilan pour
 * la sortie perd tout ce qu'il avait constaté si une étape suivante lève — et
 * c'est exactement ce qui est arrivé à sa première version : elle avait bien
 * relevé le défaut, puis a rendu un « Timeout waiting for getByText » à sa
 * place. Ce qu'un témoin a vu doit survivre à ce qui l'arrête.
 */
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/**
 * Cliquer une cible qui peut légitimement manquer — parce que le défaut qu'on
 * cherche est justement son absence. On rend `false` plutôt que de laisser
 * Playwright lever : un témoin doit nommer le défaut trouvé, jamais l'endroit
 * où il a buté.
 */
const clickIfPresent = async (page, label) => {
  const target = page.getByText(label);
  if ((await target.count()) === 0) return false;
  await target.first().click();
  await page.waitForTimeout(400);
  return true;
};

// --- 1 : la conversation sans historique.
const empty = await context.newPage();
await empty.goto(`${BASE}/c/c-nouvelle`, { waitUntil: 'load' });
await empty.waitForTimeout(700);
expect(
  (await empty.getByText('Aucun message pour l’instant').count()) > 0,
  "une conversation sans historique dessine son état vide",
);
expect(
  (await empty.locator('main li').count()) === 0,
  "l'état vide ne rend aucune bulle",
);
await empty.close();

// --- 2, 3, 4 : la coupure.
const page = await context.newPage();
await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
await page.waitForSelector('main li');
await page.waitForTimeout(500);

expect(
  (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
  "en ligne, aucun bandeau de coupure",
);

await context.setOffline(true);
await page.waitForTimeout(400);
expect(
  (await page.getByText('Hors ligne', { exact: false }).count()) > 0,
  "hors ligne, la coupure est ANNONCÉE",
);
/* Non bloquant : le fil reste lisible, et c'est tout l'intérêt du précache. */
expect(
  (await page.locator('main li').count()) > 0,
  "hors ligne, le fil reste lisible (aucun voile, aucune modale)",
);

const field = page.getByPlaceholder('Message…');
await field.fill('Un message écrit sans réseau');
await field.press('Enter');
await page.waitForTimeout(500);

const failedShown = expect(
  (await page.getByText('Non envoyé').count()) > 0,
  "un message écrit hors ligne est marqué NON ENVOYÉ",
);
/**
 * La bande de reprise doit être DANS la bulle du message concerné — pas
 * ailleurs sur l'écran. On le vérifie par la parenté, pas par la présence :
 * un bandeau global passerait le test précédent sans rendre le service.
 */
expect(
  await page.evaluate(() => {
    const bands = [...document.querySelectorAll('main li button')].filter((b) =>
      (b.textContent ?? '').includes('Non envoyé'),
    );
    return bands.length === 1 && bands[0]?.closest('li') !== null;
  }),
  "la bande de reprise est DANS la bulle, une seule fois",
);

/**
 * Les quatre vérifications suivantes DÉPENDENT de la précédente : sans bande
 * de reprise, il n'y a rien à cliquer. On les déclare non tenues plutôt que de
 * laisser Playwright rendre un « Timeout waiting for getByText » — un témoin
 * doit nommer le défaut qu'il a trouvé, pas l'endroit où il a buté. (Sa
 * première version le faisait, et une mutation l'a montré.)
 */
if (!failedShown) {
  for (const what of [
    "réessayer TOUJOURS hors ligne laisse le message en échec",
    "le bandeau disparaît au retour du réseau",
    "réessayer une fois le réseau revenu retire l'échec",
  ]) {
    expect(false, `${what} — non vérifiable : aucune bande de reprise`);
  }
} else {
  // --- 4 : réessayer sans réseau ne promet rien.
  await clickIfPresent(page, 'Réessayer');
  expect(
    (await page.getByText('Non envoyé').count()) > 0,
    "réessayer TOUJOURS hors ligne laisse le message en échec",
  );

  await context.setOffline(false);
  await page.waitForTimeout(400);
  expect(
    (await page.getByText('Hors ligne', { exact: false }).count()) === 0,
    "le bandeau disparaît au retour du réseau",
  );
  const clicked = await clickIfPresent(page, 'Réessayer');
  expect(
    clicked && (await page.getByText('Non envoyé').count()) === 0,
    clicked
      ? "réessayer une fois le réseau revenu retire l'échec"
      : "réessayer une fois le réseau revenu retire l'échec — la bande avait déjà disparu hors ligne",
  );
}

await browser.close();
server.close();

if (failures.length > 0) {
  console.error(`\n  ${failures.length} état(s) du fil non tenus.\n`);
  process.exit(1);
}
console.log('\n  Les états du fil tiennent : vide dessiné, coupure annoncée sans bloquer, échec attaché à sa bulle et reprise honnête.\n');
