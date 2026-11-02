/**
 * AMENER UNE RANGÉE DE LA LISTE À L'ÉCRAN (#11228) — la liste des
 * conversations est virtualisée : une rangée hors champ n'est pas dans le
 * document, et un témoin qui la cherche par `[data-row="…"]` la déclarerait
 * absente alors qu'elle est simplement plus bas.
 *
 * Le défileur `#contenu` descend d'une demi-hauteur à la fois depuis le haut
 * jusqu'à ce que la rangée soit montée, puis la pose au tiers de la fenêtre.
 * Jamais `scrollIntoView` : il ferait aussi défiler le cadre de l'écran
 * (#11090), ce que `check-list-actions.mjs` mesure. Une rangée DÉJÀ montée
 * ne fait rien bouger : le témoin la trouve là où le geste précédent l'a
 * laissée.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<boolean>} la rangée est-elle montée ?
 */
export const revealRow = (page, id) =>
  page.evaluate(async (rowId) => {
    const frame = document.getElementById('contenu');
    const find = () => document.querySelector(`[data-row="${rowId}"]`);
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (find() !== null || frame === null) return find() !== null;
    frame.scrollTop = 0;
    await settle();
    while (find() === null && frame.scrollTop + frame.clientHeight < frame.scrollHeight - 1) {
      frame.scrollTop += Math.max(84, frame.clientHeight / 2);
      await settle();
    }
    const row = find();
    if (row === null) return false;
    frame.scrollTop += row.getBoundingClientRect().top - frame.getBoundingClientRect().top - frame.clientHeight / 3;
    await settle();
    return find() !== null;
  }, id);

/**
 * LES RANGÉES QUE LA LISTE PORTE, montées ou non : chaque rangée montée, plus
 * celles dont une cale (`[data-row-gap]`) tient la place à 84 px chacune.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export const listedRowCount = (page) =>
  page.evaluate(() => {
    const mounted = document.querySelectorAll('[data-row]').length;
    const reserved = [...document.querySelectorAll('[data-row-gap]')].reduce((sum, gap) => sum + Math.round(gap.getBoundingClientRect().height / 84), 0);
    return mounted + reserved;
  });

/**
 * TOUTES LES RANGÉES DE LA LISTE, dans l'ordre, montées ou non : le défileur
 * la parcourt de haut en bas et relève chaque rangée montée en chemin, puis
 * revient en tête. `unread` dit si elle porte une pastille de non-lus.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<readonly { id: string, unread: boolean }[]>}
 */
export const sweepRows = (page) =>
  page.evaluate(async () => {
    const frame = document.getElementById('contenu');
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const seen = new Map();
    const read = () =>
      document.querySelectorAll('[data-row]').forEach((row) => {
        const id = row.getAttribute('data-row');
        if (id !== null && !seen.has(id)) seen.set(id, { id, unread: row.querySelector('[data-unread]') !== null, top: row.getBoundingClientRect().top + (frame?.scrollTop ?? 0) });
      });
    if (frame === null) {
      read();
      return [...seen.values()].map(({ id, unread }) => ({ id, unread }));
    }
    frame.scrollTop = 0;
    await settle();
    read();
    while (frame.scrollTop + frame.clientHeight < frame.scrollHeight - 1) {
      frame.scrollTop += Math.max(84, frame.clientHeight / 2);
      await settle();
      read();
    }
    frame.scrollTop = 0;
    await settle();
    return [...seen.values()].sort((a, b) => a.top - b.top).map(({ id, unread }) => ({ id, unread }));
  });

/**
 * LE TOTAL QUE LA LISTE PORTE (#11228) — `data-row-count` du défileur
 * `#contenu` : World Wide et les rangées des sections dépliées, montées ou
 * tenues par une cale. Une liste virtualisée n'en monte qu'une fenêtre : un
 * témoin qui compte les conversations CHARGÉES lit ce total, jamais le nombre
 * de nœuds `[data-row]`. `null` : la liste n'est pas montée.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number | null>}
 */
export const carriedRowCount = (page) =>
  page.evaluate(() => {
    const raw = document.getElementById('contenu')?.getAttribute('data-row-count');
    return raw === null || raw === undefined ? null : Number(raw);
  });

/**
 * ATTENDRE QUE LA LISTE PORTE `exactly` rangées (ou au moins `atLeast`) —
 * le même total que `carriedRowCount`, lu dans la page à chaque image.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ exactly?: number, atLeast?: number }} expected
 * @param {{ timeout?: number }} [options]
 */
export const awaitCarriedRows = (page, expected, options = {}) =>
  page.waitForFunction(
    ({ exactly, atLeast }) => {
      const raw = document.getElementById('contenu')?.getAttribute('data-row-count');
      if (raw === null || raw === undefined) return false;
      const count = Number(raw);
      return exactly === undefined ? count >= (atLeast ?? 0) : count === exactly;
    },
    expected,
    options,
  );
