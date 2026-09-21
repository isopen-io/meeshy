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

async function mountSheet(delivery: 'sent' | null) {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <MessageDetailSheet
        choices={[]}
        reactions={[]}
        sentAt={new Date('2026-09-21T10:00:00.000Z')}
        delivery={delivery}
        locale="fr-FR"
        conversationId="c-deploiement"
        messageId="m-x"
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
});
