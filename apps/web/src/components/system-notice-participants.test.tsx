import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import type { SystemRow } from '@/lib/view/message-badges';

import { SystemNotice } from './system-notice';

/**
 * LA CARTE D'APPEL NOMME SES PARTICIPANTS SOUS SON TITRE (#17868, A1.2 ; `BubbleCallNoticeView.swift`) —
 * « Awa, Karim, Lina et vous », en texte secondaire sous le titre, lue avec la carte (le titre est caché, le
 * conteneur porte le libellé complet).
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en')]);
});

const row: SystemRow = { kind: 'call', callType: 'video', text: 'Appel vidéo · 04:32' };

const people = [
  { userId: 'u_awa', displayName: 'Awa' },
  { userId: 'u_me', displayName: 'Charles' },
  { userId: 'u_karim', displayName: 'Karim' },
];

const target = (overrides: Partial<CallNoticeTarget> = {}): CallNoticeTarget => ({
  conversationId: 'c1',
  callId: 'call-1',
  media: 'video',
  live: false,
  transcript: true,
  recording: null,
  participants: people,
  viewerId: 'u_me',
  ...overrides,
});

const render = (callTarget: CallNoticeTarget | null, language: 'fr' | 'en' = 'fr') =>
  renderToStaticMarkup(<SystemNotice row={row} timeString="09:06" surface="bubble" callTarget={callTarget} language={language} />);

describe('la ligne des participants de la carte d’appel', () => {
  test('elle se pose sous le titre, avant la bascule du journal', () => {
    const html = render(target());
    expect(html).toContain('data-call-card-participants');
    expect(html).toContain('Awa, Karim et vous');
    expect(html.indexOf('data-call-card-title')).toBeLessThan(html.indexOf('data-call-card-participants'));
    expect(html.indexOf('data-call-card-participants')).toBeLessThan(html.indexOf('data-call-transcript-toggle'));
  });

  test('elle est lue avec la carte : le libellé du conteneur la porte, la ligne visible est cachée', () => {
    const html = render(target());
    expect(html).toMatch(/aria-label="Appel vidéo · 04:32, Awa, Karim et vous"/);
    expect(html).toMatch(/data-call-card-participants=""[^>]*aria-hidden="true"/);
  });

  test('elle suit la langue de la rangée', () => {
    expect(render(target(), 'en')).toContain('Awa, Karim and you');
  });

  test('un seul nom ou une liste absente : aucune ligne, le libellé reste celui d’avant', () => {
    for (const participants of [null, [], [people[1]]]) {
      const html = render(target({ participants }));
      expect(html).not.toContain('data-call-card-participants');
      expect(html).toMatch(/aria-label="Appel vidéo · 04:32"/);
    }
  });

  test('une cible sans participants (champ absent) ne change rien à la carte', () => {
    const { participants: _participants, viewerId: _viewerId, ...bare } = target();
    expect(render(bare)).not.toContain('data-call-card-participants');
  });

  test('un appel manqué ou en cours nomme aussi ceux qui ont rejoint', () => {
    expect(render(target({ transcript: false, live: true }))).toContain('data-call-card-participants');
  });
});
