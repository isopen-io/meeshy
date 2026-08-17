/**
 * WL-105 (LWS-10) — `LivesRail`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LivesRail, type LentilleLiveEntry } from '../LivesRail';

const entry = (id: string, overrides: Partial<LentilleLiveEntry> = {}): LentilleLiveEntry => ({
  id,
  name: `User ${id}`,
  isLive: false,
  ...overrides,
});

describe('LivesRail', () => {
  it('masqué (rend null) si vide', () => {
    const { container } = render(<LivesRail entries={[]} label="En direct" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('plafonne à 6 entrées', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(String(i)));
    render(<LivesRail entries={entries} label="En direct" />);
    expect(screen.getAllByTestId('lentille-lives-rail-entry')).toHaveLength(6);
  });

  it('rend moins de 6 entrées telles quelles', () => {
    const entries = [entry('a'), entry('b')];
    render(<LivesRail entries={entries} label="En direct" />);
    expect(screen.getAllByTestId('lentille-lives-rail-entry')).toHaveLength(2);
  });

  /**
   * Q-143 — Layout Shift 0, surface neuve du jour (`ae9e011d`, « le rail des
   * vivants s'alimente enfin »). La cote (`--lentille-list-rail-size`) est
   * posée EN STYLE INLINE sur le wrapper de CHAQUE pastille, JAMAIS calculée
   * depuis l'avatar : une entrée sans `avatarUrl` (initiales) et une entrée
   * AVEC (`<img>`, dont la ressource charge de façon asynchrone et pourrait
   * arriver après le premier paint) déclarent la MÊME géométrie — l'image se
   * contient dans un parent DÉJÀ dimensionné (`object-cover`+`overflow-hidden`),
   * elle ne peut donc jamais l'agrandir a posteriori. Un rail qui laisserait
   * l'avatar dicter la taille du wrapper romprait Layout Shift 0 dès que les
   * images arrivent après le texte (cas courant, réseau lent).
   */
  it('Layout Shift 0 : la cote du wrapper est FIXE par token — identique avec ou sans avatarUrl, live ou non', () => {
    const entries = [
      entry('no-avatar'),
      entry('with-avatar', { avatarUrl: 'https://example.test/a.png' }),
      entry('live', { isLive: true }),
    ];
    render(<LivesRail entries={entries} label="En direct" />);

    const wrappers = screen.getAllByTestId('lentille-lives-rail-entry').map(
      (entryEl) => entryEl.querySelector('div')! // le wrapper dimensionné, premier enfant
    );

    const sizes = wrappers.map((el) => ({
      width: el.style.width,
      height: el.style.height,
    }));
    // Toutes les entrées déclarent EXACTEMENT la même cote — jamais dérivée
    // du contenu (avatar présent/absent, live ou non).
    expect(new Set(sizes.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(sizes[0].width).toBe('var(--lentille-list-rail-size)');
    expect(sizes[0].height).toBe('var(--lentille-list-rail-size)');

    // L'image, quand elle existe, REMPLIT le wrapper (`object-cover`) —
    // structurellement incapable de l'agrandir à son chargement.
    const img = wrappers[1].querySelector('img')!;
    expect(img.className).toMatch(/\bobject-cover\b/);
    expect(img.className).toMatch(/\bh-full\b/);
    expect(img.className).toMatch(/\bw-full\b/);
  });

  /**
   * Q-143 — 1 rAF/surface : le rail des vivants ne participe PAS à la passe
   * de perspective (`useLentillePerspective`/`registerRow`) — c'est une
   * garde SOURCE (fichier entier), pas un comportement observable au rendu :
   * un import ajouté un jour ferait de cette surface une TROISIÈME source
   * d'écriture de style par frame, sans qu'aucun test de rendu ne le voie
   * forcément (les mocks de `getBoundingClientRect` sont permissifs).
   */
  it('garde source : `LivesRail.tsx` ne référence jamais `useLentillePerspective`/`registerRow` — hors de la passe rAF', () => {
    const fs = require('fs');
    const path = require('path');
    const source: string = fs.readFileSync(
      path.join(__dirname, '../LivesRail.tsx'),
      'utf-8'
    );
    expect(source).not.toMatch(/useLentillePerspective/);
    expect(source).not.toMatch(/registerRow/);
    expect(source).not.toMatch(/requestAnimationFrame/);
  });
});
