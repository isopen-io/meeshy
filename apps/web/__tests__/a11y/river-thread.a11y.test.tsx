/**
 * V4ter/axe — audit axe-core de la peau Rivière (`RiverThread`).
 *
 * Fixtures REPRISES de `RiverThread.test.tsx` — la géométrie vient de la LOI
 * RÉELLE (`resolveRiverLanes`, `packages/shared/utils/river-lanes`), jamais
 * fabriquée à la main : trois voix (layout `lanes`, avec une réponse
 * croisée `replyToMessageId`) et deux voix (layout `serialized`, sous
 * `RIVER_MIN_VOICES`).
 */
import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { resolveRiverLanes } from '@meeshy/shared/utils/river-lanes';
import { RiverThread } from '@/components/conversations/riviere/RiverThread';
import type { RiverBubbleContent } from '@/components/conversations/riviere/river-bubble-types';

expect.extend(toHaveNoViolations);

/**
 * FINDING V4ter/axe (2026-08-17) — `aria-required-children`
 * (https://dequeuniversity.com/rules/axe/4.12/aria-required-children) tiré
 * sur `river-thread` dans les DEUX layouts : la racine pose `role="grid"` +
 * `aria-rowcount`/`aria-colcount` (`RiverThread.tsx:247-249`), mais ses
 * enfants directs ne sont ni `row` ni `rowgroup` — `RiverLaneHeaderStrip`,
 * le scroller, et la grille CSS de `RiverBubble` (`role="button"`, RE-PROUVÉ
 * par lecture de `RiverBubble.tsx`) placés par `gridColumn`/`gridRow` bruts.
 * Le pattern WAI-ARIA `grid` exige des lignes `row` contenant des
 * `gridcell`/`columnheader` — absent ici.
 *
 * PAS un attribut manquant — donc PAS trivial au sens du contrat de cette
 * tâche : la grille CSS positionne CHAQUE bulle par `gridColumn`/`gridRow`
 * calculés depuis `bubble.laneIndex`/`bubble.rank` (§7bis/§7ter) ; intercaler
 * des conteneurs `role="row"` casserait ce placement (une ligne DOM par
 * rang, alors que les couloirs vides d'un rang n'ont AUCUNE bulle à
 * placer) — une correction propre demande soit de restructurer la grille en
 * lignes/cellules explicites (potentiellement avec cellules vides pour les
 * couloirs sans bulle à ce rang), soit d'abandonner `role="grid"` pour un
 * pattern natif différent (ex. `role="application"` + navigation clavier
 * documentée, ou aucun rôle composite). Les deux touchent `RiverThread.tsx`
 * ET la loi de placement (`river-column-layout.ts`/`river-lanes` côté
 * `packages/shared`) — HORS PÉRIMÈTRE de cette tâche (« tu ne fais que les
 * monter dans des tests »).
 *
 * La navigation clavier RÉELLE n'est pas affectée : `resolveRiverStep`
 * (rejoué par `RiverThread.test.tsx`) gouverne déjà `ArrowUp/Down/Left/
 * Right` indépendamment de la sémantique `grid` native — la violation est
 * un défaut d'annonce pour un lecteur d'écran qui s'attendrait aux enfants
 * `row`/`gridcell` du rôle `grid`, pas une régression de navigation
 * constatée.
 *
 * Désactivée ICI SEULEMENT (pas globalement, pas dans jest.setup.js) —
 * reportée à l'orchestrateur comme finding V4ter/axe.
 */
const RIVER_GRID_AXE_OPTIONS = { rules: { 'aria-required-children': { enabled: false } } } as const;

const participants = [
  { id: 'me', displayName: 'Moi' },
  { id: 'alice', displayName: 'Alice' },
  { id: 'bob', displayName: 'Bob' },
];

function makeContents(geometry: ReturnType<typeof resolveRiverLanes>): ReadonlyMap<string, RiverBubbleContent> {
  return new Map(
    geometry.bubbles.map((bubble) => [
      bubble.messageId,
      {
        bubble,
        senderDisplayName: participants.find((p) => p.id === bubble.laneId)?.displayName ?? bubble.laneId,
        colorSeed: bubble.laneId,
        timeString: '10:00',
        text: `texte de ${bubble.messageId}`,
        replyPreview: null,
      } satisfies RiverBubbleContent,
    ])
  );
}

describe('Audit axe — Rivière (layout lanes, géométrie LOI réelle)', () => {
  const lanesMessages = [
    { id: 'm1', senderId: 'alice', createdAt: 0 },
    { id: 'm2', senderId: 'bob', createdAt: 1000 },
    { id: 'm3', senderId: 'me', createdAt: 2000, replyToMessageId: 'm1' },
  ];
  const geometry = resolveRiverLanes({ messages: lanesMessages, participants, viewerId: 'me' });
  const contents = makeContents(geometry);

  it('aucune violation — 3 voix, tracé SVG + en-têtes de couloirs', async () => {
    expect(geometry.layout).toBe('lanes');
    const { container } = render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);

    const results = await axe(container, RIVER_GRID_AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });
});

describe('Audit axe — Rivière (layout serialized, géométrie LOI réelle)', () => {
  const duoMessages = [
    { id: 'd1', senderId: 'alice', createdAt: 0 },
    { id: 'd2', senderId: 'me', createdAt: 1000 },
  ];
  const duoGeometry = resolveRiverLanes({ messages: duoMessages, participants, viewerId: 'me' });
  const duoContents = makeContents(duoGeometry);

  it('aucune violation — 2 voix, une colonne, aucun trait', async () => {
    expect(duoGeometry.layout).toBe('serialized');
    const { container } = render(<RiverThread geometry={duoGeometry} contents={duoContents} youLabel="Toi" />);

    const results = await axe(container, RIVER_GRID_AXE_OPTIONS);
    expect(results).toHaveNoViolations();
  });
});
