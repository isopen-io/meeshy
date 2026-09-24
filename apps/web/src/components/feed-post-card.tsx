import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { useCallback, useState, type ReactNode } from 'react';

import { Avatar } from './avatar';
import { FeedPostMenu, type PostMenuHost } from './feed-post-menu';
import { PersonName } from './person-name';
import { FeedCarouselChrome, FeedCarouselDots } from './feed-carousel-chrome';
import { FeedMediaMosaic } from './feed-media-mosaic';
import { FeedMediaSurface } from './feed-media-surface';
import { FeedSceneCarousel } from './feed-scene-carousel';
import { FeedSceneMosaic } from './feed-scene-mosaic';
import { FeedSceneSurface } from './feed-scene-surface';
import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { RichText } from './rich-text';
import { PrismPastille } from './message-blocks';
import type { FeedCardMedia, FeedCardModel, FeedCardStats, FeedCardText, FeedCardViewer } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';
import { isPagedLayout, type TiledLayoutMode } from '@/lib/feed/mosaic-layout';
import { SCENE_ASPECT, cardAspect, clampedCardAspect } from '@/lib/feed/scene-framing';
import { useIsActiveScene } from '@/lib/feed/use-feed-autoplay';
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
 * l'intention. Sans hôte, ou pour une statistique qui n'a pas encore d'effet,
 * elle reste un `<span>` : un bouton sans effet mentirait (loi 4).
 *
 * **COMMENTER MÈNE AU FIL** — `onComment` rend le compteur de commentaires
 * ATTEIGNABLE (`FeedPostCard.swift`, où le même compteur ouvre
 * `FeedCommentsSheet`). Le web n'a pas de couche modale de fil : l'hôte
 * conduit au détail de la publication, où la liste et le composeur vivent.
 * Le compteur était un `<span>` INERTE, et c'est le défaut nommé par la loi
 * 4 — « cliquer une traduction change-t-il le texte lu ? » posé à un chiffre.
 *
 * **`repostCount` RESTE INERTE, ET C'EST ÉCRIT.** La republication ouvre un
 * composeur prérempli côté iOS (`StoryViewerView+Sidebar.swift:686-706`,
 * `republishStorySource`) ; le web n'a pas ce composeur. Tant qu'il n'existe
 * pas, ce chiffre est une STATISTIQUE, pas un contrôle — son témoin
 * (`feed-post-card-gestures.test.tsx`) mesure l'ABSENCE de rôle bouton,
 * pour qu'un futur lot ne le rende pas cliquable sans lui donner d'effet.
 */

type GestureHandler = (postId: string, kind: PostToggleKind) => void;

type ShareHandler = (postId: string) => void;

