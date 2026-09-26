#!/usr/bin/env node
/**
 * Extrait de `@phosphor-icons/core` (regular) le SOUS-ENSEMBLE de glyphes que
 * la v3.1 emploie, et l'ecrit en module TypeScript inlinable.
 *
 * Pourquoi lire les tracés BRUTS de `@phosphor-icons/core/assets/regular/`
 * plutôt que `packages/icons/sprite.svg` (l'ancienne source de ce script) :
 * ce sprite est le sous-sprite de 72 symboles CURATE pour `apps/web-old-version3`
 * (README `packages/icons/README.md`, `budgets.json` de ce dépôt), un chantier
 * ARRÊTÉ (2026-09-07) — s'y accrocher pour un glyphe absent de son curatage
 * (`push-pin`, `bell-slash`, `envelope-open`, `archive`, `dots-three-vertical`,
 * requis par #5559) aurait obligé à étendre un pipeline gelé. `@phosphor-icons/core`
 * est la source UNIQUE dont dérivent les deux : une dépendance de dépôt
 * (racine, `package.json`), jamais un téléchargement au build. Vérifié
 * OCTET POUR OCTET avant bascule : chaque tracé déjà extrait via le sprite
 * (`check`, `bell`, …) est identique lu depuis l'asset brut — la bascule ne
 * fait bouger AUCUN pixel des 20 glyphes existants, elle en ajoute cinq.
 *
 * Pourquoi INLINER plutot que referencer `<use href="/sprite.svg#id">` : sous
 * Capacitor le document est servi depuis le systeme de fichiers, ou la
 * resolution d'un `<use>` externe depend du schema d'URL de la coque. Un
 * fragment inline se comporte identiquement dans les deux variantes — c'est la
 * condition pour que le POC compare des variantes, et non des bugs.
 *
 * Pourquoi un GENERATEUR plutot qu'un fichier ecrit a la main : recopier des
 * chemins SVG est exactement la « seconde table » que la charte interdit. Ici
 * la source reste `@phosphor-icons/core` ; ce module en est une projection
 * rejouable — `node scripts/extract-glyphs.mjs` la regenere a l'identique.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = join(HERE, '../../../node_modules/@phosphor-icons/core/assets');
const OUTPUT = join(HERE, '../src/components/glyphs.ts');

/**
 * Tous les glyphes viennent du dossier `regular`, à UNE exception : le
 * triangle de lecture est le variant PLEIN (`fill/play-fill.svg`) — phosphor
 * ne publie pas de `regular/play.svg` équivalent visuellement à l'ancien id
 * `ph-fill-play` du sprite curaté. `fill-play` (le nom conservé pour ne pas
 * renommer un glyphe déjà consommé par `message-blocks.tsx`) résout donc vers
 * ce fichier précis plutôt que le motif `regular/<id>.svg`.
 */
const OVERRIDES = {
  'fill-play': join(CORE, 'fill/play-fill.svg'),
  /**
   * `stop` (#5668) — le bouton « Arrêter et ajouter aux pièces jointes » de la
   * barre d'enregistrement rend `stop.fill` côté iOS
   * (`UniversalComposerBar+Recording.swift:215-239`) : le variant PLEIN,
   * même dispositif que `fill-play`.
   */
  stop: join(CORE, 'fill/stop-fill.svg'),
  /**
   * `flame-fill` (D-23, #5676) — iOS emploie `flame.fill` pour le badge
   * éphémère et le tombstone « Vu et supprimé »
   * (`BubbleMetaBadges.swift:146-171`, `BubbleSystemViews.swift:50-85`) et
   * `flame` régulier dans l'aperçu de LISTE
   * (`LentilleConversationRow.swift:600-631`, `previewKindOf` §5.9) — les
   * DEUX variants sont donc extraits, même dispositif que `fill-play`.
   */
  'flame-fill': join(CORE, 'fill/flame-fill.svg'),
  /**
   * `pause` (#5805) — le widget vocal du fil bascule `fillPlay` (socle) ⇄
   * `pause` : le PLEIN, même dispositif que `fill-play`/`stop` — un contour
   * seul lirait mal à 13-18 px sur le fond dégradé du bouton.
   */
  pause: join(CORE, 'fill/pause-fill.svg'),
  /**
   * `heart-fill` / `bookmark-fill` (#6278) — le cœur et le signet d'une carte
   * du fil se peignent PLEINS quand le lecteur a posé le geste
   * (`heart.fill` / `bookmark.fill`, `FeedPostCard.swift:946-947,1059-1095`).
   * Le contour seul ne dirait pas l'état : c'est lui que `aria-pressed`
   * annonce, et le pixel doit dire la même chose.
   */
  'heart-fill': join(CORE, 'fill/heart-fill.svg'),
  'bookmark-fill': join(CORE, 'fill/bookmark-fill.svg'),
  /**
   * `coin-fill` (#6427) — la PIÈCE des Meeshes, PLEINE : à 18-20 px, à côté
   * d'un solde en gras, le contour de `coin` se perd, et c'est la silhouette
   * métallique qui doit dire « monnaie ». Même tracé que l'actif iOS
   * `MeeshCoin`, pour que les deux plateformes montrent la même pièce.
   */
  'coin-fill': join(CORE, 'fill/coin-fill.svg'),
  /**
   * `number-circle-one-fill` (#7597) — la vue unique ARMÉE : iOS pose
   * `1.circle.fill` sur la capsule armée et `1.circle` au repos
   * (`UniversalComposerBar+Protections.swift`, `MessageProtectionSymbols`).
   * Le contour et le PLEIN disent l'état que `aria-pressed` annonce.
   */
  'number-circle-one-fill': join(CORE, 'fill/number-circle-one-fill.svg'),
  /**
   * `star-fill` (#7378, #7286) — l'étoile PLEINE d'un message en favori :
   * « Retirer des favoris » dans « Plus… », la rangée de Réglages › Outils et
   * le bouton de retrait de l'écran des favoris (`star.fill` iOS,
   * `SettingsView.swift`, `StarredMessagesView.swift`). Phosphor ne publie
   * pas de `star-slash` : l'étoile PLEINE dit « en favori, toucher pour
   * retirer », le CONTOUR (`star`) dit « ajouter ».
   */
  'star-fill': join(CORE, 'fill/star-fill.svg'),
};

