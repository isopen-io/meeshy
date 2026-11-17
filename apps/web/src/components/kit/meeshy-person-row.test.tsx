import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshyPersonRow, MeeshyPersonRowSkeleton, meeshyPersonRowRecipe } from './meeshy-person-row';

const { mount, act } = kitMount();

const row = (container: HTMLElement): HTMLElement => container.querySelector('[data-kit-person-row]') as HTMLElement;

describe('MeeshyPersonRow — la recette en valeurs', () => {
  test('hauteurs 32 · 52 · 60 · 72 · 84 ; avatar 26 · 36 · 44 · 56 ; filet en retrait de 76 en regular', () => {
    expect((['inline', 'compact', 'regular', 'large', 'header'] as const).map((size) => meeshyPersonRowRecipe({ size }).height)).toEqual([32, 52, 60, 72, 84]);
    expect((['inline', 'compact', 'regular', 'large'] as const).map((size) => meeshyPersonRowRecipe({ size }).avatarSize)).toEqual([26, 36, 44, 56]);
    expect(meeshyPersonRowRecipe({}).dividerInset).toBe(76);
  });

  test('l’en-tête n’a ni filet ni appui, son titre est de 22', () => {
    expect(meeshyPersonRowRecipe({ size: 'header' })).toMatchObject({ titleSize: 22, hasDivider: false, isPressable: false });
  });

  test('nom 15, ligne secondaire 12,5, méta 16 puis 11,5, cible de 44', () => {
    expect(meeshyPersonRowRecipe({})).toMatchObject({ titleSize: 15, subtitleSize: 12.5, metaSize: 16, metaDetailSize: 11.5, targetSize: 44 });
  });

  test('atténuée baisse avatar et textes sans jamais dire « désactivée » ; fantôme remplace l’avatar par le disque en pointillé', () => {
    expect(meeshyPersonRowRecipe({ state: 'muted' }).contentOpacity).toBeLessThan(1);
    expect(meeshyPersonRowRecipe({ state: 'normal' }).contentOpacity).toBe(1);
    expect(meeshyPersonRowRecipe({ state: 'ghost' }).avatar).toBe('ghost-disc');
    expect(meeshyPersonRowRecipe({ state: 'normal' }).avatar).toBe('slot');
  });

  test('en attente : fond teinté à 8 %', () => {
    expect(meeshyPersonRowRecipe({ isPending: true }).pendingFill).toBe(0.08);
    expect(meeshyPersonRowRecipe({}).pendingFill).toBe(0);
  });
});

