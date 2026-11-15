/**
 * LE TÉMOIN DE SORTIE D'UNE RANGÉE (#11574) — une rangée qui quitte la liste
 * reste montée le temps de se replier, INERTE et retirée au lecteur d'écran,
 * puis quitte le DOM.
 *
 * L'observateur est posé AVANT le geste et note ce que la rangée a porté
 * pendant sa sortie : lire l'attribut après un délai dépendrait de la vitesse
 * de la machine. `departed` attend l'ÉTAT (`detached`), jamais un délai.
 */
export const watchRowExit = async (page, row) => {
  await page.evaluate((id) => {
    const seen = { exiting: false, inert: false, hidden: false };
    window.__rowExit = seen;
    new MutationObserver(() => {
      const node = document.querySelector(`[data-row="${id}"][data-row-exiting]`);
      if (node === null) return;
      seen.exiting = true;
      seen.inert = seen.inert || node.hasAttribute('inert');
      seen.hidden = seen.hidden || node.getAttribute('aria-hidden') === 'true';
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-row-exiting', 'inert', 'aria-hidden'] });
  }, row);
  return {
    departed: () =>
      page.waitForSelector(`[data-row="${row}"]`, { state: 'detached', timeout: 3000 }).then(
        () => true,
        () => false,
      ),
    seen: () => page.evaluate(() => window.__rowExit),
  };
};
