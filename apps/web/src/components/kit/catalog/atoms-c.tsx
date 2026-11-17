import type { ReactNode } from 'react';

import { MeeshyButton } from '../meeshy-button';
import { MeeshyCodeCard } from '../meeshy-code-card';
import { MeeshyCollapsingHero } from '../meeshy-collapsing-hero';
import { MeeshyFigure, MeeshyFigureBand, MeeshyShareBar, MeeshySpark } from '../meeshy-figures';
import { MeeshyGroupCard } from '../meeshy-group-card';
import { kitCatalogEntry, kitCatalogState, type MeeshyKitCatalogEntry, type MeeshyKitCatalogState } from '../meeshy-kit-catalog';
import { MeeshyActionGrid, MeeshyLabeledAction } from '../meeshy-labeled-action';
import { MeeshyLivingBanner } from '../meeshy-living-banner';
import { MeeshyPersonRow, MeeshyPersonRowSkeleton } from '../meeshy-person-row';
import { MeeshySectionHeader } from '../meeshy-section-header';
import { MeeshyTicket } from '../meeshy-ticket';

/**
 * LA PREMIÈRE SÉRIE D'ASSEMBLAGES DU PROFIL AU CATALOGUE (#18876, chantier #18857) — K27,
 * K28, K30, K31, K32, K34, K39, K43, K44. Même régime que `atoms.tsx` et `atoms-b.tsx` : ils ne
 * sont pas dans le registre `.claude/workflows/meeshy-kit-planche.lots.json` (fichier de la
 * chaîne outillage), ils vivent à part et `MeeshyKitCatalog.atoms` les rend.
 */
export type MeeshyKitAssembly = { readonly entry: MeeshyKitCatalogEntry; readonly file: string };

