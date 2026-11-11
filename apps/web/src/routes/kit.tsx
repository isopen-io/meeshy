import { memo, useEffect, useLayoutEffect, useState, type MouseEvent, type ReactNode } from 'react';

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

const legendOf = (tile: MeeshyKitCatalogTile): string =>
  tile.state.boardView === null ? tileId(tile) : `${tileId(tile)} · ${tile.state.boardView}`;

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
      <h2 id={`${id}-title`} className="text-caption font-semibold text-ink-muted">
        {legendOf(tile)}
      </h2>
      <div {...(tile.isPressed ? { 'data-kit-frozen': '', ...FROZEN } : {})} className="overflow-hidden rounded-card" style={{ inlineSize: 'fit-content', maxInlineSize: '100%' }}>
        <MeeshyKitCatalogStage state={tile.state} isPressed={tile.isPressed}>
          {content(entryKey, tile.state, tile.isPressed)}
        </MeeshyKitCatalogStage>
      </div>
    </section>
  );
});

function KitSwitch({ name, label, checked, onToggle }: { readonly name: string; readonly label: string; readonly checked: boolean; readonly onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-kit-setting={name}
      onClick={onToggle}
      className="rounded-chip px-4 text-body font-semibold text-ink"
      style={{ minBlockSize: TARGET, background: checked ? 'var(--color-ios-brand)' : 'var(--ios-surface-card)', color: checked ? 'var(--color-ios-on-brand)' : undefined }}
    >
      {label}
    </button>
  );
}

function useHeldScheme(): readonly [boolean, () => void] {
  const [original] = useState(currentScheme);
  const [dark, setDark] = useState(original === 'dark');
  useLayoutEffect(() => {
    applyScheme(dark ? 'dark' : 'light');
  }, [dark]);
  useLayoutEffect(() => () => applyScheme(original), [original]);
  return [dark, () => setDark((current) => !current)];
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
  const [rtl, setRtl] = useState(false);
  const [largeFont, setLargeFont] = useState(false);
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
        <KitSwitch name="dark" label="Sombre" checked={dark} onToggle={toggleDark} />
        <KitSwitch name="rtl" label="RTL" checked={rtl} onToggle={() => setRtl((current) => !current)} />
        <KitSwitch name="large-font" label="Grande police" checked={largeFont} onToggle={() => setLargeFont((current) => !current)} />
      </div>
      <div data-kit-tiles="" dir={rtl ? 'rtl' : 'ltr'} className="grid content-start gap-4" style={largeFont ? { zoom: LARGE_FONT_ZOOM } : undefined}>
        {tilesOf(entry).map((tile) => (
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
  return entry === null ? <KitCatalogList entries={entries} /> : <KitCatalogDetail entry={entry} content={content} />;
}

export default function KitCatalogRoute() {
  return <KitCatalogScreen composant={useOptionalRoute()?.params.composant} />;
}