/**
 * Noms de fichier phosphor (`push-pin.svg`) — le nom de propriété exporté est
 * la même chaîne en camelCase. Les cinq de la ligne 76-80 servent les actions
 * de rangée et le déclencheur de menu (#5559, §5.6) ; les trois derniers
 * (`user`, `key`, `caret-down`) servent les écrans de connexion et
 * d'inscription (#5555, § E1) — le champ identifiant, le champ de code à deux
 * facteurs, et le chevron du sélecteur de pays ; les vingt premiers sont
 * repris tels quels du curatage précédent.
 */
const USED = [
  'caret-left',
  'phone',
  'magnifying-glass',
  'translate',
  'check',
  'checks',
  'clock',
  'warning-circle',
  'plus',
  'microphone',
  'arrow-up',
  'image',
  'file',
  'fill-play',
  'lock',
  'x',
  'smiley',
  'users',
  'bell',
  'link-simple',
  'push-pin',
  'bell-slash',
  'envelope-open',
  'archive',
  'dots-three-vertical',
  'user',
  'key',
  'caret-down',
  /**
   * D-23, #5676 — la protection du fil : `flame` (aperçu de liste, vue
   * unique), `flame-fill` (badge éphémère, tombstone brûlé — voir
   * `OVERRIDES` ci-dessus), `prohibit` (≈ `nosign` iOS, tombstone
   * supprimé), `eye-slash` (aperçu de liste, message masqué).
   */
  'flame',
  'flame-fill',
  'prohibit',
  'eye-slash',
  /**
   * `eye` (#7354, V6) — la bascule « vue unique » du composeur : PENDANT
   * OUVERT d'`eye-slash` (le VOILE d'un message déjà protégé), même
   * métaphore que quoted.isViewOnce → « 👁️ » (iOS,
   * `ConversationViewModel+ReplyReference.swift:200`) et `bubble.media.viewOnce`
   * (« Voir une fois »). iOS arme sa capsule avec `1.circle`/`1.circle.fill`
   * (SF Symbol, sans pendant Phosphor) — `eye` en est la traduction dans le
   * socle de glyphes déjà établi par ce dépôt pour cette famille.
   */
  'eye',
  /**
   * `number-circle-one` / `number-circle-one-fill` (#7597, #7580) — le « 1 »
   * cerclé de la vue unique, pendant EXACT de `1.circle` / `1.circle.fill`
   * (SF Symbol, `MessageProtectionSymbols`). Phosphor le publie : l'ancienne
   * traduction par `eye` (#7354) n'a plus lieu d'être, et le porteur exige
   * le « 1 » cerclé au composeur comme dans le fil (#7580).
   */
  'number-circle-one',
  'number-circle-one-fill',
  /**
   * `timer` (revue #5676) — iOS distingue dans la LIGNE DE LISTE l'éphémère
   * (`timer`) de la vue unique (`flame`)
   * (`LentilleConversationRow.swift:578-584`, `:616`, `standardPreview`
   * `showEphemeralIcon`). Servir `flame` aux DEUX faisait porter au même
   * glyphe deux états différents dans la même colonne — l'ambiguïté que la
   * dimension 6 (cohérence de positionnement) interdit.
   */
  'timer',
  // L'entrée du tableau de bord « Progression » (#5547) sur l'en-tête de la
  // liste, et le titre de l'écran : le SEUL glyphe de ce lot qui entre au
  // socle — les quatorze autres vivent dans le jeu d'écran ci-dessous.
  'trophy',
  'download-simple',
];

/**
 * LE JEU D'ÉCRAN DE « PROGRESSION » (#5547) — émis dans un SECOND module,
 * `glyphs-progression.ts`, que seule la route `/me/progression` importe.
 *
 * Pourquoi deux modules et non quatorze entrées de plus dans `GLYPHS` :
 * `glyphs.ts` est importé par `glyph.tsx`, donc par TOUS les écrans, donc il
 * vit dans le socle que le lecteur paie avant le premier pixel. Un glyphe qui
 * ne sert qu'à un écran y coûterait ses octets à chaque démarrage à froid, y
 * compris pour qui n'ouvre jamais cet écran — exactement la règle qui a sorti
 * le virtualiseur du socle (D-15). Le jeu d'écran est chargé avec sa route,
 * et le gate de poids ne le compte pas dans la première peinture.
 */
const PROGRESSION = [
  // `caret-right` n'entre PAS au socle : il ne sert qu'aux entrées de section
  // du hub (#5843). Même règle que les autres — un glyphe d'un seul écran ne
  // se paie pas au démarrage à froid de tous les autres.
  'caret-right',
  'fire',
  'star',
  'medal',
  // La pièce des Meeshes (#6427) : la médaille reste aux BADGES.
  'coin-fill',
  'chat-text',
  'article',
  'camera',
  'film-strip',
  'waveform',
  'chat-circle-text',
  'globe',
  'users-three',
  'magic-wand',
  'paper-plane-tilt',
  // La famille SOCIALE (#5766) : lien créé, contenu partagé, invité venu,
  // amitié nouée. Quatre axes neufs, quatre glyphes — sans eux la vue tombe
  // sur un `Record` incomplet, ce que le type-check refuse à juste titre.
  'link-simple',
  'share-network',
  'user-plus',
  'handshake',
];

function extract(ids) {
  const missing = [];
  const entries = ids.map((id) => {
    const path = OVERRIDES[id] ?? join(CORE, 'regular', `${id}.svg`);
    let source;
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      missing.push(id);
      return '';
    }
    const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1] ?? '0 0 256 256';
    const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(source)?.[1]?.trim() ?? '';
    const name = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    return `  ${name}: { viewBox: ${JSON.stringify(viewBox)}, body: ${JSON.stringify(body)} },`;
  }).join('\n');

  if (missing.length) {
    console.error(`Glyphes absents de @phosphor-icons/core/assets/regular : ${missing.join(', ')}`);
    process.exit(1);
  }
  return entries;
}

