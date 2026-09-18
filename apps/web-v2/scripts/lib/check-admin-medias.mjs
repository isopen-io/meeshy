/**
 * LES MÉDIAS DE LA LECTURE SOUVERAINE, MESURÉS EN PIXELS (#7023).
 *
 * ## POURQUOI UNE BIBLIOTHÈQUE ET PAS QUATRE-VINGTS LIGNES DE PLUS DANS LE GATE
 *
 * `check-admin-souverain.mjs` tient 856 lignes ; le budget du dépôt
 * (`CLAUDE.md` § Code Style) place à 1000 le seuil « au-delà duquel un
 * découpage se justifie sans se discuter ». Ce module suit le motif déjà posé
 * par `lib/check-media.mjs` et `lib/check-media-grid.mjs` : le gate ORCHESTRE
 * (construit le `dist`, sème la session, intercepte les routes), la
 * bibliothèque CONSTATE.
 *
 * ## CE QUE CE MODULE MESURE QUE L'ANCIEN CONSTAT NE MESURAIT PAS
 *
 * Le gate comptait `racine.querySelectorAll('img').length >= 1`. **Une balise
 * n'est pas un pixel** : une `<img>` dont la source ne résout pas, qui échoue
 * au décodage ou que le glyphe de repli recouvre compte exactement pareil.
 * C'est la distinction que `lib/check-media.mjs` a payée en CI onze heures
 * durant (#6135) — `complete: true` disait que les octets étaient là, jamais
 * qu'un pixel avait été posé.
 *
 * On attend donc `decode()` PUIS deux `requestAnimationFrame` (le premier rend
 * la main au compositeur, le second garantit une frame produite APRÈS le
 * décodage), on lit `naturalWidth`, et on redessine l'image dans un canvas pour
 * constater que c'est bien **l'image SERVIE** qui est peinte — un aplat de
 * fond, un glyphe de repli ou une AUTRE image passeraient tous `naturalWidth >
 * 0` sans que rien ne rougisse.
 *
 * ## ET LA PROTECTION, QUI EST L'AUTRE MOITIÉ DU SUJET
 *
 * Une lecture administrative n'est pas une lecture ordinaire : la passerelle
 * (`routes/admin/media-protection.ts` → `sovereign-message-projection.ts`)
 * retire `fileUrl`, `thumbnailUrl`, `thumbHash`, `imageVariants`, la
 * transcription et les pistes de toute pièce protégée, et LAISSE ses drapeaux
 * bruts. Le client doit donc peindre un VOILE — pas une case vide, qui serait
 * indiscernable d'un média cassé — et ne rien laisser fuir de ce que la charge
 * transporte encore (leçon 275).
 *
 * Les constats tournent dans les DEUX schémas : le voile et le constat de
 * contenu retenu sont peints par des tokens (`--accent`, `--color-ios-ink-2`)
 * dont le schéma sombre change la valeur, et un voile invisible sur fond sombre
 * serait une protection annoncée et non montrée.
 */

/** Le pixel de `MEDIA_IMAGE_DATA_URI` (`src/lib/api/fixtures-media.ts`) — PNG 1×1, type 2, octets [0, 99, 102, 241]. */
export const INDIGO_SERVI = [99, 102, 241];

/** ±6 : la marge de composition / gestion de couleur retenue par `lib/check-media.mjs`, mesurée onze fois sous le plus proche défaut gardé. */
const DISTANCE_SERVIE = 6;

const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/**
 * Amène la pièce dans le champ, attend sa PEINTURE, puis rend ce que le
 * navigateur tient réellement : sa taille naturelle et sa couleur dominante.
 *
 * `null` quand l'`<img>` est absente — un cas que l'appelant doit distinguer
 * d'une image présente mais non peinte, sans quoi « pas de balise » et « balise
 * vide » rendraient le même verdict.
 */
export async function peintureDe(page, attachmentId) {
  const locator = page.locator(`img[data-attachment-image="${attachmentId}"]`);
  if ((await locator.count()) === 0) return null;

  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await locator.evaluate(async (el) => {
    if (typeof el.decode === 'function') await el.decode().catch(() => {});
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  });

  return locator.evaluate((el) => {
    if (el.naturalWidth === 0) return { naturalWidth: 0, naturalHeight: 0, dominante: null };
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(el, 0, 0);
    let pixels;
    try {
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      /* Un canvas TEINTÉ n'est pas une image absente — on le dit plutôt que de
         le confondre avec un échec de peinture. */
      return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, dominante: 'teinté' };
    }
    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [dominante] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, dominante };
  });
}

