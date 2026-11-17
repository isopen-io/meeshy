import type { ReactNode } from 'react';

import { MeeshyAvatarGroup } from '../meeshy-avatar-group';
import { MeeshyAvatarMorph, MeeshyAvatarMorphScope } from '../meeshy-avatar-morph';
import { MeeshyChart, type MeeshyChartPoint } from '../meeshy-chart';
import { MeeshyChoiceTiles } from '../meeshy-choice-tiles';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { MeeshyBlurDisc, MeeshyMapPin, MeeshyMapPinPreview, MeeshyPinCluster } from '../meeshy-map-pin';
import { MeeshyMapTrace } from '../meeshy-map-trace';
import { MeeshyMediaGrid, type MeeshyMediaGridItem } from '../meeshy-media-grid';
import { MeeshyReorderList } from '../meeshy-reorder-list';

/**
 * LA SECONDE SÉRIE D'ASSEMBLAGES DU PROFIL AU CATALOGUE (#18877, chantier #18857) — K29, K36,
 * K47, K48, K49, K50, K52, K54 (K38 `MeeshyStateBlock` est dans `atoms-b.tsx`, avec son atome).
 * Même régime que `atoms.tsx` : pas dans le registre `.claude/workflows/meeshy-kit-planche.lots.json`
 * (fichier de la chaîne outillage), ils vivent à part et `MeeshyKitCatalog.atoms` les rend.
 */
export type MeeshyKitAssemblyB = { readonly entry: MeeshyKitCatalogEntry; readonly file: string };

const glyph = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const CHAT = glyph('M3 4.5h10v6H7l-3 2.5v-2.5H3z');
const PERSON = glyph('M8 7.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3.5 13.5a4.5 4.5 0 019 0');
const noop = (): void => {};

// harmony-exempt: teintes d'exemple du catalogue — des couleurs choisies par l'hôte, que le kit reçoit en paramètre
const TINTS = { violet: '#A855F7', teal: '#4ECDC4', amber: '#F8B500', indigo: '#818CF8' } as const;

const states = (...ids: readonly (readonly [string, Partial<Parameters<typeof kitCatalogState>[0]>?])[]): readonly MeeshyKitCatalogState[] =>
  ids.map(([id, options]) => kitCatalogState({ id, ...options }));

