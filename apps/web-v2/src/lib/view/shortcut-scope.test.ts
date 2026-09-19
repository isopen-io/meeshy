import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { shortcutYieldsToTarget } from './shortcut-scope';

/**
 * **UNE FRAPPE ADRESSÉE À UN CONTRÔLE N'EST PAS UN RACCOURCI D'ÉCRAN.**
 *
 * Le témoin mesure la LOI ; ce qu'elle empêche se mesure au navigateur
 * (`check-story-scene.mjs` point 7 : « a b c » reste « a b c », Espace
 * active le bouton qui a le focus, et une flèche sur ce même bouton avance
 * quand même la story).
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

const yieldsFor = (html: string, selector: string, key: string): boolean => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const target = host.querySelector(selector);
  if (target === null) throw new Error(`fixture sans ${selector}`);
  const value = shortcutYieldsToTarget({ target, key });
  host.remove();
  return value;
};

describe('shortcutYieldsToTarget — une ZONE DE SAISIE réclame toute touche', () => {
  test('l’espace, les flèches et les lettres lui appartiennent', () => {
    for (const key of [' ', 'ArrowRight', 'ArrowLeft', 'm', 'Enter']) {
      expect(yieldsFor('<textarea></textarea>', 'textarea', key)).toBe(true);
    }
  });

  test('les autres formes de saisie aussi — champ, liste, région éditable, rôle ARIA', () => {
    expect(yieldsFor('<input type="text" />', 'input', ' ')).toBe(true);
    expect(yieldsFor('<select></select>', 'select', 'ArrowRight')).toBe(true);
    expect(yieldsFor('<div contenteditable="true"></div>', 'div', ' ')).toBe(true);
    expect(yieldsFor('<div role="textbox"></div>', 'div', 'ArrowLeft')).toBe(true);
    expect(yieldsFor('<div role="slider"></div>', 'div', 'ArrowRight')).toBe(true);
  });

  test('un `contenteditable="false"` explicite ne réclame rien — l’attribut n’est pas un drapeau de présence', () => {
    expect(yieldsFor('<div contenteditable="false"></div>', 'div', ' ')).toBe(false);
  });
});

describe('shortcutYieldsToTarget — un contrôle d’ACTIVATION ne réclame que ses deux touches', () => {
  test('Espace et Entrée lui appartiennent — sinon un `preventDefault` d’écran lui retire Espace, et il n’est plus activable qu’à Entrée', () => {
    expect(yieldsFor('<button type="button"></button>', 'button', ' ')).toBe(true);
    expect(yieldsFor('<button type="button"></button>', 'button', 'Enter')).toBe(true);
    expect(yieldsFor('<a href="/c/x"></a>', 'a', 'Enter')).toBe(true);
    expect(yieldsFor('<div role="button"></div>', 'div', ' ')).toBe(true);
  });

  test('LES FLÈCHES RESTENT À L’ÉCRAN — cliquer un bouton le FOCALISE, et une cession en bloc figerait la navigation jusqu’au clic suivant', () => {
    expect(yieldsFor('<button type="button"></button>', 'button', 'ArrowRight')).toBe(false);
    expect(yieldsFor('<button type="button"></button>', 'button', 'ArrowLeft')).toBe(false);
    expect(yieldsFor('<button type="button"></button>', 'button', 'm')).toBe(false);
    expect(yieldsFor('<a href="/c/x"></a>', 'a', 'ArrowRight')).toBe(false);
  });

  test('un DESCENDANT d’un contrôle réclame comme lui — le glyphe d’un bouton n’est pas une surface neutre', () => {
    expect(yieldsFor('<button type="button"><span data-g></span></button>', '[data-g]', ' ')).toBe(true);
    expect(yieldsFor('<button type="button"><span data-g></span></button>', '[data-g]', 'ArrowRight')).toBe(false);
  });
});

describe('shortcutYieldsToTarget — le cas NOMINAL est la surface nue', () => {
  test('une surface sans revendication laisse la touche à l’écran', () => {
    expect(yieldsFor('<div></div>', 'div', ' ')).toBe(false);
    expect(yieldsFor('<p>Le lac, ce matin.</p>', 'p', 'ArrowRight')).toBe(false);
    /* `<body>` est la cible NOMINALE d'un raccourci de lecteur plein écran :
       personne n'a le focus, la touche appartient à l'écran. */
    expect(shortcutYieldsToTarget({ target: document.body, key: ' ' })).toBe(false);
  });

  test('une cible ABSENTE ou non-élément ne réclame rien — `window` reçoit ses propres touches', () => {
    expect(shortcutYieldsToTarget({ target: null, key: ' ' })).toBe(false);
    expect(shortcutYieldsToTarget({ target: window, key: ' ' })).toBe(false);
  });
});