type CommentHandler = (postId: string) => void;

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
  onComment,
}: {
  readonly postId: string;
  readonly stats: FeedCardStats;
  readonly viewer: FeedCardViewer;
  readonly tone: 'onLight' | 'onDark';
  readonly onGesture?: GestureHandler;
  readonly onShare?: ShareHandler;
  readonly onComment?: CommentHandler;
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
function FeedMediaCarousel({ media, accent }: { readonly media: readonly FeedCardMedia[]; readonly accent: string }) {
  const [page, setPage] = useState(0);
  const clamped = Math.min(page, media.length - 1);
  const current = media[clamped];
  const language = currentInterfaceLanguage();
  if (current === undefined) return null;

  return (
    <div>
      <div className="relative overflow-hidden" style={{ borderRadius: 12, aspectRatio: `1 / ${current.ratio}` }} data-feed-media data-feed-layout="carousel">
        <FeedMediaSurface media={current} playable />
        {current.caption !== undefined ? (
          <p
            /* MARQUÉE comme celle de la mosaïque (#6864) — et c'est ici que ça
               compte le plus : le carrousel est le layout PAR DÉFAUT, donc le
               cas le plus fréquent était aussi le seul qu'aucune recette ne
               pouvait viser. La valeur dit d'OÙ vient la légende : `media` pour
               la légende propre du média, `post` pour le contenu du post servi
               en l'absence de légende propre sur un média UNIQUE. */
            data-feed-carousel-caption={current.captionOrigin ?? 'media'}
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
        {/* LE MÊME CHROME que le carrousel de scènes (`FeedCarouselChrome`,
            revue-correction #6898) : compteur, flèches à effet, pastilles
            SOUS la boîte — « que ce soit mosaïque de média ou de scène c'est
            la même chose » (`PostSceneMosaic.swift`, `fleches`). */}
        <FeedCarouselChrome
          page={clamped}
          count={media.length}
          labels={{ previous: translate(language, 'feed.post.media.previous'), next: translate(language, 'feed.post.media.next') }}
          onPrevious={() => setPage(clamped - 1)}
          onNext={() => setPage(clamped + 1)}
        />
      </div>
      <FeedCarouselDots page={clamped} count={media.length} accent={accent} />
    </div>
  );
}

/**
 * **L'HEURE RELATIVE EST LA PORTE DE LA PUBLICATION** (#7284) — l'horodatage
 * comme lien permanent est la convention de tous les fils du web, et l'élément
 * était INERTE : on lui donne un effet plutôt que d'en inventer un.
 *
 * Elle porte le nom accessible de sa DESTINATION (« Ouvrir la publication de
 * X »), jamais l'heure : « il y a 2 h » ne dit pas où l'on va, et c'est le
 * seul contrôle du fil qui y mène pour qui n'y voit pas.
 *
 * ELLE EST LA PORTE DE 44, et c'est ce qui rend le calque du corps possible :
 * `check-profile.mjs` exempte un petit contrôle dont l'adresse a DÉJÀ une
 * grande porte (`grandesPortes`, dérivée du relevé). Le calque du texte peut
 * donc faire une ligne de haut sans que rien ne devienne inatteignable.
 */
function FeedPostHeader({ model, storyRing, mood, isDetail, hosts }: { readonly model: FeedCardModel; readonly storyRing?: AuthorStoryRing; readonly mood?: string; readonly isDetail: boolean; readonly hosts: CardHosts }) {
  const language = currentInterfaceLanguage();
  return (
    <div className="flex items-center gap-2.5 px-3 pt-3">
      {/* L'AVATAR OUVRE LE PROFIL (#6396). Posé ICI et pas sur la variante
          RÉEL : là-bas, la carte entière est déjà un `<Link to="reels">`, et un
          lien imbriqué dans un lien est invalide. */}
      <Avatar
        initials={model.author.initials}
        color={model.author.accentColor}
        size={40}
        name={model.author.name}
        {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})}
        {...(model.author.username !== undefined ? { profileUsername: model.author.username } : {})}
        {...(storyRing === undefined ? {} : { storyRing })}
        {...(mood === undefined ? {} : { mood })}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* L'HEURE QUALIFIE L'AUTEUR — même ligne, miroir
            `FeedPostCard+Header.swift:51-60`. */}
        {/* `items-center` et non `items-baseline` : la porte de 44 ne s'aligne pas
            sur une ligne de base sans creuser la rangée. L'heure reste sur la
            LIGNE DU NOM — c'est ce que la vue `1h` prescrit, pas son mode
            d'alignement. */}
        <div className="flex items-center gap-1.5">
          {/* LE NOM MÈNE OÙ L'AVATAR MÈNE (#7241) — y compris l'anneau de
              story, qui PRIME sur le profil : c'est `identityTarget` qui le
              tranche, une fois, pour les deux moitiés de l'identité. */}
          <PersonName
            name={model.author.name}
            username={model.author.username}
            {...(storyRing === undefined ? {} : { storyRing })}
            className="truncate text-body font-semibold"
            style={{ color: 'var(--color-ios-ink)' }}
          />
          {isDetail ? (
            <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
              {model.relativeTime}
            </span>
          ) : (
            <Link
              to="post"
              params={{ post: model.id }}
              aria-label={translate(language, 'feed.post.open', { author: model.author.name })}
              data-feed-post-open="heure"
              className="inline-flex shrink-0 items-center text-check focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: 'var(--color-ios-ink-3)', minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
            >
              {model.relativeTime}
            </Link>
          )}
        </div>
        {model.repostOfHandle !== undefined ? (
          <span className="text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            ↻ @{model.repostOfHandle}
          </span>
        ) : null}
      </div>
      {/* LE « ⋯ » EN HAUT À DROITE (#7533) — miroir
          `FeedPostCard+Header.swift:164-241`, après le `Spacer()`. */}
      <CardMenu model={model} isDetail={isDetail} tone="card" hosts={hosts} />
    </div>
  );
}

