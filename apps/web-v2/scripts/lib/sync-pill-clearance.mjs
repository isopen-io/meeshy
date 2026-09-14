/**
 * LA PASTILLE DE SYNCHRONISATION NE RECOUVRE AUCUNE CAPSULE DE BANDE, HORS
 * LIGNE (#6401, #6387) — partagé entre `check-discover.mjs`, `check-calls.mjs`,
 * `check-communities.mjs` et `check-notifications.mjs`, qui mesurent chacun
 * leur propre bande sous le même défaut.
 *
 * **RECOUVREMENT DE RECTANGLES, PAS `elementFromPoint`** — à la différence de
 * `check-floating-clearance.mjs`, dont les disques CAPTURENT le geste et se
 * mesurent donc par ce qu'ils reçoivent. `.sync-pill` porte `pointer-events:
 * none` (elle ANNONCE, elle ne prend aucun geste) : `elementFromPoint` rend
 * toujours l'élément SOUS elle, aveugle au recouvrement visuel qu'elle
 * produit quand même. Seule une comparaison de rectangles le voit — c'est
 * exactement ce que l'issue #6387 nomme : « pointer-events: none rend
 * `elementFromPoint` aveugle ».
 */
export const syncPillOverlap = (page, selectors) =>
  page.evaluate((selectors) => {
    const pill = document.querySelector('.sync-pill');
    const p = pill?.getBoundingClientRect() ?? null;
    if (p === null || p.width === 0 || p.height === 0) return { pill: null, covers: [] };

    const nom = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48);
    const covers = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const chevauche = r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top;
        if (chevauche) covers.push({ nom: nom(el), rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } });
      }
    }
    return { pill: { top: p.top, left: p.left, right: p.right, bottom: p.bottom }, covers };
  }, selectors);
