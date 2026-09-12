/**
 * 10 — L'INDICATEUR DE FRAPPE SE VOIT (revue-correction #5793). C'est un état
 * du fil comme les autres, et il naît APRÈS le dernier message : la cellule
 * s'ajoute donc SOUS le bas du défileur d'un lecteur qui est en bas — le cas
 * NOMINAL d'une conversation vivante. Mesuré avant correctif : la cellule
 * tombait à y 760..802 dans un scrollport qui s'arrête à 768, soit 34 de ses
 * 42 px cachés. Un état qu'on ne voit pas n'est pas un état.
 *
 * Tant que `typing` valait `true` en dur (`query.ts:91`, avant #5793), la
 * cellule était montée AVANT l'ancrage d'ouverture et le défaut n'existait
 * pas : le rendre RÉEL l'a créé. C'est pourquoi ce témoin naît avec lui.
 *
 * Le bouchon de fixtures (`src/lib/api/fixtures-realtime.ts`) émet
 * `typing:start` toutes les 3 s depuis Amina Diallo sur `c-deploiement` —
 * c'est le seul moyen d'observer une frappe RÉELLE sans réseau.
 *
 * EXTRAIT dès sa naissance, même discipline que `check-media.mjs` et
 * `check-message-states.mjs` : l'hôte (`check-thread-states.mjs`) est déjà
 * au-delà du seuil de découpage de 1000 lignes (CLAUDE.md § Code Style).
 * `expect` est REMIS par l'hôte, jamais redéfini.
 */
const KEEPALIVE_GRACE_MS = 6000;
const AFTER_SCROLL_MS = 4000;

/** Le nœud de l'indicateur — reconnu par son TEXTE (« <Nom> écrit »), pas par
 * une classe : c'est ce que l'utilisateur lit. */
const measure = () => {
  const main = document.querySelector('main');
  const node = [...document.querySelectorAll('main div')].find(
    (e) => /écrit$/.test((e.textContent ?? '').trim()) && e.children.length <= 3,
  );
  if (main === null || node === undefined) return null;
  const cell = node.getBoundingClientRect();
  const port = main.getBoundingClientRect();
  return { bottom: Math.round(cell.bottom), port: Math.round(port.bottom), height: Math.round(cell.height) };
};

export async function checkTypingVisibility({ browser, BASE, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-deploiement`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row]');
  await page.waitForTimeout(KEEPALIVE_GRACE_MS);

  const seen = await page.evaluate(measure);
  expect(seen !== null, "l'indicateur de frappe apparaît dans le fil (bouchon de fixtures, 3 s)");
  expect(
    seen !== null && seen.bottom <= seen.port + 1,
    `l'indicateur de frappe est ENTIER dans la fenêtre quand le lecteur est en bas (obtenu : ${JSON.stringify(seen)})`,
  );

  // ET IL NE VOLE JAMAIS LE DÉFILEMENT — un lecteur qui a remonté son
  // historique reste où il est, même règle que l'ancrage d'ouverture, qui
  // s'abandonne à la première intention.
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main !== null) main.scrollTop = 0;
  });
  await page.waitForTimeout(AFTER_SCROLL_MS);
  const stillUp = await page.evaluate(() => Math.round(document.querySelector('main')?.scrollTop ?? -1));
  expect(stillUp === 0, `un lecteur qui a remonté n'est PAS ramené en bas par une frappe (scrollTop ${stillUp})`);

  await context.close();
}
