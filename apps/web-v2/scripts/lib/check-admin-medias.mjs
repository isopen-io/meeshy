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
 * ## CE QUE CE MODULE MESURE — ET CE QU'IL A REVENDIQUÉ À TORT
 *
 * Le gate comptait `racine.querySelectorAll('img').length >= 1`. **Une balise
 * n'est pas un pixel** : une `<img>` dont la source ne résout pas, qui échoue
 * au décodage ou que le glyphe de repli recouvre compte exactement pareil.
 * C'est la distinction que `lib/check-media.mjs` a payée en CI onze heures
 * durant (#6135) — `complete: true` disait que les octets étaient là, jamais
 * qu'un pixel avait été posé.
 *
 * **La première forme de ce module n'a corrigé que la MOITIÉ de ce défaut, en
 * revendiquant le tout.** Elle attendait `decode()` puis deux
 * `requestAnimationFrame`, lisait `naturalWidth` et redessinait l'`<img>` dans
 * un canvas — trois mesures de la **SOURCE DÉCODÉE**, aucune de la **SURFACE
 * PEINTE**. Son doc-comment affirmait pourtant qu'« un glyphe de repli
 * passerait sans rougir » de ces constats : c'était faux par construction, et
 * mesuré — poser le glyphe de repli de `ImageTile` AU-DESSUS de l'image
 * (`z-10`, le défaut historique que `lib/check-media.mjs` § (n) garde) laissait
 * `check-admin-souverain` **vert à 80 constats**. Redessiner l'`<img>` hors
 * écran ne dit rien de ce qui la recouvre à l'écran ; `hidden`, une boîte de
 * 0 px, un voile translucide passaient tous de la même façon.
 *
 * La chaîne complète est donc :
 *
 * | ce qu'on veut savoir | la mesure |
 * |---|---|
 * | les octets sont arrivés | `naturalWidth > 0` après `decode()` |
 * | c'est bien CETTE image | l'`<img>` redessinée en canvas ⇒ sa dominante |
 * | **et elle est PEINTE** | **capture de la tuile ⇒ le CŒUR de la boîte porte cette dominante, sur ≥ 99,9 % de sa surface** |
 *
 * Seule la troisième ligne est une mesure de pixels ; les deux premières
 * fournissent l'ATTENTE qu'elle compare (`#6155` : « la couleur attendue se lit
 * dans l'image servie, elle ne s'écrit pas ici »). Les seuils (±6 pour
 * l'identité, ±2 pour l'uniformité, cœur = la moitié centrale) sont ceux de
 * `lib/check-media.mjs` § (n), mesurés onze fois sous le plus proche défaut
 * gardé — le glyphe fondu à 0,4 sur l'indigo donne `71,71,174`, à 67 de
 * `99,102,241`.
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

/** ≥ 99,9 % du cœur à ±2 du dominant : le seuil d'UNIFORMITÉ de `lib/check-media.mjs` § (n). */
const PART_UNIFORME = 0.999;

const distance = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const estLaCouleur = (mesuree, attendue) =>
  typeof mesuree === 'string' && distance(mesuree.split(',').map(Number), attendue) <= DISTANCE_SERVIE;

/**
 * LA SOURCE DÉCODÉE — ce que le navigateur TIENT, pas ce qu'il MONTRE.
 *
 * Amène la pièce dans le champ, attend `decode()` puis deux
 * `requestAnimationFrame`, et rend sa taille naturelle et sa couleur dominante
 * (l'`<img>` redessinée dans un canvas HORS écran). C'est l'ATTENTE que
 * `coeurPeintDe` comparera — jamais une preuve de peinture : une image
 * `hidden`, recouverte ou posée dans une boîte de 0 px rend exactement les
 * mêmes chiffres.
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

/**
 * LE CŒUR PEINT — LA SEULE MESURE DE PIXELS DE CE MODULE.
 *
 * On CAPTURE la tuile et on relit la moitié centrale de la capture : ce qui s'y
 * trouve est ce que le compositeur a réellement posé, glyphe de repli compris.
 * Le cœur et non la boîte entière, pour les deux raisons mesurées par
 * `lib/check-media.mjs` § (n) : les coins arrondis y mêlent leur antialiasing,
 * et la pastille de jour FLOTTE au-dessus du fil.
 *
 * `shareProche` compte à ±2 par canal et non à l'égalité stricte : un aplat
 * composité est TRAMÉ, et l'égalité stricte lisait « 21 % en 106 teintes » sur
 * un champ parfaitement uniforme à l'œil. La tolérance reste vingt-deux fois
 * sous le défaut visé.
 *
 * `null` quand la tuile n'occupe aucune surface — `display:none`, une boîte de
 * 0 px : une capture y lèverait, et « l'élément n'est pas visible » est un
 * verdict, pas une erreur d'outil.
 */
async function mesureLeCoeur(page, figure) {
  const boite = await figure.boundingBox();
  if (boite === null || boite.width < 1 || boite.height < 1) return null;

  const capture = await figure.screenshot();
  return page.evaluate(async (donnees) => {
    const bitmap = new Image();
    await new Promise((ok, ko) => {
      bitmap.onload = ok;
      bitmap.onerror = ko;
      bitmap.src = `data:image/png;base64,${donnees}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const cote = Math.max(1, Math.round(Math.min(bitmap.width, bitmap.height) * 0.5));
    const pixels = context.getImageData(
      Math.round((bitmap.width - cote) / 2),
      Math.round((bitmap.height - cote) / 2),
      cote,
      cote,
    ).data;

    const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const key = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const classees = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [colour] = classees[0];
    const [dr, dg, db] = colour.split(',').map(Number);
    let proches = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.abs(pixels[i] - dr) <= 2 && Math.abs(pixels[i + 1] - dg) <= 2 && Math.abs(pixels[i + 2] - db) <= 2) {
        proches += 1;
      }
    }
    const total = pixels.length / 4;
    return {
      colour,
      shareProche: proches / total,
      tones: counts.size,
      cinqPremieres: classees.slice(0, 5).map(([c, n]) => `${c} ${((n / total) * 100).toFixed(1)}%`),
      taille: `${bitmap.width}×${bitmap.height}`,
    };
  }, capture.toString('base64'));
}

/**
 * ET ON REBOUCLE, PARCE QUE LE DÉFAUT GARDÉ EST PERSISTANT (#6135).
 *
 * `decode()` + deux `rAF` garantissent qu'une frame a été PRODUITE par le fil
 * principal, jamais que le compositeur a rasterisé la tuile que la capture va
 * lire : c'est une COURSE, que la machine gagne ou perd — rouge sur un runner,
 * vert en local, sans qu'aucun diff ne l'explique.
 *
 * Reboucler ne peut verdir qu'un défaut TRANSITOIRE : un glyphe peint par-
 * dessus l'image y RESTE, une image pas encore peinte, non. Sur épuisement, le
 * relevé des essais dit laquelle des deux on regarde.
 */
async function coeurPeintDe(page, attachmentId, attendue) {
  const figure = page.locator(`[data-attachment="${attachmentId}"]`);
  if ((await figure.count()) === 0) return { coeur: null, essais: ['aucune tuile'] };

  const ESSAIS_MAX = 12;
  const essais = [];
  let coeur = null;
  for (let essai = 1; essai <= ESSAIS_MAX; essai += 1) {
    coeur = await mesureLeCoeur(page, figure);
    essais.push(`#${essai} ${coeur === null ? 'surface nulle' : `${coeur.colour} ${(coeur.shareProche * 100).toFixed(1)}%`}`);
    if (coeur !== null && coeur.shareProche >= PART_UNIFORME && estLaCouleur(coeur.colour, attendue)) break;
    if (essai < ESSAIS_MAX) await page.waitForTimeout(250);
  }
  return { coeur, essais };
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
      lecteurs: rangee.querySelectorAll('audio').length,
      voile: voile === null ? null : (voile.getAttribute('aria-label') ?? ''),
      /* TOUS les voiles, dans l'ordre — la rangée des trois médiums en porte
         DEUX, et un premier voile juste ne dit rien du second. */
      voiles: [...rangee.querySelectorAll('[data-protected-attachment="hidden"]')].map(
        (element) => element.getAttribute('aria-label') ?? '',
      ),
      constat: constat === null ? null : (constat.textContent ?? '').trim(),
      texte: (rangee.textContent ?? '').replace(/\s+/g, ' ').trim(),
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
export async function constateLesMedias(
  page,
  { check, schema, libre, vocal, protegee, pieces, retenue, pisteAttendue, secrets },
) {
  const prefixe = `[${schema}]`;

  // 1. LA PIÈCE LIBRE EST PEINTE — pas seulement montée, pas seulement décodée.
  const peinture = await peintureDe(page, libre);
  check(peinture !== null, `${prefixe} la pièce libre monte bien son <img> (${libre})`);
  check(
    peinture !== null && peinture.naturalWidth > 0,
    `${prefixe} les octets sont arrivés — naturalWidth ${peinture === null ? 'aucune balise' : peinture.naturalWidth} > 0 après decode()`,
  );
  check(
    peinture !== null && estLaCouleur(peinture.dominante, INDIGO_SERVI),
    `${prefixe} et c’est bien l’image ATTENDUE que la balise tient (dominante ${peinture?.dominante})`,
  );

  /* LA MESURE DE PIXELS, ET LA SEULE : ce que le compositeur a POSÉ. Les trois
     constats ci-dessus lisent la SOURCE — l'attente qu'on compare ici. Sans
     celui-ci, le glyphe de repli posé PAR-DESSUS l'image (le défaut historique
     de `lib/check-media.mjs` § (n)) laissait ce gate vert : mesuré. */
  const attendue = estLaCouleur(peinture?.dominante, INDIGO_SERVI) ? peinture.dominante.split(',').map(Number) : INDIGO_SERVI;
  const { coeur, essais } = await coeurPeintDe(page, libre, attendue);
  check(
    coeur !== null,
    `${prefixe} la tuile occupe une surface non nulle — sans quoi il n’y a rien à peindre (${essais.join(' · ')})`,
  );
  check(
    coeur !== null && coeur.shareProche >= PART_UNIFORME && estLaCouleur(coeur.colour, attendue),
    `${prefixe} et le CŒUR de la tuile est PEINT par cette image — ${coeur === null ? 'surface nulle' : `${coeur.colour} sur ${(coeur.shareProche * 100).toFixed(1)} % du cœur, ${coeur.tones} teintes, tuile ${coeur.taille}, cinq premières ${coeur.cinqPremieres.join(' | ')}`} ; essais ${essais.join(' · ')}`,
  );

  /* 2. LE VOCAL SUIT LE PRISME DU LECTEUR, ET SA PISTE EST RÉSOLUE.
     La requête est ancrée sur SA rangée : un `<audio>` pris au premier venu du
     document dirait « la piste du prisme est fausse » le jour où une AUTRE
     rangée en monterait un qu'elle ne devrait pas — un diagnostic qui
     désignerait la résolution de langue pour un défaut de protection. */
  const piste = await page.evaluate((id) => document.querySelector(`[data-row="${id}"] audio`)?.getAttribute('src') ?? null, vocal);
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

  /* 3 bis. LES DEUX AUTRES MÉDIUMS — `Attachments` pose sa garde TROIS fois
     (grille visuelle, branche audio, branche fichier) et la section 3 n'en
     atteignait qu'une. Ce que les deux autres laissent partir quand elles
     tombent n'est pas une case vide : la DURÉE d'un vocal et le NOM + le POIDS
     d'un fichier, tous trois servis sans condition par `servedAttachment`
     puisque la ligne doit rester LISTABLE. */
  const troisMediums = await anatomieDeLaRangee(page, pieces);
  check(troisMediums !== null, `${prefixe} la rangée des trois médiums est rendue (${pieces})`);
  check(
    troisMediums !== null && troisMediums.voiles.join(' + ') === 'Vocal protégé + Pièce protégée',
    `${prefixe} le vocal ET le fichier protégés peignent CHACUN leur voile, qui DIT sa nature (${troisMediums?.voiles.join(' + ')})`,
  );
  check(
    troisMediums !== null && troisMediums.lecteurs === 0,
    `${prefixe} aucun <audio> ne se monte sur un vocal protégé (${troisMediums?.lecteurs})`,
  );
  check(
    troisMediums !== null && !/0:42/.test(troisMediums.texte),
    `${prefixe} et la DURÉE du vocal protégé ne se peint nulle part (« ${troisMediums?.texte} »)`,
  );
  check(
    troisMediums !== null && troisMediums.texte.includes('ordre-du-jour.pdf') && /2\s*Ko/.test(troisMediums.texte),
    `${prefixe} CONTRASTE — le fichier LIBRE de la même rangée dit bien son nom et son poids (« ${troisMediums?.texte} »)`,
  );

  // 4. UN MESSAGE DONT LA PASSERELLE A RETENU LE CONTENU LE DIT, PIÈCES COMPRISES.
  const retenu = await anatomieDeLaRangee(page, retenue);
  check(retenu !== null && retenu.images === 0, `${prefixe} un contenu retenu ne peint aucune image (${retenu?.images})`);
  check(
    retenu !== null && retenu.constat !== null && /1\s+image/.test(retenu.constat),
    `${prefixe} … et il CONSTATE la pièce que la passerelle liste sans la servir (« ${retenu?.constat} »)`,
  );
  /* LA FORME, PAS SEULEMENT L'AIGUILLE — une aiguille prouve qu'une chose EST
     là, jamais que rien d'autre ne l'est. Mesuré : ajouter le poids des pièces
     retenues au constat (ce que la leçon 275 interdit) laissait « 1 image »
     vrai, donc ce gate vert. */
  check(
    retenu !== null && retenu.constat !== null && /^·\s*1\s+image$/.test(retenu.constat.replace(/\s+/g, ' ')),
    `${prefixe} … et il ne dit QUE le type et le nombre — ni nom, ni poids, ni durée (« ${retenu?.constat} »)`,
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
