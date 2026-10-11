import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { STORIES_MINE_GLYPHS } from '@/components/glyphs-stories-mine';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { LiveAnnouncement } from '@/components/live-announcement';
import { GLYPH_SIZE } from '@/components/ui-chrome';
import { apiDeps } from '@/lib/api/deps';
import type { HttpTransport } from '@/lib/api/http';
import {
  MY_SOUNDS_PAGE_SIZE,
  flattenMySounds,
  mySoundsQueryOptions,
  performRemoveSound,
  type MySound,
  type MySoundsDeps,
} from '@/lib/api/my-sounds';
import { translate } from '@/lib/i18n-catalog';
import { isSoundsMineCatalogLoaded, loadSoundsMineCatalog, translateSoundsMine } from '@/lib/i18n-sounds-mine-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { Link } from '@/routes/route-table';

/**
 * **« MES SONS »** (#9848) — `/me/sounds`, atteint depuis Réglages › Outils :
 * les sons dont le lecteur est l'auteur — téléversés, ou extraits de ses
 * vidéos —, et le geste qui en retire un de SA bibliothèque. Miroir de l'onglet
 * « Mes sons » du sélecteur iOS (`SoundLibraryPicker`), dont le web n'a pas
 * d'équivalent : sans cet écran, un son ne se retirait d'aucune façon.
 *
 * **RETIRER N'EST PAS EFFACER**, et la confirmation le dit AVANT le geste : le
 * son quitte la bibliothèque et ne s'ajoute plus à une nouvelle publication,
 * mais les publications déjà parues continuent de le jouer. Leur nombre
 * (`postCount`, le même ensemble que la page du son) est dans la ligne
 * qu'on a déjà : aucune requête de plus pour l'annoncer.
 *
 * **OPTIMISTE, AVEC RETOUR À SA PLACE** (`performRemoveSound`) : la rangée et
 * la modale partent dans le même rendu ; un refus remet la rangée juste après
 * son plus proche voisin encore présent, et l'annonce le dit.
 *
 * **HORS LIGNE, « RETIRER » S'ÉTEINT ET L'ÉCRAN LE DIT AVANT LE GESTE** — même
 * règle que « Mes stories » (D-83) : un retrait qu'aucun réseau ne confirmerait
 * ne se joue pas en optimiste.
 *
 * **SES LIBELLÉS VOYAGENT AVEC LUI** (`i18n-sounds-mine-catalog.ts`) : le
 * catalogue d'interface et la première peinture sont à leur plafond, donc
 * l'écran attend son catalogue avant son premier rendu (`SoundsMineScreen`),
 * sans rien ajouter à la table des routes.
 */

const HEADER_HEIGHT = 64;
const SOUND_ROW_HEIGHT_ESTIMATE = 72;

export function soundRowTitle(sound: MySound, language: InterfaceLanguage): string {
  return sound.title.trim() === '' ? translateSoundsMine(language, 'soundsMine.untitled') : sound.title;
}

export function soundPostCountLabel(count: number, language: InterfaceLanguage): string {
  return translateSoundsMine(language, count === 1 ? 'soundsMine.posts.one' : 'soundsMine.posts.other', { count: String(count) });
}

export function soundRemovalBody(postCount: number, language: InterfaceLanguage): string {
  if (postCount <= 0) return translateSoundsMine(language, 'soundsMine.remove.body.unused');
  return translateSoundsMine(language, postCount === 1 ? 'soundsMine.remove.body.one' : 'soundsMine.remove.body.other', {
    count: String(postCount),
  });
}

function SoundsMineHeader({
  language,
  titleRef,
}: {
  readonly language: InterfaceLanguage;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-3" style={{ height: HEADER_HEIGHT }}>
      <Link
        to="settings"
        aria-label={translateSoundsMine(language, 'soundsMine.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} className="rtl:-scale-x-100" />
      </Link>
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="min-w-0 flex-1 truncate text-screen font-bold focus:outline-none"
        style={{ color: 'var(--color-ios-ink)' }}
      >
        {translateSoundsMine(language, 'soundsMine.title')}
      </h1>
    </header>
  );
}

function SoundCover({ sound }: { readonly sound: MySound }) {
  if (sound.coverUrl !== null) {
    return <img src={sound.coverUrl} alt="" loading="lazy" decoding="async" className="size-12 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-full text-ios-on-brand"
      style={{ background: sound.coverColor ?? 'var(--color-ios-brand)' }}
    >
      <GlyphSvg glyph={FEED_GLYPHS.musicNote} size={GLYPH_SIZE.lg} />
    </span>
  );
}

export function MySoundRow({
  sound,
  language,
  onRequestRemove,
  removeDisabled,
}: {
  readonly sound: MySound;
  readonly language: InterfaceLanguage;
  readonly onRequestRemove: (sound: MySound) => void;
  readonly removeDisabled: boolean;
}) {
  return (
    <li data-my-sound={sound.id} className="flex items-center gap-3 rounded-card px-3 py-2" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <SoundCover sound={sound} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {soundRowTitle(sound, language)}
        </p>
        {sound.postCount > 0 ? (
          <p className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {soundPostCountLabel(sound.postCount, language)}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onRequestRemove(sound)}
        disabled={removeDisabled}
        aria-label={translateSoundsMine(language, 'soundsMine.action.remove')}
        data-my-sound-remove
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2 disabled:opacity-40"
        style={{ minWidth: 44, minHeight: 44, color: 'var(--color-error)', outlineColor: 'var(--color-error)' }}
      >
        <GlyphSvg glyph={STORIES_MINE_GLYPHS.trash} size={GLYPH_SIZE.lg} />
      </button>
    </li>
  );
}

function SoundsMineEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <li className="grid flex-1 content-center justify-items-center gap-3 px-6 py-12 text-center" data-my-sounds-empty>
      <span aria-hidden="true" style={{ color: 'var(--color-ios-brand)', opacity: 0.4 }}>
        <GlyphSvg glyph={FEED_GLYPHS.musicNote} size={44} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translateSoundsMine(language, 'soundsMine.empty.title')}
      </p>
      <p className="max-w-xs text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateSoundsMine(language, 'soundsMine.empty.subtitle')}
      </p>
    </li>
  );
}