const glyph = (path: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const CHAT = glyph('M3 4.5h10v6H7l-3 2.5v-2.5H3z');
const LINK = glyph('M6.5 9.5l3-3M5 8l-1 1a2.1 2.1 0 003 3l1-1M11 8l1-1a2.1 2.1 0 00-3-3l-1 1');
const BACK = glyph('M10 3L5 8l5 5');
const MORE = glyph('M3.5 8h.01M8 8h.01M12.5 8h.01');
const noop = (): void => {};

// harmony-exempt: teintes d'exemple du catalogue — des couleurs choisies par l'hôte, que le kit reçoit en paramètre
const TINTS = { violet: '#A855F7', teal: '#4ECDC4', amber: '#F8B500', indigo: '#818CF8', green: '#34D399', deepIndigo: '#4F46E5' } as const;

const states = (...ids: readonly (readonly [string, Partial<Parameters<typeof kitCatalogState>[0]>?])[]): readonly MeeshyKitCatalogState[] =>
  ids.map(([id, options]) => kitCatalogState({ id, ...options }));

export const entryK27 = kitCatalogEntry({ key: 'K27', name: 'MeeshyLivingBanner', states: states(['teintes'], ['photo'], ['attenue'], ['theme', { backdrop: 'light' }]) });
export const entryK28 = kitCatalogEntry({ key: 'K28', name: 'MeeshyCollapsingHero', states: states(['crans'], ['sans-avatar'], ['barre']) });
export const entryK30 = kitCatalogEntry({ key: 'K30', name: 'MeeshyTicket', states: states(['tailles', { isTouchable: true }], ['etats'], ['verso'], ['theme', { backdrop: 'light' }]) });
export const entryK31 = kitCatalogEntry({ key: 'K31', name: 'MeeshyCodeCard', states: states(['styles'], ['tailles'], ['generation'], ['theme', { backdrop: 'light' }]) });
export const entryK32 = kitCatalogEntry({ key: 'K32', name: 'MeeshyLabeledAction', states: states(['repos', { isTouchable: true }], ['etats'], ['grille', { isTouchable: true }], ['theme', { backdrop: 'light' }]) });
export const entryK34 = kitCatalogEntry({ key: 'K34', name: 'MeeshyFigures', states: states(['tailles'], ['bande'], ['courbe'], ['parts'], ['etats']) });
export const entryK39 = kitCatalogEntry({ key: 'K39', name: 'MeeshyPersonRow', states: states(['tailles', { isTouchable: true }], ['tenues'], ['selection', { isTouchable: true }], ['squelette'], ['theme', { backdrop: 'light' }]) });
export const entryK43 = kitCatalogEntry({ key: 'K43', name: 'MeeshyGroupCard', states: states(['surfaces'], ['gabarits'], ['pied'], ['theme', { backdrop: 'light' }]) });
export const entryK44 = kitCatalogEntry({ key: 'K44', name: 'MeeshySectionHeader', states: states(['formes'], ['repli', { isTouchable: true }], ['etapes'], ['theme', { backdrop: 'light' }]) });

const column = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>;
const row = (children: ReactNode): ReactNode => <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>{children}</div>;
const stage = (heightRem: number, children: ReactNode): ReactNode => <div style={{ position: 'relative', blockSize: `${heightRem}rem`, overflow: 'hidden' }}>{children}</div>;

const contentK27 = (state: MeeshyKitCatalogState): ReactNode => {
  const scheme = state.id === 'theme' ? 'light' : 'dark';
  const controls = { topLeading: <MeeshyButton title="Retour" glyph={BACK} size={44} onPress={noop} />, topTrailing: <MeeshyButton title="Plus" glyph={MORE} size={44} onPress={noop} /> };
  if (state.id === 'photo') return <MeeshyLivingBanner tint={TINTS.violet} height={160} image="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=" {...controls} />;
  if (state.id === 'attenue') return <MeeshyLivingBanner tint={TINTS.teal} height={160} isMuted {...controls} />;
  return column([TINTS.violet, TINTS.teal, TINTS.amber].map((tint) => <MeeshyLivingBanner key={tint} tint={tint} scheme={scheme} height={130} {...controls} bottom={<span>Niv. 24 · 1 860</span>} />));
};

const contentK28 = (state: MeeshyKitCatalogState): ReactNode => {
  const avatar = (size: number): ReactNode => <span style={{ display: 'inline-grid', placeItems: 'center', inlineSize: size, blockSize: size, borderRadius: '50%', background: 'var(--color-ios-fill)' }}>LM</span>;
  const base = { title: 'Léo Marchetti', subtitle: 'Proche · en ligne', leading: <MeeshyButton title="Retour" glyph={BACK} size={44} onPress={noop} />, banner: <MeeshyLivingBanner tint={TINTS.teal} height={318} /> };
  if (state.id === 'barre') return stage(6, <MeeshyCollapsingHero {...base} variant="bar" progress={1} backToTopLabel="Revenir en haut" onCollapsedTap={noop} />);
  if (state.id === 'sans-avatar') return stage(28, <MeeshyCollapsingHero {...base} title="Saison 4" subtitle="Or III · encore 14 jours" progress={0.35} />);
  return row([0, 0.35, 0.7, 1].map((progress) => <div key={progress} style={{ inlineSize: 220 }}>{stage(28, <MeeshyCollapsingHero {...base} avatar={avatar} progress={progress} />)}</div>));
};

const contentK30 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'etats') {
    return column(
      <>
        <MeeshyTicket title="Atelier d’octobre" code="meeshy.me/chat/atelier-oct" kind="struck" statusLabel="Expiré" figure="50" figureCaption="/ 50 arrivées" />
        <MeeshyTicket title="Lien de communauté" code="meeshy.me/c/…" kind="ghost" statusLabel="Indisponible" />
        <MeeshyTicket title="Chargement" code="x" kind="loading" />
      </>,
    );
  }
  if (state.id === 'verso') return <MeeshyTicket title="Parrainage" code="AISSA-7K2" figure="14" figureCaption="filleuls" isFlipped back={<MeeshyCodeCard payload="https://meeshy.me/r/AISSA-7K2" label="QR du code" size={160} />} flipLabels={{ front: 'recto', back: 'verso' }} />;
  return column(
    <>
      <MeeshyTicket title="Mon lien de profil" code="meeshy.me/@aissa" size="hero" figure="1 719" figureCaption="visites ce mois" stub={<MeeshyButton title="Copier" glyph={LINK} onPress={noop} />} />
      <MeeshyTicket title="Réel Dakar la nuit" code="meeshy.me/l/dkr-nuit" size="row" tint={TINTS.indigo} glyph={LINK} figure="1 284" figureCaption="clics" onPress={noop} />
      <MeeshyTicket title="Site" code="aissandiaye.studio" size="compact" tint={TINTS.green} glyph={LINK} />
    </>,
  );
};

