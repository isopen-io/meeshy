/**
 * **LE DÉCOUPAGE D'UN TEXTE ÉCRIT PAR QUELQU'UN** (#7032) — la loi partagée
 * qui dit où sont les liens, les mentions, les hashtags et l'emphase dans un
 * contenu utilisateur. Elle rend des SEGMENTS ; elle ne rend pas de HTML, et
 * c'est ce qui la met hors de portée de toute injection : aucun consommateur
 * n'a de chaîne à interpréter, donc aucun n'a de `dangerouslySetInnerHTML` à
 * écrire.
 *
 * ## Pourquoi ici, et pas dans un client
 *
 * Deux consommateurs TypeScript existent déjà — `apps/web` (legacy,
 * `components/v2/PostContentText.tsx`) et `apps/web-v2` — et c'est le critère
 * du dépôt pour qu'une loi monte dans `packages/shared` (D-24 de
 * `apps/web-v2/decisions.md`). Écrite dans un client, elle serait recopiée
 * dans l'autre au premier lot de parité, et les deux copies diraient deux
 * choses différentes au second.
 *
 * ## Ce qu'elle ne fait PAS, délibérément
 *
 * Pas de Markdown complet. `apps/web/components/messages/MarkdownMessage.tsx`
 * empile `react-markdown` + `remark-gfm` + `rehype-raw` + une coloration
 * syntaxique + Mermaid ; le budget de première peinture de `apps/web-v2` est
 * de 90 Ko, gardé par `scripts/measure-weight.mjs`. Ce module ne coûte rien à
 * ce budget : ZÉRO dépendance, quatre expressions régulières.
 *
 * ## Les classes de caractères sont DÉRIVÉES, jamais recopiées
 *
 * `MENTION_HANDLE_CHARS` et `NAME_BOUNDARY_LEFT` viennent de
 * `mention-parser.ts`, qui interdit explicitement le drift dans ses propres
 * doc-comments : ce que le serveur RÉSOUT (`parseMentions`) et ce que ce
 * module SOULIGNE doivent être le même jeu, sinon on souligne un handle que
 * personne ne notifiera jamais.
 *
 * ## Le hashtag est une OPTION, `false` par défaut
 *
 * Mesuré : aucune jointure message ↔ hashtag n'existe dans `schema.prisma`
 * (`PostHashtag` relie un hashtag à un POST, jamais à un `Message`), et aucune
 * route serveur ne sert les messages d'un hashtag. Un `#projet` cliquable dans
 * une conversation serait donc un contrôle qui promet un écran inexistant
 * (loi 4). L'appelant DÉCLARE : `false` en conversation, `true` en
 * publication.
 */

/* `.js` EXPLICITE — la convention ESM du paquet (`esm-relative-imports.test.ts`
   la garde) : sans elle, le `dist` construit échoue à la RÉSOLUTION au
   démarrage, et aucun témoin de comportement ne le voit. */
import { MENTION_HANDLE_CHARS, NAME_BOUNDARY_LEFT } from './mention-parser.js';

/** Un morceau de texte qui n'est pas de l'emphase — le seul contenu qu'une
 * emphase peut porter (voir `TextSegment`). */
export type InlineSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'mention'; readonly text: string; readonly username: string }
  | { readonly kind: 'hashtag'; readonly text: string; readonly tag: string }
  | { readonly kind: 'url'; readonly text: string; readonly href: string };

/**
 * LES QUATRE EMPHASES, et quatre seulement (directive porteur) : gras,
 * italique, souligné, barré. La liste est FERMÉE — c'est ce qui permet au
 * rendu d'être exhaustif sans repli silencieux, et ce qui distingue ce module
 * d'un moteur Markdown (ni titre, ni liste, ni citation, ni code).
 */
export type EmphasisStyle = 'bold' | 'italic' | 'underline' | 'strikethrough';

/**
 * Une emphase porte ses PROPRES segments (`children`), jamais une chaîne :
 * `**vois https://meeshy.me**` doit rester un lien une fois en gras. Elle ne
 * s'imbrique pas dans une emphase — un seul niveau, donc aucune récursion sans
 * fin à borner, et `*b*` à l'intérieur d'un `**…**` reste ce que l'auteur a
 * tapé.
 */
export type TextSegment =
  | InlineSegment
  | { readonly kind: 'emphasis'; readonly style: EmphasisStyle; readonly children: readonly InlineSegment[] };

