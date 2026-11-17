import { describe, expect, test } from 'bun:test';

import { kitMount, spokenText } from '@/test-support/kit-mount';

import { MeeshySkeleton, MEESHY_SKELETON_APPEAR_MS, meeshySkeletonShows } from './meeshy-skeleton';
import { MeeshyStateBlock, meeshyStateBlockRecipe, type MeeshyStateBlockKind } from './meeshy-state-block';

const { mount, act } = kitMount();
const action = (title: string, perform: () => void = () => {}) => ({ title, perform });

describe('MeeshySkeletonLaw — le squelette n’existe que sur un cache vide', () => {
  test('vrai dans une seule case de la matrice chargement × cache', () => {
    const cases = [true, false].flatMap((isLoading) => [true, false].map((hasCachedData) => meeshySkeletonShows({ isLoading, hasCachedData })));
    expect(cases.filter(Boolean)).toHaveLength(1);
    expect(meeshySkeletonShows({ isLoading: true, hasCachedData: false })).toBe(true);
  });

  test('aucun squelette avant 150 ms', () => {
    expect(MEESHY_SKELETON_APPEAR_MS).toBe(150);
    const container = mount(<MeeshySkeleton shape={{ kind: 'line' }} />);
    expect((container.querySelector('[data-kit-skeleton]') as HTMLElement).style.getPropertyValue('--kit-skeleton-appear')).toBe('150ms');
  });
});

describe('MeeshyStateBlock — la recette en valeurs', () => {
  test('une erreur ne se résout pas sans action principale ; un vide plein écran non plus', () => {
    expect(meeshyStateBlockRecipe({ kind: 'error', hasPrimary: false, hasSecondary: true }).isResolvable).toBe(false);
    expect(meeshyStateBlockRecipe({ kind: 'error', hasPrimary: true }).isResolvable).toBe(true);
    expect(meeshyStateBlockRecipe({ kind: 'empty', hasPrimary: false, hasSecondary: false }).isResolvable).toBe(false);
    expect(meeshyStateBlockRecipe({ kind: 'empty', hasPrimary: false, hasSecondary: true }).isResolvable).toBe(true);
    expect(meeshyStateBlockRecipe({ kind: 'empty', size: 'compact', hasPrimary: false }).isResolvable).toBe(true);
  });

  test('le rôle : alerte pour une erreur, état pour les autres', () => {
    const roles = (['empty', 'error', 'denied', 'offline', 'success'] as MeeshyStateBlockKind[]).map((kind) => meeshyStateBlockRecipe({ kind, hasPrimary: true }).role);
    expect(roles).toEqual(['status', 'alert', 'status', 'status', 'status']);
  });

  test('le glyphe prend la teinte du genre ; l’accent de l’hôte ne colore que le vide', () => {
    expect(meeshyStateBlockRecipe({ kind: 'error', hasPrimary: true, tint: '#fff' }).glyphTone).toBe('err');
    expect(meeshyStateBlockRecipe({ kind: 'denied', hasPrimary: true }).glyphTone).toBe('warn');
    expect(meeshyStateBlockRecipe({ kind: 'offline', hasPrimary: true }).glyphTone).toBe('neutral');
    expect(meeshyStateBlockRecipe({ kind: 'empty', hasPrimary: true, tint: '#A855F7' })).toMatchObject({ glyphTone: 'accent', tint: '#A855F7' });
  });

  test('compact : une rangée de 60, ni image ni halo ; sur contenu estompé : ni fantôme ni halo', () => {
    expect(meeshyStateBlockRecipe({ kind: 'empty', size: 'compact', hasPrimary: true })).toMatchObject({ rowHeight: 60, hasGhost: false, hasHalo: false });
    expect(meeshyStateBlockRecipe({ kind: 'error', isOverContent: true, hasPrimary: true })).toMatchObject({ hasGhost: false, hasHalo: false });
    expect(meeshyStateBlockRecipe({ kind: 'empty', hasPrimary: true })).toMatchObject({ hasGhost: true, hasHalo: true });
  });

  test('le tressaillement et le tic n’appartiennent qu’à l’erreur, et le mouvement réduit garde le tic', () => {
    expect(meeshyStateBlockRecipe({ kind: 'error', hasPrimary: true })).toMatchObject({ shakes: true, hapticOnEnter: true });
    expect(meeshyStateBlockRecipe({ kind: 'error', hasPrimary: true, reduceMotion: true })).toMatchObject({ shakes: false, hapticOnEnter: true, breathes: false });
    expect(meeshyStateBlockRecipe({ kind: 'empty', hasPrimary: true })).toMatchObject({ shakes: false, hapticOnEnter: false });
  });
});

