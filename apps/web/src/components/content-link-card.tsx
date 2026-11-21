import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import type { ContentKind, ContentPathTarget } from '@meeshy/shared/utils/content-link';

import {
  contentLinkTargetQueryOptions,
  contentPostQueryOptions,
  contentPostStateOf,
  contentTargetStateOf,
  type ContentCardDeps,
} from '@/lib/api/content-card';
import { contentCardModelOf, type ContentCardModel } from '@/lib/feed/content-card';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { contentRouteOf, type ContentLinkCandidates } from '@/lib/links/content-link';
import { compactCount } from '@/lib/view/compact-count';
import { openLinkProps } from '@/lib/view/reading-telemetry';
import { useMinute } from '@/lib/view/use-minute';
import { Link } from '@/routes/route-table';

import {
  ContentCardMediaBlock,
  ContentCardSceneBlock,
  ContentCardSlideshow,
  ContentCardSoundBlock,
  ON_MEDIA_BACKDROP,
} from './content-card-visual';
import { GlyphSvg, type GlyphShape } from './glyph';
import { GLYPHS } from './glyphs';
import { CONTENT_CARD_GLYPHS } from './glyphs-content-card';
import { PrismPastille } from './message-blocks';
import { PeerAvatar } from './peer-avatar';

/**
 * **LA CARTE VIVANTE D'UN LIEN MEESHY VERS UN CONTENU** (#19334, parapluie
 * #19331, référence iOS #19332) — sous le texte d'une bulle ou d'une
 * publication, un lien vers une publication, un réel, une story ou une humeur
 * montre le contenu lui-même : son média, son auteur, son texte dans la langue
 * du lecteur, ses vues et ses favoris.
 *
 * Quatre états (`contentPostStateOf`) : le squelette quand rien n'est connu,
 * la carte (même périmée, revalidée en silence), la ligne « indisponible » sur
 * le refus de la passerelle, et rien sur une panne — le lien du texte reste
 * alors le seul geste, comme avant cette carte.
 *
 * **UN SEUL ÉLÉMENT, UN LIEN** : la carte entière ouvre le contenu à sa place,
 * par le routeur de l'application (le lecteur de réels, la visionneuse de
 * story, la page de l'humeur, le détail), avec `?from=link_preview` pour que la
 * vue dise d'où elle vient — et, venue d'un lien suivi, par ce lien même
 * (`/l/<jeton>`, comme iOS) : le clic se compte et la page dit qui a partagé.
 * Son nom prononce ce que la carte peint ; son contenu est masqué au lecteur
 * d'écran pour ne pas le dire deux fois. Un clic ne remonte pas jusqu'aux
 * gestes de la bulle ; l'appui long, lui, reste celui de la bulle.
 *
 * **Un lien suivi** (`/l/<jeton>`) attend sa résolution sous un squelette ;
 * s'il ne désigne pas un contenu, le lien de contenu suivant du texte prend sa
 * place (`ContentLinkSlot`).
 */

/** Largeur de la carte, en px CSS — bornée par la bulle qui la porte. */
const CARD_WIDTH = 280;
const CARD_RADIUS = 16;
const AVATAR_SIDE = 20;
const MOOD_EMOJI_SIZE = 28;

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const INK_3 = 'var(--color-ios-ink-3)';

const shell: CSSProperties = {
  width: CARD_WIDTH,
  maxWidth: '100%',
  borderRadius: CARD_RADIUS,
  border: '1px solid var(--color-edge)',
  backgroundColor: 'var(--color-ios-card)',
  color: INK,
  overflow: 'hidden',
};

/** Un clic dans la carte ne remonte pas jusqu'aux gestes de la bulle (sélection, double appui). */
const contained = (event: MouseEvent) => event.stopPropagation();

/** Mêmes mots que le reste de l'application pour les quatre types. */
const TYPE_LABEL = {
  POST: 'post.detail.title',
  REEL: 'feed.post.reel.chip',
  STORY: 'feed.post.repost.embed.story',
  STATUS: 'message.mood.label',
} as const satisfies Record<ContentKind, string>;

/** Mêmes icônes : celles de la feuille d'envoi, et la face des humeurs. */
const TYPE_GLYPH: Readonly<Record<ContentKind, GlyphShape>> = {
  POST: CONTENT_CARD_GLYPHS.article,
  REEL: CONTENT_CARD_GLYPHS.filmStrip,
  STORY: CONTENT_CARD_GLYPHS.circleDashed,
  STATUS: GLYPHS.smiley,
};

