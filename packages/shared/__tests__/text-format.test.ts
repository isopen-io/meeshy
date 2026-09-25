/**
 * POSER OU RETIRER UNE EMPHASE (#7849) — et ce qui est posé est ce que le
 * rendu relit : chaque cas se vérifie par `segmentText`, pas seulement par la
 * chaîne produite.
 */
import { describe, expect, it } from 'vitest';

import { toggleEmphasis } from '../utils/text-format';
import { segmentText } from '../utils/text-segments';

const at = (text: string, selected: string) => {
  const start = text.indexOf(selected);
  return { text, start, end: start + selected.length };
};

describe('toggleEmphasis', () => {
  it('encadre la sélection et garde le mot sélectionné', () => {
    expect(toggleEmphasis(at('un mot fort', 'mot'), 'bold')).toEqual({ text: 'un **mot** fort', start: 5, end: 8 });
  });

  it('les quatre emphases posent les marqueurs que le rendu relit', () => {
    for (const style of ['bold', 'italic', 'underline', 'strikethrough'] as const) {
      const { text } = toggleEmphasis(at('un mot fort', 'mot'), style);
      expect(segmentText(text)).toContainEqual({ kind: 'emphasis', style, children: [{ kind: 'text', text: 'mot' }] });
    }
  });

  it('les blancs de bord restent HORS de l’emphase', () => {
    expect(toggleEmphasis(at('un mot fort', ' mot '), 'bold').text).toBe('un **mot** fort');
  });

  it('une sélection vide pose la paire et met le curseur entre les deux', () => {
    expect(toggleEmphasis({ text: 'ab', start: 1, end: 1 }, 'strikethrough')).toEqual({ text: 'a~~~~b', start: 3, end: 3 });
  });

  it('refaire le geste RETIRE l’emphase — sélection intérieure ou encadrée', () => {
    const once = toggleEmphasis(at('un mot fort', 'mot'), 'bold');
    expect(toggleEmphasis(once, 'bold')).toEqual({ text: 'un mot fort', start: 3, end: 6 });
    expect(toggleEmphasis(at('un **mot** fort', '**mot**'), 'bold')).toEqual({ text: 'un mot fort', start: 3, end: 6 });
  });

  it('l’italique ne retire pas un gras, il s’y ajoute', () => {
    expect(toggleEmphasis(at('**mot**', 'mot'), 'italic').text).toBe('***mot***');
    expect(toggleEmphasis(at('***mot***', 'mot'), 'italic').text).toBe('**mot**');
  });

  it('une sélection faite de blancs ne change rien', () => {
    expect(toggleEmphasis({ text: 'a   b', start: 1, end: 4 }, 'bold').text).toBe('a   b');
  });
});
