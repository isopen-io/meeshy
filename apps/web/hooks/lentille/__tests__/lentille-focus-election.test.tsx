/**
 * WL-108 (LWS-8 §4.2) — le magasin de l'élu et son abonnement par rang.
 *
 * behaviour-matrix:L11 — « la sélection … devient le style de la focus card
 * persistant sur le rang sélectionné » : ce fichier prouve la MÉCANIQUE
 * d'élection qui désigne ce rang (le style lui-même est prouvé par
 * `LentilleFocusCard.test.tsx`).
 *
 * Le point cardinal ici n'est pas « ça marche » mais « ça ne re-rend pas la
 * liste » : c'est l'arbitrage explicite du jumeau iOS (`LentilleFocusElection
 * .swift`) et la seule raison pour laquelle ce magasin n'est pas un
 * `useState`.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { LentilleFocusElection, useIsFocusedRow } from '../lentille-focus-election';

describe('LentilleFocusElection', () => {
  it("n'élit personne avant la première élection", () => {
    expect(new LentilleFocusElection().getElectedId()).toBeNull();
  });

  it('publie à chaque CHANGEMENT d\'élu, et à eux seuls (garde par inégalité)', () => {
    const election = new LentilleFocusElection();
    const notify = jest.fn();
    election.subscribe(notify);

    election.adopt('a');
    expect(notify).toHaveBeenCalledTimes(1);

    // Ré-adoption du MÊME élu : une frame de défilement de plus, zéro
    // notification — sinon tous les abonnés seraient invalidés à 60 Hz.
    election.adopt('a');
    election.adopt('a');
    expect(notify).toHaveBeenCalledTimes(1);

    election.adopt('b');
    expect(notify).toHaveBeenCalledTimes(2);

    election.adopt(null);
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it('désabonne réellement', () => {
    const election = new LentilleFocusElection();
    const notify = jest.fn();
    const unsubscribe = election.subscribe(notify);
    unsubscribe();
    election.adopt('a');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('useIsFocusedRow', () => {
  const renderCounts = new Map<string, number>();

  function Row({ election, id }: { election?: LentilleFocusElection; id: string }) {
    const isFocused = useIsFocusedRow(election, id);
    renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1);
    return (
      <div data-testid={`row-${id}`} data-focused={isFocused ? 'true' : 'false'}>
        {id}
      </div>
    );
  }

  beforeEach(() => renderCounts.clear());

  it("rend `false` sans élection — un rang hors liste reste rendable", () => {
    render(<Row id="a" />);
    expect(screen.getByTestId('row-a')).toHaveAttribute('data-focused', 'false');
  });

  it("désigne le rang élu, et lui seul", () => {
    const election = new LentilleFocusElection();
    render(
      <>
        <Row election={election} id="a" />
        <Row election={election} id="b" />
      </>
    );

    act(() => election.adopt('b'));

    expect(screen.getByTestId('row-a')).toHaveAttribute('data-focused', 'false');
    expect(screen.getByTestId('row-b')).toHaveAttribute('data-focused', 'true');
  });

  it("ne re-rend QUE les rangs dont la réponse change — jamais la liste entière", () => {
    const election = new LentilleFocusElection();
    render(
      <>
        <Row election={election} id="a" />
        <Row election={election} id="b" />
        <Row election={election} id="c" />
      </>
    );
    const initial = new Map(renderCounts);

    // a → b : deux rangs changent d'état, `c` n'a aucune raison de re-rendre.
    act(() => election.adopt('a'));
    act(() => election.adopt('b'));

    expect(renderCounts.get('c')).toBe(initial.get('c'));
    expect(renderCounts.get('a')).toBeGreaterThan(initial.get('a') as number);
    expect(renderCounts.get('b')).toBeGreaterThan(initial.get('b') as number);
  });
});
