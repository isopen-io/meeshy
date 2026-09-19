import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { shortcutYieldsToTarget } from './shortcut-scope';

/**
 * **UNE FRAPPE ADRESSÉE À UN CONTRÔLE N'EST PAS UN RACCOURCI D'ÉCRAN.**
 *
 * Le témoin mesure la LOI ; ce qu'elle empêche se mesure au navigateur
 * (`check-story-scene.mjs` : « a b » doit rester « a b », et Espace doit
 * activer le bouton qui a le focus).
 */
beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

const withNode = <T>(html: string, selector: string, read: (node: Element) => T): T => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  const node = host.querySelector(selector);
  if (node === null) throw new Error(`fixture sans ${selector}`);
  const value = read(node);
  host.remove();
  return value;
};

describe('shortcutYieldsToTarget — qui possède la touche', () => {
  test('une ZONE DE SAISIE la possède — Espace y écrit un espace, jamais une pause', () => {
    expect(withNode('<textarea></textarea>', 'textarea', shortcutYieldsToTarget)).toBe(true);
    expect(withNode('<input type="text" />', 'input', shortcutYieldsToTarget)).toBe(true);
    expect(withNode('<select></select>', 'select', shortcutYieldsToTarget)).toBe(true);
  });

  test('une région ÉDITABLE la possède, même sans balise de formulaire', () => {
    expect(withNode('<div contenteditable="true"></div>', 'div', shortcutYieldsToTarget)).toBe(true);
    expect(withNode('<div role="textbox"></div>', 'div', shortcutYieldsToTarget)).toBe(true);
  });

  test('un BOUTON la possède — sinon un `preventDefault` d’écran lui retire Espace, et il n’est plus activable qu’à Entrée', () => {
    expect(withNode('<button type="button"></button>', 'button', shortcutYieldsToTarget)).toBe(true);
    expect(withNode('<a href="/c/x"></a>', 'a', shortcutYieldsToTarget)).toBe(true);
    expect(withNode('<div role="button"></div>', 'div', shortcutYieldsToTarget)).toBe(true);
  });

  test('un DESCENDANT d’un contrôle la possède aussi — le glyphe d’un bouton n’est pas une surface neutre', () => {
    expect(withNode('<button type="button"><span data-g></span></button>', '[data-g]', shortcutYieldsToTarget)).toBe(true);
  });

  test('une surface INERTE au clavier ne la possède pas — c’est là que le raccourci d’écran vit', () => {
    expect(withNode('<div></div>', 'div', shortcutYieldsToTarget)).toBe(false);
    expect(withNode('<p>Le lac, ce matin.</p>', 'p', shortcutYieldsToTarget)).toBe(false);
    /* `<body>` est la cible NOMINALE d'un raccourci de lecteur plein écran :
       personne n'a le focus, la touche appartient à l'écran. */
    expect(shortcutYieldsToTarget(document.body)).toBe(false);
  });

  test('un `contenteditable="false"` explicite ne la possède pas — l’attribut n’est pas un drapeau de présence', () => {
    expect(withNode('<div contenteditable="false"></div>', 'div', shortcutYieldsToTarget)).toBe(false);
  });

  test('une cible ABSENTE ou non-élément ne la possède pas — `window` reçoit ses propres touches', () => {
    expect(shortcutYieldsToTarget(null)).toBe(false);
    expect(shortcutYieldsToTarget(window)).toBe(false);
  });
});
