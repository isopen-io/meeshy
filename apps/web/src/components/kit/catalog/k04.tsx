import type { ReactNode } from 'react';

import { MeeshyChipRow, type MeeshyChip, type MeeshyChipRowProps } from '../meeshy-chip-row';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';

export const entryK04 = kitCatalogEntry({
  key: 'K04',
  name: 'MeeshyChipRow',
  states: [
    kitCatalogState({ id: 'simple', boardView: 'S1', isTouchable: true }),
    kitCatalogState({ id: 'icone', boardView: 'A2', isTouchable: true }),
    kitCatalogState({ id: 'deborde', boardView: 'A12', isTouchable: true }),
    kitCatalogState({ id: 'deborde-milieu' }),
    kitCatalogState({ id: 'replie', boardView: 'A16', isTouchable: true }),
    kitCatalogState({ id: 'multiple', boardView: 'A17', isTouchable: true }),
    kitCatalogState({ id: 'egal' }),
    kitCatalogState({ id: 'theme', backdrop: 'light' }),
    kitCatalogState({ id: 'compact' }),
    kitCatalogState({ id: 'desactive' }),
  ],
});

const titled = (...titles: readonly string[]): readonly MeeshyChip[] => titles.map((title) => ({ id: title, title }));

const globe = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11" />
  </svg>
);

const magnifier = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5l3 3" />
  </svg>
);

const OPENING_EFFECTS = titled('Aucun', 'Fondu', 'Zoom', 'Glisse', 'Rebond');
const PROPORTIONS = titled('9:16', '4:5', '1:1', '16:9');
const AUDIENCES = titled('Tout le monde', 'Amis', 'Proches');
const LOOKS = titled('Classiques', 'Néon', 'Pastel', 'Rétro', 'Cinéma', 'Aquarelle', 'Noir et blanc', 'Vintage', 'Polaroïd', 'Grain', 'Chaleur', 'Fraîcheur');
const HASHTAGS: readonly MeeshyChip[] = ['#voyage', '#cuisine', '#musique', '#sport', '#cinéma'].map((title) => ({ id: title, title, trailing: 'remove', hint: 'retire le hashtag' }));
const WITH_ICONS: readonly MeeshyChip[] = [
  { id: 'recherche', title: '', icon: magnifier, accessibilityLabel: 'Recherche' },
  { id: 'langue', title: 'Langue : Français', icon: globe, trailing: 'chevron', kind: 'menu', hint: 'ouvre la liste' },
  { id: 'classiques', title: 'Classiques' },
  { id: 'neon', title: 'Néon' },
  { id: 'pastel', title: 'Pastel' },
];

const noop = (): void => {};

type Sample = { readonly props: Pick<MeeshyChipRowProps, 'chips' | 'selection' | 'label'> & Partial<MeeshyChipRowProps>; readonly pressed?: string };

const SAMPLES: Readonly<Record<string, Sample>> = {
  simple: { props: { chips: OPENING_EFFECTS, selection: ['Fondu'], label: 'Effet d’ouverture' }, pressed: 'Zoom' },
  icone: { props: { chips: WITH_ICONS, selection: ['classiques'], label: 'Effets', revealsSelection: false }, pressed: 'neon' },
  deborde: { props: { chips: LOOKS, selection: ['Classiques'], label: 'Looks' }, pressed: 'Néon' },
  'deborde-milieu': { props: { chips: LOOKS, selection: ['Vintage'], label: 'Looks' } },
  replie: { props: { chips: AUDIENCES, selection: ['Amis'], label: 'Qui peut le voir', layout: 'wrap' }, pressed: 'Proches' },
  multiple: { props: { chips: HASHTAGS, selection: ['#voyage', '#musique'], label: 'Hashtags', mode: 'multiple', layout: 'wrap' }, pressed: '#sport' },
  egal: { props: { chips: titled('Audio', 'Vidéo'), selection: ['Audio'], label: 'Type d’appel', layout: 'equal' } },
  theme: { props: { chips: PROPORTIONS, selection: ['1:1'], label: 'Proportions', surface: 'theme' } },
  compact: { props: { chips: PROPORTIONS, selection: ['9:16'], label: 'Proportions', size: 'compact' } },
  desactive: { props: { chips: OPENING_EFFECTS, selection: ['Fondu'], label: 'Effet d’ouverture', disabled: true } },
};

export const contentK04 = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  const sample = SAMPLES[state.id];
  if (sample === undefined) return null;
  const pressed = isPressed ? sample.pressed : undefined;
  return (
    <div
      style={{ inlineSize: '100%', boxSizing: 'border-box', background: state.id === 'theme' ? 'transparent' : 'var(--ios-indigo-950)', borderRadius: 'var(--ios-radius-md)', padding: 'var(--ios-space-md) 0' }}
      data-kit-chip-plate={state.id}
    >
      <MeeshyChipRow inset={16} {...sample.props} onChange={noop} {...(pressed === undefined ? {} : { previewPressed: pressed })} />
    </div>
  );
};
