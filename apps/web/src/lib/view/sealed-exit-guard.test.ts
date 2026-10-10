import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { contentExitOf, quotedExitOf, sealedProps } from './content-exit';
import { SEALED_ROW_ATTRIBUTE, installSealedExitGuard } from './sealed-exit-guard';

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
  document.body.innerHTML = `<div id="s" ${SEALED_ROW_ATTRIBUTE}=""><p>secret</p><img src="/a.jpg" /><a href="/doc.pdf"><span>doc.pdf</span></a><svg><image href="/a.jpg" /></svg><div class="fond" style="background-image:url(/a.jpg)"></div></div><div id="o"><p>ordinaire</p><img src="/b.jpg" /><a href="/b.pdf">b.pdf</a></div>`;
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

const NOW = 1_700_000_000_000;
const SEALED = { [SEALED_ROW_ATTRIBUTE]: '' };

describe('sealedProps — le sceau vient du MÊME verdict que les boutons', () => {
  test('un message ordinaire n’est pas scellé', () => {
    expect(sealedProps(base, NOW)).toEqual({});
    expect(sealedProps({ ...base, effectFlags: 0, replyTo: { ...base, effectFlags: 0 } }, NOW)).toEqual({});
  });

  test('toute nature qui disparaît est scellée — message ou pièce, colonne ou bit', () => {
    expect(sealedProps({ ...base, effectFlags: EPHEMERAL, ephemeralDuration: 60 }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, expiresAt: new Date(NOW + 60_000) }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, isViewOnce: true }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, attachments: [{ isViewOnce: true }] }, NOW)).toEqual(SEALED);
  });

  test('ce que les boutons refusent déjà est scellé aussi : flou, bit de flou, chiffré', () => {
    expect(sealedProps({ ...base, isBlurred: true }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, isEncrypted: true }, NOW)).toEqual(SEALED);
  });

  test('un message ordinaire qui CITE un contenu qui disparaît est scellé : sa rangée affiche l’aperçu cité', () => {
    expect(sealedProps({ ...base, replyTo: { ...base, effectFlags: EPHEMERAL, ephemeralDuration: 60 } }, NOW)).toEqual(SEALED);
    expect(sealedProps({ ...base, replyTo: { ...base, effectFlags: 0, attachments: [{ isViewOnce: true }] } }, NOW)).toEqual(SEALED);
  });

  test('une citation dont la nature n’est pas déclarée scelle la rangée', () => {
    expect(sealedProps({ ...base, replyTo: base }, NOW)).toEqual(SEALED);
  });

  test('propriété : une rangée non scellée est une rangée dont TOUT peut sortir', () => {
    const shapes = [base, { ...base, effectFlags: EPHEMERAL, ephemeralDuration: 60 }, { ...base, isViewOnce: true }, { ...base, isBlurred: true }, { ...base, effectFlags: 0 }];
    shapes.forEach((message) =>
      [undefined, ...shapes].forEach((replyTo) => {
        const subject = replyTo === undefined ? message : { ...message, replyTo };
        const open = SEALED_ROW_ATTRIBUTE in sealedProps(subject, NOW) === false;
        const leaves = contentExitOf(subject, NOW).leaves && (replyTo === undefined || quotedExitOf(replyTo, NOW).leaves);
        expect(open && !leaves).toBe(false);
      }),
    );
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

  test('le menu natif est annulé sur TOUT ce qu’une rangée scellée rend : lien de fichier, texte, svg, fond', () => {
    ['a', 'a span', 'p', 'svg image', '.fond'].forEach((selector) => {
      expect(fire(sealed.querySelector(selector) as Element, 'contextmenu')).toBe(true);
    });
    expect(fire(ordinary.querySelector('a') as Element, 'contextmenu')).toBe(false);
  });

  test('le clic milieu sur le lien d’un fichier scellé (ouvrir dans un onglet) est annulé', () => {
    expect(fire(sealed.querySelector('a span') as Element, 'auxclick')).toBe(true);
    expect(fire(ordinary.querySelector('a') as Element, 'auxclick')).toBe(false);
  });

  test('glisser un lien ou un fond d’une rangée scellée est annulé', () => {
    expect(fire(sealed.querySelector('a') as Element, 'dragstart')).toBe(true);
    expect(fire(sealed.querySelector('.fond') as Element, 'dragstart')).toBe(true);
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

describe('la sélection réelle du document (#9573)', () => {
  test('une sélection qui commence AVANT une rangée scellée et finit APRÈS ne se copie pas', () => {
    document.body.innerHTML = `<p id="avant">avant</p><div id="sc" ${SEALED_ROW_ATTRIBUTE}=""><p>secret</p></div><p id="apres">après</p>`;
    const off = installSealedExitGuard(document);
    const range = document.createRange();
    range.setStart(document.getElementById('avant')?.firstChild as Node, 0);
    range.setEnd(document.getElementById('apres')?.firstChild as Node, 3);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const event = new Event('copy', { bubbles: true, cancelable: true });
    document.getElementById('avant')?.dispatchEvent(event);
    selection?.removeAllRanges();
    off();
    expect(event.defaultPrevented).toBe(true);
  });

  test('un geste venu d’un shadow DOM ouvert est rattaché à son hôte scellé', () => {
    document.body.innerHTML = `<div id="sh" ${SEALED_ROW_ATTRIBUTE}=""></div>`;
    const host = document.getElementById('sh') as HTMLElement;
    const inner = host.attachShadow({ mode: 'open' });
    inner.innerHTML = '<img src="/x.jpg" />';
    const off = installSealedExitGuard(document, () => []);
    const event = new Event('dragstart', { bubbles: true, cancelable: true, composed: true });
    inner.querySelector('img')?.dispatchEvent(event);
    off();
    expect(event.defaultPrevented).toBe(true);
  });
});
