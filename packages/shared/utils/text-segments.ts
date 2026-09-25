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
 * `apps/web/decisions.md`). Écrite dans un client, elle serait recopiée
 * dans l'autre au premier lot de parité, et les deux copies diraient deux
 * choses différentes au second.
 *
 * ## Ce qu'elle ne fait PAS, délibérément
 *
 * Pas de Markdown complet. `apps/web/components/messages/MarkdownMessage.tsx`
 * empile `react-markdown` + `remark-gfm` + `rehype-raw` + une coloration
 * syntaxique + Mermaid ; le budget de première peinture de `apps/web-v2` est
 * de 90 Ko, gardé par `scripts/measure-weight.mjs`. Ce module ne coûte rien à
 * ce budget : ZÉRO dépendance, quelques expressions régulières.
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
import type { ContentTrackingLink } from '../types/post.js';
import { MENTION_HANDLE_CHARS, NAME_BOUNDARY_LEFT } from './mention-parser.js';

/** Un morceau de texte qui n'est pas de l'emphase — le seul contenu qu'une
 * emphase peut porter (voir `TextSegment`). */
export type InlineSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'mention'; readonly text: string; readonly username: string }
  | { readonly kind: 'hashtag'; readonly text: string; readonly tag: string }
  | { readonly kind: 'url'; readonly text: string; readonly href: string }
  /**
   * UN LIEN DE SUIVI (#7827) — il s'ouvre par `/l/<token>`, la route qui
   * compte le clic puis redirige. Deux origines, une seule forme :
   *
   *  - `m+<token>` écrit par la passerelle à la place d'un `[[url]]` / `<url>`
   *    — `url: null`, l'adresse d'origine n'est plus dans le texte ;
   *  - une URL BRUTE que `trackingLinks` associe à un token — `url` est
   *    l'adresse affichée, et `text` reste ce que l'auteur a écrit.
   *
   * Le token n'entre ici qu'après `isTrackingToken` : c'est ce qui borne ce
   * qu'un consommateur pose dans une adresse.
   */
  | { readonly kind: 'tracked-link'; readonly text: string; readonly token: string; readonly url: string | null };

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
  /**
   * Les URL BRUTES que la passerelle a rendues traçables
   * (`metadata.trackingLinks`, ou le champ hissé du socket) — voir
   * `trackingLinksOf` pour les décoder. Absent ⇒ aucune URL n'est suivie ;
   * `m+<token>` se reconnaît sans elles.
   */
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
};

/**
 * LA FORME D'UN TOKEN — jumelle de `mshyShortRegex` / `trackingLinkRegex`
 * (`services/gateway/src/services/TrackingLinkService.ts`), qui reconnaissent
 * les liens de suivi déjà posés : `[A-Za-z0-9_-]{2,50}`. Le dernier caractère
 * est alphanumérique, comme la frontière `\b` de la passerelle l'impose.
 */
const TRACKING_TOKEN_BODY = '[A-Za-z0-9_-]{1,49}[A-Za-z0-9]';
const TRACKING_TOKEN_REGEX = new RegExp(`^${TRACKING_TOKEN_BODY}$`);

/**
 * `m+<token>`, le lien court que la passerelle écrit (`buildShortLink`). Le
 * `m` est MINUSCULE et ne se colle à aucun mot (`am+abc` n'en est pas un) —
 * même frontière que `meeshyLinkRegex` côté iOS (`MessageTextRenderer.swift`).
 */
const SHORT_LINK_REGEX = new RegExp(`(?<![\\p{L}\\p{N}_+])m\\+(${TRACKING_TOKEN_BODY})(?![A-Za-z0-9_])`, 'gu');

