import type { ReactNode } from 'react';

import { MeeshyGlass, MeeshyGlassScope, type MeeshyGlassTone } from '../meeshy-glass-tone';
import { MeeshyToggleRow, MeeshyToggleRowFace, type MeeshyToggleRowProps } from '../meeshy-toggle-row';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { Scene } from './k01';

export const entryK06 = kitCatalogEntry({
  key: 'K06',
  name: 'MeeshyToggleRow',
  states: [
    kitCatalogState({ id: 'groupe', boardView: 'R11', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'sous-titre', boardView: 'A17', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'chevron', boardView: 'A14', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'valeur', boardView: 'A15', backdrop: 'media', isTouchable: true }),
    kitCatalogState({ id: 'bascule-ouverte', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'bascule-fermee', boardView: 'O10', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'coche', boardView: 'A18', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'accent', boardView: 'A18', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'case', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'sans-icone', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'destructif', backdrop: 'dark', isTouchable: true }),
    kitCatalogState({ id: 'desactive', backdrop: 'media' }),
    kitCatalogState({ id: 'emplacements', backdrop: 'dark' }),
    kitCatalogState({ id: 'theme', backdrop: 'light', isTouchable: true }),
    kitCatalogState({ id: 'teinte', backdrop: 'media', isTouchable: true }),
  ],
});

const PATHS = {
  mute: 'M4 9v6h3l4 3V6L7 9H4zM16 9l5 6M21 9l-5 6',
  loop: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 5v4h-4M4 19v-4h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  hash: 'M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
} as const;

type IconName = keyof typeof PATHS;

function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

type Spec = Omit<MeeshyToggleRowProps, 'onAction'> & { readonly icon?: IconName | undefined };

const noop = () => {};

const row = (spec: Spec, index: number, isStatic: boolean, isPressed: boolean): ReactNode => {
  const { icon, ...content } = spec;
  const props = {
    ...content,
    showsDivider: index > 0,
    leading: icon === undefined ? undefined : <Icon name={icon} />,
  };
  if (isStatic) return <MeeshyToggleRowFace key={spec.title} {...props} />;
  if (isPressed && index === 0) return <MeeshyToggleRowFace key={spec.title} {...props} isPressed />;
  return <MeeshyToggleRow key={spec.title} {...props} onAction={noop} />;
};

const sheetOf = (specs: readonly Spec[], tone: MeeshyGlassTone, isStatic: boolean, isPressed: boolean): ReactNode => (
  <MeeshyGlassScope tone={tone}>
    <MeeshyGlass tone={tone} className="block" style={{ borderRadius: 'var(--ios-radius-lg)', overflow: 'hidden' }}>
      {specs.map((spec, index) => row(spec, index, isStatic, isPressed))}
    </MeeshyGlass>
  </MeeshyGlassScope>
);

const TONES: Readonly<Record<string, MeeshyGlassTone>> = { theme: 'theme' };

const DESTRUCTIVE: Spec = { title: 'Tout effacer', kind: 'destructive', icon: 'trash' };

const sample = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  const tone = TONES[state.id] ?? 'deep';
  const isStatic = !state.isTouchable;
  const sheet = (specs: readonly Spec[]) => sheetOf(specs, tone, isStatic, isPressed);
  switch (state.id) {
    case 'groupe':
      return sheet([
        { title: 'Transitions', icon: 'eye', accessory: { type: 'chevron' } },
        { title: 'Effet visuel', icon: 'eye', accessory: { type: 'chevron' } },
        { title: 'Enregistrer dans Photos', icon: 'file' },
        { title: 'Autoriser la reprise du son', subtitle: 'D’autres pourront utiliser le son de cette vidéo', icon: 'loop', accessory: { type: 'toggle', isOn: true } },
        DESTRUCTIVE,
      ]);
    case 'sous-titre':
      return sheet([
        { title: '#senegal', subtitle: '12 k publications', icon: 'hash' },
        { title: '#coucherdesoleil', subtitle: '8,4 k publications', icon: 'hash' },
      ]);
    case 'chevron':
      return sheet([
        { title: 'Emprunter un son', subtitle: 'Bibliothèque Meeshy et sons repris', icon: 'music', accessory: { type: 'chevron' } },
        { title: 'Enregistrer un vocal', subtitle: 'Transcrit et traduit pour chacun', icon: 'mic', accessory: { type: 'chevron' } },
        { title: 'Importer un fichier', subtitle: 'MP3, M4A, WAV', icon: 'file', accessory: { type: 'chevron' } },
      ]);
    case 'valeur':
      return sheet([
        { title: 'Muet', icon: 'mute', accessory: { type: 'toggle', isOn: false } },
        { title: 'Atténuer sous les voix', icon: 'mute', accessory: { type: 'toggle', isOn: true } },
        { title: 'Langue du son', icon: 'globe', accessory: { type: 'value', text: 'Wolof' } },
      ]);
    case 'bascule-ouverte':
      return sheet([{ title: 'Muet', accessory: { type: 'toggle', isOn: true } }]);
    case 'bascule-fermee':
      return sheet([{ title: 'Visible du début à la fin', accessory: { type: 'toggle', isOn: false } }]);
    case 'coche':
      return sheet([
        { title: 'Plage de Ngor', subtitle: '350 m', icon: 'pin', accessory: { type: 'check', isSelected: true } },
        { title: 'Île de Ngor', subtitle: '1,2 km', icon: 'pin', accessory: { type: 'check', isSelected: false } },
      ]);
    case 'accent':
      return sheet([{ title: 'Autour de moi', icon: 'locate', kind: 'accent' }]);
    case 'case':
      return sheet([
        { title: 'Amis', accessory: { type: 'checkbox', isChecked: true } },
        { title: 'Proches', accessory: { type: 'checkbox', isChecked: false } },
      ]);
    case 'sans-icone':
      return sheet([{ title: 'Notifier seulement', accessory: { type: 'chevron' } }]);
    case 'destructif':
      return sheet([DESTRUCTIVE]);
    case 'desactive':
      return sheet([{ title: 'Visible', subtitle: 'Réglé par l’administrateur', accessory: { type: 'toggle', isOn: true }, disabled: true }]);
    case 'emplacements':
      return sheet([
        {
          title: 'Notifications',
          icon: 'bell',
          titleAccessory: <span style={{ inlineSize: 'var(--ios-space-lg)', blockSize: 'var(--ios-space-lg)', borderRadius: 'var(--ios-radius-full)', background: 'var(--ios-error)', color: 'var(--color-on-media)', fontSize: 'var(--ios-font-micro)', display: 'inline-grid', placeItems: 'center' }}>3</span>,
          trailing: <span>Bientôt</span>,
          accessory: { type: 'chevron' },
        },
      ]);
    case 'theme':
      return sheet([
        { title: 'Notifications', accessory: { type: 'toggle', isOn: true } },
        { title: 'Supprimer le compte', kind: 'destructive' },
      ]);
    case 'teinte':
      return sheet([{ title: 'Afficher la rangée', accessory: { type: 'toggle', isOn: true }, tint: 'var(--ios-indigo-300)' }]);
    default:
      return null;
  }
};

export const contentK06 = (state: MeeshyKitCatalogState, isPressed: boolean): ReactNode => {
  const content = sample(state, isPressed);
  if (content === null) return content;
  return <Scene state={state}>{content}</Scene>;
};
