import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { WaitingCall } from '@/lib/calls/call-store';

import { CallWaitingBanner, SecondCallLayer } from './call-waiting-banner';

/**
 * **UN SECOND APPEL ARRIVE PENDANT LE PREMIER** (`CallWaitingBannerView.swift`) —
 * le bandeau dit qui appelle et porte ses deux réponses. Il vit dans son chunk :
 * l'écran d'appel n'en paie que l'`import()` (#17499, plafond `call_overlay`).
 */

const waiting = (overrides: Partial<WaitingCall> = {}): WaitingCall => ({
  callId: 'call-2',
  conversationId: 'c-2',
  media: 'audio',
  callerName: 'Awa Ndiaye',
  callerAvatar: null,
  callerKey: null,
  isGroup: false,
  title: 'Awa Ndiaye',
  ...overrides,
});

describe('le bandeau d’appel en attente', () => {
  test('dit qui appelle, dans une boîte d’alerte nommée', () => {
    const html = renderToStaticMarkup(<CallWaitingBanner waiting={waiting()} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-label="Awa Ndiaye vous appelle"');
    expect(html).toContain('data-call-waiting=""');
  });

  test('porte Refuser puis Répondre, chacun à 44 px', () => {
    const html = renderToStaticMarkup(<CallWaitingBanner waiting={waiting({ title: 'Famille', isGroup: true })} />);
    expect(html).toContain('Famille');
    expect(html.indexOf('Refuser')).toBeLessThan(html.indexOf('Répondre'));
    expect(html.match(/min-h-11/g)?.length).toBe(2);
  });
});

describe('le second appel — ce qui arrive et ce qui est refusé, dans un seul chunk', () => {
  test('le bandeau paraît pour un appel qui sonne, sans l’avis', () => {
    const html = renderToStaticMarkup(<SecondCallLayer waiting={waiting()} busy={false} />);
    expect(html).toContain('data-call-waiting=""');
    expect(html).not.toContain('role="status"');
  });

  test('composer pendant un appel dit « Vous êtes déjà en appel », sans bandeau', () => {
    const html = renderToStaticMarkup(<SecondCallLayer waiting={null} busy />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-call-waiting');
  });
});
