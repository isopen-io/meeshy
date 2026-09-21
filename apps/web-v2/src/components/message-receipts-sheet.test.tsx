import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { Attachment } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageReceiptsSheet } from './message-receipts-sheet';

/**
 * LA FICHE « INFOS DU MESSAGE » (#7226, W7) — sous fixtures (source par
 * défaut de `bun test`), `fetchMessageReceiptsPeople`/
 * `fetchAttachmentStatusDetails` rendent des cartes DÉTERMINISTES dérivées
 * de l'identifiant (`receipts.ts`/`attachments.ts`) : ce fichier mesure que
 * le montage React descend jusqu'au DOM, pas que la loi de catégorisation
 * est juste — `lib/view/message-receipts.test.ts` la tient déjà, pure.
 *
 * Un `attachmentId` littéral fige un SEED précis (`seedOf`,
 * `attachments.ts`) — valeurs recalculées à la main pour ce fichier :
 * `att-test-6` ⇒ incomplet, 1 ouverture, 1 téléchargement, position ≈7,7 s,
 * 3 écoutes (badge « 3x ») ; `att-fixture-2` ⇒ complet.
 */

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

describe('MessageReceiptsSheet — les trois sections nominatives', () => {
  test('« Infos du message » se monte, avec Vu par / Reçu par / Pas encore', async () => {
    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [] });

    expect(host.querySelector('[data-message-receipts-title]')?.textContent).toBe('Infos du message');
    expect(host.querySelector('[data-message-receipts-section="read-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section="received-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section="not-yet"]')).not.toBe(null);
    // c-deploiement porte 5 participants (fixtures.ts) — au moins une
    // personne apparaît quelque part, la catégorisation exacte est déjà
    // testée PUREMENT (`message-receipts.test.ts`).
    expect(host.querySelectorAll('[data-message-receipts-person]').length).toBe(5);
  });

  test('conversation inconnue ⇒ trois sections VIDES, jamais une erreur', async () => {
    const host = await mountSheet({ conversationId: 'c-inconnue-du-tout', messageId: 'm-x', attachments: [] });

    expect(host.querySelector('[data-message-receipts-section-empty="read-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section-empty="received-by"]')).not.toBe(null);
    expect(host.querySelector('[data-message-receipts-section-empty="not-yet"]')).not.toBe(null);
    expect(host.querySelectorAll('[data-message-receipts-person]').length).toBe(0);
  });
});

describe('MessageReceiptsSheet — par pièce jointe', () => {
  test('audio INCOMPLET : ouvertures, téléchargements, position mm:ss et « Nx »', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'audio/webm', originalName: 'vocal.webm', duration: 20_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    expect(card).not.toBe(null);
    const text = card?.textContent ?? '';
    expect(text).toContain('1 ouverture');
    expect(text).toContain('1 téléchargement');
    expect(text).toContain('3x');
    expect(text).toContain('Écouté jusqu’à 0:07');
    // Une barre de progression rend une valeur de largeur NON nulle.
    const bar = card?.querySelector('[data-message-receipts-playback] div div') as HTMLElement | null;
    expect(bar?.style.width).not.toBe('0%');
  });

  test('vidéo COMPLÈTE : la pastille « Terminé » remplace la position', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-fixture-2', mimeType: 'video/mp4', originalName: 'clip.mp4', duration: 15_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-fixture-2"]');
    expect(card?.querySelector('[aria-label="Terminé"]')).not.toBe(null);
    expect(card?.textContent ?? '').not.toContain('Regardé jusqu’à');
  });

  test('sans pièce jointe, aucune carte ne se monte', async () => {
    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [] });
    expect(host.querySelectorAll('[data-message-receipts-attachment]').length).toBe(0);
  });

  test('un document (ni audio ni vidéo) affiche ses agrégats, jamais de ligne de lecture', async () => {
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
