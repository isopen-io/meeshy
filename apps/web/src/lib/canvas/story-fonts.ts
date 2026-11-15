/**
 * **LES TREIZE FAMILLES QUE LA POLICE SYSTÈME NE SAIT PAS RENDRE** (#6951) —
 * la table qui donne un CORPS web aux familles typographiques d'iOS que
 * `StoryTextStyle.swift` sert par une police EMBARQUÉE dans l'application.
 *
 * ## CE QUE LE WEB PEUT ET NE PEUT PAS
 *
 * L'arbitrage de #6943 (D-84) laissait ces treize familles sur la police
 * système, faute de budget. Le budget n'était PAS le seul obstacle, et c'est
 * la mesure de ce lot : **les treize polices d'iOS sont toutes
 * PROPRIÉTAIRES** — Zapfino et Snell Roundhand (Linotype), Papyrus, Marker
 * Felt, American Typewriter et Bradley Hand (ITC/Letraset), Didot, Futura,
 * Avenir Next et Arial Rounded (Monotype/Linotype), Chalkboard SE et
 * Noteworthy (Apple), Savoye LET (Letraset). Aucune ne peut être REDISTRIBUÉE
 * par un serveur web, quel que soit le budget qu'on lui accorde.
 *
 * Ce module sert donc, pour chacune, **un substitut redistribuable de même
 * CARACTÈRE** (OFL 1.1 ou Apache 2.0), sous-ensemblé au latin. Ce n'est pas
 * la police d'iOS ; c'est sa famille. L'auteur qui écrit en `calligraphy`
 * voulait une calligraphie, et le web en rend une — là où il ne rendait,
 * jusqu'ici, rien du tout.
 *
 * > **Un substitut n'est pas un faux-semblant.** Le faux-semblant que le lot
 * > précédent refusait, à raison, c'est le REPLI GÉNÉRIQUE : écrire `serif`
 * > ou `cursive` derrière une famille absente fait croire au lecteur que le
 * > fichier a chargé. Derrière chaque famille d'ici vient la pile NATIVE et
 * > elle seule (`storyFontStack`) : si le WOFF2 n'arrive pas, le texte est
 * > peint par la police du système, exactement comme avant ce lot.
 *
 * ## CE QUE CHAQUE FAMILLE COÛTE, ET QUAND
 *
 * `bytes` est le poids RÉEL du fichier, et la table le DÉCLARE : un témoin
 * compare la déclaration au fichier (`story-fonts.test.ts`), et `budgets.json`
 * borne la somme dans le `dist/`. Un WOFF2 est déjà compressé (Brotli) — le
 * regzipper l'ALOURDIT, c'est pourquoi le gate de poids le mesure en octets
 * BRUTS là où il mesure les modules en gzip -9.
 *
 * Aucun de ces octets n'entre dans la première peinture, ni même dans le
 * chunk d'un écran : une `@font-face` ne coûte que ses lignes de CSS tant
 * qu'aucun caractère de son `unicode-range` n'est peint. Un lecteur qui ouvre
 * une story sans texte stylé ne télécharge RIEN ; celui qui en ouvre une en
 * `handwriting` paie 22 Ko, une fois.
 *
 * ## LES SEPT LANGUES, DITES FRANCHEMENT
 *
 * Le sous-ensemble servi est `latin` (U+0000-00FF et ses voisins de
 * ponctuation) : il couvre le français, l'anglais, l'espagnol, le portugais,
 * l'allemand et l'italien. **Aucun de ces treize substituts ne dessine
 * l'arabe** — les polices d'iOS non plus, du reste. Un texte arabe est donc
 * peint par la police système, et l'`unicode-range` garantit qu'il ne
 * télécharge même pas le fichier.
 */

export type StoryFontFamily = {
  /** Le nom PostScript de la police EMBARQUÉE iOS que cette famille remplace
   * (`StoryTextStyle.fontName`, `packages/MeeshySDK/…/Story/StoryTextStyle.swift`). */
  readonly ios: string;
  /** La famille CSS que `story-fonts.css` déclare. */
  readonly css: string;
  /** La graisse que le FICHIER porte — jamais celle qu'on voudrait : déclarer
   * 700 sur un fichier de 400 fait graisser le glyphe par le navigateur. */
  readonly weight: number;
  /** Le WOFF2, sous `src/styles/fonts/`. */
  readonly file: string;
  /** Le poids RÉEL du fichier, en octets. Le cliquet de la source. */
  readonly bytes: number;
  /** La licence qui autorise la redistribution. */
  readonly licence: 'OFL-1.1' | 'Apache-2.0';
};