const contentK31 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'generation') return <MeeshyCodeCard label="Ma carte" />;
  if (state.id === 'tailles') return row([72, 160, 220].map((size) => <MeeshyCodeCard key={size} payload="https://meeshy.me/@aissa" label="Code de ton profil" size={size as 72} style={size === 72 ? 'plain' : 'glass'} caption="meeshy.me/@aissa" />));
  return row(
    <>
      <MeeshyCodeCard payload="https://meeshy.me/@aissa" label="Code de ton profil" caption="meeshy.me/@aissa" tint={TINTS.deepIndigo} />
      <MeeshyCodeCard payload="https://meeshy.me/@aissa" label="Code de ton profil" style="plain" size={160} caption="meeshy.me/@aissa" />
    </>,
  );
};

const contentK32 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'etats') {
    return row(
      <>
        <MeeshyLabeledAction title="Appeler" glyph={CHAT} isPending words={{ pending: 'en cours' }} onPress={noop} />
        <MeeshyLabeledAction title="Vidéo" glyph={CHAT} disabled hint="Hors ligne" words={{ unavailable: 'indisponible' }} onPress={noop} />
        <MeeshyLabeledAction title="Bring" glyph={CHAT} kind="active" words={{ active: 'activé' }} onPress={noop} />
        <MeeshyLabeledAction title="Écrire" glyph={CHAT} value="Sera envoyé" valueKind="quiet" onPress={noop} />
      </>,
    );
  }
  if (state.id === 'grille') {
    return (
      <MeeshyActionGrid width={350}>
        {['Écrire', 'Appeler', 'Vidéo', 'Talkie', 'Bring'].map((title) => (
          <MeeshyLabeledAction key={title} title={title} glyph={CHAT} onPress={noop} />
        ))}
        <MeeshyLabeledAction title="Bloquer" glyph={CHAT} kind="destructive" onPress={noop} />
      </MeeshyActionGrid>
    );
  }
  return row(
    <>
      <MeeshyLabeledAction title="Écrire" glyph={CHAT} onPress={noop} />
      <MeeshyLabeledAction title="Bring" glyph={CHAT} value="2 / 3 aujourd’hui" badge="3" onPress={noop} />
    </>,
  );
};

const contentK34 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'bande') {
    return (
      <MeeshyFigureBand>
        <MeeshyFigure value="1 284" unit="clics" />
        <MeeshyFigure value="912" unit="visiteurs uniques" />
        <MeeshyFigure value="31" unit="pays" />
      </MeeshyFigureBand>
    );
  }
  if (state.id === 'courbe') return <MeeshyFigure value="214" unit="visites aujourd’hui" size="large" accessory={<MeeshySpark points={[3, 5, 4, 8, 6, 9, 12]} summary="Visites en hausse sur sept jours" />} />;
  if (state.id === 'parts') return column(<><MeeshyShareBar title="Sénégal" value="38 %" share={0.38} /><MeeshyShareBar title="France" value="24 %" share={0.24} /><MeeshyShareBar title="Mali" value="2 %" share={0.02} /></>);
  if (state.id === 'etats') return row(<><MeeshyFigure unit="clics" isLoading /><MeeshyFigure unit="clics" emptyLabel="aucune donnée" /><MeeshyFigure value="0" unit="clics" /></>);
  return row(<><MeeshyFigure value="1 719" unit="visites ce mois" size="hero" /><MeeshyFigure value="412" unit="clics" trend={{ direction: 'up', text: '12 %' }} /><MeeshyFigure value="86" unit="filleuls" size="compact" /></>);
};

const AVATAR = <span style={{ display: 'inline-grid', placeItems: 'center', inlineSize: '100%', blockSize: '100%', borderRadius: '50%', background: 'var(--color-ios-fill)' }}>L</span>;