/** Ce qu'une rangée porte, lu d'un seul aller-retour. */
const anatomieDeLaRangee = (page, messageId) =>
  page.evaluate((id) => {
    const rangee = document.querySelector(`[data-row="${id}"]`);
    if (rangee === null) return null;
    const voile = rangee.querySelector('[data-protected-attachment="hidden"]');
    const constat = rangee.querySelector('[data-withheld-media]');
    return {
      images: rangee.querySelectorAll('img').length,
      voile: voile === null ? null : (voile.getAttribute('aria-label') ?? ''),
      constat: constat === null ? null : (constat.textContent ?? '').trim(),
      html: rangee.innerHTML,
      libelle: rangee.getAttribute('aria-label') ?? '',
    };
  }, messageId);

/**
 * LE CONSTAT COMPLET, POUR UN SCHÉMA.
 *
 * `secrets` énumère ce qui ne doit JAMAIS atteindre le DOM d'une pièce
 * protégée — son nom de fichier et l'aiguille de son URL. Une liste plutôt
 * qu'une assertion par aiguille : « une protection de CONTENU se mesure sur
 * tout ce que la charge TRANSPORTE, jamais sur sa seule chaîne ».
 */
export async function constateLesMedias(page, { check, schema, libre, protegee, retenue, pisteAttendue, secrets }) {
  const prefixe = `[${schema}]`;

  // 1. LA PIÈCE LIBRE EST PEINTE — pas seulement montée.
  const peinture = await peintureDe(page, libre);
  check(peinture !== null, `${prefixe} la pièce libre monte bien son <img> (${libre})`);
  check(
    peinture !== null && peinture.naturalWidth > 0,
    `${prefixe} l’image est DÉCODÉE et peinte — naturalWidth ${peinture === null ? 'aucune balise' : peinture.naturalWidth} > 0`,
  );
  check(
    peinture !== null &&
      peinture.dominante !== null &&
      (peinture.dominante === 'teinté' ||
        distance(peinture.dominante.split(',').map(Number), INDIGO_SERVI) <= DISTANCE_SERVIE),
    `${prefixe} et c’est bien l’image SERVIE qui est peinte, pas un aplat de repli (dominante ${peinture?.dominante})`,
  );

  // 2. LE VOCAL SUIT LE PRISME DU LECTEUR, ET SA PISTE EST RÉSOLUE.
  const piste = await page.evaluate(() => document.querySelector('[data-admin-reading] audio')?.getAttribute('src') ?? null);
  check(piste !== null && piste !== '', `${prefixe} le vocal porte une source jouable`);
  check(
    piste !== null && piste.includes(pisteAttendue),
    `${prefixe} et c’est la piste du PRISME servi, jamais l’original (${piste === null ? 'aucune' : piste.slice(-12)})`,
  );

  // 3. LA PIÈCE PROTÉGÉE SUIT LA POLITIQUE DU PRÉDICAT SERVEUR.
  const masquee = await anatomieDeLaRangee(page, protegee);
  check(masquee !== null, `${prefixe} la rangée de la pièce protégée est rendue (${protegee})`);
  check(
    masquee !== null && masquee.voile === 'Photo protégée',
    `${prefixe} la pièce protégée peint son VOILE, et le voile DIT sa nature (${masquee?.voile})`,
  );
  check(
    masquee !== null && masquee.images === 0,
    `${prefixe} aucune <img> ne se monte sur une pièce protégée — une case sans source est un média CASSÉ, pas un secret (${masquee?.images})`,
  );

  // 4. UN MESSAGE DONT LA PASSERELLE A RETENU LE CONTENU LE DIT, PIÈCES COMPRISES.
  const retenu = await anatomieDeLaRangee(page, retenue);
  check(retenu !== null && retenu.images === 0, `${prefixe} un contenu retenu ne peint aucune image (${retenu?.images})`);
  check(
    retenu !== null && retenu.constat !== null && /1\s+image/.test(retenu.constat),
    `${prefixe} … et il CONSTATE la pièce que la passerelle liste sans la servir (« ${retenu?.constat} »)`,
  );
  check(
    retenu !== null && /1\s+image/.test(retenu.libelle),
    `${prefixe} … que l’oreille entend aussi, dans le libellé de la rangée (« ${retenu?.libelle} »)`,
  );

  // 5. RIEN DE CE QUE LA PROTECTION RETIENT N'EST DANS LE DOM.
  const dom = await page.evaluate(() => document.querySelector('[data-admin-reading]')?.innerHTML ?? '');
  for (const secret of secrets) {
    check(!dom.includes(secret), `${prefixe} aucune trace de « ${secret} » dans le fil rendu`);
  }
}
