/**
 * W1 — les deux kinds MUETS du web (parité iOS ⇄ Web, directive du 2026-08-23).
 *
 * `CanvasV3Scene` ne dispatchait que `text · media · audio · sticker`. Les kinds
 * `place` et `drawing` tombaient sur le `return null` terminal, documenté
 * « ignoré EN SILENCE » — une tolérance écrite pour les kinds RÉSERVÉS, qui
 * avalait ici deux kinds bel et bien ACTIFS :
 *
 *   - iOS les ÉMET tous les deux (`CanvasV3Migration.swift:263` pour `drawing`,
 *     `:269` pour `place`) ;
 *   - le gateway les convertit depuis le v1 (`storeEffectsV3.ts:149,158`) ;
 *   - le golden PARTAGÉ `v1-legacy-full.v3.json` porte un `('L1','place','fg')`
 *     et `v1-legacy-rich.v3.json` un `('drawing','drawing','fg')`.
 *
 * Symptôme mesuré avant correctif : une story composée sur iOS avec une épingle
 * de lieu s'affichait sur le web **sans son lieu, et sans rien signaler**.
 *
 * L'oracle de ces tests est donc le golden partagé, pas une fixture locale : ce
 * qu'iOS écrit est exactement ce que le web doit peindre.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema, type CanvasV3 } from '@meeshy/shared/types/canvas-v3';

import { CanvasV3Scene, canvasV3StrokeWidth } from '@/components/v2/CanvasV3Scene';

const FIXTURES = join(__dirname, '../../../../packages/shared/fixtures/canvas-v3');

function fixture(name: string): CanvasV3 {
  return CanvasV3Schema.parse(JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')));
}

function sceneOf(objects: unknown[]): CanvasV3 {
  return { v: 3, scenes: [{ id: 's1', objects }] } as unknown as CanvasV3;
}

function placeObject(payload: Record<string, unknown>, id = 'L1'): Record<string, unknown> {
  return {
    id,
    kind: 'place',
    anchor: { t: 'free', x: 0.3, y: 0.6 },
    plane: 'fg',
    z: 5,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  };
}

function drawingObject(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'drawing',
    kind: 'drawing',
    anchor: { t: 'free', x: 0.5, y: 0.5 },
    plane: 'fg',
    z: 3,
    transform: { scale: 1, rotation: 0, opacity: 1 },
    payload,
  };
}

function stroke(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'stroke-1',
    points: [
      { x: 100, y: 200, pressure: 0.4 },
      { x: 300, y: 500, pressure: 0.95 },
    ],
    colorHex: 'FF3B30',
    width: 12,
    tool: 'pen',
    smoothing: 'curve',
    createdAt: 776000000,
    captureVersion: 1,
    ...over,
  };
}

describe('W1 — le lieu (kind `place`)', () => {
  it("peint le lieu du golden PARTAGÉ — c'est l'écart LIVE que W1 referme", () => {
    render(<CanvasV3Scene doc={fixture('v1-legacy-full.v3')} preferredLanguages={['fr']} muted />);

    expect(screen.getByTestId('canvas-v3-object-L1')).toBeInTheDocument();
    expect(screen.getByText('Douala')).toBeInTheDocument();
  });

  it("porte le nom du lieu, et l'adresse à défaut de nom — la loi de repli d'iOS", () => {
    const { rerender } = render(
      <CanvasV3Scene
        doc={sceneOf([placeObject({ place: { id: 'p1', name: 'Douala', address: '2 rue X' } })])}
        preferredLanguages={['fr']}
        muted
      />,
    );
    expect(screen.getByText('Douala')).toBeInTheDocument();

    rerender(
      <CanvasV3Scene
        doc={sceneOf([placeObject({ place: { id: 'p1', address: '2 rue X' } })])}
        preferredLanguages={['fr']}
        muted
      />,
    );
    expect(screen.getByText('2 rue X')).toBeInTheDocument();
  });

  /**
   * `StoryLocationLayer.resolvedLabel` retombe sur « Ici » quand le lieu n'a ni
   * nom ni adresse. Le web doit poser la MÊME pastille : un lieu sans libellé
   * reste un lieu posé par l'auteur, pas un objet à escamoter.
   */
  it('retombe sur « Ici » quand le lieu ne porte ni nom ni adresse', () => {
    render(
      <CanvasV3Scene
        doc={sceneOf([placeObject({ place: { id: 'p1' } })])}
        preferredLanguages={['fr']}
        muted
      />,
    );
    expect(screen.getByText('Ici')).toBeInTheDocument();
  });

  /** Un payload sans lieu du tout n'est PAS un lieu : rien à peindre, rien à inventer. */
  it('ne peint rien quand le payload ne porte aucun lieu', () => {
    render(
      <CanvasV3Scene doc={sceneOf([placeObject({ place: null })])} preferredLanguages={['fr']} muted />,
    );
    expect(screen.queryByTestId('canvas-v3-object-L1')).not.toBeInTheDocument();
  });
});