const contentK39 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'squelette') return column((['compact', 'regular', 'large'] as const).map((size) => <MeeshyPersonRowSkeleton key={size} size={size} />));
  if (state.id === 'tenues') {
    return column(
      <>
        <MeeshyPersonRow title="Léo Marchetti" subtitle="Alfama · quartier" meta="2,4 km" avatar={AVATAR} />
        <MeeshyPersonRow title="Mina Okafor" subtitle="Atténuée" state="muted" avatar={AVATAR} />
        <MeeshyPersonRow title="Tomás Ribeiro" subtitle="Invitation envoyée" state="ghost" ghostGlyph={CHAT} />
        <MeeshyPersonRow title="Yuki Tanaka" isPending statusLine="En attente de réponse" avatar={AVATAR} />
      </>,
    );
  }
  if (state.id === 'selection') return column(<><MeeshyPersonRow title="Léo" selection={{ multiple: true }} onPress={noop} avatar={AVATAR} /><MeeshyPersonRow title="Mina" selection={{ multiple: false }} onPress={noop} avatar={AVATAR} /></>);
  return column((['compact', 'regular', 'large'] as const).map((size) => <MeeshyPersonRow key={size} size={size} title="Léo Marchetti" levelLabel="Proche" titleAccessory={CHAT} subtitle="Alfama" meta="42 min" avatar={AVATAR} onPress={noop} />));
};

const contentK43 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'pied') return <MeeshyGroupCard overline="Où il est" headerTrailing={<span>42 min</span>} footer={<MeeshyButton title="Voir sur la carte" kind="tinted" size={44} onPress={noop} />}><p style={{ margin: 0, padding: 16 }}>Alfama, Lisbonne</p></MeeshyGroupCard>;
  if (state.id === 'gabarits') return column((['content', 'prompt', 'preview', 'action'] as const).map((layout) => <MeeshyGroupCard key={layout} layout={layout}><p style={{ margin: 0, padding: 16 }}>{layout}</p></MeeshyGroupCard>));
  return column((['raised', 'ground', 'accent', 'danger', 'dashed'] as const).map((surface) => (
    <MeeshyGroupCard key={surface} surface={surface} overline={surface}>
      <p style={{ margin: 0, padding: 16 }}>Première ligne</p>
      <p style={{ margin: 0, padding: 16 }}>Seconde ligne</p>
    </MeeshyGroupCard>
  )));
};

const contentK44 = (state: MeeshyKitCatalogState): ReactNode => {
  if (state.id === 'repli') return column(<><MeeshySectionHeader title="En commun" count={6} disclosure={{ expanded: true }} onToggle={noop} /><MeeshySectionHeader title="Liens" count={3} disclosure={{ expanded: false }} onToggle={noop} /></>);
  if (state.id === 'etapes') return column(<><MeeshySectionHeader form="step" title="Choisir" index={1} step="done" stepLabel="étape 1, faite" /><MeeshySectionHeader form="step" title="Inviter" index={2} step="current" stepLabel="étape 2, en cours" /><MeeshySectionHeader form="step" title="Publier" index={3} step="todo" stepLabel="étape 3, à faire" /></>);
  return column(
    <>
      <MeeshySectionHeader title="Conversations" count={6} isLive liveLabel="en direct" trailing={<span>Tout voir</span>} />
      <MeeshySectionHeader form="overline" title="Groupe" />
      <MeeshySectionHeader form="divider" title="Aujourd’hui" />
    </>,
  );
};

/** Les assemblages, dans l'ordre des numéros de la planche. */
export const MEESHY_KIT_ASSEMBLIES_A: readonly MeeshyKitAssembly[] = [
  { entry: entryK27, file: 'meeshy-living-banner.tsx' },
  { entry: entryK28, file: 'meeshy-collapsing-hero.tsx' },
  { entry: entryK30, file: 'meeshy-ticket.tsx' },
  { entry: entryK31, file: 'meeshy-code-card.tsx' },
  { entry: entryK32, file: 'meeshy-labeled-action.tsx' },
  { entry: entryK34, file: 'meeshy-figures.tsx' },
  { entry: entryK39, file: 'meeshy-person-row.tsx' },
  { entry: entryK43, file: 'meeshy-group-card.tsx' },
  { entry: entryK44, file: 'meeshy-section-header.tsx' },
];

export const CONTENTS_C: Readonly<Record<string, (state: MeeshyKitCatalogState) => ReactNode>> = {
  K27: contentK27,
  K28: contentK28,
  K30: contentK30,
  K31: contentK31,
  K32: contentK32,
  K34: contentK34,
  K39: contentK39,
  K43: contentK43,
  K44: contentK44,
};
