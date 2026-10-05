import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, useState } from 'react';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES as INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PasswordInput } from './password-input';

/**
 * AFFICHER OU MASQUER CE QU'ON TAPE (#8054, directive porteur 2026-09-26 :
 * « Actuellement on ne voit que des étoiles »). UN composant, posé sur chaque
 * champ de mot de passe de l'application.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all(INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();

afterEach(async () => {
  mounter.unmountAll();
  await setInterfaceLanguage('fr');
});

function Harness({ initial = '' }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <form>
      <PasswordInput id="pw" value={value} onValue={setValue} autoComplete="current-password" />
    </form>
  );
}

const input = (host: ParentNode): HTMLInputElement => {
  const element = host.querySelector('#pw');
  if (!(element instanceof HTMLInputElement)) throw new Error('champ absent');
  return element;
};

const toggle = (host: ParentNode): HTMLButtonElement => {
  const element = host.querySelector('[data-password-toggle]');
  if (!(element instanceof HTMLButtonElement)) throw new Error('bouton œil absent');
  return element;
};

describe('PasswordInput — masqué par défaut, révélé à la demande', () => {
  test('masqué au montage : le bouton propose de l’afficher, état non pressé', async () => {
    const host = await mounter.mount(<Harness />);

    expect(input(host).type).toBe('password');
    expect(toggle(host).getAttribute('aria-label')).toBe(translate('fr', 'password.show'));
    expect(toggle(host).getAttribute('aria-pressed')).toBe('false');
    expect(toggle(host).getAttribute('aria-controls')).toBe('pw');
  });

  test('un clic révèle le texte, un second le masque de nouveau', async () => {
    const host = await mounter.mount(<Harness initial="s3cret" />);

    await mounter.click(toggle(host));
    expect(input(host).type).toBe('text');
    expect(input(host).value).toBe('s3cret');
    expect(toggle(host).getAttribute('aria-label')).toBe(translate('fr', 'password.hide'));
    expect(toggle(host).getAttribute('aria-pressed')).toBe('true');

    await mounter.click(toggle(host));
    expect(input(host).type).toBe('password');
    expect(toggle(host).getAttribute('aria-pressed')).toBe('false');
  });

  test('le bouton ne soumet jamais le formulaire', async () => {
    const host = await mounter.mount(<Harness />);

    expect(toggle(host).type).toBe('button');
  });

  test('la cible du bouton fait 44 px', async () => {
    const host = await mounter.mount(<Harness />);

    expect(toggle(host).style.minWidth).toBe('44px');
    expect(toggle(host).style.minHeight).toBe('44px');
  });

  test('le focus et la position du curseur restent dans le champ', async () => {
    const host = await mounter.mount(<Harness initial="abcdef" />);
    const field = input(host);
    act(() => {
      field.focus();
      field.setSelectionRange(2, 4);
    });

    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    toggle(host).dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);

    await mounter.click(toggle(host));
    expect(document.activeElement).toBe(input(host));
    expect([input(host).selectionStart, input(host).selectionEnd]).toEqual([2, 4]);
  });

  test('le libellé suit la langue d’interface — sept langues, aucune vide, aucune égale à la clé', async () => {
    for (const language of INTERFACE_LANGUAGES) {
      for (const key of ['password.show', 'password.hide'] as const) {
        const label = translate(language, key);
        expect({ language, key, empty: label.trim() === '' || label === key }).toEqual({ language, key, empty: false });
      }
    }
    await setInterfaceLanguage('ar');
    const host = await mounter.mount(<Harness />);
    expect(toggle(host).getAttribute('aria-label')).toBe(translate('ar', 'password.show'));
  });
});

describe('PasswordInput — le SEUL champ de mot de passe de l’application', () => {
  test('aucun écran ne pose un `type="password"` à la main', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const walk = (dir: string): readonly string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
      });
    const offenders = walk(root)
      .filter((path) => !path.endsWith('password-input.tsx'))
      .filter((path) => /type=["']password["']|type:\s*["']password["']/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(offenders).toEqual([]);
  });
});
