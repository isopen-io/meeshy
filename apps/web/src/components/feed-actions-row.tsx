import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { FeedCardStats, FeedCardViewer } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * `FeedActionsRow` (#6278, extrait de `feed-post-card.tsx` — CLAUDE.md §
 * budget de taille) — LA RANGÉE DES CINQ STATISTIQUES d'une carte du Flux.
 * Extraite SANS changement de comportement : le fichier d'origine dépassait
 * les 800 lignes du critère de fin de #6278, et cette rangée — types de
 * gestionnaires compris — en portait 157.
 */

export type GestureHandler = (postId: string, kind: PostToggleKind) => void;

export type ShareHandler = (postId: string) => void;

export type CommentHandler = (postId: string) => void;

export type RepostHandler = (postId: string) => void;

const GESTURE_OF_STAT: Partial<Record<keyof FeedCardStats, PostToggleKind>> = {
  likeCount: 'like',
  bookmarkCount: 'bookmark',
};

const FILLED_GLYPH: Partial<Record<keyof typeof FEED_GLYPHS, keyof typeof FEED_GLYPHS>> = {
  heart: 'heartFill',
  bookmark: 'bookmarkFill',
};

/* `as const satisfies` plutôt qu'une annotation `InterfaceCatalogKey` large
   (revue-correction #6488) : une clé de catalogue TYPÉE LARGE force
   `translate()` à exiger des paramètres pour CHAQUE clé possible du
   catalogue, y compris celles qui en portent — `as const` garde le type
   LITTÉRAL de chacune des cinq clés ci-dessous, aucune desquelles n'en prend. */
const STAT_ITEMS = [
  { key: 'likeCount', glyph: 'heart', labelKey: 'feed.post.action.like' },
  { key: 'commentCount', glyph: 'chatCircle', labelKey: 'feed.post.action.comment' },
  { key: 'repostCount', glyph: 'arrowsClockwise', labelKey: 'feed.post.action.repost' },
  { key: 'bookmarkCount', glyph: 'bookmark', labelKey: 'feed.post.action.bookmark' },
  { key: 'shareCount', glyph: 'shareNetwork', labelKey: 'feed.post.action.share' },
] as const satisfies readonly { readonly key: keyof FeedCardStats; readonly glyph: keyof typeof FEED_GLYPHS; readonly labelKey: InterfaceCatalogKey }[];

/**
 * La rangée des cinq statistiques — `tone` bascule l'encre entre la carte
 * (POST, en-dessous du média) et le scrim d'un RÉEL (blanc, sur le média).
 *
 * LE NOM ACCESSIBLE VIT SUR LE GLYPHE, PAS SUR L'ENVELOPPE (revue-correction
 * #5893) : un `aria-label` posé sur un `<span>` NU n'est jamais exposé — un
 * élément de rôle `generic` n'admet pas de nom accessible (ARIA 1.2, § name
 * from author prohibited). La première forme nommait l'enveloppe et masquait
 * le compte (`aria-hidden`) : les cinq chiffres étaient donc INAUDIBLES, la
 * rangée entière absente de l'arbre. `GlyphSvg` porte déjà le contrat
 * (`title` ⇒ `role="img" aria-label`), et le compte redevient du TEXTE lu —
 * « Aimer 14 », comme iOS l'énonce (`feed.post.a11y.like`).
 */
