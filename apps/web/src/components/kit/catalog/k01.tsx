import type { CSSProperties, ReactNode } from 'react';

import { MeeshyGlass, MeeshyGlassScope, type MeeshyGlassTone } from '../meeshy-glass-tone';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogBackdrop, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';

export const entryK01 = kitCatalogEntry({
  key: 'K01',
  name: 'MeeshyGlassTone',
  states: [
    kitCatalogState({ id: 'plain', boardView: 'R1', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'deep', boardView: 'R2', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'deep-dense', boardView: 'R7', backdrop: 'media' }),
    kitCatalogState({ id: 'onlight', boardView: 'R13', backdrop: 'light', isTouchable: true }),
    kitCatalogState({ id: 'theme', backdrop: 'light', isTouchable: true }),
    kitCatalogState({ id: 'teinte', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'opaque', backdrop: 'media' }),
  ],
});

const SCENES: Readonly<Record<MeeshyKitCatalogBackdrop, CSSProperties>> = {
  dark: { background: 'linear-gradient(160deg, var(--ios-media-backdrop), var(--ios-indigo-950))' },
  media: { background: 'linear-gradient(135deg, var(--ios-indigo-500), var(--ios-indigo-700))' },
  light: { background: 'linear-gradient(160deg, var(--ios-on-media), color-mix(in srgb, var(--ios-on-media) 70%, var(--ios-indigo-500)))' },
};

const TONES: Readonly<Record<string, MeeshyGlassTone>> = { plain: 'plain', onlight: 'onLight' };

const toneOf = (id: string): MeeshyGlassTone => TONES[id] ?? 'deep';

function Sparkle() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z" />
    </svg>
  );
}

function Pill({ state, isPressed }: { readonly state: MeeshyKitCatalogState; readonly isPressed: boolean }) {
  const isTheme = state.id === 'theme';
  return (
    <MeeshyGlass
      as={state.isTouchable ? 'button' : 'div'}
      {...(state.isTouchable ? { type: 'button' as const } : {})}
      tone={isTheme ? 'theme' : toneOf(state.id)}
      density={state.id === 'deep-dense' ? 'dense' : 'regular'}
      {...(state.id === 'teinte' ? { tint: 'accent' as const } : {})}
      interactive={state.isTouchable}
      pressed={state.isTouchable && isPressed}
      className="inline-flex items-center rounded-full text-body"
    >
      <span
        className="inline-flex items-center"
        style={{
          gap: 'var(--ios-space-sm)',
          paddingInline: 'var(--ios-space-lg)',
          minBlockSize: 44,
          color: isTheme ? 'var(--color-ios-ink)' : 'var(--color-on-media)',
        }}
      >
        <Sparkle />
        {state.id}
      </span>
    </MeeshyGlass>
  );
}

export function Scene({ state, children }: { readonly state: MeeshyKitCatalogState; readonly children: ReactNode }) {
  return (
    <div style={{ ...SCENES[state.backdrop], padding: 'var(--ios-space-lg)', borderRadius: 'var(--ios-radius-md)' }}>
      {children}
    </div>
  );
}

export const contentK01 = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  const pill = <Pill state={state} isPressed={isPressed} />;
  if (state.id === 'theme') return pill;
  return (
    <Scene state={state}>
      <MeeshyGlassScope tone={toneOf(state.id)} opaque={state.id === 'opaque'}>
        {pill}
      </MeeshyGlassScope>
    </Scene>
  );
};
