import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StoryActionRail } from '@/components/story-action-rail';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { resolveStoryActionRailPlan } from '@/lib/stories/action-rail';

/**
 * **LE BOUTON MUET DU LECTEUR DE STORY** — miroir de
 * `StoryViewerView+Sidebar.swift:479-509` (`speaker.slash.fill` /
 * `speaker.wave.2.fill`) : un contrôle existe s'il a un EFFET (loi 4),
 * jamais un décor.
 *
 * **CE FICHIER A CHANGÉ DE SUJET, PAS DE CONTRAT.** Le bouton vivait dans la
 * ligne AUTEUR (`SoundToggle`, `story-parts.tsx`, T10 #6899) ; l'arbitrage
 * #4508 le place en TÊTE DU RAIL (« le son est le SEUL élément du rail qui
 * décrit ce qui est en train de SE PASSER »). Les quatre témoins ci-dessous
 * sont ceux de `SoundToggle`, mot pour mot, retargetés sur son nouvel hôte —
 * un contrat mesuré ne se perd pas parce que son porteur déménage.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
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

function mount(node: React.ReactElement): HTMLDivElement {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(node);
  });
  return c;
}

/** Le rail réduit à SON SEUL bouton son : la loi le garde (`hasAudibleSound`),
 * un gestionnaire l'atteint, et rien d'autre n'est branché. */
const railSon = (muted: boolean, onToggle: () => void) => (
  <StoryActionRail
    plan={resolveStoryActionRailPlan({
      storyId: 'st-1',
      isOwnStory: false,
      canReply: false,
      hasAudibleSound: true,
      commentCount: 0,
      hasTranslatableContent: false,
    })}
    language="fr"
    handlers={{ sound: onToggle }}
    pressed={{ sound: muted }}
  />
);

describe('le bouton MUET du rail — un effet, jamais un décor', () => {
  test('`aria-pressed` reflète `muted`, et le clic appelle `onToggle`', () => {
    let toggled = 0;
    const el = mount(railSon(true, () => (toggled += 1)));
    const button = el.querySelector('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    expect(toggled).toBe(1);
  });

  test('non muet : `aria-pressed="false"`', () => {
    const el = mount(railSon(false, () => {}));
    expect(el.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('la cible tient au moins 44×44 (dimension 5, cibles atteignables)', () => {
    const el = mount(railSon(true, () => {}));
    const disque = el.querySelector('[data-story-action="sound"] span') as HTMLSpanElement;
    expect(disque.style.width).toBe('44px');
    expect(disque.style.height).toBe('44px');
  });

  test('LA PRISE DU GATE SURVIT AU DÉMÉNAGEMENT — `data-story-sound-toggle` est toujours là', () => {
    /* `check-story-scene.mjs` tape cette prise pour couper le son d'une
       scène ; sans elle, le gate serait VERT PAR OMISSION sur un contrôle
       devenu introuvable. */
    const el = mount(railSon(true, () => {}));
    expect(el.querySelector('[data-story-sound-toggle]')).not.toBeNull();
    expect(el.querySelector('[data-story-sound-toggle]')?.getAttribute('data-story-action')).toBe('sound');
  });

  test('un bouton BASCULE : le libellé « Muet » est CONSTANT, seul `aria-pressed` change', () => {
    const coupe = mount(railSon(true, () => {})).querySelector('button');
    expect(coupe?.getAttribute('aria-label')).toBe('Muet');
    expect(coupe?.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      root.unmount();
    });
    container.remove();
    const joue = mount(railSon(false, () => {})).querySelector('button');
    expect(joue?.getAttribute('aria-label')).toBe('Muet');
    expect(joue?.getAttribute('aria-pressed')).toBe('false');
  });
});
