import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { focusMainHeading, requestMainHeadingFocus, takeMainHeadingFocusRequest, trappedTabTarget } from './drawer-focus';

beforeAll(() => ensureHappyDomRegistered({ url: 'http://localhost/' }));
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const dialogOf = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
};

describe('trappedTabTarget — Tab boucle dans le tiroir', () => {
  const root = () => dialogOf('<button id="a"></button><a id="b" href="/x"></a><button id="c"></button><button id="off" disabled></button>');

  test('du dernier élément focalisable, Tab revient au premier ; un bouton désactivé ne compte pas', () => {
    const r = root();
    expect(trappedTabTarget(r, r.querySelector('#c'), false)?.id).toBe('a');
    r.remove();
  });

  test('du premier, Maj+Tab va au dernier', () => {
    const r = root();
    expect(trappedTabTarget(r, r.querySelector('#a'), true)?.id).toBe('c');
    r.remove();
  });

  test('au milieu, la touche avance ou recule d’un cran', () => {
    const r = root();
    expect(trappedTabTarget(r, r.querySelector('#b'), false)?.id).toBe('c');
    expect(trappedTabTarget(r, r.querySelector('#b'), true)?.id).toBe('a');
    r.remove();
  });

  test('un focus hors du tiroir est ramené : au premier en avant, au dernier en arrière', () => {
    const r = root();
    expect(trappedTabTarget(r, document.body, false)?.id).toBe('a');
    expect(trappedTabTarget(r, null, true)?.id).toBe('c');
    r.remove();
  });

  test('un tiroir sans élément focalisable laisse la touche suivre son cours', () => {
    const r = dialogOf('<p>rien</p>');
    expect(trappedTabTarget(r, null, false)).toBeNull();
    r.remove();
  });
});

describe('la demande de focus sur le titre — vit un court instant, se consomme une fois', () => {
  test('une demande fraîche est reçue une fois, puis plus', () => {
    requestMainHeadingFocus(1_000);
    expect(takeMainHeadingFocusRequest(1_500)).toBe(true);
    expect(takeMainHeadingFocusRequest(1_600)).toBe(false);
  });

  test('une demande trop ancienne est périmée : un écran monté plus tard n’en hérite pas', () => {
    requestMainHeadingFocus(1_000);
    expect(takeMainHeadingFocusRequest(10_000)).toBe(false);
  });

  test('sans demande, rien à recevoir', () => {
    takeMainHeadingFocusRequest();
    expect(takeMainHeadingFocusRequest()).toBe(false);
  });
});

describe('focusMainHeading', () => {
  test('focalise le titre de l’écran, rendu focalisable par programme seulement', () => {
    const r = dialogOf('<div data-admin-shell><h1>Comptes</h1><main id="contenu"></main></div>');
    expect(focusMainHeading()).toBe(true);
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
    r.remove();
  });

  test('sans titre, la zone de contenu reçoit le focus', () => {
    const r = dialogOf('<div data-admin-shell><main id="contenu"></main></div>');
    expect(focusMainHeading()).toBe(true);
    expect(document.activeElement?.id).toBe('contenu');
    r.remove();
  });

  test('sans écran monté, rien ne bouge', () => {
    expect(focusMainHeading()).toBe(false);
  });
});