describe('MeeshyStateBlock — ce qu’on lit et ce qu’on touche', () => {
  test('un seul élément : le titre puis la phrase ; l’image et le halo sont masqués', () => {
    const container = mount(<MeeshyStateBlock kind="error" title="Tes liens n’ont pas pu se charger" message="Réessaie dans un instant" primary={action('Réessayer')} />);
    const block = container.querySelector('[data-kit-state-block]') as HTMLElement;
    expect(block.getAttribute('role')).toBe('alert');
    expect(spokenText(container.querySelector('[data-kit-state-text]') as HTMLElement)).toBe('Tes liens n’ont pas pu se charger, Réessaie dans un instant');
    expect(container.querySelector('[data-kit-state-art]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[data-kit-state-halo]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('chaque sortie est un bouton nommé par son titre, et la principale part une fois', () => {
    let retries = 0;
    const container = mount(<MeeshyStateBlock kind="offline" title="Tu es hors ligne" primary={action('Réessayer', () => (retries += 1))} secondary={action('Plus tard')} />);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Réessayer', 'Plus tard']);
    act(() => buttons[0]?.click());
    expect(retries).toBe(1);
  });

  test('une sortie en attente se dit « en cours » et ne se rejoue pas', () => {
    let plays = 0;
    const container = mount(<MeeshyStateBlock kind="error" title="Erreur" pendingLabel="en cours" primary={{ title: 'Réessayer', isPending: true, perform: () => (plays += 1) }} />);
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(spokenText(button)).toContain('en cours');
    act(() => button.click());
    expect(plays).toBe(0);
  });

  test('un bloc qui ne peut pas se résoudre ne dessine rien', () => {
    expect(mount(<MeeshyStateBlock kind="error" title="Erreur" />).querySelector('[data-kit-state-block]')).toBeNull();
  });

  test('succès : les lignes de conséquence sont cochées, dites une fois en état', () => {
    const container = mount(<MeeshyStateBlock kind="success" title="Signalement envoyé" consequences={['Rui ne peut plus t’écrire', 'Notre équipe regarde sous 24 h']} primary={action('Terminé')} />);
    expect(container.querySelectorAll('[data-kit-state-consequence]').length).toBe(2);
    expect(container.querySelector('[data-kit-state-block]')?.getAttribute('role')).toBe('status');
  });

  test('announces faux : ni alerte ni état, l’hôte a déjà parlé', () => {
    const container = mount(<MeeshyStateBlock kind="error" title="Erreur" announces={false} primary={action('Réessayer')} />);
    expect(container.querySelector('[data-kit-state-block]')?.hasAttribute('role')).toBe(false);
  });

  test('l’art fantôme garde la forme du squelette et se cache à la voix', () => {
    const container = mount(<MeeshyStateBlock kind="empty" title="Ton premier lien t’attend" art={{ ghost: 'ticket', count: 2 }} primary={action('Créer mon lien')} />);
    expect(container.querySelectorAll('[data-kit-state-ghost]').length).toBe(2);
    expect(container.querySelector('[data-kit-state-ghost]')?.getAttribute('data-template')).toBe('ticket');
  });
});
