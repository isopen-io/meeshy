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
 * FINDING V4ter/axe — `aria-required-children` : **SOLDÉ le 2026-08-17
 * (Q-142, réserve REV-4ter R5-8).**
 *
 * CE QUI ÉTAIT DÉSACTIVÉ ICI. La racine de `RiverThread` posait
 * `role="grid"` + `aria-rowcount`/`aria-colcount` sans qu'aucun `row` ni
 * `gridcell` n'existe dessous : la grille annonçait un pattern WAI-ARIA
 * qu'elle ne fournissait pas. La règle tirait sur les DEUX layouts (`lanes`
 * et `serialized`). La désactivation a été RETIRÉE AVANT le correctif —
 * c'est ce retrait qui a produit le RED (2 violations, une par layout).
 *
 * L'ARBITRAGE RENDU. Deux issues étaient ouvertes : abandonner `grid` pour
 * un rôle qui ne promet rien, ou tenir la promesse. La navigation à deux axes
 * est RÉELLE ici (`resolveRiverStep` gouverne les quatre flèches, rejoué par
 * `RiverThread.test.tsx`) — `grid` ne sur-promettait pas, il était incomplet.
 * Les couches manquantes sont donc posées, en `display: contents` pour
 * qu'elles n'aient aucune boîte : la CSS Grid, le placement
 * `gridColumn`/`gridRow` et l'ordre DOM chronologique sont INTACTS
 * (`RiverThread.tsx`, note « LA GRILLE TIENT SA PROMESSE » ; témoins dans
 * `components/conversations/riviere/__tests__/RiverThread.test.tsx`).
 *
 * `axe(container)` NU dans les deux témoins ci-dessous : toutes les règles,
 * aucune exception.
 */

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

    const results = await axe(container);
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

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