export const entryK29 = kitCatalogEntry({ key: 'K29', name: 'MeeshyAvatarMorph', states: states(['jalons'], ['anneau-badge'], ['progression']) });
export const entryK36 = kitCatalogEntry({ key: 'K36', name: 'MeeshyMapPin', states: states(['precisions', { isTouchable: true }], ['etats'], ['grappe', { isTouchable: true }], ['apercu', { isTouchable: true }]) });
export const entryK47 = kitCatalogEntry({ key: 'K47', name: 'MeeshyChoiceTiles', states: states(['unique', { isTouchable: true }], ['multiple', { isTouchable: true }], ['valeurs', { isTouchable: true }], ['ferme', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK48 = kitCatalogEntry({ key: 'K48', name: 'MeeshyAvatarGroup', states: states(['pile'], ['duo'], ['rangee', { isTouchable: true }], ['grille'], ['theme', { backdrop: 'light' }]) });
export const entryK49 = kitCatalogEntry({ key: 'K49', name: 'MeeshyMediaGrid', states: states(['regulier', { isTouchable: true }], ['maconnerie', { isTouchable: true }], ['rangee', { isTouchable: true }], ['etats'], ['theme', { backdrop: 'light' }]) });
export const entryK50 = kitCatalogEntry({ key: 'K50', name: 'MeeshyChart', states: states(['barres'], ['courbe'], ['anneau'], ['entonnoir'], ['repartition'], ['bande'], ['bulles'], ['etats']) });
export const entryK52 = kitCatalogEntry({ key: 'K52', name: 'MeeshyReorderList', states: states(['rang', { isTouchable: true }], ['sans-rang', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK54 = kitCatalogEntry({ key: 'K54', name: 'MeeshyMapTrace', states: states(['genres'], ['relecture'], ['perime'], ['carte-claire', { backdrop: 'light' }]) });

const column = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>;
const row = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>{children}</div>;
const stage = (heightRem: number, children: ReactNode): ReactNode => <div style={{ position: 'relative', blockSize: `${heightRem}rem`, overflow: 'hidden', borderRadius: 16, background: 'color-mix(in srgb, var(--color-ios-ink) 8%, transparent)' }}>{children}</div>;
const face = (initials: string, size: number, tint: string): ReactNode => (
  <span style={{ display: 'grid', placeItems: 'center', inlineSize: size, blockSize: size, borderRadius: 999, background: tint, color: 'var(--color-ios-on-brand)', fontWeight: 800, fontSize: size * 0.34 }}>{initials}</span>
);
const FACES: readonly (readonly [string, string])[] = [['MO', TINTS.violet], ['TR', TINTS.teal], ['YT', TINTS.amber], ['KM', TINTS.indigo], ['LM', TINTS.violet], ['SB', TINTS.teal]];
const faceAt = (index: number, size: number): ReactNode => face(FACES[index % FACES.length]?.[0] ?? '·', size, FACES[index % FACES.length]?.[1] ?? TINTS.violet);

const contentK29 = (state: MeeshyKitCatalogState): ReactNode => (
  <MeeshyAvatarMorphScope>
    {state.id === 'anneau-badge' ? (
      <MeeshyAvatarMorph id="k29-ring" size={112} ring={<span style={{ display: 'block', inlineSize: '100%', blockSize: '100%', borderRadius: 999, border: `3px solid ${TINTS.teal}` }} />} badge={<span style={{ display: 'block', inlineSize: 28, blockSize: 28, borderRadius: 999, background: TINTS.amber }} />} ringTravels>
        {faceAt(4, 112)}
      </MeeshyAvatarMorph>
    ) : state.id === 'progression' ? (
      row([0, 0.5, 1].map((progress) => (
        <MeeshyAvatarMorph key={progress} id={`k29-p-${progress}`} size={56} progress={progress}>
          {faceAt(4, 56)}
        </MeeshyAvatarMorph>
      )))
    ) : (
      row([36, 44, 56, 112].map((size) => (
        <MeeshyAvatarMorph key={size} id={`k29-${size}`} size={size}>
          {faceAt(4, size)}
        </MeeshyAvatarMorph>
      )))
    )}
  </MeeshyAvatarMorphScope>
);

const contentK36 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'grappe') {
    return row(
      <>
        <MeeshyPinCluster label="3 personnes" count={3} tint={TINTS.violet} onPress={noop}>{[0, 1, 2].map((index) => faceAt(index, 36))}</MeeshyPinCluster>
        <MeeshyPinCluster label="12 publications" count={12} tint={TINTS.teal} />
        <MeeshyPinCluster label="Plus de cent" count={140} tint={TINTS.amber} />
      </>,
    );
  }
  if (state.id === 'apercu') return <MeeshyMapPinPreview label="Alfama, Lisbonne" title="Alfama, Lisbonne" subtitle="Quartier · encore 42 min" tint={TINTS.violet} onPress={noop} background={<div style={{ inlineSize: '100%', blockSize: '100%', background: 'linear-gradient(135deg, var(--color-ios-fill), var(--color-ios-card))' }} />}><MeeshyMapPin label="Léo" tint={TINTS.violet}>{faceAt(4, 48)}</MeeshyMapPin></MeeshyMapPinPreview>;
  if (state.id === 'etats') {
    return stage(11, row(
      <>
        <MeeshyMapPin label="Léo, sélectionné" tint={TINTS.violet} precision={{ area: 53 }} isSelected caption="quartier">{faceAt(4, 56)}</MeeshyMapPin>
        <MeeshyMapPin label="Tomás, il y a 12 min" tint={TINTS.teal} precision={{ area: 40 }} isStale caption="il y a 12 min">{faceAt(1, 48)}</MeeshyMapPin>
        <MeeshyMapPin label="Moi" kind="own" tint={TINTS.amber}>{faceAt(0, 38)}</MeeshyMapPin>
        <MeeshyMapPin label="Quelqu’un" kind="ghost" tint={TINTS.indigo}>{PERSON}</MeeshyMapPin>
      </>,
    ));
  }
  return stage(11, row(
    <>
      <MeeshyMapPin label="Moi, position exacte" tint={TINTS.violet} isLive onPress={noop}>{faceAt(0, 48)}</MeeshyMapPin>
      <MeeshyMapPin label="Léo, quartier" tint={TINTS.teal} precision={{ area: 53 }} caption="quartier">{faceAt(4, 48)}</MeeshyMapPin>
      <MeeshyMapPin label="Tomás, ville" tint={TINTS.amber} precision={{ wide: 86 }} caption="ville"><MeeshyBlurDisc radius={0} />{faceAt(1, 48)}</MeeshyMapPin>
    </>,
  ));
};

const TILES = [
  { id: 'profile', title: 'Mon profil', detail: 'Ta vitrine publique, avec QR', glyph: CHAT },
  { id: 'chat', title: 'Une conversation', detail: 'Fais entrer des invités, même sans compte', glyph: CHAT },
  { id: 'community', title: 'Une communauté', detail: 'Ouvre la porte à de nouveaux membres', glyph: PERSON },
  { id: 'locked', title: 'Sang seulement', state: { locked: 'dès Sang' }, glyph: PERSON },
] as const;

const contentK47 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'multiple') return <MeeshyChoiceTiles label="Ce que je donne" items={TILES} selection={{ multiple: new Set(['profile', 'chat']) }} countLabel={(n, total) => `${n} sur ${total}`} surface="glass" onSelect={noop} />;
  if (state.id === 'valeurs') {
    return <MeeshyChoiceTiles label="Pendant" content="value" columns={3} tint={TINTS.violet} selection={{ single: 'h1' }} onSelect={noop} items={[{ id: 'm15', title: '15 min', value: '15', unit: 'min' }, { id: 'h1', title: '1 heure', value: '1', unit: 'h' }, { id: 'h4', title: '4 heures', value: '4', unit: 'h' }]} />;
  }
  if (state.id === 'ferme') return <MeeshyChoiceTiles label="Durée" selection={{ single: 'profile' }} items={TILES} onSelect={noop} onLockedTap={noop} />;
  return <MeeshyChoiceTiles label="Type de lien" tint={TINTS.teal} selection={{ single: 'chat' }} items={TILES.slice(0, 3)} onSelect={noop} />;
};

const contentK48 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'duo') return <MeeshyAvatarGroup count={2} layout="duo" size={72} label="Aïssa et Léo" tint={TINTS.violet} cell={faceAt} />;
  if (state.id === 'rangee') return <MeeshyAvatarGroup count={4} layout="rail" size={56} label="Suggestions" caption={(index) => ['Mina', 'Tomás', 'Yuki', 'Kwame'][index] ?? null} selection={{ multiple: new Set([0, 2]) }} onSelectionChange={noop} cell={faceAt} />;
  if (state.id === 'grille') return <MeeshyAvatarGroup count={12} layout={{ grid: 4 }} size={44} max={7} label="Mes amis" cell={faceAt} />;
  return column(
    <>
      <MeeshyAvatarGroup count={12} layout="stack" size={40} max={4} summary="Mina, Kwame et 10 autres" showsChevron onPress={noop} cell={faceAt} />
      <MeeshyAvatarGroup count={5} layout="stack" size={26} label="Cinq amis" cell={faceAt} />
    </>,
  );
};

const photo = (id: string): ReactNode => <span style={{ display: 'block', inlineSize: '100%', blockSize: '100%', background: `linear-gradient(${(id.charCodeAt(0) % 9) * 40}deg, ${TINTS.violet}, ${TINTS.teal})` }} />;
const MEDIA: readonly MeeshyMediaGridItem[] = [
  { id: 'a', kind: 'media', label: 'Ouvrir le réel de 24 secondes', badge: { value: '0:24' }, caption: 'réel · Alfama' },
  { id: 'b', kind: 'media', label: 'Ouvrir la photo', aspect: 0.75 },
  { id: 'c', kind: 'text', label: 'Ouvrir le statut', overline: 'Statut', text: 'Lumière de 18 h sur le Tage.', tint: TINTS.violet },
  { id: 'd', kind: 'media', label: 'Ouvrir la story', aspect: 1.2 },
  { id: 'e', kind: 'media', label: 'Ouvrir la photo', aspect: 0.9 },
  { id: 'f', kind: 'media', label: 'Ouvrir le réel', aspect: 0.6, badge: { value: '0:41' } },
];

const contentK49 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'maconnerie') return <MeeshyMediaGrid label="Publications de Léo" layout="masonry" columns={2} items={MEDIA} onOpen={noop} content={(item) => photo(item.id)} />;
  if (state.id === 'rangee') return <MeeshyMediaGrid label="Vitrine" layout="row" columns={3} items={MEDIA} onOpen={noop} content={(item) => photo(item.id)} />;
  if (state.id === 'etats') return <MeeshyMediaGrid label="Chargement" columns={3} items={[{ id: 's1', kind: 'skeleton', label: '' }, { id: 's2', kind: 'skeleton', label: '' }, { id: 'g1', kind: 'ghost', label: '' }]} onOpen={noop} />;
  return <MeeshyMediaGrid label="Médias échangés" columns={3} spacing="tight" items={MEDIA} onOpen={noop} content={(item) => photo(item.id)} />;
};