export type SegmentOptions = {
  /** `true` en PUBLICATION seulement — voir le doc-comment de tête. */
  readonly hashtags?: boolean;
  /**
   * Le jeu de pseudos que le SERVEUR a validés (`Message.validatedMentions`,
   * `Post.mentions[].username`), en minuscules ou non — la comparaison est
   * insensible à la casse, sans quoi `@Alice` ne deviendrait jamais un lien.
   *
   * `undefined` (le serveur ne s'est pas prononcé) souligne TOUT handle : ne
   * plus rien souligner serait une régression visible. `[]` ne souligne RIEN —
   * le serveur s'est prononcé, et il dit qu'il n'y en a aucune.
   */
  readonly mentions?: readonly string[] | undefined;
};

/**
 * `NAME_BOUNDARY_LEFT` écarte les adresses e-mail (`contact@marie.com`), y
 * compris après une lettre accentuée. Le handle est capturé en ASCII
 * (`MENTION_HANDLE_CHARS`), comme la résolution par username de
 * `parseMentions` : un username est toujours ASCII.
 */
const MENTION_REGEX = new RegExp(`${NAME_BOUNDARY_LEFT}@([${MENTION_HANDLE_CHARS}]{1,30})`, 'gu');

/**
 * JUMELLE de `HashtagService.HASHTAG_REGEX` (`services/gateway/src/services/
 * HashtagService.ts:20`), le service qui ÉCRIT les lignes `PostHashtag` : ce
 * qui se souligne ici doit être exactement ce qui a été indexé là-bas. Le `/`
 * dans la frontière gauche est ce qui empêche l'ancre d'une URL
 * (`…/page#section`) d'être lue comme un hashtag.
 */
const HASHTAG_REGEX = /(?<![\p{L}\p{N}_/])#([\p{L}\p{N}_]{1,50})/gu;

/**
 * **ANCRÉE SUR `https?://`** — c'est la garde, et elle est structurelle : un
 * `javascript:`, un `data:` ou un `file:` ne peut pas matcher, donc aucun
 * `href` produit par ce module ne peut porter un autre schéma. Filtrer après
 * coup aurait laissé la question ouverte à chaque nouvelle forme hostile.
 */
const URL_REGEX = /(?<![@\w])https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g;

/**
 * **LES QUATRE MARQUEURS, DANS L'ORDRE OÙ ILS SONT ESSAYÉS.** L'alternation
 * est ordonnée, et le gras DOIT précéder l'italique : à une position portant
 * `**`, c'est la paire qui doit gagner sur l'étoile seule.
 *
 * Trois refus communs aux quatre : une emphase qui s'ouvre sur un blanc
 * (`3 * 4`), une emphase qui se ferme sur un blanc, une emphase VIDE
 * (`****`, `____`, `~~~~`). Et le corps d'un marqueur DOUBLE accepte le
 * caractère seul (`**a *b* c**`) mais jamais la paire : c'est ce qui donne à
 * une emphase interne son statut de texte littéral — un seul niveau, donc
 * aucune récursion à borner.
 *
 * ## Pourquoi le souligné porte une FRONTIÈRE DE MOT que le gras n'a pas
 *
 * `*` et `~` n'apparaissent jamais au milieu d'un mot ; `_` si — c'est le
 * piège que le porteur a nommé. `snake_case` n'a qu'UN tiret bas et reste donc
 * hors de portée d'un marqueur double, mais `chemin__long__ici` et surtout
 * **une URL** (`https://meeshy.me/a__b__c`, l'emphase étant découpée AVANT les
 * liens) seraient coupés sans garde. Les deux lookarounds
 * `(?<![\p{L}\p{N}_])` / `(?![\p{L}\p{N}_])` sont cette garde : un `__` collé
 * à un caractère de mot n'ouvre ni ne ferme rien. C'est aussi la règle de
 * CommonMark pour `_`, et donc ce qu'un auteur habitué attend.
 *
 * Chaque motif porte EXACTEMENT un groupe capturant — tout le reste est
 * `(?:…)` ou lookaround. C'est l'invariant qui autorise l'indexation
 * `rule i → match[i + 1]` ci-dessous ; l'enfreindre décalerait tous les styles
 * en silence.
 */
