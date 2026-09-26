import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallRecord } from '@/lib/api/calls';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallDetailSheet } from './call-detail-sheet';

/**
 * LA FICHE D'UN APPEL (#6383) — miroir de `CallDetailSheet.swift` : toucher une
 * ligne du journal ouvre QUI, QUAND, COMBIEN DE TEMPS, et les deux rappels.
 */

const NOW = new Date('2026-09-13T12:00:00.000Z');

const record = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  callId: 'call-amina',
  conversationId: 'c-amina',
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  direction: 'incoming',
  isVideo: false,
  startedAt: '2026-09-13T09:00:00.000Z',
  durationSec: 185,
  peer: { userId: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
  ...overrides,
});

const sheet = (overrides: Partial<CallRecord> = {}, language: 'fr' | 'en' = 'fr') =>
  renderToStaticMarkup(<CallDetailSheet language={language} record={record(overrides)} now={NOW} onClose={() => undefined} />);

describe('la fiche d’un appel', () => {
  test('se titre « Détails de l’appel » et nomme l’interlocuteur', () => {
    const html = sheet();
    expect(html).toContain('Détails de l’appel');
    expect(html).toMatch(/data-call-detail-name[^>]*>Amina Diallo</);
  });

  test('la ligne d’état dit la direction et l’heure ; un manqué la porte en rouge', () => {
    expect(sheet()).toMatch(/data-call-detail-status="incoming"[^>]*>.*?<\/svg>Reçu · 3h</);
    expect(sheet({ direction: 'missed', durationSec: 0 })).toMatch(/data-call-detail-status="missed"[^>]*color:var\(--color-error\)/);
  });

  test('rappeler en vocal OU en vidéo, quel que soit le type d’origine', () => {
    const html = sheet({ isVideo: true });
    expect(html).toContain('data-call-detail-redial="audio"');
    expect(html).toContain('data-call-detail-redial="video"');
  });

  test('les détails : type, date complète, durée — un appel sans durée n’en affiche aucune', () => {
    const html = sheet({ isVideo: true, durationSec: 754 });
    expect(html).toMatch(/<dt[^>]*>Type<\/dt><dd[^>]*>Appel vidéo<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>Date<\/dt><dd[^>]*><time dateTime="2026-09-13T09:00:00.000Z"[^>]*>[^<]*2026/);
    expect(html).toMatch(/<dt[^>]*>Durée<\/dt><dd[^>]*>12:34<\/dd>/);
    expect(sheet({ direction: 'missed', durationSec: 0 })).not.toContain('data-call-detail-duration');
  });

  test('ouvre le fil de SA conversation', () => {
    expect(sheet()).toMatch(/data-call-detail-open[^>]*href="\/c\/c-amina"/);
  });

  test('un appel de groupe se nomme par sa conversation', () => {
    expect(sheet({ peer: null, conversationType: 'group', conversationTitle: 'Annonces produit' })).toMatch(
      /data-call-detail-name[^>]*>Annonces produit</,
    );
  });

  test('en anglais, la fiche est anglaise', async () => {
    await loadInterfaceCatalog('en');
    const html = sheet({ direction: 'outgoing' }, 'en');
    expect(html).toContain('Call details');
    expect(html).toMatch(/<dt[^>]*>Duration<\/dt>/);
  });
});
