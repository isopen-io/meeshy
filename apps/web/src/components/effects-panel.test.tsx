import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { EffectsPanel } from './effects-panel';

/**
 * LE PANNEAU D'EFFETS (#7980, jumelle web de #7967) — plus une feuille : un
 * petit panneau INLINE, même forme que le rail de durée éphémère. Deux
 * rangées (« Animation d'entrée », « Effet permanent ») et « Tout effacer »,
 * qui ne paraît que si l'un des dix effets est armé et ne retire QU'EUX.
 */
describe('EffectsPanel — rendu statique', () => {
  test('les deux rangées sont rendues, jamais une troisième « Comportement »', () => {
    const html = renderToStaticMarkup(<EffectsPanel flags={0} onChange={() => {}} />);
    expect(html).toContain('Animation d&#x27;entrée');
    expect(html).toContain('Effet permanent');
    expect(html).not.toContain('Comportement');
    expect(html).not.toContain('Vue unique');
  });

  test('ce n’est pas une feuille : aucun dialogue, aucun bouton Fermer', () => {
    const html = renderToStaticMarkup(<EffectsPanel flags={0} onChange={() => {}} />);
    expect(html).not.toContain('<dialog');
    expect(html).not.toContain('aria-label="Fermer"');
    expect(html).toContain('data-composer-effects-panel');
  });

  test('un bit actif porte aria-pressed="true", un bit inactif "false"', () => {
    const html = renderToStaticMarkup(<EffectsPanel flags={MESSAGE_EFFECT_FLAGS.SHAKE} onChange={() => {}} />);
    expect(html).toContain('aria-label="Secousse, actif"');
    expect(html).toContain('aria-label="Zoom, inactif"');
  });

  test('« Tout effacer » est ABSENT quand aucun effet n’est armé', () => {
    const html = renderToStaticMarkup(<EffectsPanel flags={0} onChange={() => {}} />);
    expect(html).not.toContain('Tout effacer');
  });

  test('« Tout effacer » paraît dès qu’UN effet est armé', () => {
    const html = renderToStaticMarkup(<EffectsPanel flags={MESSAGE_EFFECT_FLAGS.GLOW} onChange={() => {}} />);
    expect(html).toContain('Tout effacer');
  });
});

describe('EffectsPanel — DOM réel', () => {
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
      root.render(<EffectsPanel flags={flags} onChange={onChange} />);
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

  test('« Tout effacer » retire les dix effets et laisse un bit de cycle de vie intact', () => {
    let changed: number | null = null;
    const el = mount(MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.RAINBOW, (f) => {
      changed = f;
    });
    const clear = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Tout effacer');
    expect(clear).toBeDefined();
    act(() => {
      clear!.click();
    });
    expect(changed).toBe(MESSAGE_EFFECT_FLAGS.BLURRED);
  });

  test('les deux rangées sont des groupes nommés par leur titre (lecteur d’écran)', () => {
    const el = mount(0, () => {});
    const groups = [...el.querySelectorAll('[role="group"][aria-labelledby]')];
    const names = groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent);
    expect(names).toEqual(["Animation d'entrée", 'Effet permanent']);
    expect(groups[0]!.querySelectorAll('button[aria-pressed]')).toHaveLength(6);
    expect(groups[1]!.querySelectorAll('button[aria-pressed]')).toHaveLength(4);
  });
});