const EMPHASIS_RULES = [
  { style: 'bold', source: String.raw`\*\*(?!\s)((?:[^*]|\*(?!\*))+?)(?<!\s)\*\*` },
  { style: 'underline', source: String.raw`(?<![\p{L}\p{N}_])__(?!\s)((?:[^_]|_(?!_))+?)(?<!\s)__(?![\p{L}\p{N}_])` },
  { style: 'strikethrough', source: String.raw`~~(?!\s)((?:[^~]|~(?!~))+?)(?<!\s)~~` },
  { style: 'italic', source: String.raw`\*(?!\s)([^*\s][^*]*?)(?<!\s)\*` },
] as const satisfies readonly { readonly style: EmphasisStyle; readonly source: string }[];

const EMPHASIS_REGEX = new RegExp(EMPHASIS_RULES.map((rule) => rule.source).join('|'), 'gu');

type RawMatch = { readonly start: number; readonly end: number; readonly segment: InlineSegment };

const collect = (
  content: string,
  regex: RegExp,
  build: (match: RegExpExecArray | RegExpMatchArray) => InlineSegment | null,
): readonly RawMatch[] =>
  [...content.matchAll(regex)].flatMap((match) => {
    const segment = build(match);
    const start = match.index;
    if (segment === null || start === undefined) return [];
    return [{ start, end: start + match[0].length, segment }];
  });

function inlineSegments(content: string, options: SegmentOptions): readonly InlineSegment[] {
  if (content === '') return [];

  const allowed = options.mentions === undefined ? null : new Set(options.mentions.map((m) => m.toLowerCase()));

  const matches = [
    ...collect(content, MENTION_REGEX, (match) => {
      const handle = match[1];
      if (handle === undefined) return null;
      const username = handle.toLowerCase();
      // Un handle que le serveur n'a PAS validé n'est pas un match du tout —
      // pas un segment « mention inerte » : le texte autour doit rester d'un
      // seul tenant, sinon `@inconnue` couperait sa phrase en trois.
      if (allowed !== null && !allowed.has(username)) return null;
      return { kind: 'mention', text: match[0], username };
    }),
    ...(options.hashtags === true
      ? collect(content, HASHTAG_REGEX, (match) => {
          const tag = match[1];
          return tag === undefined ? null : { kind: 'hashtag', text: match[0], tag: tag.toLowerCase() };
        })
      : []),
    ...collect(content, URL_REGEX, (match) => ({ kind: 'url', text: match[0], href: match[0] })),
  ].sort((a, b) => a.start - b.start);

  const segments: InlineSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    // Chevauchement : le premier par position d'ouverture gagne. C'est ce qui
    // garde un `@handle` ou un `#ancre` À L'INTÉRIEUR d'une URL dans l'URL.
    if (match.start < cursor) continue;
    if (match.start > cursor) segments.push({ kind: 'text', text: content.slice(cursor, match.start) });
    segments.push(match.segment);
    cursor = match.end;
  }
  if (cursor < content.length) segments.push({ kind: 'text', text: content.slice(cursor) });
  return segments;
}

/**
 * Découpe `content`. Le résultat COUVRE le texte d'origine — seules les
 * étoiles d'emphase disparaissent, parce qu'elles sont la notation et non le
 * propos.
 */
export function segmentText(content: string, options: SegmentOptions = {}): readonly TextSegment[] {
  if (content === '') return [];

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of content.matchAll(EMPHASIS_REGEX)) {
    const start = match.index;
    if (start === undefined) continue;
    // La règle qui a matché est celle dont le groupe est défini — un seul
    // l'est par match, l'alternation étant exclusive et chaque motif ne
    // portant qu'un groupe.
    const hit = EMPHASIS_RULES.map((rule, index) => ({ style: rule.style, inner: match[index + 1] })).find(
      (candidate) => candidate.inner !== undefined,
    );
    if (hit?.inner === undefined) continue;
    if (start > cursor) segments.push(...inlineSegments(content.slice(cursor, start), options));
    segments.push({ kind: 'emphasis', style: hit.style, children: inlineSegments(hit.inner, options) });
    cursor = start + match[0].length;
  }
  if (cursor < content.length) segments.push(...inlineSegments(content.slice(cursor), options));
  return segments;
}

/**
 * Y A-T-IL QUOI QUE CE SOIT À ENRICHIR ? — la question que se pose une surface
 * avant de monter un rendu par segments plutôt qu'un simple nœud de texte.
 * Elle existe pour que le chemin nominal (l'immense majorité des messages) ne
 * paie ni tableau ni composant de plus.
 */
export function hasRichText(content: string, options: SegmentOptions = {}): boolean {
  const segments = segmentText(content, options);
  return segments.some((segment) => segment.kind !== 'text');
}
