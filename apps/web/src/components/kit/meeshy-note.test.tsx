import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyNote, MeeshyNoteList, meeshyNoteRecipe } from './meeshy-note';

const { mount, render, act } = kitMount();

describe('MeeshyNote — la recette en valeurs', () => {
  test('phrase de 12,5 en ligne, 13 en bande, 14 en bandeau, interligne 1,4', () => {
    expect(['line', 'band', 'banner'].map((form) => meeshyNoteRecipe({ form: form as 'line' }).fontSize)).toEqual([12.5, 13, 14]);
    expect(meeshyNoteRecipe({ form: 'band' }).lineHeight).toBe(1.4);
  });

  test('tête de 16 (ligne, bande, liste) ou 22 (bandeau) ; point de 9', () => {
    expect(meeshyNoteRecipe({ form: 'line' }).leadSize).toBe(16);
    expect(meeshyNoteRecipe({ form: 'band' }).leadSize).toBe(16);
    expect(meeshyNoteRecipe({ form: 'banner' }).leadSize).toBe(22);
    expect(meeshyNoteRecipe({ form: 'live' }).dotSize).toBe(9);
  });

  test('bande : rayon 16, teinte du sens à 10 %, marges 12 · 14 · 12 · 18, filet de 3 au bord de début', () => {
    expect(meeshyNoteRecipe({ form: 'band', kind: 'info' })).toMatchObject({ radius: 16, fillOpacity: 0.1, padding: { top: 12, end: 14, bottom: 12, start: 18 }, rule: 3 });
  });

  test('bandeau : pleine largeur, sans rayon, 48 au moins, filet bas de 1', () => {
    expect(meeshyNoteRecipe({ form: 'banner' })).toMatchObject({ radius: 0, minHeight: 48, borderBottom: 1, isFullWidth: true });
  });

  test('ligne et direct n’ont aucun conteneur', () => {
    expect(meeshyNoteRecipe({ form: 'line' }).hasContainer).toBe(false);
    expect(meeshyNoteRecipe({ form: 'live' }).hasContainer).toBe(false);
  });

  test('seule la forme live a un point ; périmé le fige et fait tomber la teinte à ink2 sans changer la hauteur', () => {
    const fresh = meeshyNoteRecipe({ form: 'live', kind: 'ok' });
    const stale = meeshyNoteRecipe({ form: 'live', kind: 'ok', isStale: true });
    expect(fresh).toMatchObject({ lead: 'pulse', isPulsing: true, phraseTone: 'ok' });
    expect(stale).toMatchObject({ isPulsing: false, phraseTone: 'ink2' });
    expect(stale.minHeight).toBe(fresh.minHeight);
  });

  test('mouvement réduit : aucun battement, aucune hauteur animée', () => {
    expect(meeshyNoteRecipe({ form: 'live', reduceMotion: true })).toMatchObject({ isPulsing: false, animatesHeight: false });
    expect(meeshyNoteRecipe({ form: 'banner' }).animatesHeight).toBe(true);
  });

  test('seul warn est annoncé, une fois, poliment ; announces le force', () => {
    expect(meeshyNoteRecipe({ kind: 'warn' }).announces).toBe(true);
    expect(meeshyNoteRecipe({ kind: 'info' }).announces).toBe(false);
    expect(meeshyNoteRecipe({ kind: 'security' }).announces).toBe(false);
    expect(meeshyNoteRecipe({ kind: 'info', announces: true }).announces).toBe(true);
    expect(meeshyNoteRecipe({ kind: 'warn', announces: false }).announces).toBe(false);
  });

  test('la seconde ligne est ignorée en ligne et en direct', () => {
    expect(meeshyNoteRecipe({ form: 'line', hasDetail: true }).showsDetail).toBe(false);
    expect(meeshyNoteRecipe({ form: 'live', hasDetail: true }).showsDetail).toBe(false);
    expect(meeshyNoteRecipe({ form: 'band', hasDetail: true }).showsDetail).toBe(true);
  });

  test('l’action de fin garde une cible de 44 et passe à la ligne sous 320', () => {
    expect(meeshyNoteRecipe({ form: 'banner', hasAction: true })).toMatchObject({ actionTarget: 44, actionWrapsBelow: 320 });
  });

  test('la teinte de l’hôte remplace celle du sens', () => {
    expect(meeshyNoteRecipe({ tint: '#14b8a6' }).tone).toBe('tint');
  });

  test('compacte : 13 ; régulière : 14,5 en liste', () => {
    expect(meeshyNoteRecipe({ form: 'band', size: 'compact', isList: true }).fontSize).toBe(13);
    expect(meeshyNoteRecipe({ form: 'band', size: 'regular', isList: true }).fontSize).toBe(14.5);
  });
});

