import type { ReactNode } from 'react';

import { MeeshyCircleScale } from '../meeshy-circle-scale';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { MeeshyLockedGroup, MeeshyLockedRow } from '../meeshy-locked-row';
import { MeeshySkeleton } from '../meeshy-skeleton';
import { MeeshyStepper } from '../meeshy-stepper';
import { MeeshyTranslationMark } from '../meeshy-translation-mark';
import { MeeshyWavePlayer } from '../meeshy-wave-player';

/**
 * LA SECONDE SÉRIE D'ATOMES DU PROFIL AU CATALOGUE (#18875, chantier #18857) — K33, K35,
 * K37, K38 (le seul atome `MeeshySkeleton`), K51, K53. Même régime que `atoms.tsx` : ils ne
 * sont pas dans le registre `.claude/workflows/meeshy-kit-planche.lots.json` (fichier de la
 * chaîne outillage), ils vivent à part et `MeeshyKitCatalog.atoms` les rend.
 */
export type MeeshyKitAtomB = { readonly entry: MeeshyKitCatalogEntry; readonly file: string };

const glyph = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const DOT = glyph('M8 4v8M4 8h8');
const CHECK = glyph('m3.5 8.5 3 3 6-7');
const noop = (): void => {};

const states = (...ids: readonly (readonly [string, Partial<Parameters<typeof kitCatalogState>[0]>?])[]): readonly MeeshyKitCatalogState[] =>
  ids.map(([id, options]) => kitCatalogState({ id, ...options }));

