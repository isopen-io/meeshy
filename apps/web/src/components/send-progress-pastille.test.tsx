import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { sendProgressStore } from '@/lib/send/send-progress';

import { Check } from './message-blocks';

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});
beforeEach(() => sendProgressStore.setState({ fractions: {} }));

describe('Check — la pastille d’envoi porte la progression (#16134)', () => {
  test('une bulle en envoi avec une fraction montre une barre « Envoi en cours » et son pourcentage', () => {
    sendProgressStore.getState().report('cm-a', 0.42);
    const html = renderToStaticMarkup(<Check status="pending" isMine progressKey="cm-a" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-label="Envoi en cours"');
    expect(html).toContain('42');
  });

  test('chaque bulle lit SA fraction, pas celle d’une autre', () => {
    sendProgressStore.getState().report('cm-a', 0.1);
    sendProgressStore.getState().report('cm-b', 0.9);
    expect(renderToStaticMarkup(<Check status="pending" isMine progressKey="cm-a" />)).toContain('aria-valuenow="10"');
    expect(renderToStaticMarkup(<Check status="pending" isMine progressKey="cm-b" />)).toContain('aria-valuenow="90"');
  });

  test('sans fraction, la pastille garde l’horloge ; un message confirmé n’affiche jamais de progression', () => {
    expect(renderToStaticMarkup(<Check status="pending" isMine progressKey="cm-a" />)).not.toContain('progressbar');
    sendProgressStore.getState().report('cm-a', 0.5);
    expect(renderToStaticMarkup(<Check status="sent" isMine progressKey="cm-a" />)).not.toContain('progressbar');
  });
});