/** « Réel de X », « Humeur de X » se disent déjà ailleurs : les mêmes clés. */
const HEAD_OF: Readonly<Record<ContentKind, (language: InterfaceLanguage, author: string) => string>> = {
  POST: (language, author) => translate(language, 'content.card.of.post', { author }),
  REEL: (language, author) => translate(language, 'feed.post.reel.of', { author }),
  STORY: (language, author) => translate(language, 'content.card.of.story', { author }),
  STATUS: (language, author) => translate(language, 'mood.peek.title', { name: author }),
};

export type ContentLinkSlotProps = {
  /** Les liens de contenu du texte, dans son ordre (`contentLinksIn`). */
  readonly candidates: ContentLinkCandidates;
  readonly deps: ContentCardDeps;
  readonly language: InterfaceLanguage;
  /** Le Prisme du lecteur (`useReaderLanguages`) — il sert le texte de la carte. */
  readonly readerLanguages: readonly string[];
  /** La publication qui porte le texte : elle ne se cite pas elle-même. */
  readonly excludePostId?: string;
};

/** LA CARTE DU PREMIER LIEN DE CONTENU — un lien suivi qui ne désigne rien passe la main au suivant. */
export function ContentLinkSlot(props: ContentLinkSlotProps) {
  const [first, ...rest] = props.candidates;
  if (first === undefined) return null;
  if (first.kind === 'tracked') return <TrackedContentCard {...props} token={first.token} rest={rest} />;
  return <ContentPostCard {...props} target={{ postId: first.postId, type: first.type }} token={null} />;
}

function TrackedContentCard({ token, rest, ...props }: ContentLinkSlotProps & { readonly token: string; readonly rest: ContentLinkCandidates }) {
  const query = useQuery(contentLinkTargetQueryOptions(props.deps, token));
  const state = contentTargetStateOf(query, props.excludePostId);
  switch (state.kind) {
    case 'loading':
      return <ContentCardSkeleton language={props.language} />;
    case 'failed':
      return null;
    case 'none':
      return <ContentLinkSlot {...props} candidates={rest} />;
    case 'content':
      return <ContentPostCard {...props} target={state.target} token={token} />;
  }
}

/** `token` : le jeton du lien suivi qui a mené à ce contenu, par lequel le geste repasse ; `null` pour une adresse directe. */
function ContentPostCard({
  target,
  token,
  deps,
  language,
  readerLanguages,
}: ContentLinkSlotProps & { readonly target: ContentPathTarget; readonly token: string | null }) {
  const queryClient = useQueryClient();
  const query = useQuery(contentPostQueryOptions({ ...deps, postId: target.postId, queryClient }));
  const state = contentPostStateOf(query);
  const post = state.kind === 'card' ? state.post : undefined;
  const minute = useMinute();
  const model = useMemo(
    () =>
      post === undefined
        ? undefined
        : contentCardModelOf(post, { preferredLanguages: readerLanguages, now: new Date(minute * 60_000), linkType: target.type, language }),
    [post, readerLanguages, minute, target.type, language],
  );
  if (state.kind === 'loading') return <ContentCardSkeleton language={language} />;
  if (state.kind === 'unavailable') return <ContentUnavailable type={target.type} language={language} />;
  return model === undefined ? null : <ContentCard model={model} token={token} language={language} readerLanguages={readerLanguages} />;
}

function ContentCardSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  const bar = (width: string): CSSProperties => ({
    height: 10,
    width,
    borderRadius: 5,
    backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)',
  });
  return (
    <div
      data-content-card="loading"
      role="status"
      aria-busy="true"
      aria-label={translate(language, 'content.card.loading')}
      className="mt-1.5"
      style={shell}
    >
      <div style={{ aspectRatio: String(16 / 9), backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)' }} />
      <div className="grid gap-2 p-3">
        <div style={bar('55%')} />
        <div style={bar('85%')} />
      </div>
    </div>
  );
}

function ContentUnavailable({ type, language }: { readonly type: ContentKind | null; readonly language: InterfaceLanguage }) {
  return (
    <p
      data-content-card="unavailable"
      data-content-type={type ?? undefined}
      className="mt-1.5 mb-0 flex items-center gap-2 px-3 py-2 text-mini"
      style={{ ...shell, color: INK_2 }}
    >
      <GlyphSvg glyph={type === null ? GLYPHS.linkSimple : TYPE_GLYPH[type]} size={16} className="shrink-0" />
      <span className="min-w-0">{translate(language, 'content.card.unavailable')}</span>
    </p>
  );
}

