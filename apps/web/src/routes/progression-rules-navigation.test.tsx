import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog, unloadGameCatalog } from '@/lib/i18n-game-catalog';
import { DEFAULT_INTERFACE_LANGUAGE, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { RULES_SECTIONS } from '@/lib/game/rules-address';
import { translateGame } from '@/lib/i18n-game-catalog';
import { RULES_GLOSSARY } from '@/lib/view/game-rules-copy';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { RulesBody } from './progression-rules';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();
const scrolled: Element[] = [];
const original: { scroll?: typeof Element.prototype.scrollIntoView } = {};

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/regles' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
  original.scroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  unmountAll();
  scrolled.length = 0;
});
afterAll(async () => {
  if (original.scroll !== undefined) Element.prototype.scrollIntoView = original.scroll;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  unloadGameCatalog();
  await loadGameCatalog(DEFAULT_INTERFACE_LANGUAGE);
  await releaseHappyDomIfRegistered();
});

const LANGUAGES = SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[];

/**
 * LE CARNET DES RÈGLES SE PARCOURT (#18422, #18423) — directive du porteur : une
 * vue du Jeu montre l'instant, son explication se lit dans les règles, ouvertes
 * à la section concernée. Le carnet porte donc un sommaire, et chaque section,
 * chaque règle, chaque concept s'y désigne.
 */
const toc = (host: ParentNode): HTMLElement => {
  const nav = host.querySelector<HTMLElement>('nav[data-rules-toc]');
  if (nav === null) throw new Error('aucun sommaire');
  return nav;
};
const entry = (host: ParentNode, section: string): HTMLButtonElement => {
  const button = toc(host).querySelector<HTMLButtonElement>(`button[data-rules-toc-entry="${section}"]`);
  if (button === null) throw new Error(`aucune entrée « ${section} » au sommaire`);
  return button;
};
const sectionOf = (host: ParentNode, section: string): Element | null => host.querySelector(`[data-rules-section="${section}"]`);

describe('le sommaire', () => {
  test('il se nomme, et liste les cinq sections dans l’ordre de la page', async () => {
    const host = await mount(<RulesBody />);
    expect(toc(host).getAttribute('aria-label')).toBe('Sommaire');
    expect([...toc(host).querySelectorAll('button')].map((button) => button.getAttribute('data-rules-toc-entry'))).toEqual([...RULES_SECTIONS]);
    expect([...toc(host).querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Règles', 'Concepts', 'Médailles', 'En images', 'Sept cartes']);
  });

  test('il précède les sections, et chaque section qu’il nomme existe, dans le même ordre', async () => {
    const host = await mount(<RulesBody />);
    const sections = [...host.querySelectorAll('[data-rules-section]')];
    expect(sections.map((section) => section.getAttribute('data-rules-section'))).toEqual([...RULES_SECTIONS]);
    expect(toc(host).compareDocumentPosition(sections[0] as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('chaque entrée est une cible de 44 px, nommée dans les sept langues', async () => {
    for (const language of LANGUAGES) {
      const names = RULES_SECTIONS.map((section) => translateGame(language, `game.rules.toc.${section}`));
      expect({ language, named: names.every((name) => name.length > 0 && !name.startsWith('game.')), distinct: new Set(names).size }).toEqual({ language, named: true, distinct: RULES_SECTIONS.length });
      expect(translateGame(language, 'game.rules.toc.label').startsWith('game.')).toBe(false);
    }
    const host = await mount(<RulesBody />);
    for (const button of toc(host).querySelectorAll<HTMLButtonElement>('button')) expect(button.style.minHeight).toBe('44px');
  });

  test('toucher « Médailles » pose la section à l’écran, ouverte, et y porte le focus', async () => {
    const host = await mount(<RulesBody />);
    expect(host.querySelector('#medailles-panel')?.hasAttribute('hidden')).toBe(true);
    await click(entry(host, 'badges'));
    expect(host.querySelector('#medailles-panel')?.hasAttribute('hidden')).toBe(false);
    expect(scrolled).toEqual([sectionOf(host, 'badges') as Element]);
    expect(sectionOf(host, 'badges')?.contains(document.activeElement)).toBe(true);
  });

  test('toucher « Sept cartes » déplie les sept cartes', async () => {
    const host = await mount(<RulesBody />);
    await click(entry(host, 'etapes'));
    expect(host.querySelector('#etapes-panel')?.hasAttribute('hidden')).toBe(false);
    expect(scrolled).toEqual([sectionOf(host, 'etapes') as Element]);
  });

  test('toucher deux fois la même entrée y ramène deux fois', async () => {
    const host = await mount(<RulesBody />);
    await click(entry(host, 'concepts'));
    await click(entry(host, 'concepts'));
    expect(scrolled).toEqual([sectionOf(host, 'concepts') as Element, sectionOf(host, 'concepts') as Element]);
  });

  test('sans cible, rien ne défile à l’ouverture', async () => {
    await mount(<RulesBody />);
    expect(scrolled).toEqual([]);
  });
});

describe('une section désignée par l’adresse', () => {
  test('un concept : sa rangée s’ouvre, seule, se pose à l’écran et se distingue', async () => {
    const host = await mount(<RulesBody focus={{ kind: 'concept', key: 'flame' }} />);
    const row = host.querySelector('[data-rules-concept="flame"]');
    expect(row?.querySelector('[hidden]')).toBeNull();
    expect(row?.hasAttribute('data-rules-target')).toBe(true);
    expect(host.querySelectorAll('[data-rules-target]')).toHaveLength(1);
    expect([...host.querySelectorAll('[data-rules-concept]')].filter((other) => other.querySelector('[hidden]') === null)).toHaveLength(1);
    expect(scrolled).toEqual([row as Element]);
  });

  test('chaque concept du glossaire se désigne', async () => {
    for (const key of RULES_GLOSSARY) {
      const host = await mount(<RulesBody focus={{ kind: 'concept', key }} />);
      expect({ key, open: host.querySelector(`[data-rules-concept="${key}"] [hidden]`) === null }).toEqual({ key, open: true });
      unmountAll();
    }
  });

  test('une section repliée s’ouvre : les sept cartes', async () => {
    const host = await mount(<RulesBody focus={{ kind: 'section', section: 'etapes' }} />);
    expect(host.querySelector('#etapes-panel')?.hasAttribute('hidden')).toBe(false);
    expect(scrolled).toEqual([sectionOf(host, 'etapes') as Element]);
  });

  test('une règle : la sienne se distingue et se pose à l’écran', async () => {
    const host = await mount(<RulesBody focus={{ kind: 'rule', index: 3 }} />);
    expect(host.querySelector('#regle-3')?.hasAttribute('data-game-rule-target')).toBe(true);
    expect(scrolled).toEqual([host.querySelector('#regle-3') as Element]);
  });

  test('les anciennes entrées tiennent : `target` désigne une règle, `badges` ouvre les médailles', async () => {
    const rule = await mount(<RulesBody target={2} />);
    expect(rule.querySelector('#regle-2')?.hasAttribute('data-game-rule-target')).toBe(true);
    unmountAll();
    scrolled.length = 0;
    const badges = await mount(<RulesBody badges />);
    expect(badges.querySelector('#medailles-panel')?.hasAttribute('hidden')).toBe(false);
    expect(scrolled).toEqual([sectionOf(badges, 'badges') as Element]);
  });
});
