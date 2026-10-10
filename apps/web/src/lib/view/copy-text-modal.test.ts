import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { browserClipboard } from './copy-text';

/**
 * LE REPLI COPIE DEPUIS LA FENÊTRE MODALE (#8986) — une `<dialog>` ouverte par
 * `showModal()` rend inerte tout ce qui est hors d'elle : une zone de texte
 * posée dans `body` n'y prend pas le focus et `execCommand('copy')` n'y copie
 * rien. La zone vit donc là où vit le focus.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'execCommand');
});

function recordCopyHost(): { readonly host: () => Element | null } {
  let host: Element | null = null;
  Object.defineProperty(document, 'execCommand', {
    value: () => {
      host = document.querySelector('textarea[aria-hidden="true"]')?.parentElement ?? null;
      return true;
    },
    configurable: true,
  });
  return { host: () => host };
}

describe('legacyCopy — la zone de texte suit le focus (#8986)', () => {
  test('focus dans une fenêtre modale ⇒ la zone y est posée, pas dans body', () => {
    const dialog = document.createElement('dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    const recorder = recordCopyHost();
    expect(browserClipboard().legacyCopy('+33 6 12 34 56 78')).toBe(true);
    expect(recorder.host() === dialog).toBe(true);
    expect(document.querySelector('textarea') === null).toBe(true);
  });

  test('hors fenêtre modale ⇒ body, comme avant', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const recorder = recordCopyHost();
    expect(browserClipboard().legacyCopy('a')).toBe(true);
    expect(recorder.host() === document.body).toBe(true);
  });
});
