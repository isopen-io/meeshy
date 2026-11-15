import type { ReactNode } from 'react';

export type MeeshyKitCatalogBackdrop = 'dark' | 'light' | 'media';

export type MeeshyKitCatalogState = {
  readonly id: string;
  readonly boardView: string | null;
  readonly backdrop: MeeshyKitCatalogBackdrop;
  readonly isTouchable: boolean;
};

export type MeeshyKitCatalogTile = {
  readonly state: MeeshyKitCatalogState;
  readonly isPressed: boolean;
};

export type MeeshyKitCatalogEntry = {
  readonly key: string;
  readonly name: string;
  readonly states: readonly MeeshyKitCatalogState[];
};

export const kitCatalogState = (input: {
  readonly id: string;
  readonly boardView?: string;
  readonly backdrop?: MeeshyKitCatalogBackdrop;
  readonly isTouchable?: boolean;
}): MeeshyKitCatalogState => ({
  id: input.id,
  boardView: input.boardView ?? null,
  backdrop: input.backdrop ?? 'dark',
  isTouchable: input.isTouchable ?? false,
});

export const kitCatalogEntry = (input: {
  readonly key: string;
  readonly name: string;
  readonly states?: readonly MeeshyKitCatalogState[];
}): MeeshyKitCatalogEntry => ({ key: input.key, name: input.name, states: input.states ?? [] });

export const isDelivered = (entry: MeeshyKitCatalogEntry): boolean => entry.states.length > 0;

export const accessibilityName = (entry: MeeshyKitCatalogEntry): string => `${entry.key} ${entry.name}`;

export const tileId = (tile: MeeshyKitCatalogTile): string => (tile.isPressed ? `${tile.state.id}-presse` : tile.state.id);

export const tilesOf = (entry: MeeshyKitCatalogEntry): readonly MeeshyKitCatalogTile[] =>
  entry.states.flatMap((state) =>
    state.isTouchable
      ? [
          { state, isPressed: false },
          { state, isPressed: true },
        ]
      : [{ state, isPressed: false }],
  );

export const listedEntries = (entries: readonly MeeshyKitCatalogEntry[]): readonly MeeshyKitCatalogEntry[] => entries.filter(isDelivered);

export const listedEntry = (key: string, entries: readonly MeeshyKitCatalogEntry[]): MeeshyKitCatalogEntry | null =>
  listedEntries(entries).find((entry) => entry.key.toLowerCase() === key.toLowerCase()) ?? null;

const BACKDROP: Readonly<Record<MeeshyKitCatalogBackdrop, string>> = {
  dark: 'var(--ios-surface)',
  light: 'var(--ios-surface)',
  media: 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))',
};

export function MeeshyKitCatalogStage({
  state,
  isPressed = false,
  children,
}: {
  readonly state: MeeshyKitCatalogState;
  readonly isPressed?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div
      data-kit-stage=""
      data-backdrop={state.backdrop}
      {...(isPressed ? { 'data-pressed': '' } : {})}
      style={{ padding: 'var(--ios-space-md)', background: BACKDROP[state.backdrop] }}
    >
      {children}
    </div>
  );
}