describe('W1 — le dessin (kind `drawing`)', () => {
  it('peint les traits du golden PARTAGÉ', () => {
    render(<CanvasV3Scene doc={fixture('v1-legacy-rich.v3')} preferredLanguages={['fr']} muted />);

    const el = screen.getByTestId('canvas-v3-object-drawing');
    expect(el).toBeInTheDocument();
    expect(el.querySelectorAll('polyline')).toHaveLength(1);
  });

  it('rend un trait par stroke, dans son espace de design 1080×1920', () => {
    render(
      <CanvasV3Scene
        doc={sceneOf([drawingObject({ strokes: [stroke(), stroke({ id: 'stroke-2' })] })])}
        preferredLanguages={['fr']}
        muted
      />,
    );

    const svg = screen.getByTestId('canvas-v3-object-drawing').querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1080 1920');
    expect(svg?.querySelectorAll('polyline')).toHaveLength(2);
    expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe('100,200 300,500');
  });

  /**
   * `StoryStrokeRasterizer.draw` : le marqueur est translucide (0,45) et sa
   * largeur double est portée par `StrokeWidthMapping.base`. Le stylo reste
   * opaque. Deux constantes du SDK, miroitées ici — jamais devinées.
   */
  it('miroite la loi de largeur du SDK — marqueur ×2 et translucide, pression bornée', () => {
    // captureVersion 0 ⇒ largeur CONSTANTE (le legacy d'avant la pression).
    expect(canvasV3StrokeWidth({ width: 12, tool: 'pen', captureVersion: 0 }, 0.1)).toBe(12);
    expect(canvasV3StrokeWidth({ width: 12, tool: 'marker', captureVersion: 0 }, 0.1)).toBe(24);

    // captureVersion ≥ 1 ⇒ facteur 0,4 → 1,0, plafonné à la base.
    expect(canvasV3StrokeWidth({ width: 10, tool: 'pen', captureVersion: 1 }, 0)).toBeCloseTo(4);
    expect(canvasV3StrokeWidth({ width: 10, tool: 'pen', captureVersion: 1 }, 1)).toBeCloseTo(10);

    /**
     * L'ORDRE des deux bornes, et il compte. `StrokeWidthMapping.effectiveWidth`
     * écrit `min(hardCap × base, max(minWidth, base × factor))` : le plafond est
     * appliqué APRÈS le plancher, donc un trait dont la base est déjà sous
     * l'unité reste sous l'unité — le « plancher d'une unité » du SDK ne le
     * relève PAS. Ce test grave le comportement RÉEL, pas l'intention du
     * commentaire : le web doit miroiter le code, sinon les deux plateformes
     * peignent des épaisseurs différentes pour le même trait.
     */
    expect(canvasV3StrokeWidth({ width: 0.5, tool: 'pen', captureVersion: 1 }, 0)).toBe(0.5);
    // Le plancher, lui, mord bien dès que la base dépasse l'unité.
    expect(canvasV3StrokeWidth({ width: 2, tool: 'pen', captureVersion: 1 }, 0)).toBe(1);
  });

  it("n'est jamais peint pour la gomme — elle n'existe pas comme trait", () => {
    render(
      <CanvasV3Scene
        doc={sceneOf([drawingObject({ strokes: [stroke({ tool: 'eraser' })] })])}
        preferredLanguages={['fr']}
        muted
      />,
    );
    expect(screen.queryByTestId('canvas-v3-object-drawing')).not.toBeInTheDocument();
  });

  /**
   * Le payload porte AUSSI `data` — le PNG opaque du legacy, que le pont Swift
   * transporte en base64. Le web ne le décode PAS : le format n'est garanti par
   * aucun contrat (c'est un `Data` iOS), et les `strokes` sont la forme
   * vectorielle qui les remplace. Un dessin qui n'aurait QUE `data` ne rend donc
   * rien — et c'est un choix, pas un oubli.
   */
  it('ignore le blob `data` opaque : seuls les traits vectoriels sont peints', () => {
    render(
      <CanvasV3Scene
        doc={sceneOf([drawingObject({ data: 'AQIDBA==' })])}
        preferredLanguages={['fr']}
        muted
      />,
    );
    expect(screen.queryByTestId('canvas-v3-object-drawing')).not.toBeInTheDocument();
  });
});
