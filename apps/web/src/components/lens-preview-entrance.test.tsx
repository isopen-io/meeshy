import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationPreview } from '@meeshy/shared/utils/conversation-preview';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensPreviewLine } from './lens-preview-line';

/**
 * #16975 — L'APPARITION SE JOUE SUR LE BLOC DE LA LIGNE 2, UNE FOIS, QUAND LE
 * DERNIER MESSAGE CHANGE : ni au montage, ni au re-rendu du même message.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const preview: ConversationPreview = {
  kind: 'message',
  tone: 'default',
  icon: 'effect',
  author: null,
  segments: [{ kind: 'text', text: 'Surprise', language: null }],
  effect: { veil: false, finish: null, entrance: 'shake' },
};

describe('LensPreviewLine — l’apparition', () => {
  test('rien au montage ni au même message ; une fois quand le dernier message change', () => {
    const block = document.createElement('span');
    block.setAttribute('data-line2', '');
    document.body.appendChild(block);
    const played: unknown[] = [];
    Object.assign(block, {
      animate: (keyframes: unknown) => {
        played.push(keyframes);
        return {} as Animation;
      },
      getBoundingClientRect: () => ({ top: 10, bottom: 30, width: 200, height: 20, left: 0, right: 200, x: 0, y: 10, toJSON: () => ({}) }),
    });
    const root = createRoot(block);
    const render = (key: string) =>
      act(() => root.render(<LensPreviewLine preview={preview} interfaceLanguage="fr" accent="#6366f1" entranceKey={key} />));

    render('m1');
    expect(played).toHaveLength(0);
    render('m1');
    expect(played).toHaveLength(0);
    render('m2');
    expect(played).toHaveLength(1);

    act(() => root.unmount());
    block.remove();
  });
});
