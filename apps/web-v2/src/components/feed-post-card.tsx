import { useState } from 'react';

import { Avatar } from './avatar';
import { FeedMediaMosaic } from './feed-media-mosaic';
import { FeedMediaSurface } from './feed-media-surface';
import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { FeedCardMedia, FeedCardModel, FeedCardStats, FeedCardText, FeedCardViewer } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { isPagedLayout } from '@/lib/feed/mosaic-layout';
import { FEED_TEXT_TRUNCATION_LIMIT, truncateWords } from '@/lib/feed/text';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

/**
 * `FeedPostCard` (#5893) — la carte de publication du fil, DEUX FORMES,
 * miroir § 1.2 de la spécification : `FeedPostCard.swift` (le POST — en-tête
 * AU-DESSUS du média) et `ReelFeedCard.swift` (le RÉEL — plein cadre,
 * identité et actions POSÉES SUR le média, scrim bas). `model.isReel` est le
 * SEUL aiguillage — `resolveFeedCardModel` (`lib/feed/card-model.ts`) a déjà
 * tranché tout le reste (Prisme, accent, géométrie).
 *
 * LES GESTES QUI ÉCRIVENT (#6278) : « Aimer » et « Enregistrer » sont des
 * boutons à bascule DÈS QU'UN HÔTE porte `onGesture` — la carte ne tient
 * aucun état de geste, elle peint `model.viewer` (le cache du fil) et remet
 * l'intention. Sans hôte, ou pour commenter/repartager/partager qui n'ont
 * pas encore d'effet, la statistique reste un `<span>` : un bouton sans effet
 * mentirait (loi 4).
 */

type GestureHandler = (postId: string, kind: PostToggleKind) => void;