function emit({ ids, output, constant, type, role }) {
  writeFileSync(
    output,
    `/* GENERE par scripts/extract-glyphs.mjs depuis @phosphor-icons/core.
 * Ne pas editer a la main : relancer \`node scripts/extract-glyphs.mjs\`.
 * La liste des glyphes employes vit dans ce script, pas ici.
 * ${role} */

export const ${constant} = {
${extract(ids)}
} as const;

export type ${type} = keyof typeof ${constant};
`,
  );
  const bytes = Buffer.byteLength(readFileSync(output));
  console.log(`  ${ids.length} glyphes extraits → ${output.slice(HERE.length - 'scripts'.length)} · ${bytes} o de module`);
}

emit({
  ids: USED,
  output: OUTPUT,
  constant: 'GLYPHS',
  type: 'GlyphName',
  role: 'LE SOCLE : importe par glyph.tsx, donc par tous les ecrans — paye avant le premier pixel.',
});

emit({
  ids: PROGRESSION,
  output: join(HERE, '../src/components/glyphs-progression.ts'),
  constant: 'PROGRESSION_GLYPHS',
  type: 'ProgressionGlyphName',
  role: "LE JEU D'ECRAN de /me/progression (#5547) : charge avec sa route, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU MENU DU MESSAGE (#5814) — miroir
 * `MessageActionsMenu.swift:96-111` : Selectionner (check-circle), Traduire
 * (globe), Copier (copy), Transferer (arrow-bend-up-right, #5866),
 * Repondre (magic-wand — l'action s'appelait
 * `compose` jusqu'a #7555 ; l'icone n'a pas suivi le renommage, #7564),
 * Plus... (dots-three).
 * `magic-wand` et `globe` existent deja dans le jeu PROGRESSION : deux jeux
 * d'ecran distincts peuvent extraire le meme glyphe phosphor, chacun dans SON
 * module — ils ne se chargent jamais ensemble (le fil et /me/progression ne
 * sont pas la meme route), donc aucun octet n'est paye deux fois au meme
 * demarrage.
 *
 * `arrow-bend-up-right` (#5866) est le plus proche de `arrowshape.turn.up.right`
 * que iOS pose sur « Transferer » (`MessageActionsMenu.swift`) : phosphor ne
 * publie pas la fleche PLEINE en chevron, et le contour lit mieux a 18 px.
 *
 * `star` / `star-fill` (#7378) — le favori de la feuille « Plus... »
 * (`action.star` / `action.unstar`, `star.fill` iOS) : Ajouter (contour),
 * Retirer (plein). La feuille vit dans le chunk du fil, comme ce jeu.
 *
 * `pencil-simple` (#7534) — « Modifier » du menu « ⋯ » d'une carte du fil,
 * miroir `pencil` (SF Symbols, `FeedPostCard+Header.swift:213`) : même
 * glyphe que `AUTH`/`THREAD_STATES` (composeur, avatar), un jeu D'ÉCRAN
 * distinct parce que ce menu et le fil des messages ne se chargent jamais
 * ensemble.
 */
const THREAD_MENU = [
  'check-circle',
  'globe',
  'copy',
  'arrow-bend-up-right',
  'magic-wand',
  'dots-three',
  'star',
  'star-fill',
  'pencil-simple',
];

emit({
  ids: THREAD_MENU,
  output: join(HERE, '../src/components/glyphs-thread-menu.ts'),
  constant: 'THREAD_MENU_GLYPHS',
  type: 'ThreadMenuGlyphName',
  role: "LE JEU D'ECRAN du menu du message (#5814) : charge avec le chunk du fil, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DE L'IDENTITE DE RANGEE (#5935) — miroir
 * `FocalIdentityHeader.swift:129-139` : le fantome `theatermasks.fill`
 * (iOS, `.purple`) qui precede le nom d'un visiteur SANS COMPTE. Phosphor ne
 * publie pas de `theatermasks` : `mask-happy` en est le plus proche
 * visuellement (un masque, jamais deux) et le seul disponible dans
 * `regular/`. Charge avec le chunk du fil (`focal-row.tsx`), jamais dans le
 * socle — un sans-compte reste un cas RARE face au volume d'identites
 * ordinaires que le socle paie a chaque premier pixel.
 */
const THREAD_IDENTITY = ['mask-happy'];

emit({
  ids: THREAD_IDENTITY,
  output: join(HERE, '../src/components/glyphs-thread-identity.ts'),
  constant: 'THREAD_IDENTITY_GLYPHS',
  type: 'ThreadIdentityGlyphName',
  role: "LE JEU D'ECRAN de l'identite de rangee (#5935) : le masque du sans-compte (theatermasks.fill iOS), charge avec le chunk du fil, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES ROUTES D'AUTHENTIFICATION (#5816) — le heros de
 * MagicLinkView (`wand.and.stars`), l'icone d'email du champ (`envelope`,
 * distinct de `envelope-open` du socle, qui reste l'etat "attente") et le
 * bouton "Renvoyer" (`arrow.clockwise`). Charge avec `/auth/magic-link` et
 * `/forgot-password`, jamais dans le socle : ces trois glyphes ne servent
 * qu'a un visiteur SANS session, un chemin rare compare au fil.
 */
const AUTH = ['envelope', 'magic-wand', 'arrow-clockwise', 'info'];

emit({
  ids: AUTH,
  output: join(HERE, '../src/components/glyphs-auth.ts'),
  constant: 'AUTH_GLYPHS',
  type: 'AuthGlyphName',
  role: "LE JEU D'ECRAN des routes d'authentification (#5816) : charge avec elles, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU TIROIR DU COMPOSEUR (#5668, etendu #7280) — `stop` (le
 * bouton « Arreter et ajouter aux pieces jointes » de la barre
 * d'enregistrement), `camera` et `map-pin` (les tuiles « Camera » et
 * « Position », #7280).
 * `image`, `file`, `microphone`, `smiley` et `x` (tuiles, aperçu, annuler)
 * restent au SOCLE : ils y sont deja pour d'autres usages (rangee du
 * composeur, blocs de message), les dupliquer ici paierait leurs octets deux
 * fois. Charge avec le
 * chunk `composer-tray` (#5668, § 7 de la specification), jamais dans le
 * socle ni dans le chunk du fil : la barre d'enregistrement n'entre qu'au
 * premier tap sur le micro ou le "+".
 */
const COMPOSER = ['stop', 'camera', 'map-pin', 'sticker', 'clipboard-text', 'image-square', 'x'];

/* AVERTISSEMENT (#7280) — `glyphs-feed.ts` porte un `mapPin` AJOUTÉ À LA MAIN
   (#6901), que ce script ne connaît pas : le relancer le SUPPRIME. Avant de
   committer une regeneration, verifier `git diff src/components/glyphs-*.ts`
   et ne garder que les jeux qu'on voulait toucher — ou ajouter `map-pin` a
   FEED, ce qui ferait perdre son doc-comment. */

emit({
  ids: COMPOSER,
  output: join(HERE, '../src/components/glyphs-composer.ts'),
  constant: 'COMPOSER_GLYPHS',
  type: 'ComposerGlyphName',
  role: "LE JEU D'ECRAN du tiroir du composeur (#5668) : charge avec le chunk composer-tray, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES PIECES JOINTES DU FIL (#5805) — `pause` (le widget
 * vocal bascule `fillPlay` (socle) ⇄ `pause` selon `AudioPlaybackStatus`,
 * `fill/pause-fill.svg`, meme dispositif que `fill-play`). Charge avec
 * `attachment-blocks.tsx`, deja dans le chunk du fil (monte par bubble.tsx
 * et focal-row.tsx) — jamais dans le socle.
 */
const MEDIA = ['pause'];

emit({
  ids: MEDIA,
  output: join(HERE, '../src/components/glyphs-media.ts'),
  constant: 'MEDIA_GLYPHS',
  type: 'MediaGlyphName',
  role: "LE JEU D'ECRAN des pieces jointes du fil (#5805) : charge avec attachment-blocks.tsx, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DE LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359) — miroir
 * des symboles de `VideoTransportControls.swift` : `speaker.wave.2.fill` /
 * `speaker.slash.fill` (muet), `pip.enter` (image dans l'image) et
 * `ellipsis` (le menu vitesse / image dans l'image). `pause` et `fill-play`
 * restent la ou ils sont (`MEDIA_GLYPHS`, socle) : le chunk de la visionneuse
 * les recoit deja, les dupliquer ici paierait leurs octets deux fois. Charge
 * avec le chunk `media-viewer`, jamais dans le socle ni dans le chunk du fil.
 */
const MEDIA_TRANSPORT = ['speaker-high', 'speaker-slash', 'picture-in-picture', 'dots-three'];

emit({
  ids: MEDIA_TRANSPORT,
  output: join(HERE, '../src/components/glyphs-media-transport.ts'),
  constant: 'MEDIA_TRANSPORT_GLYPHS',
  type: 'MediaTransportGlyphName',
  role: "LE JEU D'ECRAN de la barre de lecture de la visionneuse (#6359) : charge avec le chunk media-viewer, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES ETATS DU MESSAGE (#5936) — miroir
 * `BubbleMetaBadges.swift` (transfere : `arrowshape.turn.up.right.fill`,
 * modifie : `pencil`), `LocationMessageView` (lieu : `mappin.and.ellipse`),
 * `BubbleStoryCitationCard.swift` (bande de citation :
 * `arrowshape.turn.up.backward.fill`) et `FocalCallNoticeRow`/
 * `BubbleCallNoticeView` (appel video : `video.fill`). `push-pin` et `phone`
 * (l'appel AUDIO) restent au SOCLE, deja consommes ailleurs — pas de
 * duplication d'octets.
 *
 * `user-plus` s'y AJOUTE (ecart avec le brief de la specification, qui le
 * disait deja present dans le jeu IDENTITE `THREAD_IDENTITY` : verifie,
 * seul `mask-happy` y vit) — l'avis d'arrivee (`person.badge.plus` cote iOS)
 * en a besoin et n'a pas d'autre domicile dans le chunk du fil.
 */
const THREAD_STATES = ['arrow-bend-up-right', 'pencil-simple', 'map-pin', 'arrow-bend-up-left', 'video-camera', 'user-plus'];

emit({
  ids: THREAD_STATES,
  output: join(HERE, '../src/components/glyphs-thread-states.ts'),
  constant: 'THREAD_STATES_GLYPHS',
  type: 'ThreadStatesGlyphName',
  role: "LE JEU D'ECRAN des etats du message (#5936) : transfere, modifie, lieu, citation de story, appel video, avis d'arrivee — charge avec le chunk du fil, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES MENUS FLOTTANTS (#6104) — les quatre glyphes des deux
 * boutons flottants et de leur echelle, miroir `RootMenuLadderEntry.swift` :
 *
 * | iOS | phosphor | pourquoi celui-la |
 * |---|---|---|
 * | `square.stack.fill` (le Flux) | `stack` | des plans empiles, la meme idee |
 * | `sparkle.magnifyingglass` (Decouvrir) | `binoculars` | voir plus loin |
 * | `person.3.fill` (Communautes) | `users-three` | TROIS personnes, comme iOS |
 * | `gearshape.fill` (Reglages) | `gear` | — |
 *
 * `binoculars` plutot que `magnifying-glass` : phosphor ne publie pas la
 * loupe a etincelles d'iOS, et la loupe NUE est deja le glyphe de la
 * RECHERCHE dans cette application (barre de la liste). Deux sens pour un
 * meme dessin, sur deux surfaces que l'utilisateur enchaine, est exactement
 * la divergence que la dimension 6 nomme — les jumelles disent « chercher des
 * GENS », ce que la loupe ne dit plus ici.
 *
 * `link-simple`, `bell`, `phone` et `user` — les quatre autres glyphes de
 * l'echelle et du profil — restent au SOCLE, ou ils vivent deja : les
 * dupliquer ici paierait leurs octets DEUX FOIS au meme demarrage, puisque le
 * socle est toujours charge. C'est l'arbitrage que `composer-tray` a deja
 * tranche dans ce fichier pour `image`/`file`/`microphone`/`x`.
 */
const FLOATING = ['stack', 'binoculars', 'users-three', 'gear'];

emit({
  ids: FLOATING,
  output: join(HERE, '../src/components/glyphs-floating.ts'),
  constant: 'FLOATING_GLYPHS',
  type: 'FloatingGlyphName',
  role: "LE JEU D'ECRAN des menus flottants (#6104) : charge avec le chunk des menus, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU FIL DES PUBLICATIONS (#5893, #6104) — les cinq
 * statistiques STATIQUES de `FeedPostCard` (aimer, commenter, repartager,
 * enregistrer, partager), miroir `FeedPostCard.swift:976-1131`. Ce lot les
 * rend en COMPTEURS, jamais en boutons (lecture seule, D-6) : les glyphes
 * restent les memes qu'iOS, seul l'effet du geste change (aucun).
 *
 * `arrows-clockwise` pour repartager (`arrow.2.squarepath` cote iOS) : le
 * mouvement circulaire est la meme idee, phosphor ne publie pas l'exact
 * pictogramme SF Symbols. `chat-circle` (bulle nue) plutot que
 * `chat-circle-text` (deja dans PROGRESSION, une bulle a lignes) : la carte
 * de post n'a besoin que de la bulle, jamais du texte a l'interieur.
 *
 * `waveform` (deja dans PROGRESSION, mais un AUTRE chunk -- dupliquer ici
 * evite de faire dependre le fil de la route progression) sert le repli
 * plein cadre d'un media AUDIO (post ou reel) avant toute lecture. `caret-right`
 * sert les DEUX fleches du carrousel de FeedPostCardCarousel -- `caret-left`
 * N'Y ENTRE PAS : il est deja au SOCLE (`caretLeft`, retour de l'en-tete), le
 * dupliquer paierait ses octets deux fois au meme demarrage.
 *
 * `monitor-play` (#6457) : le bouton « Lancer les Reels » de l'en-tete du fil,
 * miroir de `play.rectangle.on.rectangle.fill` (`FeedView.swift`) -- un cadre
 * d'ecran qui porte le triangle de lecture, la meme idee que le symbole iOS.
 * Le lecteur des Reels relit ce MEME jeu (coeur, signet, partage, onde) plutot
 * que d'en recopier les traces dans un jeu a lui.
 *
 * `speaker-slash` (#6898) : l'indicateur « son coupe » d'une scene elue du fil,
 * miroir de `BackgroundSoundBadge.muteIconName` (`FeedSceneAutoplay.swift:186-200`)
 * -- jusqu'ici un trace RECOPIE a la main dans `scene-player.tsx`.
 */
const FEED = ['heart', 'heart-fill', 'chat-circle', 'arrows-clockwise', 'bookmark', 'bookmark-fill', 'share-network', 'waveform', 'caret-right', 'monitor-play', 'speaker-slash'];

emit({
  ids: FEED,
  output: join(HERE, '../src/components/glyphs-feed.ts'),
  constant: 'FEED_GLYPHS',
  type: 'FeedGlyphName',
  role: "LE JEU D'ECRAN du fil des publications (#5893) : les cinq statistiques de la carte de post, charge avec la route /feed, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DE LA CLOCHE (#6288) — les glyphes du rail de categories,
 * miroir `NotificationCategory.icon` (`NotificationListView.swift:37-51`) :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `circle.fill` (non lues) | `circle` |
 * | `bubble.left.fill` (messages) | `chat-circle` |
 * | `heart.fill` (reactions) | `heart` |
 * | `at` (mentions) | `at` |
 * | `hand.thumbsup.fill` (social) | `thumbs-up` |
 * | `person.badge.plus` (contacts) | `user-plus` |
 * | `person.3.fill` (groupes) | `users-three` |
 * | `globe` (traductions) | `globe` |
 * | `gear` (systeme) | `gear` |
 *
 * plus `trash` pour « Supprimer » dans le menu d'une ligne. `bell` (toutes),
 * `phone` (appels) et `check` (marquer lue) restent au SOCLE, ou ils vivent
 * deja. `heart`, `chat-circle`, `users-three`, `gear`, `globe` et `user-plus`
 * existent aussi dans d'autres jeux d'ecran : ceux-la ne se chargent jamais
 * avec la cloche, aucun octet n'est donc paye deux fois au meme demarrage.
 */
const NOTIFICATIONS = ['circle', 'chat-circle', 'heart', 'at', 'thumbs-up', 'user-plus', 'users-three', 'globe', 'gear', 'trash'];

emit({
  ids: NOTIFICATIONS,
  output: join(HERE, '../src/components/glyphs-notifications.ts'),
  constant: 'NOTIFICATIONS_GLYPHS',
  type: 'NotificationsGlyphName',
  role: "LE JEU D'ECRAN de la cloche (#6288) : le rail des categories et le menu d'une ligne, charge avec la route /notifications, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU PROFIL (#6289) — miroir des symboles de `ProfileView.swift`
 * et du bandeau de statistiques de `UserProfileSheet+DetailsTab.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `pencil.circle.fill` (avatar) | `pencil-simple` |
 * | `photo.fill` (banniere) | `camera` |
 * | `person.text.rectangle.fill` (identite) | `identification-card` |
 * | `text.quote` (bio) | `quotes` |
 * | `at` (pseudo) | `at` |
 * | `envelope.fill` (contact) | `envelope-simple` |
 * | `globe` (langues) | `globe` |
 * | `chart.bar.fill` (statistiques) | `chart-bar` |
 * | `paperplane.fill` (messages) | `chat-circle` |
 * | `calendar` (membre depuis, jours) | `calendar-blank` |
 * | `person.badge.plus.fill` (demandes) | `user-plus` |
 * | `chevron.forward` | `caret-right` |
 *
 * `user`, `phone`, `translate`, `trophy`, `users` et `x` restent au SOCLE.
 */
const PROFILE = [
  'pencil-simple',
  'camera',
  'identification-card',
  'quotes',
  'at',
  'envelope-simple',
  'globe',
  'chart-bar',
  'chat-circle',
  'calendar-blank',
  'user-plus',
  'caret-right',
];

emit({
  ids: PROFILE,
  output: join(HERE, '../src/components/glyphs-profile.ts'),
  constant: 'PROFILE_GLYPHS',
  type: 'ProfileGlyphName',
  role: "LE JEU D'ECRAN du profil (#6289) : sections, contacts, langues, statistiques et entrees, charge avec la route /me, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES REGLAGES (#5563) — miroir des symboles de `SettingsView.swift`
 * et de `PrivacySettingsView.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `person.circle.fill` (compte) | `user-circle` |
 * | `shield.fill` (securite) | `shield-check` |
 * | `person.crop.circle.badge.minus` (supprimer) | `user-minus` |
 * | `eye.fill` (visibilite) | `eye` |
 * | `circle.fill` (statut en ligne) | `circle` |
 * | `keyboard` (indicateur de frappe) | `keyboard` |
 * | `paintbrush.fill` (apparence) | `paint-brush` |
 * | `circle.lefthalf.filled` / `sun.max` / `moon` (theme) | `circle-half` / `sun` / `moon` |
 * | `globe` (langue de l'interface) | `globe` |
 * | `bell.badge.fill` (notifications) | `bell-ringing` |
 * | `speaker.wave.2.fill` (sons) | `speaker-high` |
 * | `slider.horizontal.3` (plus d'options) | `sliders-horizontal` |
 * | `externaldrive.fill` (donnees) | `hard-drives` |
 * | `bubble.left` (messages) | `chat-text` |
 * | `square.and.arrow.up.fill` (export) | `export` |
 * | `wrench.and.screwdriver.fill` (outils) | `wrench` |
 * | `info.circle.fill` (a propos) | `info` |
 * | `doc.text.fill` (conditions) | `file-text` |
 * | `hand.raised.fill` (politique) | `hand-palm` |
 * | `sparkles` (version) | `sparkle` |
 * | `rectangle.portrait.and.arrow.forward` (deconnexion) | `sign-out` |
 * | lien vers le legacy (propre au web) | `arrow-square-out` |
 * | `chevron.forward` | `caret-right` |
 *
 * `lock`, `clock`, `checks`, `translate`, `bell`, `image` et `trophy` restent au SOCLE.
 */
const SETTINGS = [
  'user-circle',
  'shield-check',
  'user-minus',
  'eye',
  'circle',
  'keyboard',
  'paint-brush',
  'circle-half',
  'sun',
  'moon',
  'globe',
  'bell-ringing',
  'speaker-high',
  'sliders-horizontal',
  'hard-drives',
  'chat-text',
  'export',
  'wrench',
  'info',
  'file-text',
  'hand-palm',
  'sparkle',
  'sign-out',
  'arrow-square-out',
  'caret-right',
  /* LES PUBLICATIONS ENREGISTREES (#7286) — la rangee « Outils » des reglages,
     miroir du `bookmark.fill` d'iOS (`SettingsView.swift`). Le jeu du FLUX le
     porte deja, mais le tirer d'ici ferait entrer toute sa table dans le chunk
     des reglages pour un seul trace. */
  'bookmark-fill',
  /* LES MESSAGES FAVORIS (#7286) — la PREMIERE rangee « Outils », miroir du
     `star.fill` d'iOS (`SettingsView.swift`, teinte `warning`). */
  'star-fill',
];

emit({
  ids: SETTINGS,
  output: join(HERE, '../src/components/glyphs-settings.ts'),
  constant: 'SETTINGS_GLYPHS',
  type: 'SettingsGlyphName',
  role: "LE JEU D'ECRAN des reglages (#5563) : sections, bascules, theme, liens vers le legacy, charge avec la route /settings, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES MESSAGES FAVORIS (#7286) — miroir de
 * `StarredMessagesView.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `star.circle` (etat vide) | `star` |
 * | `star.fill` (en favori — toucher pour retirer) | `star-fill` |
 * | `bubble.left.and.bubble.right.fill` (la conversation d'une ligne) | `chats-circle` |
 *
 * `caretLeft`, `lock` et `warningCircle` restent au SOCLE. Charge avec la route
 * `/me/starred-messages`, jamais dans le socle.
 */
const STARRED = ['star', 'star-fill', 'chats-circle'];

emit({
  ids: STARRED,
  output: join(HERE, '../src/components/glyphs-starred.ts'),
  constant: 'STARRED_GLYPHS',
  type: 'StarredGlyphName',
  role: "LE JEU D'ECRAN des messages favoris (#7286) : charge avec la route /me/starred-messages, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DES COMMUNAUTES (#6364) — miroir des symboles de
 * `CommunityListView.swift`, `CommunityDetailView.swift` et
 * `CommunityCreateView.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `bubble.left.fill` (conversations d'une carte) | `chat-circle` |
 * | `bubble.left.and.bubble.right.fill` (canaux du detail) | `chats-circle` |
 * | `globe` (publique) | `globe` |
 * | `plus.circle.fill` (creer) | `plus-circle` |
 * | `person.3.fill` (etat vide) | `users-three` |
 * | `xmark.circle.fill` (effacer la recherche) | `x-circle` |
 * | `lock.shield.fill` / `eye.fill` (confidentialite a la creation) | `shield-check` / `eye` |
 * | `chevron.forward` | `caret-right` |
 *
 * `lock`, `users`, `magnifyingGlass`, `caretLeft` et `warningCircle` restent au SOCLE.
 */
const COMMUNITIES = ['chat-circle', 'chats-circle', 'globe', 'plus-circle', 'users-three', 'x-circle', 'shield-check', 'eye', 'caret-right'];

emit({
  ids: COMMUNITIES,
  output: join(HERE, '../src/components/glyphs-communities.ts'),
  constant: 'COMMUNITIES_GLYPHS',
  type: 'CommunitiesGlyphName',
  role: "LE JEU D'ECRAN des communautes (#6364) : cartes, detail, recherche et creation, charge avec les routes /communities, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU JOURNAL D'APPELS (#6362) — miroir des symboles de
 * `CallsTab.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `arrow.up.right` (appel emis) | `arrow-up-right` |
 * | `arrow.down.left` (appel recu) | `arrow-down-left` |
 * | `arrow.down.left` en rouge (appel manque) | `phone-x` — divergence assumee (D-61) : la direction ne se dit jamais par la couleur seule |
 * | `video.fill` (appel video) | `video-camera` |
 * | `phone.arrow.up.right` (etat vide) | `phone-outgoing` |
 *
 * `phone`, `caretLeft` et `warningCircle` restent au SOCLE.
 */
/**
 * LA DÉCOUVERTE DE PERSONNES (#6363) — `PeopleDiscoveryView` et ses trois
 * onglets : `person.badge.plus` (Demandes, Ajouter), `hand.raised.fill`
 * (Bloqués), `envelope.fill` (inviter par e-mail), `paperplane` (état vide des
 * envoyées), `person.2.slash` (état vide des reçues, rendu `user-check` barré
 * par le sens plutôt que par un trait). Chargé avec la route /discover.
 */
const DISCOVER = ['user-plus', 'hand-palm', 'envelope-simple', 'paper-plane-tilt', 'user-check'];

emit({
  ids: DISCOVER,
  output: join(HERE, '../src/components/glyphs-discover.ts'),
  constant: 'DISCOVER_GLYPHS',
  type: 'DiscoverGlyphName',
  role: "LE JEU D'ECRAN de la decouverte de personnes (#6363) : onglets, ajout, blocage, invitation et etats vides, charge avec la route /discover, jamais dans le socle.",
});

const CALLS = ['arrow-up-right', 'arrow-down-left', 'phone-x', 'video-camera', 'phone-outgoing', 'dots-nine', 'backspace', 'arrows-down-up', 'calendar-blank'];

emit({
  ids: CALLS,
  output: join(HERE, '../src/components/glyphs-calls.ts'),
  constant: 'CALLS_GLYPHS',
  type: 'CallsGlyphName',
  role: "LE JEU D'ECRAN du journal d'appels (#6362) : directions, type video et etat vide, charge avec la route /calls, jamais dans le socle.",
});

/**
 * L'ECRAN D'APPEL (#6382) — miroir des symboles de `CallView.swift`,
 * `IncomingCallView.swift` et `FloatingCallPillView.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `phone.down.fill` (raccrocher, refuser) | `phone-disconnect` |
 * | `mic.slash.fill` (micro coupe) | `microphone-slash` |
 * | `video.fill` / `video.slash.fill` (camera) | `video-camera` / `video-camera-slash` |
 * | `arrow.triangle.2.circlepath.camera` (changer de camera) | `camera-rotate` |
 * | `arrow.down.right.and.arrow.up.left` (reduire) | `arrows-in-simple` |
 * | `captions.bubble` (sous-titres) | `closed-captioning` |
 * | `wifi.exclamationmark` (connexion instable) | `cell-signal-low` |
 *
 * `phone` et `microphone` restent au SOCLE. Charge avec l'ecran d'appel, jamais dans le socle.
 */
const CALL_SCREEN = ['phone-disconnect', 'microphone-slash', 'video-camera', 'video-camera-slash', 'camera-rotate', 'arrows-in-simple', 'closed-captioning', 'cell-signal-low'];

emit({
  ids: CALL_SCREEN,
  output: join(HERE, '../src/components/glyphs-call-screen.ts'),
  constant: 'CALL_SCREEN_GLYPHS',
  type: 'CallScreenGlyphName',
  role: "LE JEU D'ECRAN de l'appel audio et video (#6382) : raccrocher, micro, camera, reduire, sous-titres et qualite, charge avec l'ecran d'appel, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DE « MES LIENS » (#6361) — miroir des symboles de
 * `LinksHubView.swift`, `ShareLinksView.swift`, `ShareLinkDetailView.swift` et
 * `CreateShareLinkView.swift` :
 *
 * | iOS | phosphor |
 * |---|---|
 * | `link.badge.plus` (banniere, etat vide) | `link` |
 * | `link` / `link.badge.minus` (lien actif / inactif) | `link-simple` (socle) / `link-break` |
 * | `plus.circle.fill` (creer) | `plus-circle` |
 * | `checkmark.circle.fill` (actifs) | `check-circle` |
 * | `person.fill.badge.plus` (rejoints, utilisations) | `user-plus` |
 * | `doc.on.doc` (copier) | `copy` |
 * | `square.and.arrow.up` (partager) | `export` |
 * | `pause.circle` / `play.circle` (desactiver / activer) | `pause-circle` / `play-circle` |
 * | `infinity` (maximum) | `infinity` |
 * | `bubble.left.and.bubble.right.fill` (section conversation) | `chats-circle` |
 * | `tag.fill` (identite) | `tag` |
 * | `person.badge.key.fill` (acces invites) | `key` (socle) |
 * | `slider.horizontal.3` (permissions) | `sliders-horizontal` |
 * | `gauge.with.dots.needle.bottom.50percent` (limites) | `gauge` |
 * | `person.fill.checkmark` / `person.fill` / `envelope.fill` / `calendar` | `user-check` / `user` (socle) / `envelope-simple` / `calendar-blank` |
 * | `bubble.left.fill` / `photo.fill` / `paperclip` / `clock.fill` | `chat-circle` / `image` (socle) / `paperclip` / `clock-counter-clockwise` |
 * | `person.2.fill` / `clock.badge.xmark` (limites) | `users` (socle) / `hourglass` |
 * | `chevron.forward` | `caret-right` |
 */
const LINKS = [
  'link',
  'link-break',
  'plus-circle',
  'check-circle',
  'user-plus',
  'copy',
  'export',
  'pause-circle',
  'play-circle',
  'infinity',
  'chats-circle',
  'tag',
  'sliders-horizontal',
  'gauge',
  'user-check',
  'envelope-simple',
  'calendar-blank',
  'chat-circle',
  'paperclip',
  'clock-counter-clockwise',
  'hourglass',
  'caret-right',
];

emit({
  ids: LINKS,
  output: join(HERE, '../src/components/glyphs-links.ts'),
  constant: 'LINKS_GLYPHS',
  type: 'LinksGlyphName',
  role: "LE JEU D'ECRAN de Mes liens (#6361) : hub, liens de partage, detail et creation, charge avec les routes /links, jamais dans le socle.",
});

/**
 * LE JEU DE LA LIGNE D'APERÇU (#7547) — l'iconographie web des icônes que rend
 * le composeur partagé (`PreviewIcon`, `composeConversationPreview`, #7546) et
 * que le socle ne porte pas encore. Le socle garde `phone`, `microphone`,
 * `image`, `file`, `eye`, `eye-slash`, `flame-fill`, `timer` et `lock`.
 *
 * | icône du composeur | phosphor |
 * |---|---|
 * | `call-video` | `video-camera` |
 * | `audio` | `music-note` |
 * | `video` | `film-strip` |
 * | `location` | `map-pin` |
 * | `attachments` | `paperclip` |
 * | `effect` | `sparkle` |
 * | `forward` | `arrow-bend-up-right` |
 * | `sticker` | `sticker` |
 * | direction d'un appel (entrant / sortant) | `arrow-down-left` / `arrow-up-right` |
 */
const LENS_PREVIEW = [
  'video-camera',
  'music-note',
  'film-strip',
  'map-pin',
  'paperclip',
  'sparkle',
  'arrow-bend-up-right',
  'arrow-down-left',
  'arrow-up-right',
  'sticker',
];

emit({
  ids: LENS_PREVIEW,
  output: join(HERE, '../src/components/glyphs-lens-preview.ts'),
  constant: 'LENS_PREVIEW_GLYPHS',
  type: 'LensPreviewGlyphName',
  role: "LE JEU de la ligne d'apercu de la Lentille (#7547) : les icones du composeur partage que le socle ne porte pas.",
});

/**
 * LES DEUX JEUX DE L'AUDIENCE DU STUDIO (#7683) — miroir des six
 * `PostVisibility.icon` (`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift:22-31`,
 * SF Symbols `globe`, `person.3.fill`, `person.2.fill`, `person.fill.xmark`,
 * `person.fill.checkmark`, `lock.fill`) :
 *
 * | iOS | phosphor | jeu |
 * |---|---|---|
 * | `globe` (public) | `globe` | `STORY_AUDIENCE` (la pastille) |
 * | `person.3.fill` (communautes) | `users-three` | `STORY_AUDIENCE` (la pastille) |
 * | `person.2.fill` (contacts) | `users` | SOCLE (`glyphs.ts`) |
 * | `person.fill.xmark` (sauf...) | `user-minus` | `STORY_AUDIENCE_PEOPLE` (la feuille) |
 * | `person.fill.checkmark` (seulement...) | `user-check` | `STORY_AUDIENCE_PEOPLE` (la feuille) |
 * | `lock.fill` (prive) | `lock` | SOCLE (`glyphs.ts`) |
 *
 * `users` et `lock` ne sont PAS repris : le socle les paie deja avant le
 * premier pixel. Et les deux modes NOMINATIFS ont leur propre jeu : la
 * pastille ne les peint jamais (le studio ne sait pas les choisir), seule la
 * feuille — chargee A LA DEMANDE — les montre, grises avec leur raison. Les
 * lier au chunk du studio ferait payer a chaque ouverture deux icones que la
 * plupart des auteurs ne verront pas (revue-correction #7683 : la premiere
 * forme dupliquait le socle et liait les six, et le chunk du studio franchissait
 * son plafond).
 */
emit({
  ids: ['globe', 'users-three'],
  output: join(HERE, '../src/components/glyphs-story-audience.ts'),
  constant: 'STORY_AUDIENCE_GLYPHS',
  type: 'StoryAudienceGlyphName',
  role: "LE JEU DE LA PASTILLE D'AUDIENCE DU STUDIO (#7683) : les deux audiences choisissables que le socle ne porte pas, charge avec /stories/new et /posts/new.",
});

emit({
  ids: ['user-minus', 'user-check'],
  output: join(HERE, '../src/components/glyphs-story-audience-people.ts'),
  constant: 'STORY_AUDIENCE_PEOPLE_GLYPHS',
  type: 'StoryAudiencePeopleGlyphName',
  role: "LE JEU DE LA FEUILLE D'AUDIENCE (#7683) : les deux modes NOMINATIFS, charges avec la feuille a la demande, jamais avec le studio.",
});

/**
 * LE JEU D'ECRAN DE « MES STORIES » (#6149) — le listing que la pastille «
 * moi » du rail ouvre desormais. `eye` (Vues) et `fill-play` (Ouvrir) restent
 * au SOCLE, ou ils vivent deja (le fil et le lecteur les paient avant ce
 * chunk) : seul `trash` (Supprimer) est propre a cet ecran, comme il l'est
 * deja a la cloche (`glyphs-notifications.ts`) — deux jeux qui portent le
 * meme tracé plutot qu'un import croise qui lierait la cloche au listing.
 */
emit({
  ids: ['trash'],
  output: join(HERE, '../src/components/glyphs-stories-mine.ts'),
  constant: 'STORIES_MINE_GLYPHS',
  type: 'StoriesMineGlyphName',
  role: 'LE JEU DE « MES STORIES » (#6149) : le bouton Supprimer du listing, charge avec /stories/mine.',
});