const countLabel = (language: InterfaceLanguage, count: number, keys: { readonly one: 'story.views.count.one' | 'content.card.favorites.one'; readonly other: 'story.views.count.other' | 'content.card.favorites.other' }): string =>
  translate(language, count === 1 ? keys.one : keys.other, { count: String(count) });

/** Ce que la carte prononce : ce qu'elle peint, dans l'ordre où elle le peint. */
function cardLabelOf(model: ContentCardModel, language: InterfaceLanguage): string {
  const head = model.author.name === '' ? translate(language, TYPE_LABEL[model.type]) : HEAD_OF[model.type](language, model.author.name);
  const body = [model.moodEmoji, model.text?.full].filter((part): part is string => part !== undefined).join(' ');
  const figures = [
    countLabel(language, model.stats.views, { one: 'story.views.count.one', other: 'story.views.count.other' }),
    countLabel(language, model.stats.favorites, { one: 'content.card.favorites.one', other: 'content.card.favorites.other' }),
    ...(model.bookmarked ? [translate(language, 'content.card.saved')] : []),
  ].join(', ');
  return [head, body, figures].filter((part) => part !== '').join('. ');
}

/** Le bloc visuel porte-t-il une face (image, diaporama, scène) ? La pastille du type s'y pose ; sinon, avant le nom. */
const hasFace = (model: ContentCardModel): boolean => model.visual.kind === 'media' || model.visual.kind === 'slideshow' || model.visual.kind === 'scene';

/**
 * LA PORTE DU GESTE : le lien suivi tel quel (le clic se compte), sinon
 * l'adresse du contenu à sa place. La carte en pose une ; chaque page d'un
 * diaporama en pose une autre, muette (le lien de la carte la prononce déjà).
 */
function OpenLink({ model, token, children, ...rest }: { readonly model: ContentCardModel; readonly token: string | null; readonly children: ReactNode } & Readonly<Record<string, unknown>>) {
  const open = openLinkProps(model.postId, 'link_preview');
  const shared = { draggable: false, ...(open.onClick === undefined ? {} : { onClick: open.onClick }), ...rest };
  return token === null ? (
    <Link to={contentRouteOf(model.routeType)} params={{ post: model.postId }} search={open.search} {...shared}>
      {children}
    </Link>
  ) : (
    <Link to="trackingLink" params={{ token }} {...shared}>
      {children}
    </Link>
  );
}

function ContentCard({ model, token, language, readerLanguages }: { readonly model: ContentCardModel; readonly token: string | null; readonly language: InterfaceLanguage; readonly readerLanguages: readonly string[] }) {
  const accent = model.author.accentColor;
  const chip = (onMedia: boolean) => <TypeChip type={model.type} language={language} onMedia={onMedia} />;
  const { visual } = model;
  const page = (face: ReactNode) => (
    <OpenLink model={model} token={token} tabIndex={-1} aria-hidden="true" data-content-card-page-open="" className="block size-full">
      {face}
    </OpenLink>
  );
  const face =
    visual.kind === 'media' ? (
      <ContentCardMediaBlock media={visual.media} accent={accent} chip={chip} />
    ) : visual.kind === 'scene' && model.scene !== undefined ? (
      <ContentCardSceneBlock scene={model.scene} index={visual.index} accent={accent} readerLanguages={readerLanguages} authorName={model.author.name} chip={chip} />
    ) : null;
  return (
    <div
      data-content-card="card"
      data-content-type={model.type}
      className="mt-1.5 transition-transform has-[>a:active]:scale-[0.98]"
      style={{ ...shell, width: CARD_WIDTH }}
      onClick={contained}
    >
      {visual.kind === 'slideshow' ? (
        <ContentCardSlideshow
          pages={visual.pages}
          scene={model.scene}
          accent={accent}
          readerLanguages={readerLanguages}
          authorName={model.author.name}
          language={language}
          chip={chip}
          renderOpen={page}
        />
      ) : null}
      {visual.kind === 'sound' ? <ContentCardSoundBlock sound={visual.sound} postId={model.postId} accent={accent} language={language} /> : null}
      <OpenLink
        model={model}
        token={token}
        aria-label={cardLabelOf(model, language)}
        aria-description={translate(language, 'content.card.hint')}
        data-content-card-open=""
        className="block focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ display: 'block', width: '100%', outlineColor: 'var(--color-ios-brand)', borderRadius: CARD_RADIUS }}
      >
        <span aria-hidden="true" className="block">
          {face}
          <span className="grid gap-1.5 px-3 py-2.5">
            <AuthorRow model={model} language={language} />
            <TextRow model={model} language={language} />
            <StatsRow model={model} language={language} />
          </span>
        </span>
      </OpenLink>
    </div>
  );
}

