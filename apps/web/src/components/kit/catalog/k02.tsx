import type { ReactNode } from 'react';

import { MeeshyGlassButton, MeeshyGlassButtonFace, type MeeshyGlassButtonKind, type MeeshyGlassButtonSize } from '../meeshy-glass-button';
import { MeeshyGlass, MeeshyGlassGroup, MeeshyGlassScope, type MeeshyGlassTint, type MeeshyGlassTone } from '../meeshy-glass-tone';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { Scene } from './k01';

export const entryK02 = kitCatalogEntry({
  key: 'K02',
  name: 'MeeshyGlassButton',
  states: [
    kitCatalogState({ id: 'normal', boardView: 'R2', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'seul', boardView: 'R1', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'seul-clair', boardView: 'R13', backdrop: 'light', isTouchable: true }),
    kitCatalogState({ id: 'actif', boardView: 'R3', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'destructif', boardView: 'S9', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'doux', boardView: 'S1', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'texte', boardView: 'A2', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'pastille', backdrop: 'media' }),
    kitCatalogState({ id: 'teinte', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'theme', backdrop: 'light', isTouchable: true }),
    kitCatalogState({ id: 'desactive', backdrop: 'media' }),
    kitCatalogState({ id: 'tailles', backdrop: 'media' }),
  ],
});

const PATHS = {
  close: 'M3 3l10 10M13 3L3 13',
  ellipsis: 'M3 8h.01M8 8h.01M13 8h.01',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5',
  back: 'M10 3L5 8l5 5',
  undo: 'M6 4L3 7l3 3M3 7h6a4 4 0 010 8H7',
  redo: 'M10 4l3 3-3 3M13 7H7a4 4 0 000 8h2',
  plus: 'M8 3v10M3 8h10',
  bell: 'M4 11V7a4 4 0 018 0v4l1 1.5H3zM6.5 14h3',
  paste: 'M5 3h6v2H5zM4 4h8v9H4z',
  pen: 'M3 13l1-3 7-7 2 2-7 7z',
  scribble: 'M3 11c2-4 3-4 4-1s2 3 3-1 2-3 3-1',
} as const;

type IconName = keyof typeof PATHS;

function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

type CellProps = {
  readonly icon: IconName;
  readonly label: string;
  readonly isPressed: boolean;
  readonly kind?: MeeshyGlassButtonKind;
  readonly size?: MeeshyGlassButtonSize;
  readonly tone?: MeeshyGlassTone;
  readonly tint?: MeeshyGlassTint;
  readonly pressable?: boolean;
  readonly disabled?: boolean;
};

function Cell({ icon, label, isPressed, kind, size, tone, tint, pressable = true, disabled = false }: CellProps) {
  const glyph = <Icon name={icon} />;
  if (isPressed && pressable) return <MeeshyGlassButtonFace glyph={glyph} kind={kind ?? 'normal'} size={size ?? 44} tone={tone} tint={tint} pressed />;
  return <MeeshyGlassButton label={label} glyph={glyph} kind={kind} size={size} tone={tone} tint={tint} disabled={disabled} onPress={() => {}} />;
}

const Row = ({ children }: { readonly children: ReactNode }) => <div className="flex items-center" style={{ gap: 'var(--ios-space-sm)' }}>{children}</div>;

const container = (isPressed: boolean) => (
  <MeeshyGlassGroup>
    <MeeshyGlass tone="deep" className="inline-flex items-center rounded-full">
      <span className="inline-flex items-center" style={{ gap: 'var(--ios-space-sm)', padding: 'var(--ios-space-xs)' }}>
        <Cell icon="undo" label="Annuler" size={40} isPressed={isPressed} pressable={false} />
        <Cell icon="redo" label="Rétablir" size={40} isPressed={isPressed} />
        <Cell icon="ellipsis" label="Afficher les actions" size={48} isPressed={isPressed} pressable={false} />
      </span>
    </MeeshyGlass>
  </MeeshyGlassGroup>
);

const sizes = (isPressed: boolean) => (
  <Row>
    {([36, 40, 44, 48] as const).map((size) => (
      <Cell key={size} icon="plus" label="Ajouter" size={size} isPressed={isPressed} />
    ))}
  </Row>
);

const ownGlyphs = (isPressed: boolean) => (
  <Row>
    {isPressed ? (
      <>
        <MeeshyGlassButtonFace glyph="Aa" pressed />
        <MeeshyGlassButtonFace glyph={<span aria-hidden="true" style={{ inlineSize: 'var(--ios-space-lg)', blockSize: 'var(--ios-space-lg)', borderRadius: 'var(--radius-pill)', background: 'var(--ios-indigo-500)' }} />} pressed />
      </>
    ) : (
      <>
        <MeeshyGlassButton label="Style du texte" glyph="Aa" onPress={() => {}} />
        <MeeshyGlassButton label="Couleur" glyph={<span aria-hidden="true" style={{ inlineSize: 'var(--ios-space-lg)', blockSize: 'var(--ios-space-lg)', borderRadius: 'var(--radius-pill)', background: 'var(--ios-indigo-500)' }} />} onPress={() => {}} />
      </>
    )}
  </Row>
);

const badged = (isPressed: boolean) => {
  const dot = <span style={{ display: 'block', inlineSize: 'var(--ios-space-sm)', blockSize: 'var(--ios-space-sm)', borderRadius: 'var(--radius-pill)', background: 'var(--ios-error)' }} />;
  const glyph = <Icon name="bell" />;
  return isPressed ? <MeeshyGlassButtonFace glyph={glyph} badge={dot} pressed /> : <MeeshyGlassButton label="Notifications" value="3" glyph={glyph} badge={dot} onPress={() => {}} />;
};

const themed = (isPressed: boolean) => (
  <Row>
    <Cell icon="pen" label="Stylo" tone="theme" isPressed={isPressed} />
    <Cell icon="pen" label="Stylo" kind="active" tone="theme" isPressed={isPressed} />
  </Row>
);

const sample = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  switch (state.id) {
    case 'normal':
      return container(isPressed);
    case 'seul':
      return <Cell icon="close" label="Fermer" tone="plain" isPressed={isPressed} />;
    case 'seul-clair':
      return <Cell icon="close" label="Fermer" tone="onLight" isPressed={isPressed} />;
    case 'actif':
      return <Cell icon="ellipsis" label="Ranger les actions" kind="active" isPressed={isPressed} />;
    case 'destructif':
      return <Cell icon="trash" label="Retirer" kind="destructive" size={40} isPressed={isPressed} />;
    case 'doux':
      return <Cell icon="back" label="Retour" kind="soft" size={40} isPressed={isPressed} />;
    case 'texte':
      return ownGlyphs(isPressed);
    case 'pastille':
      return badged(isPressed);
    case 'teinte':
      return <Cell icon="paste" label="Coller" tint="accent" isPressed={isPressed} />;
    case 'theme':
      return themed(isPressed);
    case 'desactive':
      return <Cell icon="scribble" label="Marqueur" isPressed={isPressed} disabled />;
    case 'tailles':
      return sizes(isPressed);
    default:
      return null;
  }
};

const TONES: Readonly<Record<string, MeeshyGlassTone>> = { seul: 'plain', 'seul-clair': 'onLight' };

export const contentK02 = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  const content = sample(state, isPressed);
  if (content === null || state.id === 'theme') return content;
  return (
    <Scene state={state}>
      <MeeshyGlassScope tone={TONES[state.id] ?? 'deep'}>{content}</MeeshyGlassScope>
    </Scene>
  );
};
