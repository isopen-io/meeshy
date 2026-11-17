import type { ReactNode } from 'react';

import { MeeshyBadge } from '../meeshy-badge';
import { MeeshyButton, MeeshyButtonPair } from '../meeshy-button';
import { MeeshyKeyHint, MeeshyKeyLegend } from '../meeshy-key-hint';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { MeeshyMedallion, MeeshyMedallionRow } from '../meeshy-medallion';
import { MeeshyMeter } from '../meeshy-meter';
import { MEESHY_MOTION_TOKENS, meeshyMotionRecipe } from '../meeshy-motion';
import { MeeshyNote } from '../meeshy-note';

/**
 * LES ATOMES DU PROFIL AU CATALOGUE (#18874, chantier #18857) — K26, K40, K41, K42, K45,
 * K46, K55. Ils ne sont PAS dans `MeeshyKitCatalog.entries` : cette liste est égale, clé
 * pour clé, au registre `.claude/workflows/meeshy-kit-planche.lots.json`, qui n'a pas encore
 * ces numéros (un fichier de la chaîne outillage, pas du web). Ils vivent ici, à part, et
 * `MeeshyKitCatalog.atoms` / `atomContent` les rendent ; leur entrée dans le registre, avec
 * les images de référence, est un lot de la chaîne outillage.
 */
export type MeeshyKitAtom = { readonly entry: MeeshyKitCatalogEntry; readonly file: string };

const glyph = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

const CHAT = glyph('M3 4.5h10v6H7l-3 2.5v-2.5H3z');
const CHEVRON = glyph('M6 3l5 5-5 5');
const noop = (): void => {};

const states = (...ids: readonly (readonly [string, Partial<Parameters<typeof kitCatalogState>[0]>?])[]): readonly MeeshyKitCatalogState[] =>
  ids.map(([id, options]) => kitCatalogState({ id, ...options }));

export const entryK26 = kitCatalogEntry({ key: 'K26', name: 'MeeshyMotion', states: states(['jetons'], ['reduit']) });
export const entryK40 = kitCatalogEntry({
  key: 'K40',
  name: 'MeeshyButton',
  states: states(['genres', { isTouchable: true }], ['tailles', { isTouchable: true }], ['etats'], ['formes', { isTouchable: true }], ['paire', { isTouchable: true }], ['theme', { backdrop: 'light', isTouchable: true }]),
});
export const entryK41 = kitCatalogEntry({ key: 'K41', name: 'MeeshyBadge', states: states(['surfaces'], ['contenus'], ['tailles'], ['touchable', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK42 = kitCatalogEntry({ key: 'K42', name: 'MeeshyMeter', states: states(['formes'], ['teintes'], ['etats'], ['theme', { backdrop: 'light' }]) });
export const entryK45 = kitCatalogEntry({ key: 'K45', name: 'MeeshyMedallion', states: states(['genres'], ['formes'], ['decors'], ['etats'], ['theme', { backdrop: 'light' }]) });
export const entryK46 = kitCatalogEntry({ key: 'K46', name: 'MeeshyNote', states: states(['formes'], ['sens'], ['direct'], ['theme', { backdrop: 'light' }]) });
export const entryK55 = kitCatalogEntry({ key: 'K55', name: 'MeeshyKeyHint', states: states(['touches'], ['legende', { backdrop: 'media' }], ['autre-machine']) });

const row = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>{children}</div>;

const contentK26 = (state: MeeshyKitCatalogState): ReactNode =>
  row(
    MEESHY_MOTION_TOKENS.map((token) => {
      const recipe = meeshyMotionRecipe(token, state.id === 'reduit');
      return (
        <span key={token} data-motion-token={token}>
          motion.{token} · {recipe.nature} · {recipe.durationMs} ms · {recipe.haptic}
        </span>
      );
    }),
  );

const contentK40 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'tailles') return row([56, 50, 44, 36].map((size) => <MeeshyButton key={size} title={`s${size}`} size={size as 56} glyph={CHAT} onPress={noop} />));
  if (state.id === 'etats') {
    return row(
      <>
        <MeeshyButton title="Écrire" glyph={CHAT} onPress={noop} />
        <MeeshyButton title="Envoyer" isPending glyph={CHAT} pendingLabel="en cours" onPress={noop} />
        <MeeshyButton title="Demander" disabled disabledReason="Pas de nouvelles demandes" onPress={noop} />
        <MeeshyButton title="Envoyer" isDeferred deferredLabel="sera envoyé" onPress={noop} />
      </>,
    );
  }
  if (state.id === 'formes') {
    return row(
      <>
        <MeeshyButton title="Nouveau message" shape="round" glyph={CHAT} onPress={noop} />
        <MeeshyButton title="Maintenir pour parler" shape="hold" glyph={CHAT} holdState="idle" onHoldChange={noop} />
      </>,
    );
  }
  if (state.id === 'paire') return <MeeshyButtonPair primary={<MeeshyButton title="Accepter" onPress={noop} />} secondary={<MeeshyButton title="Refuser" kind="outline" onPress={noop} />} />;
  const scheme = state.id === 'theme' ? 'light' : 'dark';
  return row((['primary', 'accent', 'tinted', 'glass', 'outline', 'danger', 'text'] as const).map((kind) => <MeeshyButton key={kind} title={kind} kind={kind} scheme={scheme} trailing={CHEVRON} onPress={noop} />));
};

const contentK41 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'contenus') {
    return row(
      <>
        <MeeshyBadge content={{ label: 'Vérifié' }} kind="ok" />
        <MeeshyBadge content={{ count: 150 }} kind="err" surface="solid" label="150 non lus" />
        <MeeshyBadge content={{ code: 'PT' }} surface="outline" />
        <MeeshyBadge content={{ time: '17:42' }} />
        <MeeshyBadge content={{ ordinal: 2 }} kind="accent" />
      </>,
    );
  }
  if (state.id === 'tailles') return row([18, 22, 28, 36].map((size) => <MeeshyBadge key={size} content={{ label: `${size}` }} size={size as 18} />));
  if (state.id === 'touchable') return <MeeshyBadge content={{ label: 'Or III' }} leading={{ glyph: CHAT }} surface="glass" size={36} label="Or III" onPress={noop} />;
  return row((['glass', 'tonal', 'solid', 'outline'] as const).map((surface) => <MeeshyBadge key={surface} content={{ label: surface }} surface={surface} kind="accent" scheme={state.id === 'theme' ? 'light' : 'dark'} />));
};

