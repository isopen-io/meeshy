import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import type { StickerDefinition, StickerOrigin } from '@meeshy/shared/types/sticker-definition';

import { GlyphSvg } from './glyph';
import { COMPOSER_GLYPHS } from './glyphs-composer';
import { Sheet } from './sheet';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import {
  STICKERS_QUERY_KEY,
  STICKERS_STALE_TIME,
  createSticker,
  deleteSticker,
  loadMyStickers,
  markStickerUsed,
  withStickerFirst,
} from '@/lib/api/stickers';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { appelNatifMethode, coqueCourante } from '@/lib/native-shell';
import { stickerFileOf, stickerRefusalKey } from '@/lib/stickers/library-file';
import { imageFilesOf, prepareStickerSource, readClipboardImages } from '@/lib/stickers/prepare';

/**
 * **« MES STICKERS »** (#7938) — la palette de la tuile « Sticker » du tiroir,
 * miroir de `composer.attach.sticker` (`UniversalComposerBar+Attachments.swift:295`).
 *
 * Trois façons d'en CRÉER, sans quitter la feuille :
 * - « Depuis une image » — un fichier de l'appareil (photo, capture, GIF) ;
 * - « Coller » — le presse-papier asynchrone, là où le navigateur le sert, et
 *   celui du système dans la coque Android (`MeeshyClipboard`, #8640) ;
 * - un collage (Ctrl+V / ⌘V) ou un dépôt sur la feuille — une image copiée
 *   depuis une page, un autre logiciel, une autre conversation.
 *
 * L'image est réduite ICI quand ça économise du réseau (`prepareStickerSource`),
 * puis la passerelle la normalise et la déduplique : recoller la même image
 * remonte le sticker existant en tête au lieu d'en créer un double.
 *
 * Toucher un sticker relit son image, le remonte en tête (le cache est écrit
 * au geste, le réseau confirme) et rend les deux à l'hôte, qui l'envoie. Une
 * image qui ne se relit pas est DITE ici, et rien ne part.
 */
const MeeStickerPanel = lazy(() => import('./composer-mee-stickers').then((m) => ({ default: m.MeeStickerPanel })));

/** Les onglets de la feuille : la bibliothèque, puis Mee, Meo et les Instants (#9034). */
const STICKER_TABS = ['mine', 'mee', 'meo', 'instants'] as const;
type StickerTab = (typeof STICKER_TABS)[number];

/** Ce que la feuille rend à l'hôte : l'image à joindre et le descripteur du champ `sticker`. */
export type PickedSticker = { readonly file: File; readonly sticker: MessageSticker };

const ACTION = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-body disabled:opacity-50';
const ACTION_STYLE = {
  backgroundColor: 'color-mix(in srgb, var(--ios-tile-sticker) 14%, transparent)',
  color: 'var(--color-ios-ink)',
} as const;

