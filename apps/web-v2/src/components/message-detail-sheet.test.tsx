import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MessageDetailSheet } from './message-detail-sheet';

/**
 * « INFOS DU MESSAGE » NE SE MONTE QUE SOUS LA MÊME GARDE QUE L'ACCUSÉ
 * (#7226, W7) — `delivery !== null`, posée par l'appelant (`isMineOf`,
 * `thread.tsx`) : un message REÇU n'a pas d'accusé nominatif à lire sur
 * lui-même, et la feuille ne doit engager AUCUNE requête pour lui.
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

const SERVER_MESSAGE_ID = '66f0a1b2c3d4e5f6a7b8c9d0';

async function mountSheet(delivery: 'sent' | null, messageId: string = SERVER_MESSAGE_ID) {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <MessageDetailSheet
        choices={[]}
        reactions={[]}
        sentAt={new Date('2026-09-21T10:00:00.000Z')}
        delivery={delivery}
        locale="fr-FR"
        conversationId="c-deploiement"
        messageId={messageId}
        attachments={[]}
        onPickLanguage={() => undefined}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe('MessageDetailSheet — la garde de « Infos du message »', () => {
  test('message ENVOYÉ (delivery non nul) ⇒ la section se monte', async () => {
    const host = await mountSheet('sent');
    expect(host.querySelector('[data-message-receipts-title]')).not.toBe(null);
  });

  test('message REÇU (delivery nul) ⇒ AUCUNE section, aucune requête engagée', async () => {
    const host = await mountSheet(null);
    expect(host.querySelector('[data-message-receipts-title]')).toBe(null);
  });

  /**
   * LA SECONDE MOITIÉ DE LA GARDE — un message ENCORE OPTIMISTE porte son
   * `clientMessageId` (`cid_…`) et n'existe pas côté serveur, alors que
   * `deliveryOf` le rend « envoyé » (`deliveredCount: 0` ⇒ `'sent'`). Sans
   * `hasServerMessageId`, ouvrir « Plus… » juste après l'envoi lançait un
   * `GET …/receipts?detail=people&messageIds=cid_…` voué au 400, puis
   * peignait « Impossible de charger ces informations ». iOS pose la même
   * garde (`MessageViewsDetailView.swift:943`).
   */
  test('message ENVOYÉ mais encore OPTIMISTE (`cid_…`) ⇒ aucune section', async () => {
    const host = await mountSheet('sent', 'cid_2f1c8b0e-4a6d-4c11-9b5e-0f9a7c3d2e18');
    expect(host.querySelector('[data-message-receipts-title]')).toBe(null);
  });
});
