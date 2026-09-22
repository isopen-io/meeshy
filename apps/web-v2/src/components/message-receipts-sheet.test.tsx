import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { appQueryClient } from '@/lib/api/query-client';
import { apiDeps } from '@/lib/api/deps';
import { attachmentStatusDetailsQueryKey, fetchAttachmentStatusDetails, type AttachmentStatusRow } from '@/lib/api/attachments';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import { fetchMessageReceiptsPeople } from '@/lib/api/receipts';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { Attachment } from '@/lib/api/types';
import { time } from '@/lib/grouping';
import { positionFraction, receiptCategoriesOf } from '@/lib/view/message-receipts';
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

  test('vidéo COMPLÈTE : aucun pourcentage, la pastille suffit', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-fixture-2', mimeType: 'video/mp4', originalName: 'clip.mp4', duration: 15_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-fixture-2"]');
    expect(card?.querySelector('[data-message-receipts-percent]')).toBe(null);
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

/**
 * QUI A OUVERT (#7363, W6) — avant ce lot, une image/un document
 * n'affichaient que des AGRÉGATS (comptes), jamais un nom ni une heure
 * (test ci-dessus, "jamais de ligne de lecture"). `openedRowsOf` filtre sur
 * `viewedAt` (`lib/view/message-receipts.ts`), jamais `downloadedAt` :
 * télécharger n'est pas ouvrir.
 *
 * LES PIÈCES SONT CHOISIES SUR CE QUE LE CORPUS PORTE (revue #7363) —
 * `att-test-6` compte une ouverture, `att-fixture-2` aucune. L'AGRÉGAT de la
 * carte est asserté À CÔTÉ de la rangée, parce que c'est leur DÉSACCORD qui
 * se voyait à l'écran : « 1 ouverture » au-dessus de « Pas encore ouvert ».
 */
describe('MessageReceiptsSheet — qui a OUVERT une image ou un document (#7363, W6)', () => {
  test('une image avec une ouverture connue affiche le NOM et l’HEURE de qui a ouvert', async () => {
    const rows = await fetchAttachmentStatusDetails({ ...apiDeps, attachmentId: 'att-test-6' });
    if (!rows.ok) throw new Error('la fixture « att-test-6 » doit répondre `ok`');
    const [row] = rows.data;
    if (row === undefined || row.viewedAt === null) throw new Error('la fixture « att-test-6 » doit porter une ouverture');

    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'image/png', originalName: 'photo.png' })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    const openedRow = card?.querySelector(`[data-message-receipts-opened="${row.participantId}"]`) ?? null;
    expect(openedRow).not.toBe(null);
    expect(openedRow?.textContent ?? '').toContain(row.username);
    expect(openedRow?.querySelector('[data-message-receipts-opened-time]')?.textContent).toBe(time(row.viewedAt));
    // L'AGRÉGAT compte ce que la rangée NOMME — jamais l'état vide à côté.
    expect(card?.textContent ?? '').toContain('1 ouverture');
    expect(card?.textContent ?? '').not.toContain('Pas encore ouvert');
  });

  test('un DOCUMENT (kind « file ») avec une ouverture connue affiche aussi le nom et l’heure', async () => {
    const rows = await fetchAttachmentStatusDetails({ ...apiDeps, attachmentId: 'att-test-6' });
    if (!rows.ok) throw new Error('la fixture « att-test-6 » doit répondre `ok`');
    const [row] = rows.data;
    if (row === undefined || row.viewedAt === null) throw new Error('la fixture « att-test-6 » doit porter une ouverture');

    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'application/pdf', originalName: 'contrat.pdf' })],
    });

    const openedRow = host.querySelector(`[data-message-receipts-opened="${row.participantId}"]`);
    expect(openedRow?.textContent ?? '').toContain(row.username);
  });

  test('aucune ouverture connue ⇒ état vide « Pas encore ouvert », et AUCUN agrégat d’ouverture', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-fixture-2', mimeType: 'image/png', originalName: 'photo.png' })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-fixture-2"]');
    expect(card?.textContent ?? '').toContain('Pas encore ouvert');
    expect(card?.querySelector('[data-message-receipts-opened]')).toBe(null);
    expect(card?.textContent ?? '').not.toContain('ouverture');
  });

  test('audio/vidéo restent sur `PlaybackRow` — jamais de rangée « opened »', async () => {
    const host = await mountSheet({
      conversationId: 'c-deploiement',
      messageId: 'm-x',
      attachments: [attachment({ id: 'att-test-6', mimeType: 'audio/webm', originalName: 'vocal.webm', duration: 20_000 })],
    });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    expect(card?.querySelector('[data-message-receipts-opened]')).toBe(null);
  });
});

