import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { Sheet } from '@/components/sheet';
import { ApiError } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { storyViewersQueryOptions, type PostViewerRow } from '@/lib/api/publication-viewers';
import { time } from '@/lib/grouping';
import { translate } from '@/lib/i18n-catalog';
import {
  isViewerEngagementCatalogLoaded,
  loadViewerEngagementCatalog,
  translateViewerEngagement,
} from '@/lib/i18n-viewer-engagement-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { coldStateOf } from '@/lib/view/cold-state';
import { initialsOf } from '@/lib/view/conversation';
import { peekProfileOnClick } from '@/lib/view/profile-peek';
import { viewerEngagementMarks, type ViewerEngagementMark } from '@/lib/view/viewer-engagement';
import { Link } from '@/routes/route-table';

/**
 * **QUI A VU — ET CE QUE CHACUN A FAIT** (#7116, enrichie par #9727) — le
 * PATRON est `MessageReceiptsSheet` : `useQuery` `staleTime: 0`, une ligne par
 * personne. Miroir de `StoryViewersSheet` (`StoryViewerView+Content.swift`) :
 * avatar, nom, heure de vue, et SOUS le nom ce que la personne a fait sur ce
 * contenu — ses réactions, ses commentaires, ses réponses, ses
 * republications, ses partages, son favori. Un compteur à zéro ne se dessine
 * pas (`viewerEngagementMarks`) : la ligne reste aérée.
 *
 * **Story, post et réel** — la même feuille, la même route
 * (`GET /posts/:postId/interactions`, auteur seul). `subject` choisit
 * seulement les phrases de l'état vide et du refus.
 *
 * **Détail INDISPONIBLE** (`engagement: 'unavailable'`) : la passerelle n'a
 * pas pu établir ce que les personnes ont fait et sert des lignes NUES. La
 * liste le dit en tête, discrètement, et le détail d'une personne le redit au
 * lieu de « sans autre interaction » — qui serait un mensonge.
 *
 * **Toucher une ligne REBONDIT et ouvre son DÉTAIL** dans la feuille : ce que
 * la personne a fait, en toutes lettres, et « Voir le profil ». « Retour aux
 * vues » rend la liste et le focus à la ligne d'où l'on venait.
 *
 * **Nommé `publication-viewers-sheet`, pas `story-viewers-sheet`** : le motif
 * de `story_reader` (`budgets.json`) l'aurait capté dans le plafond du
 * lecteur — ce fichier est chargé À LA DEMANDE (`lazy()`, D-54) et compté à
 * part (`on_demand_chunks.publication_viewers_sheet`). Ses libellés vivent
 * dans `i18n-viewer-engagement-catalog`, chargé avec lui
 * (`preparePublicationViewersSheet`) : le catalogue d'interface est à son
 * plafond.
 *
 * **SIX ÉTATS DESSINÉS** (revue #7116) : chargement (cache VIDE seulement),
 * HORS LIGNE (`coldStateOf`), REFUS (403), erreur avec « Réessayer », vide,
 * et la liste — plus, depuis #9727, le détail d'une personne.
 *
 * **L'EN-TÊTE LIT LE COMPTE AUTORITATIF** (`viewCount`), jamais la longueur
 * d'une page qui peut être partielle — et retombe sur le total servi.
 */
export type ViewersSubject = 'story' | 'publication';

/** Charge, AVEC le chunk de la feuille, le catalogue de ses libellés. */
export async function preparePublicationViewersSheet(): Promise<void> {
  await loadViewerEngagementCatalog(currentInterfaceLanguage()).catch(() => undefined);
}

export function PublicationViewersSheet({
  postId,
  viewCount,
  subject = 'story',
  onClose,
}: {
  readonly postId: string;
  readonly viewCount: number | null | undefined;
  readonly subject?: ViewersSubject;
  readonly onClose: () => void;
}) {
  const lang = currentInterfaceLanguage();
  const labelsReady = useViewerEngagementCatalog(lang);
  const query = useQuery({ ...storyViewersQueryOptions({ ...apiDeps, postId }), staleTime: 0 });
  const viewers: readonly PostViewerRow[] = query.data?.viewers ?? [];
  const engagementUnavailable = query.data?.engagement === 'unavailable';
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const opened = openedId === null ? undefined : viewers.find((viewer) => viewer.id === openedId);
  const count = viewCount ?? query.data?.pagination.total;
  const title =
    count === undefined
      ? translate(lang, 'story.action.views')
      : translate(lang, count === 1 ? 'story.views.count.one' : 'story.views.count.other', { count: String(count) });

  return (
    <Sheet title={title} onClose={onClose}>
      {opened !== undefined && labelsReady ? (
        <ViewerDetail
          viewer={opened}
          lang={lang}
          engagementUnavailable={engagementUnavailable}
          onBack={() => {
            setReturnTo(opened.id);
            setOpenedId(null);
          }}
        />
      ) : (
        <ViewersBody
          query={query}
          viewers={viewers}
          lang={lang}
          subject={subject}
          labelsReady={labelsReady}
          engagementUnavailable={engagementUnavailable}
          returnFocusTo={returnTo}
          onOpen={setOpenedId}
        />
      )}
    </Sheet>
  );
}

