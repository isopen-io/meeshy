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
 * (globe), Copier (copy), Composer (magic-wand), Plus... (dots-three).
 * `magic-wand` et `globe` existent deja dans le jeu PROGRESSION : deux jeux
 * d'ecran distincts peuvent extraire le meme glyphe phosphor, chacun dans SON
 * module — ils ne se chargent jamais ensemble (le fil et /me/progression ne
 * sont pas la meme route), donc aucun octet n'est paye deux fois au meme
 * demarrage.
 */
const THREAD_MENU = ['check-circle', 'globe', 'copy', 'magic-wand', 'dots-three'];

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
const AUTH = ['envelope', 'magic-wand', 'arrow-clockwise'];

emit({
  ids: AUTH,
  output: join(HERE, '../src/components/glyphs-auth.ts'),
  constant: 'AUTH_GLYPHS',
  type: 'AuthGlyphName',
  role: "LE JEU D'ECRAN des routes d'authentification (#5816) : charge avec elles, jamais dans le socle.",
});

/**
 * LE JEU D'ECRAN DU TIROIR DU COMPOSEUR (#5668) — `stop` (le bouton
 * « Arreter et ajouter aux pieces jointes » de la barre d'enregistrement).
 * `image`, `file`, `microphone` et `x` (tuiles, aperçu, annuler) restent au
 * SOCLE : ils y sont deja pour d'autres usages (rangee du composeur, blocs de
 * message), les dupliquer ici paierait leurs octets deux fois. Charge avec le
 * chunk `composer-tray` (#5668, § 7 de la specification), jamais dans le
 * socle ni dans le chunk du fil : la barre d'enregistrement n'entre qu'au
 * premier tap sur le micro ou le "+".
 */
const COMPOSER = ['stop'];

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