const contentK42 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'formes') {
    return (
      <>
        <MeeshyMeter value={23} total={50} label="Arrivées" title="Entrées" valueText="23 / 50" />
        <MeeshyMeter value={2} total={3} label="Tes quotas" form={{ stepped: 3 }} size={12} />
        <MeeshyMeter value={0} label="Chargement" form="indeterminate" />
      </>
    );
  }
  if (state.id === 'etats') {
    return (
      <>
        <MeeshyMeter value={50} total={50} label="Plein" kind="ok" fullKind="err" />
        <MeeshyMeter value={64} total={100} label="Périmé" isStale />
        <MeeshyMeter value={0} total={50} label="Vide" />
      </>
    );
  }
  return (
    <>
      {(['accent', 'ok', 'warn', 'err'] as const).map((kind) => (
        <MeeshyMeter key={kind} value={64} total={100} label={kind} kind={kind} />
      ))}
    </>
  );
};

const contentK45 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'formes') return row((['disc', 'squircle', 'scallop', 'blob'] as const).map((shape) => <MeeshyMedallion key={shape} shape={shape} size={64} value="31" />));
  if (state.id === 'decors') {
    return row(
      <>
        <MeeshyMedallion size={64} glyph={CHAT} decor="halo" />
        <MeeshyMedallion size={64} glyph={CHAT} decor="dashed" />
        <MeeshyMedallion size={64} glyph={CHAT} decor={['struck', 'dashed']} />
        <MeeshyMedallion size={64} glyph={CHAT} decor={{ waves: 2 }} />
      </>,
    );
  }
  if (state.id === 'etats') {
    return (
      <MeeshyMedallionRow earned={2} total={3} caption="2 trophées sur 3">
        <MeeshyMedallion glyph={CHAT} state="earned" />
        <MeeshyMedallion glyph={CHAT} state="current" />
        <MeeshyMedallion glyph={CHAT} state="locked" />
      </MeeshyMedallionRow>
    );
  }
  return row((['accent', 'ok', 'warn', 'err', 'neutral'] as const).map((kind) => <MeeshyMedallion key={kind} kind={kind} glyph={CHAT} />));
};

const contentK46 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'sens') return <>{(['neutral', 'info', 'ok', 'warn', 'security'] as const).map((kind) => <MeeshyNote key={kind} text={`Note ${kind}`} form="band" kind={kind} />)}</>;
  if (state.id === 'direct') return <MeeshyNote text="Position en direct · mise à jour il y a 20 s" form="live" kind="ok" />;
  return (
    <>
      <MeeshyNote text="Suivi : choisis ta cible à l’étape suivante" />
      <MeeshyNote text="Rien n’a été envoyé" form="band" kind="info" detail="Le bouton est revenu comme avant" />
      <MeeshyNote text="Hors ligne · tu vois la dernière version connue" form="banner" kind="warn" action={<MeeshyButton title="Réessayer" kind="text" size={36} onPress={noop} />} />
    </>
  );
};

const contentK55 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'legende') {
    return <MeeshyKeyLegend platform="apple" hasKeyboard container="glassBar" items={[{ id: 'map', combos: [[{ character: 'm' }]], title: 'Carte' }, { id: 'write', combos: [['primary', 'enter']], title: 'Écrire', startsGroup: true }]} />;
  }
  const platform = state.id === 'autre-machine' ? 'other' : 'apple';
  return row(
    <>
      <MeeshyKeyHint keys={['primary', { character: 'k' }]} platform={platform} hasKeyboard />
      <MeeshyKeyHint keys={['escape']} platform={platform} hasKeyboard />
      <MeeshyKeyHint keys={['left', 'right']} platform={platform} hasKeyboard size="compact" />
    </>,
  );
};

export const MEESHY_KIT_ATOMS: readonly MeeshyKitAtom[] = [
  { entry: entryK26, file: 'meeshy-motion.ts' },
  { entry: entryK40, file: 'meeshy-button.tsx' },
  { entry: entryK41, file: 'meeshy-badge.tsx' },
  { entry: entryK42, file: 'meeshy-meter.tsx' },
  { entry: entryK45, file: 'meeshy-medallion.tsx' },
  { entry: entryK46, file: 'meeshy-note.tsx' },
  { entry: entryK55, file: 'meeshy-key-hint.tsx' },
];

const CONTENTS: Readonly<Record<string, (state: MeeshyKitCatalogState) => ReactNode>> = {
  K26: contentK26,
  K40: contentK40,
  K41: contentK41,
  K42: contentK42,
  K45: contentK45,
  K46: contentK46,
  K55: contentK55,
};

export const atomEntries: readonly MeeshyKitCatalogEntry[] = MEESHY_KIT_ATOMS.map((atom) => atom.entry);

export const atomContent = (key: string, state: MeeshyKitCatalogState): ReactNode => CONTENTS[key]?.(state) ?? null;
