import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { EffectsSheet } from './effects-sheet';

/**
 * LA FEUILLE D'EFFETS (#6175) — DEUX sections seulement (« Animation
 * d'entrée », « Effet permanent »), miroir réduit de `EffectsPickerView.swift`
 * (§ 1.2 point 3 de la spécification : la section « Comportement » n'est PAS
 * reprise, elle poserait une seconde porte vers des faits que la rangée
 * haute pilote déjà).
 */
describe('EffectsSheet — rendu statique', () => {
  test('les deux sections sont rendues, jamais une troisième « Comportement »', () => {
    const html = renderToStaticMarkup(<EffectsSheet flags={0} onChange={() => {}} onClose={() => {}} />);
    expect(html).toContain('Animation d&#x27;entrée');
    expect(html).toContain('Effet permanent');
    expect(html).not.toContain('Comportement');
    expect(html).not.toContain('Éphémère');
    expect(html).not.toContain('Vue unique');
  });

  test('un bit actif porte aria-pressed="true", un bit inactif "false"', () => {
    const html = renderToStaticMarkup(<EffectsSheet flags={MESSAGE_EFFECT_FLAGS.SHAKE} onChange={() => {}} onClose={() => {}} />);
    expect(html).toContain('aria-label="Secousse, actif"');
    expect(html).toContain('aria-label="Zoom, inactif"');
  });
});

describe('EffectsSheet — DOM réel, chaque puce est un TOGGLE indépendant', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (flags: number, onChange: (flags: number) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<EffectsSheet flags={flags} onChange={onChange} onClose={() => {}} />);
    });
    return container;
  };

  test('cocher « Secousse » ajoute SON bit, sans toucher les autres', () => {
    let changed: number | null = null;
    const el = mount(MESSAGE_EFFECT_FLAGS.GLOW, (f) => {
      changed = f;
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Secousse, inactif"]')!.click();
    });
    expect(changed).toBe(MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.SHAKE);
  });

  test('décocher un bit déjà actif le RETIRE, jamais les autres', () => {
    let changed: number | null = null;
    const el = mount(MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.SHAKE, (f) => {
      changed = f;
    });
    act(() => {
      el.querySelector<HTMLButtonElement>('[aria-label="Secousse, actif"]')!.click();
    });
    expect(changed).toBe(MESSAGE_EFFECT_FLAGS.GLOW);
  });

  test('la coquille modale (`Sheet`) est présente : un bouton Fermer accessible', () => {
    const el = mount(0, () => {});
    expect(el.querySelector('[aria-label="Fermer"]')).not.toBeNull();
  });
});