/**
 * « L'HEURE DE CHAQUE ACCUSÉ » (#7352, V4) — `receivedAt`/`readAt` sont
 * SERVIS par `fetchMessageReceiptsPeople` (`api/receipts.ts:99-106`) depuis
 * toujours, jamais RENDUS avant ce lot (relevé de l'issue,
 * `message-receipts-sheet.tsx:198-215`). Réutilise `time()`
 * (`lib/grouping.ts`), le même SSOT que l'horodatage de la bulle — aucun
 * nouveau format.
 *
 * Les valeurs attendues viennent de la MÊME fonction que le composant lit
 * (`fetchMessageReceiptsPeople` + `receiptCategoriesOf`), jamais d'une
 * horloge recalculée à la main dans ce fichier : un témoin qui devinerait sa
 * propre valeur mesurerait sa propre horloge, pas le rendu (leçon du dépôt,
 * `tasks/lessons.md` — « un témoin qui fabrique son décodeur mesure le
 * RUNTIME »).
 */
describe('MessageReceiptsSheet — l’heure de chaque accusé (#7352, V4)', () => {
  test('« Vu par » porte l’heure de `readAt` ; « Reçu par » celle de `receivedAt` ; « Pas encore » n’en porte AUCUNE', async () => {
    const result = await fetchMessageReceiptsPeople({ ...apiDeps, conversationId: 'c-deploiement', messageId: 'm-x' });
    if (!result.ok) throw new Error('la fixture « c-deploiement » doit répondre `ok`');
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

/**
 * « LE % EST LISIBLE ET BOUGE EN DIRECT » (#7361, W8) — avant ce lot, le
 * pourcentage ne vivait que dans `aria-valuenow` : invisible à l'œil. Miroir
 * iOS : `MessageViewsDetailView.swift:891-899` (barre + « N% » sur la même
 * ligne).
 *
 * « En direct » : `attachment-status:updated` INVALIDE la query de la pièce
 * (`socket.ts`, témoin `socket.test.ts`) et le refetch REMPLACE les lignes en
 * cache. Ce témoin mesure l'autre moitié — une ligne remplacée dans le cache
 * atteint le PIXEL de la feuille ouverte, sans la rouvrir.
 *
 * Les valeurs attendues sortent de la MÊME fonction que le composant lit
 * (`fetchAttachmentStatusDetails` + `positionFraction`), jamais d'un chiffre
 * recalculé à la main.
 */
describe('MessageReceiptsSheet — le pourcentage écouté / regardé (#7361, W8)', () => {
  const audio = attachment({ id: 'att-test-6', mimeType: 'audio/webm', originalName: 'vocal.webm', duration: 20_000 });

  async function servedRows(): Promise<readonly AttachmentStatusRow[]> {
    const result = await fetchAttachmentStatusDetails({ ...apiDeps, attachmentId: 'att-test-6' });
    if (!result.ok) throw new Error('la fixture « att-test-6 » doit répondre `ok`');
    return result.data;
  }

  test('audio INCOMPLET : le % est VISIBLE, égal à la valeur de la barre', async () => {
    const [row] = await servedRows();
    if (row === undefined) throw new Error('la fixture « att-test-6 » doit servir une ligne');
    const expected = Math.round(
      positionFraction({ positionMs: row.lastPlayPositionMs, complete: row.listenedComplete, durationMs: 20_000 }) * 100,
    );
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(100);

    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [audio] });

    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    expect(card?.querySelector('[data-message-receipts-percent]')?.textContent).toBe(`${expected}%`);
    expect(card?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(String(expected));
  });

  test('une ligne REMPLACÉE dans le cache (refetch après `attachment-status:updated`) fait bouger le % et la barre sans rouvrir la feuille', async () => {
    const rows = await servedRows();
    const host = await mountSheet({ conversationId: 'c-deploiement', messageId: 'm-x', attachments: [audio] });
    const card = host.querySelector('[data-message-receipts-attachment="att-test-6"]');
    const before = card?.querySelector('[data-message-receipts-percent]')?.textContent;
    expect(before).not.toBe('50%');

    await act(async () => {
      appQueryClient.setQueryData(
        attachmentStatusDetailsQueryKey('att-test-6'),
        rows.map((row) => ({ ...row, lastPlayPositionMs: 10_000, listenedComplete: false })),
      );
    });
    await mounter.settle();

    expect(card?.querySelector('[data-message-receipts-percent]')?.textContent).toBe('50%');
    const bar = card?.querySelector('[role="progressbar"] > div') as HTMLElement | null;
    expect(bar?.style.width).toBe('50%');
  });
});
