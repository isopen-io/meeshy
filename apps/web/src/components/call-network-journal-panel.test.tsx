import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { JournalEvent } from '@/lib/calls/call-network-journal';
import { createCallJournalStore } from '@/lib/calls/call-network-journal-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { CallNetworkJournal, CallNetworkJournalSection } from './call-network-journal-panel';

/**
 * **« QUALITÉ ET RÉSEAU » DANS LA FICHE D'UN APPEL** (#8698) — le résumé (pire
 * qualité, pires mesures, reconnexions, relais, réseau, fin) puis la
 * chronologie de ce que ce téléphone a vu, relue depuis le journal persisté.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('en');
});

const at = (seconds: number): number => Date.UTC(2026, 8, 29, 10, 0, seconds);

const events: readonly JournalEvent[] = [
  { at: at(0), kind: 'phase', phase: 'connecting' },
  { at: at(2), kind: 'phase', phase: 'connected' },
  { at: at(2), kind: 'profile', profile: 'cellular', audioBitrate: 24_000 },
  { at: at(2), kind: 'path', path: 'relay' },
  { at: at(4), kind: 'quality', level: 'good', loss: 0.4, rtt: 110, jitter: 6, audioKbps: 24, videoKbps: 480 },
  { at: at(20), kind: 'link', name: 'Nadia', state: 'reconnecting' },
  { at: at(21), kind: 'phase', phase: 'reconnecting' },
  { at: at(22), kind: 'quality', level: 'poor', loss: 9.5, rtt: 480, jitter: 31, audioKbps: 16, videoKbps: 90 },
  { at: at(24), kind: 'survival', stage: 'frozen' },
  { at: at(40), kind: 'phase', phase: 'ended', reason: 'connectionLost', detail: null },
];

describe('« Qualité et réseau » (#8698)', () => {
  test('le résumé dit le pire de l’appel, les reconnexions, le relais, le réseau et la fin', () => {
    const html = renderToStaticMarkup(<CallNetworkJournal events={events} language="fr" />);
    expect(html).toContain('Qualité et réseau');
    expect(html).toContain('data-call-network-summary="worstLevel"');
    expect(html).toContain('faible');
    expect(html).toMatch(/9,5\s?%/);
    expect(html).toMatch(/480\s?ms/);
    expect(html).toContain('Reconnexions');
    expect(html).toContain('Par un relais');
    expect(html).toContain('Données mobiles');
    expect(html).toContain('Connexion perdue');
  });

  test('la chronologie : une ligne datée par événement, dans l’ordre, dans la langue', () => {
    const html = renderToStaticMarkup(<CallNetworkJournal events={events} language="en" />);
    expect(html.match(/data-call-network-event=/g)?.length).toBe(events.length);
    expect(html).toContain('Connecting');
    expect(html).toContain('Nadia: reconnecting');
    expect(html).toContain('Video slowed down');
    expect(html).toContain('Mobile data');
    expect(html).toContain('Relayed through the server');
    expect(html.indexOf('data-call-network-event="phase"')).toBeLessThan(html.indexOf('data-call-network-event="survival"'));
    expect(html).toContain('dateTime="2026-09-29T10:00:40.000Z"');
  });

  test('sans journal sur ce téléphone, la section ne se montre pas', () => {
    expect(renderToStaticMarkup(<CallNetworkJournal events={[]} language="fr" />)).toBe('');
  });

  test('la section relit le journal persisté du compte, et seulement le sien', () => {
    const items = new Map<string, string>();
    const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) };
    createCallJournalStore({ storage, now: () => 0 }).append('u-a', 'call-1', events);
    expect(renderToStaticMarkup(<CallNetworkJournalSection callId="call-1" viewerId="u-a" language="fr" storage={storage} />)).toContain('data-call-network-journal="call-1"');
    expect(renderToStaticMarkup(<CallNetworkJournalSection callId="call-1" viewerId="u-b" language="fr" storage={storage} />)).toBe('');
  });
});