export function isTrackingToken(value: string): boolean {
  return TRACKING_TOKEN_REGEX.test(value);
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const trackingLinkEntries = (value: unknown): readonly ContentTrackingLink[] =>
  Array.isArray(value)
    ? value.flatMap((entry: unknown) => {
        if (!isRecord(entry)) return [];
        const { url, token } = entry;
        if (typeof url !== 'string' || typeof token !== 'string') return [];
        if (!/^https?:\/\//.test(url) || !isTrackingToken(token)) return [];
        return [{ url, token }];
      })
    : [];

/**
 * **CE QUE LA PASSERELLE SERT, DÉCODÉ SANS JAMAIS LEVER** (#7827). Un message
 * ou une publication porte ses liens suivis à DEUX endroits selon le
 * transport : hissés en `trackingLinks` sur le socket (`message:new` n'embarque
 * pas `metadata`), rangés dans `metadata.trackingLinks` en REST. Le champ hissé
 * gagne quand il porte quelque chose ; toute entrée mal formée est écartée —
 * un lien perdu vaut mieux qu'un fil entier par terre.
 */
export function trackingLinksOf(carrier: {
  readonly trackingLinks?: unknown;
  readonly metadata?: unknown;
}): readonly ContentTrackingLink[] {
  const hoisted = trackingLinkEntries(carrier.trackingLinks);
  if (hoisted.length > 0) return hoisted;
  return isRecord(carrier.metadata) ? trackingLinkEntries(carrier.metadata.trackingLinks) : [];
}

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
 * **CE QUI FERME LA PHRASE N'APPARTIENT PAS À L'ADRESSE.** Tous ces caractères
 * sont des caractères d'URL VALIDES — la classe ci-dessus les accepte donc, et
 * les avalait : « regarde https://meeshy.me/notes. » produisait un lien vers
 * `…/notes.`, une adresse qui n'existe pas. Le lien AFFICHÉ et le lien SUIVI
 * cessaient d'être le même, sans que rien ne le dise à l'écran (loi 4).
 *
 * La liste est celle qui termine une phrase, jamais une adresse : une URL
 * réelle ne finit ni par un point, ni par une virgule, ni par un
 * point-virgule, ni par un deux-points, ni par un point d'exclamation ou
 * d'interrogation, ni par un guillemet.
 */
const URL_TAIL_PUNCTUATION = '.,;:!?\'"';

/**
 * LES FERMANTES SE TRAITENT PAR ÉQUILIBRE, JAMAIS PAR LISTE — c'est la
 * différence entre `(https://meeshy.me/a)`, où la parenthèse encadre le lien,
 * et `https://fr.wikipedia.org/wiki/Prisme_(optique)`, où elle EN FAIT PARTIE.
 * Compter les deux moitiés distingue les deux ; retirer tout `)` final
 * casserait la seconde au nom de la première.
 *
 * DEUX PAIRES, et deux seulement : ce sont les seules fermantes que
 * `URL_REGEX` peut capturer. L'accolade n'appartient pas à sa classe de
 * caractères — une entrée `'}'` ici serait une branche qu'aucun entrant ne
 * peut atteindre, c'est-à-dire un témoin qui ne peut pas tomber déguisé en
 * exhaustivité.
 */
const URL_CLOSERS: Readonly<Record<string, string>> = { ')': '(', ']': '[' };

const occurrences = (text: string, char: string): number => [...text].filter((c) => c === char).length;

const trimUrlTail = (url: string): string => {
  const last = url.at(-1);
  if (last === undefined) return url;
  if (URL_TAIL_PUNCTUATION.includes(last)) return trimUrlTail(url.slice(0, -1));
  const opener = URL_CLOSERS[last];
  if (opener !== undefined && occurrences(url, last) > occurrences(url, opener)) return trimUrlTail(url.slice(0, -1));
  return url;
};

/** Ce que l'ancrage de `URL_REGEX` garantit AVANT la taille, et qu'il faut
 * re-garantir APRÈS : rognée, une adresse peut se réduire à son seul schéma
 * (`https://.`), et `https://` seul n'est l'adresse de rien. */
const URL_HAS_AUTHORITY = /^https?:\/\/[^\s]/;

/**
 * LE TOKEN D'UNE URL BRUTE — cherché sur l'adresse AFFICHÉE puis sur chaque
 * forme plus longue jusqu'au match brut. La passerelle extrait les URL avec sa
 * propre expression (`processExplicitLinksInContent`), qui GARDE un point ou un
 * `?` final : `https://meeshy.me/notes.` y est la clé, `…/notes` ici le texte.
 * Même double essai que `resolvedLinkURL` côté iOS.
 */
const trackedTokenFor = (
  raw: string,
  shown: string,
  tokens: ReadonlyMap<string, string>,
): string | undefined =>
  Array.from({ length: raw.length - shown.length + 1 }, (_, extra) => raw.slice(0, shown.length + extra))
    .map((candidate) => tokens.get(candidate))
    .find((token) => token !== undefined);

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
    /* LA FIN EST CELLE DU SEGMENT, PAS CELLE DU MATCH. Les trois analyseurs
       posent dans `text` la tranche qu'ils CONSOMMENT (les frontières sont des
       lookarounds, de largeur nulle) — la longueur du match leur était donc
       égale jusqu'ici. Elle cesse de l'être dès qu'un analyseur rend MOINS que
       ce qu'il a matché : l'URL rognée de sa ponctuation finale doit laisser
       le point au texte qui suit, pas le faire disparaître. */
    return [{ start, end: start + segment.text.length, segment }];
  });

function inlineSegments(content: string, options: SegmentOptions): readonly InlineSegment[] {
  if (content === '') return [];

  const allowed = options.mentions === undefined ? null : new Set(options.mentions.map((m) => m.toLowerCase()));
  const trackedTokens = new Map(
    (options.trackingLinks ?? [])
      .filter((link) => isTrackingToken(link.token))
      .map((link) => [link.url, link.token] as const),
  );

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
    ...collect(content, URL_REGEX, (match) => {
      const url = trimUrlTail(match[0]);
      if (!URL_HAS_AUTHORITY.test(url)) return null;
      const token = trackedTokenFor(match[0], url, trackedTokens);
      return token === undefined
        ? { kind: 'url', text: url, href: url }
        : { kind: 'tracked-link', text: url, token, url };
    }),
    ...collect(content, SHORT_LINK_REGEX, (match) => {
      const token = match[1];
      return token === undefined ? null : { kind: 'tracked-link', text: match[0], token, url: null };
    }),
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
    // portant qu'un groupe : un `match[0]` non vide garantit qu'exactement UN
    // candidat a `inner` défini, jamais zéro — d'où le `!` non-null, justifié
    // par cet invariant plutôt qu'un `if` qui ne pourrait jamais rougir.
    const hit = EMPHASIS_RULES.map((rule, index) => ({ style: rule.style, inner: match[index + 1] })).find(
      (candidate): candidate is { readonly style: EmphasisStyle; readonly inner: string } =>
        candidate.inner !== undefined,
    )!;
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