export function ComposerStickerSheet({
  onPick,
  onClose,
}: {
  /** Le sticker CHOISI et son image — l'hôte l'envoie tel quel. */
  readonly onPick: (picked: PickedSticker) => void;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [managing, setManaging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<StickerTab>('mine');

  const library = useQuery({
    queryKey: STICKERS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadMyStickers({ ...apiDeps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: STICKERS_STALE_TIME,
  });
  const stickers = library.data ?? [];

  const writeLibrary = (update: (list: readonly StickerDefinition[]) => readonly StickerDefinition[]) =>
    queryClient.setQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY, (list) => update(list ?? []));

  const create = async (sources: readonly Blob[], origin: StickerOrigin) => {
    if (sources.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    const refusals = await sources.reduce<Promise<readonly string[]>>(async (previous, source) => {
      const done = await previous;
      const file = await prepareStickerSource(source);
      const result = await createSticker(apiDeps, { file, origin });
      if (result.ok) {
        writeLibrary((list) => withStickerFirst(list, result.data));
        return done;
      }
      return [...done, translate(language, stickerRefusalKey(result.code))];
    }, Promise.resolve([]));
    setNotice(refusals[0] ?? null);
    setBusy(false);
  };

  const pasteFromClipboard = async () => {
    const images = await readClipboardImages(navigator.clipboard, appelNatifMethode(coqueCourante(), 'MeeshyClipboard', 'readImage'));
    if (images.length === 0) {
      setNotice(translate(language, 'composer.sticker.nothingToPaste'));
      return;
    }
    await create(images, 'paste');
  };

  const onPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const images = imageFilesOf(event.clipboardData);
    if (images.length === 0) return;
    event.preventDefault();
    void create(images, 'paste');
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const images = imageFilesOf(event.dataTransfer);
    if (images.length === 0) return;
    event.preventDefault();
    void create(images, 'upload');
  };

  const pick = async (sticker: StickerDefinition) => {
    if (busy) return;
    setBusy(true);
    const file = await stickerFileOf(sticker);
    setBusy(false);
    if (file === null) {
      setNotice(translate(language, 'composer.sticker.unavailable'));
      return;
    }
    writeLibrary((list) => withStickerFirst(list, sticker));
    void markStickerUsed(apiDeps, sticker.id);
    onPick({ file, sticker: { stickerId: sticker.id } });
  };

  const remove = (sticker: StickerDefinition) => {
    const before = queryClient.getQueryData<readonly StickerDefinition[]>(STICKERS_QUERY_KEY);
    writeLibrary((list) => list.filter((s) => s.id !== sticker.id));
    void deleteSticker(apiDeps, sticker.id).then((result) => {
      if (result.ok) return;
      queryClient.setQueryData(STICKERS_QUERY_KEY, before);
      setNotice(translate(language, 'composer.sticker.error.failed'));
    });
  };

  return (
    <Sheet title={translate(language, 'composer.sticker.title')} bodyAs="div" onClose={onClose}>
      <StickerTabBar tab={tab} onSelect={setTab} language={language} />
      {tab !== 'mine' ? (
        <div className="px-4 pb-4">
          <Suspense fallback={<p className="py-6 text-center text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>…</p>}>
            <MeeStickerPanel tab={tab} language={language} onPick={onPick} />
          </Suspense>
        </div>
      ) : (
        <div
          data-sticker-library
          tabIndex={-1}
          onPaste={onPaste}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex flex-col gap-3 px-4 pb-4"
        >
          <div className="flex flex-wrap gap-2">
            <button type="button" data-sticker-create className={ACTION} style={ACTION_STYLE} disabled={busy} onClick={() => fileInput.current?.click()}>
              <GlyphSvg glyph={COMPOSER_GLYPHS.imageSquare} size={18} />
              <span>{translate(language, 'composer.sticker.fromImage')}</span>
            </button>
            <button type="button" data-sticker-paste className={ACTION} style={ACTION_STYLE} disabled={busy} onClick={() => void pasteFromClipboard()}>
              <GlyphSvg glyph={COMPOSER_GLYPHS.clipboardText} size={18} />
              <span>{translate(language, 'composer.sticker.paste')}</span>
            </button>
            {stickers.length > 0 ? (
              <button type="button" data-sticker-manage className={ACTION} style={ACTION_STYLE} aria-pressed={managing} onClick={() => setManaging((on) => !on)}>
                <span>{translate(language, managing ? 'composer.sticker.done' : 'composer.sticker.manage')}</span>
              </button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label={translate(language, 'composer.sticker.fromImage')}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                void create(files, 'upload');
              }}
            />
          </div>

          <p className="text-caption" style={{ color: notice === null ? 'var(--color-ios-ink-3)' : 'var(--ios-error)' }} role="status" aria-live="polite">
            {busy ? translate(language, 'composer.sticker.creating') : (notice ?? translate(language, 'composer.sticker.pasteHint'))}
          </p>

          {library.isSuccess && stickers.length === 0 ? (
            <p data-sticker-empty className="py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'composer.sticker.empty')}
            </p>
          ) : (
            <ul className="grid grid-cols-4 gap-2" aria-busy={library.isPending}>
              {stickers.map((sticker) => (
                <li key={sticker.id} className="relative">
                  <button
                    type="button"
                    data-sticker={sticker.id}
                    aria-label={
                      managing
                        ? translate(language, 'composer.sticker.remove')
                        : (sticker.name ?? translate(language, 'composer.sticker.item'))
                    }
                    className="block aspect-square w-full rounded-xl p-1"
                    style={{ backgroundColor: 'var(--color-ios-card)' }}
                    onClick={() => (managing ? remove(sticker) : void pick(sticker))}
                  >
                    <img
                      src={attachmentSrc(sticker.fileUrl)}
                      alt=""
                      width={sticker.width}
                      height={sticker.height}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </button>
                  {managing ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full"
                      style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
                    >
                      <GlyphSvg glyph={COMPOSER_GLYPHS.x} size={14} />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

const TAB_KEYS = {
  mine: 'composer.sticker.title',
  mee: 'composer.sticker.mee.solo',
  meo: 'composer.sticker.meo.solo',
  instants: 'composer.sticker.tab.instants',
} as const;

const TAB_LABELS: Readonly<Partial<Record<StickerTab, string>>> = { mee: 'Mee', meo: 'Meo' };

/** Les onglets — une liste d'onglets au clavier (flèches, Début, Fin), un seul arrêt de tabulation, cibles de 44 px. */
function StickerTabBar({
  tab,
  onSelect,
  language,
}: {
  readonly tab: StickerTab;
  readonly onSelect: (tab: StickerTab) => void;
  readonly language: ReturnType<typeof currentInterfaceLanguage>;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const current = STICKER_TABS.indexOf(tab);
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -current, End: STICKER_TABS.length - 1 - current }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (current + step + STICKER_TABS.length) % STICKER_TABS.length;
    const target = STICKER_TABS[next];
    if (target === undefined) return;
    onSelect(target);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={translate(language, 'composer.sticker.tabs')} onKeyDown={onKeyDown} className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3">
      {STICKER_TABS.map((candidate, index) => {
        const selected = candidate === tab;
        return (
          <button
            key={candidate}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-sticker-tab={candidate}
            onClick={() => onSelect(candidate)}
            className="shrink-0 rounded-chip px-4 text-body font-semibold"
            style={{
              minHeight: 44,
              color: selected ? 'var(--color-ios-on-brand)' : 'var(--color-ios-ink)',
              backgroundColor: selected ? 'var(--accent)' : 'var(--color-ios-card)',
            }}
          >
            {TAB_LABELS[candidate] ?? translate(language, TAB_KEYS[candidate])}
          </button>
        );
      })}
    </div>
  );
}