function useViewerEngagementCatalog(lang: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => isViewerEngagementCatalogLoaded(lang));
  useEffect(() => {
    if (isViewerEngagementCatalogLoaded(lang)) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    void loadViewerEngagementCatalog(lang).then(
      () => {
        if (live) setReady(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [lang]);
  return ready;
}

const MUTED = { color: 'var(--color-ios-ink-3)' } as const;

function ViewersBody({
  query,
  viewers,
  lang,
  subject,
  labelsReady,
  engagementUnavailable,
  returnFocusTo,
  onOpen,
}: {
  readonly query: { readonly data: unknown; readonly isError: boolean; readonly isPaused: boolean; readonly error: unknown; readonly refetch: () => unknown };
  readonly viewers: readonly PostViewerRow[];
  readonly lang: InterfaceLanguage;
  readonly subject: ViewersSubject;
  readonly labelsReady: boolean;
  readonly engagementUnavailable: boolean;
  readonly returnFocusTo: string | null;
  readonly onOpen: (viewerId: string) => void;
}) {
  const state = coldStateOf(query);
  if (state === 'loading') {
    return (
      <li className="px-4 py-3 text-body" style={MUTED} data-viewers-loading>
        {translate(lang, 'story.views.loading')}
      </li>
    );
  }
  if (state === 'offline') {
    return (
      <li className="px-4 py-3 text-body" style={MUTED} data-viewers-offline>
        {translate(lang, 'story.views.offline')}
      </li>
    );
  }
  if (state === 'error') {
    if (query.error instanceof ApiError && query.error.status === 403) {
      return (
        <li className="px-4 py-3 text-body" style={MUTED} data-viewers-forbidden>
          {subject === 'publication' && labelsReady
            ? translateViewerEngagement(lang, 'viewerEngagement.forbidden')
            : translate(lang, 'story.views.forbidden')}
        </li>
      );
    }
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-body" style={MUTED} data-viewers-error>
        <span className="flex-1">{translate(lang, 'message-detail.load-error')}</span>
        <button
          type="button"
          className="rounded-full px-3 font-semibold"
          style={{ minHeight: 44, color: 'var(--color-primary)' }}
          onClick={() => void query.refetch()}
          data-viewers-retry
        >
          {translate(lang, 'message-detail.retry')}
        </button>
      </li>
    );
  }
  if (viewers.length === 0) {
    return (
      <li className="grid justify-items-center gap-2 px-8 py-10 text-center" data-viewers-empty>
        <Glyph name="eyeSlash" size={28} style={MUTED} />
        <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(lang, 'story.views.empty.title')}
        </p>
        <p className="text-body" style={MUTED}>
          {subject === 'publication' && labelsReady
            ? translateViewerEngagement(lang, 'viewerEngagement.empty.subtitle')
            : translate(lang, 'story.views.empty.subtitle')}
        </p>
      </li>
    );
  }
  return (
    <>
      {engagementUnavailable && labelsReady ? (
        <li className="px-4 py-2 text-mini" style={MUTED} role="status" data-viewers-engagement-unavailable>
          {translateViewerEngagement(lang, 'viewerEngagement.unavailable')}
        </li>
      ) : null}
      {viewers.map((viewer) => (
        <ViewerRow
          key={viewer.id}
          viewer={viewer}
          lang={lang}
          labelsReady={labelsReady}
          focusOnMount={viewer.id === returnFocusTo}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

const nameOf = (viewer: PostViewerRow): string => viewer.displayName ?? viewer.username;

function ViewerAvatar({ viewer, size }: { readonly viewer: PostViewerRow; readonly size: number }) {
  const label = nameOf(viewer);
  return (
    <Avatar
      initials={initialsOf(label)}
      color={colorForName(label)}
      size={size}
      name={label}
      {...(viewer.avatarUrl === null ? {} : { src: viewer.avatarUrl })}
    />
  );
}

function ViewerRow({
  viewer,
  lang,
  labelsReady,
  focusOnMount,
  onOpen,
}: {
  readonly viewer: PostViewerRow;
  readonly lang: InterfaceLanguage;
  readonly labelsReady: boolean;
  readonly focusOnMount: boolean;
  readonly onOpen: (viewerId: string) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  const label = nameOf(viewer);
  const marks = viewerEngagementMarks(viewer);
  return (
    <li data-story-viewer={viewer.id}>
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen(viewer.id)}
        disabled={!labelsReady}
        aria-label={labelsReady ? translateViewerEngagement(lang, 'viewerEngagement.openDetail', { name: label }) : label}
        className="flex w-full items-center gap-3 px-4 text-start transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
        style={{ minHeight: 56, color: 'var(--color-ios-ink)' }}
        data-story-viewer-open
      >
        <ViewerAvatar viewer={viewer} size={40} />
        <span className="grid min-w-0 flex-1 gap-0.5 py-2">
          <span className="truncate text-body font-medium">{label}</span>
          {marks.length > 0 ? <EngagementStrip marks={marks} /> : null}
        </span>
        <span className="text-mini" style={MUTED} data-story-viewer-time>
          {time(viewer.viewedAt)}
        </span>
      </button>
    </li>
  );
}

const MARK_GLYPH = {
  comments: FEED_GLYPHS.chatCircle,
  replies: FEED_GLYPHS.arrowBendUpLeft,
  reposts: FEED_GLYPHS.arrowsClockwise,
  shares: FEED_GLYPHS.shareNetwork,
} as const;

/** La rangée compacte sous le nom : emojis, puis glyphe + nombre. Décorative — le détail la dit en toutes lettres. */
function EngagementStrip({ marks }: { readonly marks: readonly ViewerEngagementMark[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-mini" style={{ color: 'var(--color-ios-ink-2)' }} aria-hidden="true" data-story-viewer-marks>
      {marks.map((mark) => {
        if (mark.kind === 'reactions') {
          return (
            <span key={mark.kind} data-story-viewer-reaction>
              {mark.emojis.join(' ')}
            </span>
          );
        }
        return (
          <span key={mark.kind} className="inline-flex items-center gap-1" data-story-viewer-mark={mark.kind}>
            <GlyphSvg glyph={MARK_GLYPH[mark.kind]} size={14} />
            {mark.count}
          </span>
        );
      })}
    </span>
  );
}

function markSentence(lang: InterfaceLanguage, mark: ViewerEngagementMark): string {
  switch (mark.kind) {
    case 'reactions':
      return translateViewerEngagement(lang, 'viewerEngagement.reactions', { emojis: mark.emojis.join(' ') });
    case 'comments':
    case 'replies':
    case 'reposts':
    case 'shares':
      return translateViewerEngagement(lang, `viewerEngagement.${mark.kind}.${mark.count === 1 ? 'one' : 'other'}` as const, {
        count: String(mark.count),
      });
  }
}

function ViewerDetail({
  viewer,
  lang,
  engagementUnavailable,
  onBack,
}: {
  readonly viewer: PostViewerRow;
  readonly lang: InterfaceLanguage;
  readonly engagementUnavailable: boolean;
  readonly onBack: () => void;
}) {
  const back = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  const label = nameOf(viewer);
  const marks = viewerEngagementMarks(viewer);
  return (
    <li className="grid gap-4 px-4 pb-6" data-viewer-detail={viewer.id}>
      <button
        ref={back}
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 justify-self-start rounded-full pe-3 font-semibold"
        style={{ minHeight: 44, color: 'var(--color-primary)' }}
        data-viewer-detail-back
      >
        <GlyphSvg glyph={FEED_GLYPHS.caretRight} size={16} style={{ transform: 'scaleX(-1)' }} />
        {translateViewerEngagement(lang, 'viewerEngagement.back')}
      </button>
      <div className="grid justify-items-center gap-1 text-center">
        <ViewerAvatar viewer={viewer} size={64} />
        <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {label}
        </p>
        <p className="text-mini" style={MUTED}>
          {translateViewerEngagement(lang, 'viewerEngagement.viewedAt', { time: time(viewer.viewedAt) })}
        </p>
      </div>
      <ul className="grid gap-2" data-viewer-detail-marks>
        {marks.length === 0 && engagementUnavailable ? (
          <li className="text-body" style={MUTED} data-viewer-detail-unavailable>
            {translateViewerEngagement(lang, 'viewerEngagement.unavailable')}
          </li>
        ) : marks.length === 0 ? (
          <li className="text-body" style={MUTED} data-viewer-detail-only-viewed>
            {translateViewerEngagement(lang, 'viewerEngagement.onlyViewed')}
          </li>
        ) : (
          marks.map((mark) => (
            <li key={mark.kind} className="flex items-center gap-3 text-body" style={{ color: 'var(--color-ios-ink)' }} data-viewer-detail-mark={mark.kind}>
              {mark.kind === 'reactions' ? null : <GlyphSvg glyph={MARK_GLYPH[mark.kind]} size={18} style={{ color: 'var(--color-ios-ink-2)' }} />}
              <span>{markSentence(lang, mark)}</span>
            </li>
          ))
        )}
      </ul>
      <Link
        to="userProfile"
        params={{ username: viewer.username }}
        onClick={peekProfileOnClick(viewer.username)}
        className="grid place-items-center rounded-full font-semibold"
        style={{ minHeight: 44, color: 'var(--color-primary)', border: '1px solid var(--color-edge)' }}
        data-viewer-detail-profile
      >
        {translateViewerEngagement(lang, 'viewerEngagement.openProfile')}
      </Link>
    </li>
  );
}