function SoundsMineError({ language, online, onRetry }: { readonly language: InterfaceLanguage; readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {online ? translateSoundsMine(language, 'soundsMine.error.title') : translate(language, 'feed.offline.title')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        {translate(language, 'feed.retry')}
      </button>
    </li>
  );
}

/**
 * `transport` est injectable pour que le témoin fasse répondre la passerelle
 * comme il l'entend (refus, attente). Par défaut : le transport de l'app.
 */
export function SoundsMineView({ transport }: { readonly transport?: HttpTransport }) {
  const language = currentInterfaceLanguage();
  const queryClient = useQueryClient();
  const online = useOnline();
  const deps = useMemo<MySoundsDeps>(
    () => (transport === undefined ? apiDeps : { source: 'gateway', transport }),
    [transport],
  );
  const corpus = useInfiniteQuery(mySoundsQueryOptions(deps));
  const sounds = flattenMySounds(corpus.data);
  const { text: announcement, tone, announce } = useLiveAnnouncer();
  const [pending, setPending] = useState<MySound | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [focusTitleTick, setFocusTitleTick] = useState(0);
  const frame = useRef<HTMLUListElement>(null);

  /* Le bouton qui a ouvert la confirmation part avec sa rangée : le focus
     rejoint le titre APRÈS le rendu qui retire la modale (même motif que
     « Mes stories »). */
  useEffect(() => {
    if (focusTitleTick > 0) titleRef.current?.focus();
  }, [focusTitleTick]);

  const requestRemove = useCallback((sound: MySound) => setPending(sound), []);
  const cancelRemove = useCallback(() => setPending(null), []);
  const confirmRemove = useCallback(() => {
    const sound = pending;
    setPending(null);
    if (sound === null || !online) return;
    setFocusTitleTick((tick) => tick + 1);
    void performRemoveSound({ sound, deps: { ...deps, queryClient, isOnline: () => online } }).then((outcome) => {
      announce(
        translateSoundsMine(language, outcome === 'done' ? 'soundsMine.remove.success' : 'soundsMine.remove.failure'),
        outcome === 'done' ? 'neutral' : 'error',
      );
    });
  }, [pending, online, deps, queryClient, announce, language]);

  const loading = corpus.data === undefined && !corpus.isError;
  const paginationState = paginationStateOf(corpus);
  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(SOUND_ROW_HEIGHT_ESTIMATE),
    enabled: paginationState === 'idle' && sounds.length > 0,
    onReach: () => void corpus.fetchNextPage(),
  });

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <SoundsMineHeader language={language} titleRef={titleRef} />

      {online ? null : (
        <p role="status" data-my-sounds-offline className="px-4 pb-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateSoundsMine(language, 'soundsMine.offline')}
        </p>
      )}

      <ul
        ref={frame}
        data-my-sounds-list
        className="scrollbar-none overscroll-contain flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-safe"
        {...(loading ? { 'aria-busy': true } : {})}
      >
        {corpus.data === undefined && corpus.isError ? (
          <SoundsMineError language={language} online={online} onRetry={() => void corpus.refetch()} />
        ) : loading ? null : sounds.length === 0 ? (
          <SoundsMineEmpty language={language} />
        ) : (
          <>
            {sounds.map((sound) => (
              <MySoundRow
                key={sound.id}
                sound={sound}
                language={language}
                onRequestRemove={requestRemove}
                removeDisabled={!online}
              />
            ))}
            <LensPaginationFooter
              state={paginationState}
              showsAllLoadedHint={showsAllLoadedHint(sounds.length, MY_SOUNDS_PAGE_SIZE)}
              onRetry={() => void corpus.fetchNextPage()}
              sentinelRef={observeTail}
            />
          </>
        )}
      </ul>

      {pending === null ? null : (
        <ConfirmDialog
          name="my-sound-remove"
          title={translateSoundsMine(language, 'soundsMine.remove.title')}
          body={soundRemovalBody(pending.postCount, language)}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={translateSoundsMine(language, 'soundsMine.remove.confirm')}
          tone="destructive"
          onConfirm={confirmRemove}
          onCancel={cancelRemove}
        />
      )}

      <LiveAnnouncement text={announcement} tone={tone} marker="mySounds" />
    </main>
  );
}

export default function SoundsMineScreen() {
  const language = currentInterfaceLanguage();
  const [ready, setReady] = useState(() => isSoundsMineCatalogLoaded(language));
  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    loadSoundsMineCatalog(language).then(
      () => {
        if (live) setReady(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language, ready]);
  return ready ? <SoundsMineView /> : null;
}