describe('MeeshyPersonRow — une phrase, une rangée', () => {
  test('sans onPress : un texte inerte ; avec : un bouton', () => {
    expect(row(mount(<MeeshyPersonRow title="Léo" />)).getAttribute('role')).not.toBe('button');
    const pressable = mount(<MeeshyPersonRow title="Léo" onPress={() => {}} />);
    expect(pressable.querySelector('button[data-kit-person-hit]')).not.toBeNull();
  });

  test('la phrase dite assemble nom, niveau, ligne secondaire, méta et détail', () => {
    const container = mount(<MeeshyPersonRow title="Léo Marchetti" levelLabel="Proche" subtitle="Alfama" meta="2,4 km" metaDetail="encore 42 minutes" onPress={() => {}} />);
    const hit = container.querySelector('[data-kit-person-hit]') as HTMLElement;
    expect(hit.getAttribute('aria-label')).toBe('Léo Marchetti, Proche, Alfama, 2,4 km, encore 42 minutes');
  });

  test('un label remplace la phrase composée', () => {
    const container = mount(<MeeshyPersonRow title="Léo" label="Léo, en ligne" onPress={() => {}} />);
    expect(container.querySelector('[data-kit-person-hit]')?.getAttribute('aria-label')).toBe('Léo, en ligne');
  });

  test('le glyphe de niveau est muet : le niveau se dit par son mot', () => {
    const container = mount(<MeeshyPersonRow title="Léo" levelLabel="Proche" titleAccessory={<svg data-glyph="" />} />);
    expect(spokenText(row(container))).toContain('Proche');
    expect(container.querySelector('[data-glyph]')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  test('la rangée ne dessine aucun point de présence : un emplacement avatar nu reste nu', () => {
    const container = mount(<MeeshyPersonRow title="Léo" avatar={<span data-avatar="">L</span>} />);
    expect(container.querySelector('[data-avatar]')).not.toBeNull();
    expect(container.querySelector('[data-presence],[class*="presence"]')).toBeNull();
  });

  test('un état fantôme écrit sa raison dans la ligne secondaire', () => {
    const container = mount(<MeeshyPersonRow title="Mina" state="ghost" subtitle="Invitation envoyée" ghostGlyph={<svg data-ghost="" />} />);
    expect(container.querySelector('[data-kit-person-ghost]')).not.toBeNull();
    expect(row(container).textContent).toContain('Invitation envoyée');
  });

  test('en attente : la ligne d’état remplace la ligne secondaire', () => {
    const container = mount(<MeeshyPersonRow title="Mina" subtitle="Alfama" isPending statusLine="En attente de réponse" />);
    expect(row(container).textContent).toContain('En attente de réponse');
    expect(row(container).textContent).not.toContain('Alfama');
  });

  test('l’aperçu d’un fil remplace la ligne secondaire', () => {
    const container = mount(<MeeshyPersonRow title="Mina" subtitle="Alfama" preview="On se voit samedi ?" />);
    expect(row(container).textContent).toContain('On se voit samedi ?');
    expect(row(container).textContent).not.toContain('Alfama');
  });
});

describe('MeeshyPersonRow — sélection', () => {
  test('simple : un choix coché ou non, redit par aria-checked', () => {
    const container = mount(<MeeshyPersonRow title="Léo" selection={{ single: true }} onPress={() => {}} />);
    const hit = container.querySelector('[data-kit-person-hit]') as HTMLElement;
    expect(hit.getAttribute('role')).toBe('radio');
    expect(hit.getAttribute('aria-checked')).toBe('true');
  });

  test('multiple : une case cochée ou non', () => {
    const container = mount(<MeeshyPersonRow title="Léo" selection={{ multiple: false }} onPress={() => {}} />);
    const hit = container.querySelector('[data-kit-person-hit]') as HTMLElement;
    expect(hit.getAttribute('role')).toBe('checkbox');
    expect(hit.getAttribute('aria-checked')).toBe('false');
  });
});

describe('MeeshyPersonRow — balayage doublé', () => {
  const actions = (log: string[]) => [
    { title: 'Archiver', glyph: <svg />, perform: () => log.push('archiver') },
    { title: 'Supprimer', glyph: <svg />, role: 'destructive' as const, perform: () => log.push('supprimer') },
  ];

  test('chaque action existe comme bouton nommé, atteignable sans geste', () => {
    const log: string[] = [];
    const container = mount(<MeeshyPersonRow title="Léo" trailingActions={actions(log)} onPress={() => {}} />);
    const named = Array.from(container.querySelectorAll('[data-kit-person-action]')).map((node) => node.getAttribute('aria-label') ?? node.textContent);
    expect(named).toEqual(['Archiver', 'Supprimer']);
  });

  test('toucher une action la joue une fois et ne presse pas la rangée', () => {
    const log: string[] = [];
    let presses = 0;
    const container = mount(<MeeshyPersonRow title="Léo" trailingActions={actions(log)} onPress={() => (presses += 1)} />);
    act(() => (container.querySelector('[data-kit-person-action]') as HTMLElement).click());
    expect(log).toEqual(['archiver']);
    expect(presses).toBe(0);
  });

  test('deux actions au plus par bord, le destructif en dernier', () => {
    const log: string[] = [];
    const three = [...actions(log), { title: 'Bloquer', glyph: <svg />, perform: () => {} }];
    const container = mount(<MeeshyPersonRow title="Léo" trailingActions={three} />);
    expect(container.querySelectorAll('[data-kit-person-action]').length).toBe(2);
    const destructive = [{ title: 'Supprimer', glyph: <svg />, role: 'destructive' as const, perform: () => {} }, { title: 'Archiver', glyph: <svg />, perform: () => {} }];
    const ordered = mount(<MeeshyPersonRow title="Léo" trailingActions={destructive} />);
    const last = Array.from(ordered.querySelectorAll('[data-kit-person-action]')).at(-1);
    expect(last?.getAttribute('data-role')).toBe('destructive');
  });
});

describe('MeeshyPersonRowSkeleton', () => {
  test('même hauteur que la rangée de sa taille, muet à la voix', () => {
    const skeleton = mount(<MeeshyPersonRowSkeleton size="regular" />).firstElementChild as HTMLElement;
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.style.getPropertyValue('--kit-person-h')).toBe(`${60 / 16}rem`);
  });
});

describe('MeeshyPersonRow — pureté', () => {
  test('aucun type du domaine, aucun singleton', () => {
    for (const file of ['./meeshy-person-row.tsx', './meeshy-person-row-recipe.ts']) {
      const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(text).not.toMatch(/@meeshy\/shared|@\/stores|@\/lib\/api/);
    }
  });
});
