import { beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import type { Attachment } from '@/lib/api/types';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import { saveContactFile } from './save-contact-file';

/**
 * « TÉLÉCHARGER LA CARTE » (#9263) — la pièce se télécharge avec la session,
 * puis part par la porte de fichiers partagée : le téléchargement d'un
 * navigateur, la feuille de partage de la coque Android (d'où Contacts
 * l'importe). Jamais un lien remis au navigateur du système.
 */

beforeAll(() => {
  sessionStore.getState().establishGuest({
    sessionToken: 'st-contact-file',
    guest: { participantId: null, nickname: 'Lecteur', conversationId: 'c1', link: 'l1', mayWrite: true },
  });
});

const ATTACHMENT = {
  id: 'att-vcf-1',
  originalName: 'Awa.vcf',
  mimeType: 'text/vcard',
  fileUrl: '/api/v1/attachments/file/2026/09/awa.vcf',
} as unknown as Attachment;

const serveCard = (status = 200): typeof fetch =>
  (async () => new Response(new Blob(['BEGIN:VCARD'], { type: 'text/vcard' }), { status })) as unknown as typeof fetch;

function shareHost(outcome: 'shared' | 'cancelled'): FileDeliveryHost & { readonly shared: string[] } {
  const shared: string[] = [];
  return {
    shared,
    canShareFiles: () => true,
    shareFiles: async ({ files }) => {
      shared.push(...files.map((file) => `${file.name} ${file.type}`));
      if (outcome === 'cancelled') throw Object.assign(new Error('abort'), { name: 'AbortError' });
    },
  };
}

describe('saveContactFile (#9263)', () => {
  test('la carte téléchargée part par la feuille de partage sous son nom d’origine', async () => {
    const host = shareHost('shared');
    expect(await saveContactFile({ attachment: ATTACHMENT, fetchImpl: serveCard(), host })).toBe('saved');
    expect(host.shared).toEqual(['Awa.vcf text/vcard']);
  });

  test('refermer la feuille de partage n’est pas un échec', async () => {
    expect(await saveContactFile({ attachment: ATTACHMENT, fetchImpl: serveCard(), host: shareHost('cancelled') })).toBe('cancelled');
  });

  test('une pièce introuvable, ou un hôte sans porte de fichiers, est un échec dit', async () => {
    expect(await saveContactFile({ attachment: ATTACHMENT, fetchImpl: serveCard(404), host: shareHost('shared') })).toBe('failed');
    expect(await saveContactFile({ attachment: ATTACHMENT, fetchImpl: serveCard(), host: {} })).toBe('failed');
  });
});