const point = (id: string, value: number, label = id): MeeshyChartPoint => ({ id, value, label, spoken: `${label}, ${value}` });
const DAYS = [4, 12, 30, 7, 214, 90, 41, 18, 5, 0, 22, 60].map((value, index) => point(`d${index}`, value, `${index + 1} nov.`));

const contentK50 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'courbe') return <MeeshyChart kind="line" points={DAYS} summary="Un rythme sur douze jours" tint={TINTS.violet} axisLabels={['1 nov.', '12 nov.']} markers={[{ kind: 'peak' }, { kind: 'today' }]} />;
  if (state.id === 'anneau') return <MeeshyChart kind="donut" points={[point('p', 81, 'Téléphone'), point('o', 16, 'Ordinateur'), point('t', 3, 'Tablette')]} summary="Appareils : 81 % téléphone" center={<span>81 %</span>} tint={TINTS.teal} />;
  if (state.id === 'entonnoir') return <MeeshyChart kind="funnel" points={[point('v', 38, 'Visites'), point('i', 17, 'Inscriptions'), point('a', 14, 'Actifs')]} summary="De 38 visites à 14 actifs" tint={TINTS.indigo} />;
  if (state.id === 'repartition') return <MeeshyChart kind="breakdown" points={[point('sn', 38, 'Sénégal'), point('fr', 24, 'France'), point('ci', 11, 'Côte d’Ivoire')]} summary="Sénégal en tête, 38 %" />;
  if (state.id === 'bande') return <MeeshyChart kind="strip" points={Array.from({ length: 30 }, (_, index) => point(`j${index}`, (index * 7) % 11, `jour ${index + 1}`))} summary="Trente jours d'un regard" tint={TINTS.amber} />;
  if (state.id === 'bulles') return <MeeshyChart kind="bubbles" points={[{ ...point('a', 488, 'SN'), position: { x: 0.25, y: 0.45 } }, { ...point('b', 308, 'FR'), position: { x: 0.6, y: 0.4 } }, { ...point('c', 52, 'PT'), position: { x: 0.45, y: 0.75 } }]} summary="Trois pays" tint={TINTS.violet} />;
  if (state.id === 'etats') return column(<><MeeshyChart kind="bars" points={[]} summary="Aucun clic" emptyText="Aucun clic sur la période" axisLabels={['18 oct.', '16 nov.']} /><MeeshyChart kind="bars" points={DAYS} summary="Chargement" isLoading /></>);
  return <MeeshyChart kind="bars" points={DAYS} summary="Pic le 5 novembre, 214 clics" tint={TINTS.violet} axisLabels={['1 nov.', '6 nov.', '12 nov.']} selection="d4" onSelect={noop} callout={(id) => (id === 'd4' ? { title: '5 nov.', value: '214', note: 'le meilleur jour' } : null)} />;
};