export function FeedActionsRow({
  postId,
  stats,
  viewer,
  tone,
  onGesture,
  onShare,
  onComment,
  onRepost,
}: {
  readonly postId: string;
  readonly stats: FeedCardStats;
  readonly viewer: FeedCardViewer;
  readonly tone: 'onLight' | 'onDark';
  readonly onGesture?: GestureHandler;
  readonly onShare?: ShareHandler;
  readonly onComment?: CommentHandler;
  readonly onRepost?: RepostHandler;
}) {
  const ink = tone === 'onDark' ? 'rgba(255,255,255,0.92)' : 'var(--color-ios-ink-2)';
  const language = currentInterfaceLanguage();
  return (
    <div className="flex items-center justify-between" data-feed-actions>
      {STAT_ITEMS.map((item) => {
        const label = translate(language, item.labelKey);
        /* « Partager » est un geste PONCTUEL, pas une bascule : un bouton
           simple, sans `aria-pressed` — et seulement si l'hôte sait partager. */
        if (item.key === 'shareCount' && onShare !== undefined) {
          return (
            <button
              key={item.key}
              type="button"
              data-feed-gesture="share"
              onClick={() => onShare(postId)}
              className="flex items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: ink, minHeight: 44, minWidth: 44, outlineColor: 'var(--color-ios-brand)' }}
            >
              <GlyphSvg glyph={FEED_GLYPHS[item.glyph]} size={19} title={label} />
              <span className="text-check font-medium">{stats[item.key]}</span>
            </button>
          );
        }
        /* COMMENTER — un geste PONCTUEL comme « Partager » : il CONDUIT au
           fil, il ne bascule rien. Pas d'`aria-pressed` : un état enfoncé
           annoncerait une opinion que commenter n'exprime pas. */
        if (item.key === 'commentCount' && onComment !== undefined) {
          return (
            <button
              key={item.key}
              type="button"
              data-feed-gesture="comment"
              onClick={() => onComment(postId)}
              className="flex items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: ink, minHeight: 44, minWidth: 44, outlineColor: 'var(--color-ios-brand)' }}
            >
              <GlyphSvg glyph={FEED_GLYPHS[item.glyph]} size={19} title={label} />
              <span className="text-check font-medium">{stats[item.key]}</span>
            </button>
          );
        }
        /* REPARTAGER — APPEND-ONLY (#6278) : `aria-pressed` annonce, le clic
           ne défait jamais (`onGesture` reste réservé aux DEUX bascules). */
        if (item.key === 'repostCount' && onRepost !== undefined) {
          const pressed = viewer.reposted;
          return (
            <button
              key={item.key}
              type="button"
              data-feed-gesture="repost"
              aria-pressed={pressed}
              onClick={() => onRepost(postId)}
              className="flex items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: pressed ? 'var(--color-ok)' : ink, minHeight: 44, minWidth: 44, outlineColor: 'var(--color-ios-brand)' }}
            >
              <GlyphSvg glyph={FEED_GLYPHS[item.glyph]} size={19} title={label} />
              <span className="text-check font-medium">{stats[item.key]}</span>
            </button>
          );
        }
        const kind = GESTURE_OF_STAT[item.key];
        if (kind === undefined || onGesture === undefined) {
          return (
            <span key={item.key} className="flex items-center gap-1.5" style={{ color: ink, minHeight: 44 }}>
              <GlyphSvg glyph={FEED_GLYPHS[item.glyph]} size={19} title={label} />
              <span className="text-check font-medium">{stats[item.key]}</span>
            </span>
          );
        }
        const pressed = kind === 'like' ? viewer.liked : viewer.bookmarked;
        /* Le cœur aimé se peint dans la couleur d'erreur, le signet dans la
           marque (sur un réel, en blanc) — miroir `FeedPostCard.swift:946`,
           rouge seulement quand LE LECTEUR a aimé. */
        const pressedInk = kind === 'like' ? 'var(--color-error)' : tone === 'onDark' ? 'white' : 'var(--color-ios-brand)';
        return (
          <button
            key={item.key}
            type="button"
            data-feed-gesture={kind}
            aria-pressed={pressed}
            onClick={() => onGesture(postId, kind)}
            className="flex items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: pressed ? pressedInk : ink, minHeight: 44, minWidth: 44, outlineColor: 'var(--color-ios-brand)' }}
          >
            <span className="grid place-items-center" {...(pressed ? { 'data-feed-glyph-filled': '' } : {})}>
              <GlyphSvg glyph={FEED_GLYPHS[pressed ? (FILLED_GLYPH[item.glyph] ?? item.glyph) : item.glyph]} size={19} title={label} />
            </span>
            <span className="text-check font-medium">{stats[item.key]}</span>
          </button>
        );
      })}
    </div>
  );
}
