/**
 * ATTEINDRE UNE RANGÉE VIRTUALISÉE (#5648, extrait de `check-reading-mode.mjs`
 * pour #5935 — le second appelant qui en avait besoin, `lib/check-identity.mjs`,
 * aurait sinon recopié la même boucle molette).
 *
 * `[data-row="…"]` n'existe dans le DOM que si son index est dans (ou proche
 * de) la fenêtre virtualisée (`@tanstack/react-virtual`, `routes/thread.tsx`) :
 * `scrollIntoView` sur un nœud pas encore monté est un NO-OP silencieux
 * (`?.`) — un défilement RÉEL (`wheel`), gradué, fait avancer la fenêtre
 * jusqu'à ce que la cible apparaisse. Une fois rendue, on la CENTRE
 * (`scrollIntoView`, un défilement PROGRAMMÉ : aucune intention ouverte,
 * `scene.ts` l'ignore).
 */
export async function scrollRowIntoView(page, rowId) {
  await page.locator('main').hover();
  for (let i = 0; i < 80; i += 1) {
    if ((await page.locator(`main [data-row="${rowId}"]`).count()) > 0) break;
    await page.mouse.wheel(0, -80);
    await page.waitForTimeout(50);
  }
  await page.evaluate((id) => {
    document.querySelector(`main [data-row="${id}"]`)?.scrollIntoView({ block: 'center' });
  }, rowId);
  await page.waitForTimeout(50);
}
