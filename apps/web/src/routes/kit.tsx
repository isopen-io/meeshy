import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';

import { MeeshyKitCatalog } from '@/components/kit/catalog';
import { MeeshyKitCatalogEmptyState } from '@/components/kit/catalog/empty-state';
import {
  accessibilityName,
  listedEntries,
  listedEntry,
  MeeshyKitCatalogStage,
  tileId,
  tilesOf,
  type MeeshyKitCatalogEntry,
  type MeeshyKitCatalogState,
  type MeeshyKitCatalogTile,
} from '@/components/kit/meeshy-kit-catalog';
import { navigate, useOptionalRoute } from '@/lib/router';
import { applyScheme, currentScheme } from '@/lib/scheme';

type KitContent = (key: string, state: MeeshyKitCatalogState, isPressed: boolean) => ReactNode;

const TARGET = 44;
const LARGE_FONT_ZOOM = 2;

const kitPath = (key: string): string => `/kit/${key.toLowerCase()}`;

const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;

function KitLink({ href, children, ...rest }: { readonly href: string; readonly children: ReactNode; readonly 'aria-label'?: string; readonly 'data-kit-row'?: string; readonly 'data-kit-key'?: string; readonly 'data-kit-back'?: string }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        navigate(href);
      }}
      className="flex items-center gap-3 rounded-card px-4 text-body font-semibold text-ink"
      style={{ minBlockSize: TARGET }}
    >
      {children}
    </a>
  );
}

function KitCatalogList({ entries }: { readonly entries: readonly MeeshyKitCatalogEntry[] }) {
  const listed = listedEntries(entries);
  return (
    <main className="mx-auto grid w-full max-w-3xl content-start gap-4 px-4 py-6">
      <h1 className="text-screen font-bold text-ink">Kit</h1>
      {listed.length === 0 ? (
        <MeeshyKitCatalogEmptyState />
      ) : (
        <nav aria-label="Kit">
          <ul className="grid gap-1">
            {listed.map((entry) => (
              <li key={entry.key}>
                <KitLink href={kitPath(entry.key)} aria-label={accessibilityName(entry)} data-kit-row="" data-kit-key={entry.key}>
                  <span aria-hidden="true">{entry.key}</span>
                  <span aria-hidden="true" className="text-ink-muted">
                    {entry.name}
                  </span>
                </KitLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}

const PRESSED_LEGEND = 'isPressed';

const legendOf = (tile: MeeshyKitCatalogTile): string =>
  [tile.state.id, tile.state.boardView, tile.isPressed ? PRESSED_LEGEND : null].filter((part) => part !== null).join(' · ');

const FROZEN = { inert: true } as const;

const KitTile = memo(function KitTile({
  entryKey,
  tile,
  content,
}: {
  readonly entryKey: string;
  readonly tile: MeeshyKitCatalogTile;
  readonly content: KitContent;
}) {
  const id = tileId(tile);
  return (
    <section
      id={id}
      data-kit-tile={id}
      data-kit-state={tile.state.id}
      {...(tile.state.boardView === null ? {} : { 'data-kit-board-view': tile.state.boardView })}
      {...(tile.state.isTouchable ? { 'data-kit-touchable': '' } : {})}
      aria-labelledby={`${id}-title`}
      className="grid gap-2"
    >
      <h2 id={`${id}-title`} className="font-code text-caption text-ink-muted">
        {legendOf(tile)}
      </h2>
      <div {...(tile.isPressed ? { 'data-kit-frozen': '', ...FROZEN } : {})} className="overflow-hidden" style={{ inlineSize: 'fit-content', maxInlineSize: '100%', borderRadius: 'var(--ios-radius-md)' }}>
        <MeeshyKitCatalogStage state={tile.state} isPressed={tile.isPressed}>
          {content(entryKey, tile.state, tile.isPressed)}
        </MeeshyKitCatalogStage>
      </div>
    </section>
  );
});

const KitSetting = memo(function KitSetting({ name, label, checked, onToggle }: { readonly name: string; readonly label: string; readonly checked: boolean; readonly onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2 px-2 font-code text-body text-ink" style={{ minBlockSize: TARGET }}>
      <input type="checkbox" role="switch" data-kit-setting={name} checked={checked} onChange={onToggle} />
      {label}
    </label>
  );
});

const useToggle = (initial: boolean): readonly [boolean, () => void] => {
  const [value, setValue] = useState(initial);
  return [value, useCallback(() => setValue((current) => !current), [])];
};

function useHeldScheme(): readonly [boolean, () => void] {
  const [original] = useState(currentScheme);
  const [dark, toggleDark] = useToggle(original === 'dark');
  useLayoutEffect(() => {
    applyScheme(dark ? 'dark' : 'light');
  }, [dark]);
  useLayoutEffect(() => () => applyScheme(original), [original]);
  return [dark, toggleDark];
}

function useHashScroll(key: string): void {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id === '') return;
    document.getElementById(id)?.scrollIntoView();
  }, [key]);
}

function KitCatalogDetail({ entry, content }: { readonly entry: MeeshyKitCatalogEntry; readonly content: KitContent }) {
  const [dark, toggleDark] = useHeldScheme();
  const [rtl, toggleRtl] = useToggle(false);
  const [largeFont, toggleLargeFont] = useToggle(false);
  const tiles = useMemo(() => tilesOf(entry), [entry]);
  useHashScroll(entry.key);
  return (
    <main className="mx-auto grid w-full max-w-5xl content-start gap-4 px-4 py-6">
      <KitLink href="/kit" data-kit-back="">
        Kit
      </KitLink>
      <h1 data-kit-name={entry.name} className="text-screen font-bold text-ink">
        {accessibilityName(entry)}
      </h1>
      <div role="group" aria-label="Réglages" className="flex flex-wrap gap-2">
        <KitSetting name="dark" label="dark" checked={dark} onToggle={toggleDark} />
        <KitSetting name="rtl" label="rtl" checked={rtl} onToggle={toggleRtl} />
        <KitSetting name="large-font" label={`zoom ${LARGE_FONT_ZOOM}`} checked={largeFont} onToggle={toggleLargeFont} />
      </div>
      <div data-kit-tiles="" dir={rtl ? 'rtl' : 'ltr'} className="grid content-start gap-4" style={largeFont ? { zoom: LARGE_FONT_ZOOM } : undefined}>
        {tiles.map((tile) => (
          <KitTile key={tileId(tile)} entryKey={entry.key} tile={tile} content={content} />
        ))}
      </div>
    </main>
  );
}

export function KitCatalogScreen({
  composant,
  entries = MeeshyKitCatalog.entries,
  content = MeeshyKitCatalog.content,
}: {
  readonly composant?: string | undefined;
  readonly entries?: readonly MeeshyKitCatalogEntry[];
  readonly content?: KitContent;
}) {
  const entry = composant === undefined ? null : listedEntry(composant, entries);
  return entry === null ? <KitCatalogList entries={entries} /> : <KitCatalogDetail key={entry.key} entry={entry} content={content} />;
}

export default function KitCatalogRoute() {
  return <KitCatalogScreen composant={useOptionalRoute()?.params.composant} />;
}