/** L'ordre est celui de `StoryTextStyle.allCases` réduit aux familles qui
 * exigent un fichier — donc l'ordre des pickers, côté iOS comme ici. */
export const STORY_FONT_STYLES = [
  'handwriting',
  'calligraphy',
  'cartoon',
  'futuristic',
  'fantasy',
  'curve',
  'tag',
  'retro',
  'elegant',
  'poster',
  'bubble',
  'note',
  'brush',
] as const;

export type StoryFontStyle = (typeof STORY_FONT_STYLES)[number];

export const STORY_FONT_FAMILIES: Readonly<Record<StoryFontStyle, StoryFontFamily>> = {
  handwriting: { ios: 'SnellRoundhand', css: 'Parisienne', weight: 400, file: 'parisienne-latin.woff2', bytes: 22332, licence: 'OFL-1.1' },
  calligraphy: { ios: 'Zapfino', css: 'Italianno', weight: 400, file: 'italianno-latin.woff2', bytes: 25292, licence: 'OFL-1.1' },
  cartoon: { ios: 'ChalkboardSE-Bold', css: 'Comic Neue', weight: 700, file: 'comic-neue-700-latin.woff2', bytes: 12800, licence: 'OFL-1.1' },
  futuristic: { ios: 'Futura-CondensedExtraBold', css: 'Saira Condensed', weight: 800, file: 'saira-condensed-800-latin.woff2', bytes: 12060, licence: 'OFL-1.1' },
  fantasy: { ios: 'Papyrus', css: 'Metamorphous', weight: 400, file: 'metamorphous-latin.woff2', bytes: 13876, licence: 'OFL-1.1' },
  curve: { ios: 'SavoyeLetPlain', css: 'Tangerine', weight: 400, file: 'tangerine-latin.woff2', bytes: 16248, licence: 'Apache-2.0' },
  tag: { ios: 'MarkerFelt-Wide', css: 'Permanent Marker', weight: 400, file: 'permanent-marker-latin.woff2', bytes: 29296, licence: 'Apache-2.0' },
  retro: { ios: 'AmericanTypewriter', css: 'Cutive', weight: 400, file: 'cutive-latin.woff2', bytes: 15332, licence: 'OFL-1.1' },
  elegant: { ios: 'Didot', css: 'Prata', weight: 400, file: 'prata-latin.woff2', bytes: 11916, licence: 'OFL-1.1' },
  poster: { ios: 'AvenirNextCondensed-Heavy', css: 'Anton', weight: 400, file: 'anton-latin.woff2', bytes: 12004, licence: 'OFL-1.1' },
  bubble: { ios: 'ArialRoundedMTBold', css: 'Fredoka', weight: 600, file: 'fredoka-600-latin.woff2', bytes: 16464, licence: 'OFL-1.1' },
  note: { ios: 'Noteworthy-Bold', css: 'Patrick Hand', weight: 400, file: 'patrick-hand-latin.woff2', bytes: 14224, licence: 'OFL-1.1' },
  brush: { ios: 'BradleyHandITCTT-Bold', css: 'Caveat', weight: 700, file: 'caveat-700-latin.woff2', bytes: 51068, licence: 'OFL-1.1' },
};

/**
 * LA PILE D'UNE FAMILLE — son substitut, puis la police NATIVE, et rien
 * d'autre. Pas de `cursive`, pas de `fantasy`, pas de `serif` : un générique
 * rendrait une police d'allure voisine et ferait croire que le fichier a
 * chargé. Le contrat est celui de la règle 1 du Prisme, transposé à la
 * typographie — à défaut de la bonne famille, on sert l'original.
 */
export function storyFontStack(style: StoryFontStyle): string {
  return `'${STORY_FONT_FAMILIES[style].css}', var(--font-native)`;
}

/** La somme des treize fichiers — ce que `budgets.json › story_fonts` borne
 * dans le `dist/`, et qu'aucun lecteur ne paie en entier. */
export const STORY_FONTS_TOTAL_BYTES = STORY_FONT_STYLES.reduce(
  (total, style) => total + STORY_FONT_FAMILIES[style].bytes,
  0,
);