const LANGS = [{ id: 'fr', name: 'Français' }, { id: 'en', name: 'Anglais' }, { id: 'wo', name: 'Wolof' }];
const LABELS = { handle: (title: string) => `Déplacer ${title}`, moveUp: 'Monter', moveDown: 'Descendre', announce: (title: string, rank: number, count: number) => `${title}, rang ${rank} sur ${count}` };

const contentK52 = (state: MeeshyKitCatalogState): ReactNode => (
  <MeeshyReorderList
    label="Langues, par priorité"
    items={LANGS}
    getId={(lang) => lang.id}
    title={(lang) => lang.name}
    labels={LABELS}
    onMove={noop}
    rank={state.id === 'sans-rang' ? 'hidden' : 'ordinal'}
    emphasizesFirst={state.id !== 'sans-rang'}
    hint="Glisse"
    row={(lang) => <span style={{ display: 'block', padding: '1rem', borderRadius: 18, background: 'var(--color-ios-fill)', fontWeight: 700 }}>{lang.name}</span>}
  />
);

const TRACE = [{ x: 24, y: 150 }, { x: 90, y: 80 }, { x: 170, y: 110 }, { x: 280, y: 40 }];

const contentK54 = (state: MeeshyKitCatalogState): ReactNode => {
  const stops = [{ id: 's1', pointIndex: 0, value: '09:10', title: 'Maison' }, { id: 's2', pointIndex: 2, value: '15:05', title: 'Studio' }, { id: 's3', pointIndex: 3, value: '17:42', title: 'Ici' }];
  if (state.id === 'relecture') return stage(10, <MeeshyMapTrace label="Journée de Mina" points={TRACE} kind="history" tint={TINTS.teal} progress={0.45} stops={stops} />);
  if (state.id === 'perime') return stage(10, <MeeshyMapTrace label="Trajet périmé" points={TRACE} kind="route" tint={TINTS.violet} isStale midCaption="il y a 12 min" />);
  if (state.id === 'carte-claire') return stage(10, <MeeshyMapTrace label="Trajet vers Léo" points={TRACE} kind="route" tint={TINTS.violet} onLightMap midCaption="2,4 km · 30 min à pied" />);
  return stage(10, <><MeeshyMapTrace label="Trajet vers Léo" points={TRACE} kind="route" tint={TINTS.violet} midCaption="2,4 km · 30 min à pied" /><MeeshyMapTrace label="À vol d'oiseau" points={[{ x: 30, y: 30 }, { x: 150, y: 60 }]} kind="link" tint={TINTS.amber} /></>);
};

/** Les assemblages, dans l'ordre des numéros de la planche. */
export const MEESHY_KIT_ASSEMBLIES_B: readonly MeeshyKitAssemblyB[] = [
  { entry: entryK29, file: 'meeshy-avatar-morph.tsx' },
  { entry: entryK36, file: 'meeshy-map-pin.tsx' },
  { entry: entryK47, file: 'meeshy-choice-tiles.tsx' },
  { entry: entryK48, file: 'meeshy-avatar-group.tsx' },
  { entry: entryK49, file: 'meeshy-media-grid.tsx' },
  { entry: entryK50, file: 'meeshy-chart.tsx' },
  { entry: entryK52, file: 'meeshy-reorder-list.tsx' },
  { entry: entryK54, file: 'meeshy-map-trace.tsx' },
];

export const CONTENTS_D: Readonly<Record<string, (state: MeeshyKitCatalogState) => ReactNode>> = {
  K29: contentK29,
  K36: contentK36,
  K47: contentK47,
  K48: contentK48,
  K49: contentK49,
  K50: contentK50,
  K52: contentK52,
  K54: contentK54,
};