export const entryK33 = kitCatalogEntry({ key: 'K33', name: 'MeeshyCircleScale', states: states(['formes'], ['niveaux'], ['selection', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK35 = kitCatalogEntry({ key: 'K35', name: 'MeeshyWavePlayer', states: states(['repos', { isTouchable: true }], ['lecture', { isTouchable: true }], ['phases'], ['compact', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK37 = kitCatalogEntry({ key: 'K37', name: 'MeeshyLockedRow', states: states(['formes'], ['geste', { isTouchable: true }], ['ouvert'], ['groupe', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK38 = kitCatalogEntry({ key: 'K38', name: 'MeeshySkeleton', states: states(['formes'], ['theme', { backdrop: 'light' }]) });
export const entryK51 = kitCatalogEntry({ key: 'K51', name: 'MeeshyTranslationMark', states: states(['densites'], ['modes', { isTouchable: true }], ['sans-geste'], ['legende', { backdrop: 'media' }]) });
export const entryK53 = kitCatalogEntry({ key: 'K53', name: 'MeeshyStepper', states: states(['boutons', { isTouchable: true }], ['piste', { isTouchable: true }], ['jalons'], ['theme', { backdrop: 'light' }]) });

const LEVELS = ['Public', 'Communauté', 'Connaissance', 'Ami', 'Proche', 'Sang'].map((title) => ({ title, glyph: DOT }));
const WORDS_WAVE = { play: 'Lire', pause: 'Mettre en pause', replay: 'Rejouer', buffering: 'Chargement', unavailable: 'Indisponible', position: 'Position', positionText: (elapsed: number, total: number) => `${elapsed} s sur ${total}` };
const WORDS_LOCKED = { locked: 'verrouillé', unlocked: 'déverrouillé', pending: 'en cours' };
const WORDS_MARK = { translated: 'Traduit', original: 'Original', showOriginal: 'Voir l’original', showTranslation: 'Voir la traduction' };
const SAMPLES = Array.from({ length: 96 }, (_, index) => 0.25 + 0.7 * Math.abs(Math.sin(index / 5)));
const STOPS = [{ id: 'city', title: 'Ville', markSize: 14 }, { id: 'quarter', title: 'Quartier', markSize: 28 }, { id: 'exact', title: 'Exact', markSize: 44 }];
const MILESTONES = [
  { id: 'a', title: 'Premier message', caption: '6 mars', glyph: CHECK },
  { id: 'b', title: 'Amis', caption: '11 mars', glyph: CHECK },
  { id: 'c', title: 'Proches', caption: '19 mars', glyph: DOT },
  { id: 'd', title: '1 000 messages', glyph: DOT },
];

const column = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>;

const contentK33 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'niveaux') {
    return column(
      <>
        <MeeshyCircleScale levels={LEVELS.slice(1)} current={3} counts={[46, 31, 9, 3, 1]} />
        <MeeshyCircleScale levels={[LEVELS[0], LEVELS[3], LEVELS[5]].map((level) => level ?? { title: '' })} current={1} form="pill" size="compact" />
      </>,
    );
  }
  if (state.id === 'selection') return <MeeshyCircleScale levels={LEVELS} current={3} counts={[128, 46, 31, 9, 3, 0]} onSelect={noop} />;
  if (state.id === 'formes') {
    return column(
      <>
        <MeeshyCircleScale levels={LEVELS} current={4} counts={[128, 46, 31, 9, 3, 1]} />
        <MeeshyCircleScale levels={LEVELS} current={4} form="pill" />
        <MeeshyCircleScale levels={LEVELS} current={4} other={5} form="rings" center={<b>AN</b>} marker={<b>LM</b>} />
      </>,
    );
  }
  return <MeeshyCircleScale levels={LEVELS} current={3} counts={[128, 46, 31, 9, 3, 1]} />;
};

const contentK35 = (state: MeeshyKitCatalogState): ReactNode => {
  const common = { label: 'Voix de Léo', words: WORDS_WAVE, samples: SAMPLES, duration: 9, onToggle: noop } as const;
  if (state.id === 'phases') {
    return column(
      <>
        <MeeshyWavePlayer {...common} phase="buffering" progress={0.4} isPlaying />
        <MeeshyWavePlayer {...common} phase="unavailable" progress={0} isPlaying={false} />
        <MeeshyWavePlayer {...common} progress={1} isPlaying={false} />
      </>,
    );
  }
  if (state.id === 'compact') return <MeeshyWavePlayer {...common} size="compact" progress={0.55} isPlaying onScrub={noop} trailing={<span>1×</span>} />;
  return <MeeshyWavePlayer {...common} progress={state.id === 'lecture' ? 0.55 : 0} isPlaying={state.id === 'lecture'} onScrub={noop} />;
};

const contentK37 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'formes') {
    return column(
      <>
        <MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS_LOCKED} />
        <div style={{ inlineSize: 164 }}>
          <MeeshyLockedRow form="tile" title="Cadre Or" requirement="niveau 30" words={WORDS_LOCKED} glyph={DOT} />
        </div>
        <MeeshyLockedRow form="inline" title="Batterie" requirement="dès Proche" words={WORDS_LOCKED} />
      </>,
    );
  }
  if (state.id === 'geste') {
    return column(
      <>
        <MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS_LOCKED} action={{ title: 'Demander', perform: noop }} />
        <MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS_LOCKED} action={{ title: 'Envoi', isPending: true, perform: noop }} />
        <MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS_LOCKED} action={{ title: 'Demandé', isDone: true, perform: noop }} />
      </>,
    );
  }
  if (state.id === 'ouvert') return <MeeshyLockedRow title="Batterie" requirement="dès Proche" words={WORDS_LOCKED} isOpen glyph={DOT} />;
  if (state.id === 'groupe') {
    return (
      <MeeshyLockedGroup title="3 choses réservées" requirement="dès Proche" count={3} expanded onExpandedChange={noop} words={WORDS_LOCKED}>
        <MeeshyLockedRow form="inline" title="Position continue" requirement="dès Proche" words={WORDS_LOCKED} />
        <MeeshyLockedRow form="inline" title="Historique 30 jours" requirement="dès Proche" words={WORDS_LOCKED} />
      </MeeshyLockedGroup>
    );
  }
  return <MeeshyLockedRow title="Présence" requirement="dès Ami" words={WORDS_LOCKED} />;
};

const contentK38 = (): ReactNode =>
  column(
    <>
      <MeeshySkeleton shape={{ kind: 'line', widthRatio: 0.7 }} />
      <MeeshySkeleton shape={{ kind: 'line', widthRatio: 0.45, height: 11 }} />
      <MeeshySkeleton shape={{ kind: 'pill', width: 96 }} />
      <MeeshySkeleton shape={{ kind: 'circle', diameter: 60 }} />
      <MeeshySkeleton shape={{ kind: 'ticket', height: 96, cut: 14 }} />
      <MeeshySkeleton shape={{ kind: 'card', aspect: 4 / 3, radius: 18 }} />
    </>,
  );

const contentK51 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'densites') {
    return column(
      <>
        <MeeshyTranslationMark density="icon" isShowingOriginal={false} words={WORDS_MARK} sourceLanguageName="de l’italien" />
        <MeeshyTranslationMark sourceLanguageName="de l’italien" isShowingOriginal={false} words={WORDS_MARK} onToggle={noop} />
      </>,
    );
  }
  if (state.id === 'modes') {
    return column(
      <>
        <MeeshyTranslationMark sourceLanguageName="de l’arabe" isShowingOriginal={false} words={WORDS_MARK} onToggle={noop} />
        <MeeshyTranslationMark originalLanguageName="en arabe" isShowingOriginal words={WORDS_MARK} onToggle={noop} />
        <MeeshyTranslationMark mode="announce" announcement="Il le lira en portugais" isShowingOriginal={false} words={WORDS_MARK} />
      </>,
    );
  }
  if (state.id === 'legende') return <MeeshyTranslationMark density="legend" caption="Le tram 28, avant tout le monde." isShowingOriginal={false} words={WORDS_MARK} onToggle={noop} />;
  return <MeeshyTranslationMark sourceLanguageName="du portugais du Brésil" isShowingOriginal={false} words={WORDS_MARK} />;
};

const contentK53 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'piste') return <MeeshyStepper kind="track" label="Précision" value={1} stops={STOPS} onChange={noop} />;
  if (state.id === 'jalons') return <MeeshyStepper kind="milestones" label="Notre histoire" value={2} stops={MILESTONES} />;
  return <MeeshyStepper label="Nombre d’entrées" value={50} range={{ min: 1, max: 50 }} decrementLabel="Moins d’entrées" incrementLabel="Plus d’entrées" onChange={noop} />;
};

export const MEESHY_KIT_ATOMS_B: readonly MeeshyKitAtomB[] = [
  { entry: entryK33, file: 'meeshy-circle-scale.tsx' },
  { entry: entryK35, file: 'meeshy-wave-player.tsx' },
  { entry: entryK37, file: 'meeshy-locked-row.tsx' },
  { entry: entryK38, file: 'meeshy-skeleton.tsx' },
  { entry: entryK51, file: 'meeshy-translation-mark.tsx' },
  { entry: entryK53, file: 'meeshy-stepper.tsx' },
];

export const CONTENTS_B: Readonly<Record<string, (state: MeeshyKitCatalogState) => ReactNode>> = {
  K33: contentK33,
  K35: contentK35,
  K37: contentK37,
  K38: contentK38,
  K51: contentK51,
  K53: contentK53,
};