describe('MeeshyNote — le composant', () => {
  test('tête, phrase et seconde ligne se lisent en un seul élément ; le glyphe est caché', () => {
    const container = mount(<MeeshyNote text="Hors ligne" form="band" detail="Mise à jour il y a 18 min" lead={{ glyph: <i data-glyph>g</i> }} />);
    const node = container.querySelector('[data-kit-note]');
    expect(node?.textContent).toContain('Hors ligne');
    expect(node?.textContent).toContain('Mise à jour il y a 18 min');
    expect(container.querySelector('[data-glyph]')?.parentElement?.getAttribute('aria-hidden')).toBe('true');
  });

  test('la valeur en gras se pose où qu’elle tombe, à l’encre pleine', () => {
    const container = mount(<MeeshyNote text="Léo te verra dans un rayon d’environ 600 m" emphasis="600 m" />);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('600 m');
    expect(container.querySelector('[data-kit-note]')?.textContent).toBe('Léo te verra dans un rayon d’environ 600 m');
  });

  test('une phrase vide n’est pas une note', () => {
    expect(() => mount(<MeeshyNote text="" />)).toThrow();
  });

  test('un warn est dit une fois, poliment, sans voler le focus ; les autres jamais', () => {
    const warn = mount(<MeeshyNote text="Réseau instable" kind="warn" />);
    const node = warn.querySelector('[data-kit-note]');
    expect(node?.getAttribute('role')).toBe('status');
    expect(node?.getAttribute('aria-live')).toBe('polite');
    expect(node?.getAttribute('tabindex')).toBeNull();
    const info = mount(<MeeshyNote text="Suivi" kind="info" />);
    expect(info.querySelector('[data-kit-note]')?.getAttribute('role')).toBeNull();
    expect(info.querySelector('[data-kit-note]')?.getAttribute('aria-live')).toBeNull();
  });

  test('une phrase qui change sans changer de sens ne se redit pas : la région reste la même', () => {
    const container = mount(<MeeshyNote text="Réseau instable" kind="warn" />);
    const before = container.querySelector('[data-kit-note]');
    render(<MeeshyNote text="Réseau très instable" kind="warn" />);
    expect(container.querySelector('[data-kit-note]')).toBe(before);
  });

  test('l’action de fin reste un bouton à part, nommé', () => {
    const calls: string[] = [];
    const container = mount(<MeeshyNote text="Hors ligne" form="banner" action={<button type="button" onClick={() => calls.push('retry')}>Réessayer</button>} />);
    const button = container.querySelector('button');
    act(() => button?.click());
    expect(calls).toEqual(['retry']);
    expect(container.querySelector('[data-kit-note-body]')?.contains(button ?? null)).toBe(false);
  });

  test('live : point pulsé quand la donnée arrive, figé quand elle est périmée', () => {
    const live = mount(<MeeshyNote text="Position en direct" form="live" kind="ok" />);
    expect(live.querySelector('[data-kit-note-lead]')?.getAttribute('data-pulse')).toBe('true');
    const stale = mount(<MeeshyNote text="Position d’il y a 3 h" form="live" kind="ok" isStale />);
    expect(stale.querySelector('[data-kit-note-lead]')?.getAttribute('data-pulse')).toBe('false');
  });

  test('la liste annonce son nombre de lignes', () => {
    const container = mount(
      <MeeshyNoteList
        kind="info"
        items={[
          { glyph: <i>a</i>, text: 'Premier point' },
          { glyph: <i>b</i>, text: 'Second point' },
        ]}
      />,
    );
    const list = container.querySelector('[role="list"]');
    expect(list?.querySelectorAll('[role="listitem"]').length).toBe(2);
    expect(list?.getAttribute('data-count')).toBe('2');
  });
});

describe('MeeshyNote — dans le flux, sans horloge', () => {
  test('ni overlay, ni zIndex, ni position fixe, ni minuterie, ni réseau, ni horloge', () => {
    for (const file of ['./meeshy-note.tsx', './meeshy-note-recipe.ts', '../../styles/kit-note.css']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/overlay|z-?[iI]ndex|position:\s*(fixed|absolute)|setTimeout|setInterval|Date\.now|fetch\(|navigator\.onLine|backdrop-filter|box-shadow:\s*0 \d+px \d+px/);
    }
  });
});
