import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { apiDeps } from '@/lib/api/deps';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { fetchMessageReceiptsPeople } from '@/lib/api/receipts';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { Attachment } from '@/lib/api/types';
import { time } from '@/lib/grouping';
import { receiptCategoriesOf } from '@/lib/view/message-receipts';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageReceiptsSheet } from './message-receipts-sheet';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const attachment = (partial: Partial<Attachment>): Attachment => ({
  ...attachmentDefaults,
  id: 'att-x',
  messageId: 'm1',
  fileName: 'x.bin',
  originalName: 'x.bin',
  mimeType: 'application/octet-stream',
  fileSize: 10,
  fileUrl: 'https://cdn/x.bin',
  uploadedBy: 'u-viewer',
  createdAt: new Date('2026-09-21T09:00:00.000Z').toISOString(),
  ...partial,
});

async function mountSheet(props: {
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachments: readonly Attachment[];
}): Promise<HTMLElement> {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <ul>
        <MessageReceiptsSheet {...props} />
      </ul>
    </QueryClientProvider>,
  );
  await mounter.settle();
  return host;
}

describe('MessageReceiptsSheet - sections nominatives', () => {
  test('Infos du message se monte', async () => {
    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [] });

    expect(host.querySelector('[data-message-receipts-title]')?.textContent).toBe('Infos du message');
    expect(host.querySelector('[data-message-receipts-section="read-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section="received-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section="not-yet"]')).not.toBe(null);
    expect(host.querySelectorAll('[data-message-receipts-person]').length).toBe(5);
  });

  test('conversation inconnue rend trois sections vides', async () => {
    const host = await mountSheet({ conversationId: 'c-inconnue-du-tout', messageId: 'm-x', attachments: [] });

    expect(host.querySelector('[data-message-receipts-section-empty="read-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section-empty="received-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section-empty="not-yet"]')).not.toBe(null);
    expect(host.querySelectorAll('[data-message-receipts-person]').length).toBe(0);
  });
});

describe('MessageReceiptsSheet - par piece jointe', () => {
  test('audio incomplet affiche ouvertures, downloads, position et nombre', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'audio/webm', originalName: 'vocal.webm', duration: 20_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    expect(card).not.toBe(null);
    const text = card?.textContent ?? '';
    expect(text).toContain('1 ouverture');
    expect(text).toContain('3x');
    expect(text).toContain('%');
    const bar = card?.querySelector('[data-message-receipts-playback] div div') as HTMLElement | null;
    expect(bar?.style.width).not.toBe('0%');
  });

  test('audio incomplet affiche le pourcentage visible cote de la barre', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'audio/webm', originalName: 'vocal.webm', duration: 20_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    const playbackRow = card?.querySelector('[data-message-receipts-playback]');
    expect(playbackRow).not.toBe(null);
    const text = playbackRow?.textContent ?? '';
    expect(text).toMatch(/%/);
  });

  test('video complete n affiche pas de barre percentage', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-fixture-2', mimeType: 'video/mp4', originalName: 'clip.mp4', duration: 15_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-fixture-2"]');
    expect(card).not.toBe(null);
    const playbackRow = card?.querySelector('[data-message-receipts-playback]');
    expect(playbackRow).not.toBe(null);
    expect(playbackRow?.textContent ?? '').not.toContain('%');
  });

  test('sans piece jointe aucune carte ne se monte', async () => {
    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [] });
    expect(host.querySelectorAll('[data-message-receipts-attachment]').length).toBe(0);
  });

  test('document affiche agregats jamais de ligne de lecture', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'application/pdf', originalName: 'contrat.pdf' })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    expect(card?.textContent ?? '').toContain('1 ouverture');
    expect(card?.querySelector('[data-message-receipts-playback]')).toBe(null);
  });
});

describe('MessageReceiptsSheet - heure de chaque accuse', () => {
  test('Vu par porte heure readAt Recu par celle receivedAt Pas encore aucune', async () => {
    const result = await fetchMessageReceiptsPeople({ ...apiDeps, conversationId: 'c-deploiement', messageId: 'm-x' });
    if (!result.ok) throw new Error('la fixture c-deploiement doit repondre ok');
    const { readBy, receivedBy, notYet } = receiptCategoriesOf(result.data.people);
    expect(readBy.length).toBeGreaterThan(0);
    expect(receivedBy.length).toBeGreaterThan(0);
    expect(notYet.length).toBeGreaterThan(0);

    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [] });

    for (const person of readBy) {
      const row = host.querySelector(`[data-message-receipts-person="${person.participantId}"]`);
      expect(row?.querySelector('[data-message-receipts-person-time]')?.textContent).toBe(time(person.readAt as string));
    }
    for (const person of receivedBy) {
      const row = host.querySelector(`[data-message-receipts-person="${person.participantId}"]`);
      expect(row?.querySelector('[data-message-receipts-person-time]')?.textContent).toBe(time(person.receivedAt as string));
    }
    for (const person of notYet) {
      const row = host.querySelector(`[data-message-receipts-person="${person.participantId}"]`);
      expect(row?.querySelector('[data-message-receipts-person-time]')).toBe(null);
    }
  });
});
