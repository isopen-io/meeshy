/**
 * **ÉCRIRE SUR LA SCÈNE COMME UN AUTEUR** (#8515).
 *
 * Les gates du studio remplissaient la saisie par `page.fill('#story-studio-text', …)`.
 * `fill` écrit dans le champ SANS passer par ce qui le recouvre : le calque des
 * gestes (inset-0, z 3) couvrait la saisie (z 2), aucun doigt ni aucune souris
 * n'y arrivait — seule la touche Tab ×10 — et les gates restaient verts. Ils
 * GARDAIENT le défaut.
 *
 * Ce site unique écrit par le chemin de l'auteur : un CLIC sur l'invite (un
 * texte vide), un DOUBLE-CLIC sur un texte déjà écrit (la sélection
 * silencieuse le sélectionne au premier), puis le CLAVIER. Si le clic n'a pas
 * donné le focus à la saisie, rien n'est tapé : la phrase rendue nomme le
 * défaut au lieu de le contourner.
 *
 * `finish` (vrai par défaut) referme ensuite l'édition par « Terminé », comme
 * l'auteur avant de publier : sur mobile, la plaque d'édition retire le socle.
 *
 * Rend `null` quand le texte est arrivé, sinon la raison de l'échec.
 */
const FIELD = '#story-studio-text';

const focusReached = (page) =>
  page
    .waitForFunction((selector) => document.activeElement === document.querySelector(selector), FIELD, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);

export async function writeOnStage(page, text, { finish = true } = {}) {
  const focused = await page.evaluate((selector) => document.activeElement === document.querySelector(selector), FIELD);
  if (!focused) {
    const box = await page.locator(FIELD).boundingBox();
    if (box === null) return 'la saisie de la scène est introuvable';
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const written = await page.evaluate((selector) => (document.querySelector(selector)?.value ?? '').trim() !== '', FIELD);
    if (written) await page.mouse.dblclick(x, y);
    else await page.mouse.click(x, y);
    if (!(await focusReached(page))) return 'un clic sur la scène n’a pas donné le focus à la saisie — le calque des gestes la couvre';
  }
  await page.keyboard.press('ControlOrMeta+A');
  if (text === '') await page.keyboard.press('Backspace');
  else await page.keyboard.type(text);
  const value = await page.evaluate((selector) => document.querySelector(selector)?.value ?? null, FIELD);
  if (value !== text) return `le texte tapé au clavier n’est pas arrivé dans la saisie : « ${value} »`;
  if (finish && (await page.locator('[data-story-edit-done]').count()) > 0) await page.click('[data-story-edit-done]');
  return null;
}

/** Le « T+ » du rail — il pose un texte ET ouvre sa saisie : on tape aussitôt. */
export async function addTextOnStage(page, text) {
  await page.click('[data-story-option="add-text"]');
  if (!(await focusReached(page))) return '« T+ » n’a pas ouvert la saisie du texte posé';
  return writeOnStage(page, text, { finish: false });
}