type ShareHandler = (postId: string) => void;

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
function FeedActionsRow({
  postId,
  stats,
  viewer,
  tone,
  onGesture,
  onShare,
}: {
  readonly postId: string;
  readonly stats: FeedCardStats;
  readonly viewer: FeedCardViewer;
  readonly tone: 'onLight' | 'onDark';
  readonly onGesture?: GestureHandler;
  readonly onShare?: ShareHandler;
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

/**
 * LE CARROUSEL — vue 3f de la planche : « un lot de médias se PARCOURT, il
 * ne se contemple pas ». L'index de page vit ICI (`useState`), jamais dans
 * `FeedPostCard`, pour ne pas invalider toute la carte à chaque page
 * (`FeedPostCardCarousel.swift:20-25`).
 */
function FeedMediaCarousel({ media }: { readonly media: readonly FeedCardMedia[] }) {
  const [page, setPage] = useState(0);
  const clamped = Math.min(page, media.length - 1);
  const current = media[clamped];
  const language = currentInterfaceLanguage();
  if (current === undefined) return null;

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 12, aspectRatio: `1 / ${current.ratio}` }} data-feed-media data-feed-layout="carousel">
      <FeedMediaSurface media={current} playable />
      {current.caption !== undefined ? (
        <p
          className="absolute inset-x-0 bottom-0 px-3 py-2 text-check text-white"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
          /* La langue SERVIE (#6280, `resolveMediaCaption`), jamais la
             langue d'interface : un lecteur d'écran qui prononce une
             traduction française avec une voix anglaise est le défaut du
             cycle 122 (CLAUDE.md § Prisme), rendu audible sur une légende. */
          {...(current.captionLanguage !== undefined ? { lang: current.captionLanguage } : {})}
        >
          {current.caption}
        </p>
      ) : null}
      {media.length > 1 ? (
        <>
          <span
            data-feed-media-counter
            className="absolute top-2 right-2 rounded-chip px-2 py-0.5 text-check font-semibold text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {clamped + 1} / {media.length}
          </span>
          {clamped > 0 ? (
            <button
              type="button"
              aria-label={translate(language, 'feed.post.media.previous')}
              onClick={() => setPage(clamped - 1)}
              className="absolute inset-y-0 left-0 grid place-items-center"
              style={{ width: 44 }}
            >
              <Glyph name="caretLeft" size={18} style={{ color: 'white' }} />
            </button>
          ) : null}
          {clamped < media.length - 1 ? (
            <button
              type="button"
              aria-label={translate(language, 'feed.post.media.next')}
              onClick={() => setPage(clamped + 1)}
              className="absolute inset-y-0 right-0 grid place-items-center"
              style={{ width: 44 }}
            >
              <GlyphSvg glyph={FEED_GLYPHS.caretRight} size={18} style={{ color: 'white' }} />
            </button>
          ) : null}
          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1" aria-hidden="true">
            {media.map((m, i) => (
              <span
                key={m.id}
                className="rounded-full"
                style={{ width: 5, height: 5, backgroundColor: i === clamped ? 'white' : 'rgba(255,255,255,0.5)' }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FeedPostHeader({ model }: { readonly model: FeedCardModel }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-3">
      <Avatar initials={model.author.initials} color={model.author.accentColor} size={40} name={model.author.name} {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})} />
      <div className="flex min-w-0 flex-col">
        {/* L'HEURE QUALIFIE L'AUTEUR — même ligne, miroir
            `FeedPostCard+Header.swift:51-60`. */}
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {model.author.name}
          </span>
          <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            {model.relativeTime}
          </span>
        </div>
        {model.repostOfHandle !== undefined ? (
          <span className="text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            ↻ @{model.repostOfHandle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Le texte d'un POST — tronqué à 20 mots avec « voir plus »/« voir moins »
 * (`truncateWords`, `lib/feed/text.ts`) ; `lang` porte la langue SERVIE. */
function FeedPostText({ text }: { readonly text: FeedCardText }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = truncateWords(text.full, FEED_TEXT_TRUNCATION_LIMIT);
  const shown = !truncated.truncated || expanded ? text.full : truncated.text;
  const language = currentInterfaceLanguage();

  return (
    <div className="px-3">
      <p
        className="whitespace-pre-wrap text-bubble"
        {...(text.language !== '' ? { lang: text.language } : {})}
        style={{ color: 'var(--color-ios-ink)' }}
      >
        {shown}
      </p>
      {truncated.truncated ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          /* CIBLE 44 (charte du chantier, et convention de TOUT le dépôt —
             `attachment-blocks.tsx:264` pose le même 44 sur une bascule de
             texte en ligne). La première forme reprenait les 24 pt d'iOS,
             qui n'a pas la même loi de cible : 24 px est le PLANCHER de
             WCAG 2.5.8, pas la règle d'ici (revue-correction #5893). */
          className="pb-1.5 text-left text-check font-semibold"
          style={{ color: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {translate(language, expanded ? 'feed.post.see_less' : 'feed.post.see_more')}
        </button>
      ) : null}
    </div>
  );
}

/** Le RÉEL — plein cadre, identité et actions SUR le média, scrim bas (miroir
 * `ReelFeedCard.swift`). Rendu en AFFICHE IMMOBILE : la lecture reste hors
 * tranche (D-42), le média est son propre repli (poster/placeholder). */
type CardHosts = { readonly onGesture?: GestureHandler; readonly onShare?: ShareHandler };

/** Les hôtes optionnels passent tels quels — `exactOptionalPropertyTypes`
 * refuse de poser une clé optionnelle à `undefined`. */
const hostsOf = ({ onGesture, onShare }: CardHosts): CardHosts => ({
  ...(onGesture !== undefined ? { onGesture } : {}),
  ...(onShare !== undefined ? { onShare } : {}),
});

function FeedReelCard({ model, ...hosts }: { readonly model: FeedCardModel } & CardHosts) {
  const poster = model.media[0];
  const ratio = poster?.ratio ?? 1.25;
  const language = currentInterfaceLanguage();

  return (
    <div
      role="group"
      aria-label={translate(language, 'feed.post.reel.of', { author: model.author.name })}
      className="relative overflow-hidden"
      style={{ borderRadius: 18, aspectRatio: `1 / ${ratio}` }}
      data-feed-card="reel"
    >
      {poster !== undefined ? (
        <FeedMediaSurface media={poster} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      )}
      {/* TOUCHER LE RÉEL L'OUVRE (#6457) — miroir `ReelFeedCard.onTapMedia` ⇒
          `ReelsPresenter.present(posts:startId:)`. Le lien couvre la carte
          SOUS tout le reste : le voile, la puce et l'identité le laissent
          passer (`pointer-events-none`), seule la rangée des gestes le
          recouvre. `draggable={false}` : le glisser natif d'une ancre volerait
          le défilement du fil. */}
      <Link
        to="reels"
        search={{ seed: model.id }}
        aria-label={translate(language, 'reels.open', { author: model.author.name })}
        draggable={false}
        data-feed-reel-open
        className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4"
        style={{ borderRadius: 18, outlineColor: 'white' }}
      >
        {null}
      </Link>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 55%)' }} aria-hidden="true" />
      {/* LA PUCE « RÉEL » (§ 1.5 de la spécification, manquante à la première
          forme) — la carte est rendue en AFFICHE IMMOBILE, et un réel dont la
          pièce de tête est une IMAGE (la moitié du corpus de recette de
          staging) ne se distingue alors d'un post par RIEN d'autre que son
          cadrage. La puce nomme le médium tant que la lecture reste hors
          tranche (D-42). */}
      <span
        data-feed-reel-chip
        className="pointer-events-none absolute top-3 left-3 rounded-chip px-2 py-0.5 text-check font-semibold text-white"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        {translate(language, 'feed.post.reel.chip')}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Avatar initials={model.author.initials} color={model.author.accentColor} size={34} {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})} />
          <span className="text-body font-semibold text-white">{model.author.name}</span>
        </div>
        {model.text !== undefined ? (
          <p
            className="text-check text-white/90"
            {...(model.text.language !== '' ? { lang: model.text.language } : {})}
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {model.text.full}
          </p>
        ) : null}
        <div className="pointer-events-auto">
          <FeedActionsRow postId={model.id} stats={model.stats} viewer={model.viewer} tone="onDark" {...hostsOf(hosts)} />
        </div>
      </div>
    </div>
  );
}

/**
 * LES MÉDIAS D'UN POST, DANS L'AGENCEMENT DE SON AUTEUR (#6514) — le carrousel
 * pour le défaut, et pour un média seul (une mosaïque d'un élément n'en est
 * pas une) ; une mosaïque pour les quatre autres.
 */
function FeedPostMedia({ media, layout }: { readonly media: readonly FeedCardMedia[]; readonly layout: FeedCardModel['layout'] }) {
  if (isPagedLayout(layout) || media.length < 2) return <FeedMediaCarousel media={media} />;
  return <FeedMediaMosaic media={media} layout={layout} />;
}

export function FeedPostCard({ model, ...hosts }: { readonly model: FeedCardModel } & CardHosts) {
  if (model.isReel) return <FeedReelCard model={model} {...hostsOf(hosts)} />;

  return (
    <article
      className="flex flex-col gap-2 pb-3"
      style={{ backgroundColor: 'var(--color-ios-card)', borderRadius: 18, border: '0.5px solid var(--color-edge)' }}
      data-feed-card="post"
    >
      <FeedPostHeader model={model} />
      {model.text !== undefined ? <FeedPostText text={model.text} /> : null}
      {model.media.length > 0 ? (
        <div className="px-3">
          <FeedPostMedia media={model.media} layout={model.layout} />
        </div>
      ) : null}
      <div className="px-3">
        <FeedActionsRow postId={model.id} stats={model.stats} viewer={model.viewer} tone="onLight" {...hostsOf(hosts)} />
      </div>
    </article>
  );
}
