import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SEALED_ROW_ATTRIBUTE, installSealedExitGuard, sealedRowProps } from './sealed-exit-guard';

/**
 * LES SORTIES NATIVES DU NAVIGATEUR (#9573) — copier une sélection (Ctrl+C,
 * menu du navigateur), couper, glisser une image hors de la page, ouvrir le
 * menu contextuel natif d'un média : sur la rangée d'un contenu qui disparaît,
 * le geste est annulé. Une rangée ordinaire garde les siens.
 */
const { EPHEMERAL, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const base = { isViewOnce: false, isBlurred: false };

let uninstall: () => void;
let sealed: HTMLElement;
let ordinary: HTMLElement;
let picked: Node | null = null;

beforeAll(() => {
  ensureHappyDomRegistered();
  document.body.innerHTML = `<div id="s" ${SEALED_ROW_ATTRIBUTE}=""><p>secret</p><img src="/a.jpg" /></div><div id="o"><p>ordinaire</p><img src="/b.jpg" /></div>`;
  sealed = document.getElementById('s') as HTMLElement;
  ordinary = document.getElementById('o') as HTMLElement;
  uninstall = installSealedExitGuard(document, () => (picked === null ? [] : [picked]));
});

afterAll(async () => {
  uninstall();
  await releaseHappyDomIfRegistered();
});

const fire = (target: Element, type: string): boolean => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('sealedRowProps — quelles rangées sont scellées', () => {
  test('toute nature qui disparaît, jamais un message ordinaire', () => {
    expect(sealedRowProps(base)).toEqual({});
    expect(sealedRowProps({ ...base, isBlurred: true })).toEqual({});
    expect(sealedRowProps({ ...base, effectFlags: EPHEMERAL, ephemeralDuration: 60 })).toEqual({ [SEALED_ROW_ATTRIBUTE]: '' });
    expect(sealedRowProps({ ...base, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ })).toEqual({ [SEALED_ROW_ATTRIBUTE]: '' });
    expect(sealedRowProps({ ...base, isViewOnce: true })).toEqual({ [SEALED_ROW_ATTRIBUTE]: '' });
    expect(sealedRowProps({ ...base, attachments: [{ isViewOnce: true }] })).toEqual({ [SEALED_ROW_ATTRIBUTE]: '' });
  });
});

describe('installSealedExitGuard', () => {
  test('glisser l’image d’une rangée scellée est annulé ; celle d’une rangée ordinaire non', () => {
    expect(fire(sealed.querySelector('img') as Element, 'dragstart')).toBe(true);
    expect(fire(ordinary.querySelector('img') as Element, 'dragstart')).toBe(false);
  });

  test('le menu contextuel natif d’un média scellé est annulé', () => {
    expect(fire(sealed.querySelector('img') as Element, 'contextmenu')).toBe(true);
    expect(fire(ordinary.querySelector('img') as Element, 'contextmenu')).toBe(false);
  });

  test('copier ou couper depuis une rangée scellée est annulé', () => {
    picked = null;
    expect(fire(sealed.querySelector('p') as Element, 'copy')).toBe(true);
    expect(fire(sealed.querySelector('p') as Element, 'cut')).toBe(true);
    expect(fire(ordinary.querySelector('p') as Element, 'copy')).toBe(false);
  });

  test('une sélection qui DÉBORDE sur une rangée scellée ne se copie pas, même lancée d’ailleurs', () => {
    picked = sealed.querySelector('p');
    expect(fire(ordinary.querySelector('p') as Element, 'copy')).toBe(true);
    picked = ordinary.querySelector('p');
    expect(fire(ordinary.querySelector('p') as Element, 'copy')).toBe(false);
    picked = null;
  });

  test('désinstallé, plus rien n’est annulé', () => {
    const off = installSealedExitGuard(document, () => []);
    off();
    uninstall();
    expect(fire(sealed.querySelector('img') as Element, 'dragstart')).toBe(false);
    uninstall = installSealedExitGuard(document, () => (picked === null ? [] : [picked]));
  });
});