/** Le texte d'un POST — tronqué à 20 mots avec « voir plus »/« voir moins »
 * (`truncateWords`, `lib/feed/text.ts`) ; `lang` porte la langue SERVIE.
 *
 * **ET C'EST LA SEULE SURFACE OÙ LE HASHTAG EST CLIQUABLE** (#7032) : les
 * hashtags n'existent que pour les PUBLICATIONS (`PostHashtag` relie un
 * hashtag à un post, jamais à un message) — d'où `hashtags` posé ICI et nulle
 * part ailleurs. L'enrichissement porte sur le texte AFFICHÉ, donc déjà
 * traduit par le Prisme ET déjà tronqué : c'est ce que le lecteur voit qu'il
 * peut cliquer, jamais un original qu'il ne lit pas. */
function FeedPostText({
  text,
  mentions,
}: {
  readonly text: FeedCardText;
  /* `| undefined` EXPLICITE, et non un `?` seul : sous `exactOptionalPropertyTypes`
     les deux ne disent pas la même chose, et c'est l'ABSENCE de distinction qui
     compte ici. `undefined` est une valeur PORTEUSE de sens pour le Prisme des
     mentions — « le serveur ne s'est pas prononcé, souligne tout handle » — à
     distinguer de `[]`, « il s'est prononcé, n'en souligne aucun ». La passer
     doit donc rester possible, exactement comme `RichText` la déclare. */
  readonly mentions?: readonly string[] | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const language = currentInterfaceLanguage();

  /**
   * **CE QUI EST RÉELLEMENT RENDU** (#7141) — le Prisme sert la traduction par
   * défaut ; ce drapeau ne dit que le GESTE du lecteur, qui a demandé l'original.
   *
   * Il gouverne le TEXTE **et** `lang` ensemble : les séparer ferait prononcer
   * l'espagnol avec une voix anglaise — le défaut que `lang` existe pour
   * empêcher, déplacé d'un cran (motif `showContent={false}`, cycle 123 du
   * `CLAUDE.md` racine). Et il passe AVANT la troncature : c'est le texte LU
   * qu'on coupe, jamais la traduction pendant qu'on lit l'original.
   */
  const [showingOriginal, setShowingOriginal] = useState(false);
  const lu = showingOriginal ? { full: text.original, language: text.originalLanguage } : { full: text.full, language: text.language };
  const truncated = truncateWords(lu.full, FEED_TEXT_TRUNCATION_LIMIT);
  const shown = !truncated.truncated || expanded ? lu.full : truncated.text;

  return (
    <div className="px-3">
      <div className="flex items-start gap-1">
        <RichText
          data-feed-text
          text={shown}
          className="min-w-0 flex-1 whitespace-pre-wrap text-bubble"
          {...(lu.language !== '' ? { lang: lu.language } : {})}
          style={{ color: 'var(--color-ios-ink)' }}
          hashtags
          mentions={mentions}
        />
        {/* LA PASTILLE SE GARDE ELLE-MÊME (`servedLanguage === originalLanguage`
            ⇒ `null`) : une publication non traduite n'annonce rien, et aucune
            condition n'est tenue en double ici. */}
        <PrismPastille
          servedLanguage={text.language}
          originalLanguage={text.originalLanguage}
          active={showingOriginal ? text.originalLanguage : null}
          language={language}
          subject="post"
          onToggle={() => setShowingOriginal((open) => !open)}
        />
      </div>
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
type CardHosts = {
  readonly onGesture?: GestureHandler;
  readonly onShare?: ShareHandler;
  readonly onComment?: CommentHandler;
  /** Le menu « ⋯ » (#7533) — absent, le bouton ne se monte pas (loi 4). */
  readonly menu?: PostMenuHost;
};

/** Les hôtes optionnels passent tels quels — `exactOptionalPropertyTypes`
 * refuse de poser une clé optionnelle à `undefined`. */
const hostsOf = ({ onGesture, onShare, onComment }: CardHosts): Omit<CardHosts, 'menu'> => ({
  ...(onGesture !== undefined ? { onGesture } : {}),
  ...(onShare !== undefined ? { onShare } : {}),
  ...(onComment !== undefined ? { onComment } : {}),
});

/** LE « ⋯ » D'UNE CARTE (#7533) — la MÊME pose pour les deux natures, seul le
 * fond change (`tone`). `null` sans hôte de menu. */
function CardMenu({ model, isDetail, tone, hosts }: { readonly model: FeedCardModel; readonly isDetail: boolean; readonly tone: 'card' | 'overlay'; readonly hosts: CardHosts }) {
  if (hosts.menu === undefined) return null;
  return (
    <FeedPostMenu
      postId={model.id}
      authorId={model.author.id}
      authorName={model.author.name}
      text={model.text?.full}
      bookmarked={model.viewer.bookmarked}
      isDetail={isDetail}
      tone={tone}
      menu={hosts.menu}
      onShare={hosts.onShare}
      onGesture={hosts.onGesture}
    />
  );
}

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
      /* MÊME identité que la carte de post (#6864) : un marqueur posé sur une
         seule des deux natures est une asymétrie silencieuse — le jour où une
         recette vise un réel par son id, elle trouverait le vide et conclurait
         à l'absence de la carte plutôt qu'à l'absence de l'attribut. */
      data-feed-card-id={model.id}
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
      {/* LE « ⋯ » EN HAUT À DROITE, AU-DESSUS du lien qui couvre la carte —
          miroir `ReelFeedCard.swift:297-325` (disque sombre sur le média). */}
      <div className="absolute top-1 right-1">
        <CardMenu model={model} isDetail={false} tone="overlay" hosts={hosts} />
      </div>
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
 * `onOpenScene`/`registerScene` — LES DEUX HÔTES DE LA SCÈNE (D-78, #6898) :
 * le premier remet l'intention d'ouvrir une scène précise — `useSceneGallery`
 * (#6902, `routes/feed.tsx`/`routes/post.tsx`) l'ouvre EN PLACE, à l'ÉCHELLE
 * uniforme et centrée (`SceneFullscreenGallery`, `MediaViewer` réutilisée) ;
 * sans hôte, `FeedSceneSurface` ne pose aucun bouton, jamais un tap sans
 * effet (loi 4). Le second enregistre la boîte de la carte auprès du magasin
 * d'élection (`useFeedAutoplayRoot.registerScene`, `lib/feed/use-feed-
 * autoplay.ts`) — une réf de rappel STABLE (voir son doc-comment), jamais une
 * réf inline.
 */
type SceneHosts = {
  readonly preferredLanguages?: readonly string[];
  readonly onOpenScene?: (postId: string, sceneIndex: number) => void;
  readonly registerScene?: (id: string, node: Element | null) => void;
};

/**
 * **LE CALQUE QUI OUVRE LA PUBLICATION** (#7284) — LE TEXTE, et le texte seul.
 *
 * La fiche `/post/$post` existait, complète et routée, et RIEN dans le fil n'y
 * menait : le seul lien du dépôt vivait dans `notification-row.tsx`. Une liste
 * sans son lien rend sa fiche inatteignable, et aucun gate ne le voit — les
 * témoins de la route passent, ceux de la carte passent, et le produit est
 * cassé entre les deux.
 *
 * **ÉCART ASSUMÉ AVEC iOS, ET IL SE CONSIGNE ICI.** `FeedPostCard.swift`
 * enferme l'EN-TÊTE *et* le texte dans sa zone tapable
 * (`.contentShape(Rectangle()).onTapGesture`) ; le web n'enferme que le TEXTE.
 * Ce n'est pas une infidélité, c'est une contrainte de plateforme :
 * `contentShape` donne à SwiftUI une zone qui n'entre pas en concurrence avec
 * les gestes de ses enfants, là où un calque CSS est un CONTRÔLE parmi les
 * autres. `check-profile.mjs` exige qu'un contrôle POSSÈDE SON CENTRE — ce qui
 * fait qu'un doigt visant le milieu d'une cible atteint cette cible — et un
 * calque étiré ne peut pas posséder le sien quand d'autres contrôles vivent
 * dans sa région. L'en-tête porte l'avatar et le nom, deux `<Link>` : mesuré,
 * le centre du calque tombait sur le nom de l'auteur (320x568 et 390x844,
 * pile `A(/u/...)` au-dessus de `A[open](/post/...)`). L'identité SORT donc de
 * la région couverte, et l'heure relative devient la porte de l'en-tête.
 * **Ne pas « corriger » cet écart en réétendant le calque à l'en-tête : il
 * rouvrirait ce défaut.**
 *
 * **CE QUI RESTE DEHORS, ET POURQUOI.** iOS sort déjà chaque autre surface du
 * geste, en l'écrivant : la scène ouvre le PLEIN ÉCRAN (directive porteur
 * 2026-09-05 — « la scène EST le contenu : la toucher demande à la voir en
 * grand, pas à lire ses commentaires »), le média a « its own fullscreen
 * gesture », la rangée d'actions est « not inside the tap target ».
 *
 * **LE CALQUE PASSE SOUS, LE TEXTE LAISSE TRAVERSER.** Un `<a>` englobant est
 * exclu : les mentions, les hashtags et les URL du corps sont DÉJÀ des liens,
 * et un `<a>` imbriqué se rend sans s'activer — le défaut que #7251 vient de
 * corriger sur la rangée de conversation. Le calque couvre donc le texte SOUS
 * lui ; le texte est `pointer-events-none` et ses cibles internes ré-arment le
 * clic.
 *
 * **ET « SOUS » EST UNE QUESTION D'ORDRE DE PEINTURE, PAS D'ORDRE DU DOCUMENT.**
 * `pointer-events-auto` rend une cible HITTABLE, il ne la REMONTE pas : un
 * élément ré-armé qu'un calque recouvre reste inatteignable. Un
 * `position: absolute` peint à l'étape 8 de l'ordre de peinture CSS, le
 * contenu en flux normal aux étapes 4 à 7. D'où `relative z-[1]` sur
 * l'enveloppe : elle passe AU-DESSUS du calque avec tous ses descendants tout
 * en restant TRANSPARENTE au doigt, si bien que le texte tombe toujours sur le
 * calque et que les mentions gagnent. UN seul élément positionné plutôt qu'un
 * par cible.
 *
 * **LE CALQUE EST LE DOUBLON, L'HEURE EST LE CONTRÔLE.** Deux liens de même
 * destination se liraient deux fois et prendraient deux tours de clavier : le
 * calque sort donc de l'arbre d'accessibilité et du parcours (`aria-hidden`,
 * `tabIndex={-1}`), exactement comme le lien d'avatar dupliqué de
 * `lens-row.tsx`. Il est GÉNÉREUX au doigt, jamais annoncé ; l'heure est
 * annoncée, focusable, et fait 44.
 *
 * `isDetail` — **LA FICHE NE MÈNE PAS À ELLE-MÊME.** `routes/post.tsx` monte
 * cette même carte sur le détail. Le défaut par DÉFAUT est le geste PRÉSENT :
 * un hôte qui arrive demain l'obtient sans rien câbler, là où un rappel à
 * passer se serait oublié — ce qui est arrivé deux fois à `onComment` (#7113,
 * `routes/post-card-hosts.test.ts`).
 */
function FeedPostOpenZone({
  postId,
  isDetail,
  children,
}: {
  readonly postId: string;
  readonly isDetail: boolean;
  readonly children: ReactNode;
}) {
  if (isDetail) {
    return <div data-feed-post-open-zone>{children}</div>;
  }
  return (
    <div className="relative" data-feed-post-open-zone>
      <Link
        to="post"
        params={{ post: postId }}
        aria-hidden
        tabIndex={-1}
        draggable={false}
        data-feed-post-open="corps"
        className="absolute inset-0"
        style={{ borderRadius: 12 }}
      >
        {null}
      </Link>
      <div
        data-feed-post-open-through
        className="pointer-events-none relative z-[1] [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * LE VISUEL D'UN POST (D-78, #6898) — LA SCÈNE d'abord (`model.scene`), le
 * MÉDIA en repli (`model.media`, D-70) quand `storyEffects` est absent,
 * invalide, ou `v < 3`. La forme (mono-scène / carrousel / mosaïque) suit
 * exactement celle du média (§ 1.3 de la spécification `scenes-fil`) : seule
 * la SOURCE de la tuile change.
 */
function FeedPostVisual({
  model,
  active,
  preferredLanguages,
  onOpenScene,
  registerScene,
}: {
  readonly model: FeedCardModel;
  readonly active: boolean;
} & SceneHosts) {
  // **RÉFS DE RAPPEL STABLES** (motif `use-out-of-view.ts`/`use-feed-autoplay.ts`)
  // — appelées AVANT tout retour anticipé (règle des Hooks). Une réf inline
  // (`ref={(n) => registerScene(model.id, n)}` recréée à CHAQUE rendu) fait
  // désinscrire puis réinscrire la boîte à CHAQUE bascule d'élection (le
  // rendu déclenché par `useIsActiveScene`) : la réinscription relance
  // l'observation, dont la notification relance l'élection, qui relance le
  // rendu — une BOUCLE SANS FIN, mesurée : deux scènes cinématiques
  // adjacentes jouaient alors SIMULTANÉMENT, chacune alternant `playing`
  // à la fréquence des trames (§ 5.7 de la spécification, gate rouge avant
  // ce correctif).
  const registerBox = useCallback(
    (node: Element | null) => registerScene?.(model.id, node),
    [registerScene, model.id],
  );
  const openScene = useCallback((index: number) => onOpenScene?.(model.id, index), [onOpenScene, model.id]);

  const scene = model.scene;
  if (scene !== undefined) {
    const { document, carrier } = scene;
    const languages = preferredLanguages ?? [];
    const openHost = onOpenScene !== undefined ? { onOpenScene } : {};

    if (document.scenes.length === 1) {
      const firstScene = document.scenes[0]!;
      const boxAspect = clampedCardAspect(cardAspect(firstScene) ?? SCENE_ASPECT);
      return (
        <div
          {...(registerScene !== undefined ? { ref: registerBox } : {})}
          data-feed-scene-box
          className="relative overflow-hidden"
          style={{ aspectRatio: String(boxAspect), borderRadius: 16 }}
        >
          <FeedSceneSurface
            document={document}
            sceneIndex={0}
            carrier={carrier}
            preferredLanguages={languages}
            active={active}
            frame="page"
            authorName={model.author.name}
            {...(onOpenScene !== undefined ? { onOpen: openScene } : {})}
          />
        </div>
      );
    }

    return isPagedLayout(model.layout) ? (
      <FeedSceneCarousel
        document={document}
        carrier={carrier}
        preferredLanguages={languages}
        accent={model.author.accentColor}
        active={active}
        authorName={model.author.name}
        {...openHost}
        {...(registerScene !== undefined ? { registerRef: registerBox } : {})}
      />
    ) : (
      <FeedSceneMosaic
        document={document}
        carrier={carrier}
        preferredLanguages={languages}
        layout={model.layout as TiledLayoutMode}
        authorName={model.author.name}
        {...openHost}
      />
    );
  }

  if (model.media.length === 0) return null;
  return isPagedLayout(model.layout) || model.media.length < 2 ? (
    <FeedMediaCarousel media={model.media} accent={model.author.accentColor} />
  ) : (
    <FeedMediaMosaic media={model.media} layout={model.layout as TiledLayoutMode} />
  );
}

export function FeedPostCard({ model, preferredLanguages, onOpenScene, registerScene, storyRing, mood, isDetail = false, ...hosts }: { readonly model: FeedCardModel; readonly storyRing?: AuthorStoryRing; readonly mood?: string; readonly isDetail?: boolean } & CardHosts & SceneHosts) {
  // La lecture est une VALEUR REÇUE du magasin d'élection (#6898 § 5.3) —
  // JAMAIS un état local : seules les deux cartes dont le booléen bascule se
  // re-rendent (Zero Unnecessary Re-render).
  const active = useIsActiveScene(model.id);

  if (model.isReel) return <FeedReelCard model={model} {...hostsOf(hosts)} {...(hosts.menu === undefined ? {} : { menu: hosts.menu })} />;

  // Repli du contenu sur la légende d'un média SEUL (#6864, `resolveMedia`) :
  // le texte du post est alors DÉJÀ peint comme légende par `FeedMediaCarousel`
  // — le répéter ici peindrait deux fois la même phrase sur la même carte.
  // Une carte à SCÈNE ne monte pas `FeedMediaCarousel` et ne descend jamais le
  // texte du post en légende (`resolveSceneCaption`) : son texte reste ICI.
  const soleMedia = model.scene === undefined && model.media.length === 1 ? model.media[0] : undefined;
  const bodyText = model.text !== undefined && soleMedia?.caption === model.text.full ? undefined : model.text;

  return (
    <article
      className="flex flex-col gap-2 pb-3"
      style={{ backgroundColor: 'var(--color-ios-card)', borderRadius: 18, border: '0.5px solid var(--color-edge)' }}
      data-feed-card="post"
      /* L'IDENTITÉ DU POST, pour que la recette puisse viser UNE carte (#6864).
         `key={model.id}` existe déjà côté route, mais une clé de réconciliation
         n'est pas un attribut rendu : rien dans le DOM ne distinguait deux
         cartes. Un gate devait alors cibler par le TEXTE attendu — fragile, et
         incapable de dire de quelle publication il parle. */
      data-feed-card-id={model.id}
    >
      <FeedPostHeader model={model} isDetail={isDetail} hosts={hosts} {...(storyRing === undefined ? {} : { storyRing })} {...(mood === undefined ? {} : { mood })} />
      {bodyText !== undefined ? (
        <FeedPostOpenZone postId={model.id} isDetail={isDetail}>
          <FeedPostText text={bodyText} mentions={model.validatedMentions} />
        </FeedPostOpenZone>
      ) : null}
      {/* Un post à SCÈNES SANS média (cas réel, § 3 de la spécification) ne
          doit plus rester nu sous son texte (D-78) : la condition porte donc
          sur `model.scene` autant que sur `model.media.length`. */}
      {model.scene !== undefined || model.media.length > 0 ? (
        <div className="px-3">
          <FeedPostVisual
            model={model}
            active={active}
            {...(preferredLanguages !== undefined ? { preferredLanguages } : {})}
            {...(onOpenScene !== undefined ? { onOpenScene } : {})}
            {...(registerScene !== undefined ? { registerScene } : {})}
          />
        </div>
      ) : null}
      <div className="px-3">
        <FeedActionsRow postId={model.id} stats={model.stats} viewer={model.viewer} tone="onLight" {...hostsOf(hosts)} />
      </div>
    </article>
  );
}
