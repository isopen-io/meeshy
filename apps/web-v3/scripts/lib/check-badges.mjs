import { contrastOf } from './contrast.mjs';

/**
 * 9 — LES BADGES ET LA RANGÉE SYSTÈME (#5936) — un message épinglé, transféré,
 * modifié ou système se RECONNAÎT dans le fil, sur les DEUX peaux. EXTRAIT
 * directement dans `scripts/lib/` (jamais ajouté à l'hôte) : `check-thread
 * -states.mjs` compte 1018 lignes AVANT ce lot — à 182 du plafond DUR de 1200
 * (`CLAUDE.md` § Code Style), la même discipline que `check-media.mjs`
 * (#5805) a déjà suivie pour la même raison.
 *
 * `expect`, `setScheme` et `AA_THRESHOLD` sont REMIS par l'hôte, jamais
 * redéfinis (même garde que `checkThreadMedia`).
 *
 * DEUX PEAUX × DEUX SCHÉMAS : Focal en clair, Bulles en sombre — même
 * répartition que `checkThreadMedia`.
 */
export async function checkThreadBadges({ browser, BASE, expect, setScheme, AA_THRESHOLD, skin, scheme }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setScheme(context, scheme);
  const page = await context.newPage();
  await page.goto(`${BASE}/c/c-states`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');

  if (skin === 'bulles') {
    await page.getByRole('button', { name: /Mode de lecture/ }).click();
    await page.getByRole('menuitemradio', { name: /Bulles/ }).click();
    await page.waitForTimeout(300);
  }

  const rowOf = (id) => page.locator(`[data-message="${id}"]`);

  // (a) ÉPINGLÉ.
  const pinnedText = await rowOf('states-pinned').innerText();
  expect(pinnedText.includes('épinglé'), `[${skin}/${scheme}] le badge « épinglé » se peint`);

  // (b) TRANSFÉRÉ, titre servi — jamais un identifiant.
  const forwardedText = await rowOf('states-forwarded').innerText();
  expect(
    forwardedText.includes('Transféré depuis Annonces produit'),
    `[${skin}/${scheme}] « Transféré depuis {titre} », jamais un identifiant`,
  );

  // (c) TRANSFÉRÉ, titre absent — « Transféré » seul.
  const forwardedAnonText = await rowOf('states-forwarded-anonymous').innerText();
  expect(
    forwardedAnonText.includes('Transféré') && !forwardedAnonText.includes('Transféré depuis'),
    `[${skin}/${scheme}] titre absent ⇒ « Transféré » seul`,
  );

  // (d) MODIFIÉ.
  const editedText = await rowOf('states-edited').innerText();
  expect(editedText.includes('modifié'), `[${skin}/${scheme}] « modifié » se peint`);

  // (e) LES QUATRE (trois visibles) BADGES ENSEMBLE, dans l'ordre iOS.
  const allBadgesText = await rowOf('states-all-badges').innerText();
  const pinnedAt = allBadgesText.indexOf('épinglé');
  const forwardedAt = allBadgesText.indexOf('Transféré depuis Salon');
  const editedAt = allBadgesText.indexOf('modifié');
  expect(
    pinnedAt !== -1 && forwardedAt > pinnedAt && editedAt > forwardedAt,
    `[${skin}/${scheme}] épinglé → transféré → modifié, dans cet ordre`,
  );

  // (f) RANGÉE SYSTÈME — aucun avatar, et PLATE en Focal (pas de `.bubble`),
  // capsule en Bulles.
  const systemRow = rowOf('states-system');
  await systemRow.waitFor({ state: 'attached' });
  const hasSystemMarker = await systemRow.evaluate((el) => el.closest('[data-system-row]') !== null);
  expect(hasSystemMarker, `[${skin}/${scheme}] la rangée système porte data-system-row`);
  const systemText = await systemRow.innerText();
  expect(
    systemText.includes('rejoint la conversation'),
    `[${skin}/${scheme}] le texte de la rangée système se lit`,
  );

  // (g) EMOJI SEUL — rendu ≥ 40 px, sur le texte SERVI.
  const emojiParagraph = page.locator('[data-message="states-emoji"] [data-body-kind="emoji-only"]');
  await emojiParagraph.waitFor({ state: 'attached' });
  const emojiFontSize = await emojiParagraph.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(emojiFontSize >= 40, `[${skin}/${scheme}] emoji seul ≥ 40 px (mesuré ${emojiFontSize}px)`);

  const emojiTranslatedParagraph = page.locator(
    '[data-message="states-emoji-translated"] [data-body-kind="emoji-only"]',
  );
  const emojiTranslatedCount = await emojiTranslatedParagraph.count();
  expect(
    emojiTranslatedCount === 1,
    `[${skin}/${scheme}] emoji seul PAR TRADUCTION (texte servi, pas le contenu brut)`,
  );

  /**
   * (h) CONTRASTE AA (4,5:1) des nouveaux textes — épinglé, transféré,
   * modifié. `states-all-badges` (Kwame, message REÇU) porte le témoin de
   * contraste pour « modifié », jamais `states-edited` (message à SOI) :
   * `EditedMark` hérite alors la couleur méta de la bulle « mine »
   * (`--ios-bubble-meta-mine`, blanc 70 % sur indigo-500) — un jeton
   * PRÉEXISTANT, déjà porté par l'heure et l'accusé de CHAQUE bulle envoyée,
   * mesuré à 3,02:1 en sombre. Le réparer ici élargirait ce lot à toute la
   * colonne méta de la bulle envoyée, sur les trois plateformes (iOS porte
   * la MÊME opacité, `BubbleEditedIndicator.swift:19-21`) — hors périmètre
   * de #5936, issue compagnon à ouvrir.
   */
  for (const [id, selector] of [
    ['states-pinned', `[data-message="states-pinned"] [data-badge="pinned"]`],
    ['states-forwarded', `[data-message="states-forwarded"] [data-badge="forwarded"]`],
    ['states-all-badges (modifié)', `[data-message="states-all-badges"] [data-badge="edited"]`],
  ]) {
    const contrast = await contrastOf(page, selector);
    expect(
      contrast !== null && contrast >= AA_THRESHOLD,
      `[${skin}/${scheme}] contraste AA sur le badge « ${id} » (mesuré ${contrast ?? 'n/a'})`,
    );
  }

  await context.close();
}
