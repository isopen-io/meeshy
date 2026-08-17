import { render, screen, fireEvent } from '@testing-library/react';
import { resolveRiverLanes, resolveRiverStep } from '@meeshy/shared/utils/river-lanes';
import { RiverThread } from '../RiverThread';
import type { RiverBubbleContent } from '../river-bubble-types';

const participants = [
  { id: 'me', displayName: 'Moi' },
  { id: 'alice', displayName: 'Alice' },
  { id: 'bob', displayName: 'Bob' },
];

const lanesMessages = [
  { id: 'm1', senderId: 'alice', createdAt: 0 },
  { id: 'm2', senderId: 'bob', createdAt: 1000 },
  { id: 'm3', senderId: 'me', createdAt: 2000, replyToMessageId: 'm1' },
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
        layout: geometry.layout,
        replyPreview: null,
      } satisfies RiverBubbleContent,
    ])
  );
}

describe('RiverThread — hôte de l\'écran Rivière (R-134)', () => {
  const geometry = resolveRiverLanes({ messages: lanesMessages, participants, viewerId: 'me' });
  const contents = makeContents(geometry);

  it('rend une bulle par bubble de la géométrie, dans l\'ORDRE CHRONOLOGIQUE STRICT du DOM (§7bis/§7ter)', () => {
    render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
    const rendered = screen.getAllByTestId('river-bubble').map((el) => el.getAttribute('data-message-id'));
    expect(rendered).toEqual(geometry.bubbles.map((b) => b.messageId));
  });

  it('data-layout reflète geometry.layout ("lanes" ici — 3 voix, ≤ 7 couloirs)', () => {
    render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
    expect(screen.getByTestId('river-thread')).toHaveAttribute('data-layout', 'lanes');
  });

  it('monte le tracé SVG (RiverLaneOverlay) en layout "lanes"', () => {
    render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
    expect(screen.getByTestId('river-lane-overlay')).toBeInTheDocument();
  });

  it('une bulle sans contenu résolu (Prisme pas encore appliqué) reste invisible, jamais un crash', () => {
    const partialContents = new Map(contents);
    partialContents.delete(geometry.bubbles[0]!.messageId);
    render(<RiverThread geometry={geometry} contents={partialContents} youLabel="Toi" />);
    expect(screen.getAllByTestId('river-bubble')).toHaveLength(geometry.bubbles.length - 1);
  });

  it('la grille consomme river.lane.widthReference — jamais une largeur de couloir en dur', () => {
    render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
    expect(screen.getByTestId('river-grid').style.gridTemplateColumns).toContain(
      'var(--lentille-river-lane-width-reference)'
    );
  });

  describe('navigation deux axes — REJOUE resolveRiverStep RÉEL (garde R15)', () => {
    it('ArrowDown/ArrowUp/ArrowLeft/ArrowRight produisent EXACTEMENT le curseur que rendrait resolveRiverStep', () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
      const host = screen.getByTestId('river-thread');

      const initialCursor = {
        laneIndex: Number(host.getAttribute('data-cursor-lane')),
        rank: Number(host.getAttribute('data-cursor-rank')),
      };

      const expected = resolveRiverStep({ geometry, cursor: initialCursor, direction: 'right' });
      fireEvent.keyDown(host, { key: 'ArrowRight' });

      expect(host).toHaveAttribute('data-cursor-lane', String(expected.cursor.laneIndex));
      expect(host).toHaveAttribute('data-cursor-rank', String(expected.cursor.rank));
      expect(host).toHaveAttribute('data-last-reason', expected.reason);
    });

    it('un bord (`edge`) laisse le curseur INCHANGÉ — la loi ne l\'invente jamais', () => {
      // alice (colonne 1) est la SEULE branche vivante au rang 0 : aller à
      // `left` n'a rien de vivant à gauche ⇒ edge (rejoué contre la loi ci-dessous).
      const edgeCursor = { laneIndex: 1, rank: 0 };
      const expected = resolveRiverStep({ geometry, cursor: edgeCursor, direction: 'left' });
      expect(expected.reason).toBe('edge');

      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" initialCursor={edgeCursor} />);
      const host = screen.getByTestId('river-thread');
      fireEvent.keyDown(host, { key: 'ArrowLeft' });

      expect(host).toHaveAttribute('data-cursor-lane', '1');
      expect(host).toHaveAttribute('data-cursor-rank', '0');
      expect(host).toHaveAttribute('data-last-reason', 'edge');
    });

    it('un clic sur une bulle déplace le curseur SUR elle (choix explicite, pas un pas de la loi)', () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
      const target = geometry.bubbles[1]!; // m2, bob
      const bubbleEl = screen
        .getAllByTestId('river-bubble')
        .find((el) => el.getAttribute('data-message-id') === target.messageId);
      expect(bubbleEl).toBeDefined();
      fireEvent.click(bubbleEl as HTMLElement);

      const host = screen.getByTestId('river-thread');
      expect(host).toHaveAttribute('data-cursor-lane', String(target.laneIndex));
      expect(host).toHaveAttribute('data-cursor-rank', String(target.rank));
    });
  });

  describe('sérialisée — une colonne, aucun axe horizontal, aucun trait (§7ter C)', () => {
    // Deux voix seulement : < RIVER_MIN_VOICES (3) ⇒ sérialisée.
    const duoMessages = [
      { id: 'd1', senderId: 'alice', createdAt: 0 },
      { id: 'd2', senderId: 'me', createdAt: 1000 },
    ];
    const duoGeometry = resolveRiverLanes({ messages: duoMessages, participants, viewerId: 'me' });
    const duoContents = makeContents(duoGeometry);

    it('geometry.layout === "serialized" (décor du test)', () => {
      expect(duoGeometry.layout).toBe('serialized');
    });

    it('data-layout="serialized" et data-serialization-reason="belowMinimum"', () => {
      render(<RiverThread geometry={duoGeometry} contents={duoContents} youLabel="Toi" />);
      const host = screen.getByTestId('river-thread');
      expect(host).toHaveAttribute('data-layout', 'serialized');
      expect(host).toHaveAttribute('data-serialization-reason', 'belowMinimum');
    });

    it('AUCUN trait n\'est dessiné (le tracé reste monté, décoratif, mais son paint est vide)', () => {
      render(<RiverThread geometry={duoGeometry} contents={duoContents} youLabel="Toi" />);
      expect(screen.queryByTestId('river-lane-line')).not.toBeInTheDocument();
      expect(screen.queryByTestId('river-connector')).not.toBeInTheDocument();
    });

    it('left/right rendent "edge" — plus d\'axe horizontal', () => {
      render(<RiverThread geometry={duoGeometry} contents={duoContents} youLabel="Toi" initialCursor={{ laneIndex: 0, rank: 0 }} />);
      const host = screen.getByTestId('river-thread');
      fireEvent.keyDown(host, { key: 'ArrowRight' });
      expect(host).toHaveAttribute('data-last-reason', 'edge');
      expect(host).toHaveAttribute('data-cursor-lane', '0');
    });

    it('down avance au message SUIVANT, quel qu\'en soit l\'auteur (l\'axe vertical redevient le temps)', () => {
      render(<RiverThread geometry={duoGeometry} contents={duoContents} youLabel="Toi" initialCursor={{ laneIndex: 0, rank: 0 }} />);
      const host = screen.getByTestId('river-thread');
      fireEvent.keyDown(host, { key: 'ArrowDown' });
      expect(host).toHaveAttribute('data-cursor-rank', '1');
      expect(host).toHaveAttribute('data-last-reason', 'moved');
    });
  });

  it('a11y : SVG décoratif aria-hidden, ordre DOM = ordre chronologique (pas de rôle supplémentaire à annoncer)', () => {
    render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
    expect(screen.getByTestId('river-lane-overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('river-lane-header-strip')).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * Q-142 / réserve REV-4ter **R5-8** — `aria-required-children`.
   *
   * La racine annonçait `role="grid"` sans un seul `row`/`gridcell` dessous.
   * Ces témoins figent les DEUX moitiés du remède : la sémantique EST là, et
   * elle n'a RIEN déplacé — c'est la seconde moitié qui pouvait casser en
   * silence, et c'est elle qui a dicté le `display: contents`.
   */
  describe('Q-142/R5-8 — la grille tient sa promesse (row + gridcell)', () => {
    it('un `row` par rang, un `gridcell` par bulle, indexés par la LOI (rank/laneIndex), jamais par un compteur de rendu', () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);

      const rows = screen.getAllByTestId('river-row');
      const cells = screen.getAllByTestId('river-gridcell');
      expect(rows).toHaveLength(geometry.bubbles.length);
      expect(cells).toHaveLength(geometry.bubbles.length);

      expect(rows.map((el) => el.getAttribute('role'))).toEqual(rows.map(() => 'row'));
      expect(cells.map((el) => el.getAttribute('role'))).toEqual(cells.map(() => 'gridcell'));

      // 1-indexés, et pris sur la géométrie — pas sur la position de rendu.
      expect(rows.map((el) => el.getAttribute('aria-rowindex'))).toEqual(
        geometry.bubbles.map((bubble) => String(bubble.rank + 1))
      );
      expect(cells.map((el) => el.getAttribute('aria-colindex'))).toEqual(
        geometry.bubbles.map((bubble) => String(bubble.laneIndex + 1))
      );
    });

    it("les index annoncés recouvrent EXACTEMENT ce que la racine déclare (`aria-rowcount`/`aria-colcount`)", () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);
      const host = screen.getByTestId('river-thread');

      expect(host).toHaveAttribute('role', 'grid');
      const rowIndexes = screen
        .getAllByTestId('river-row')
        .map((el) => Number(el.getAttribute('aria-rowindex')));
      const colIndexes = screen
        .getAllByTestId('river-gridcell')
        .map((el) => Number(el.getAttribute('aria-colindex')));

      expect(Math.max(...rowIndexes)).toBeLessThanOrEqual(Number(host.getAttribute('aria-rowcount')));
      expect(Math.max(...colIndexes)).toBeLessThanOrEqual(Number(host.getAttribute('aria-colcount')));
      expect(Math.min(...rowIndexes)).toBeGreaterThanOrEqual(1);
      expect(Math.min(...colIndexes)).toBeGreaterThanOrEqual(1);
    });

    it("les deux couches n'ont AUCUNE boîte (`display: contents`) — sans quoi la CSS Grid serait cassée", () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);

      for (const el of [...screen.getAllByTestId('river-row'), ...screen.getAllByTestId('river-gridcell')]) {
        expect((el as HTMLElement).style.display).toBe('contents');
      }
    });

    it('le PLACEMENT et l’ORDRE CHRONOLOGIQUE sont intacts — la bulle reste l’élément de grille, avec ses gridColumn/gridRow', () => {
      render(<RiverThread geometry={geometry} contents={contents} youLabel="Toi" />);

      const bubbles = screen.getAllByTestId('river-bubble') as HTMLElement[];
      expect(bubbles.map((el) => el.getAttribute('data-message-id'))).toEqual(
        geometry.bubbles.map((bubble) => bubble.messageId)
      );

      bubbles.forEach((el, index) => {
        const bubble = geometry.bubbles[index]!;
        expect(el.style.gridColumn).toBe(String(bubble.laneIndex + 1));
        expect(el.style.gridRow).toBe(String(bubble.rank + 1));
      });

      // Et la grille elle-même n'a pas bougé de forme.
      expect(screen.getByTestId('river-grid').style.display).toBe('grid');
    });
  });
});