function TypeChip({ type, language, onMedia }: { readonly type: ContentKind; readonly language: InterfaceLanguage; readonly onMedia: boolean }) {
  return (
    <span
      data-content-card-type
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-check font-semibold ${onMedia ? 'text-on-media' : ''}`}
      style={onMedia ? { backgroundColor: ON_MEDIA_BACKDROP } : { backgroundColor: 'var(--color-ios-surface)', color: INK_2 }}
    >
      <GlyphSvg glyph={TYPE_GLYPH[type]} size={12} />
      {translate(language, TYPE_LABEL[type])}
    </span>
  );
}

function AuthorRow({ model, language }: { readonly model: ContentCardModel; readonly language: InterfaceLanguage }) {
  const { author } = model;
  return (
    <span data-content-card-author className="flex min-w-0 items-center gap-1.5 text-mini">
      {hasFace(model) ? null : <TypeChip type={model.type} language={language} onMedia={false} />}
      <PeerAvatar
        presenceKey={author.id}
        ringRef={author.ring}
        initials={author.initials}
        color={author.accentColor}
        size={AVATAR_SIDE}
        name={author.name}
        {...(author.avatarSrc === undefined ? {} : { src: author.avatarSrc })}
      />
      <span className="min-w-0 truncate font-semibold" style={{ color: INK }}>
        {author.name}
      </span>
      {model.relativeTime === '' ? null : (
        <span className="shrink-0" style={{ color: INK_3 }}>
          · {model.relativeTime}
        </span>
      )}
    </span>
  );
}

function TextRow({ model, language }: { readonly model: ContentCardModel; readonly language: InterfaceLanguage }) {
  const { text, moodEmoji } = model;
  if (text === undefined && moodEmoji === undefined) return null;
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      {moodEmoji === undefined ? null : (
        <span data-content-card-mood className="shrink-0" style={{ fontSize: MOOD_EMOJI_SIZE, lineHeight: 1 }}>
          {moodEmoji}
        </span>
      )}
      {text === undefined ? null : (
        <>
          <span
            data-content-card-text
            {...(text.language === '' ? {} : { lang: text.language })}
            className="min-w-0 flex-1 text-title"
            style={{
              color: INK,
              display: '-webkit-box',
              WebkitLineClamp: hasFace(model) ? 2 : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {text.full}
          </span>
          <PrismPastille servedLanguage={text.language} originalLanguage={text.originalLanguage} active={null} language={language} subject="post" />
        </>
      )}
    </span>
  );
}

function Stat({ name, glyph, value, language, saved }: { readonly name: string; readonly glyph: GlyphShape; readonly value: number; readonly language: InterfaceLanguage; readonly saved?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <GlyphSvg glyph={glyph} size={13} />
      <span data-content-card-stat={name} {...(saved === undefined ? {} : { 'data-saved': String(saved) })} className="tabular-nums">
        {compactCount(value, language)}
      </span>
    </span>
  );
}

/** Vues et favoris toujours, j'aime et commentaires seulement s'il y en a — les icônes de la carte du fil. */
function StatsRow({ model, language }: { readonly model: ContentCardModel; readonly language: InterfaceLanguage }) {
  const { stats } = model;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-check font-medium" style={{ color: INK_3 }}>
      <Stat name="views" glyph={GLYPHS.eye} value={stats.views} language={language} />
      {stats.likes > 0 ? <Stat name="likes" glyph={CONTENT_CARD_GLYPHS.heartFill} value={stats.likes} language={language} /> : null}
      {stats.comments > 0 ? <Stat name="comments" glyph={CONTENT_CARD_GLYPHS.chatCircle} value={stats.comments} language={language} /> : null}
      <Stat
        name="favorites"
        glyph={model.bookmarked ? CONTENT_CARD_GLYPHS.bookmarkFill : CONTENT_CARD_GLYPHS.bookmark}
        value={stats.favorites}
        language={language}
        saved={model.bookmarked}
      />
    </span>
  );
}
