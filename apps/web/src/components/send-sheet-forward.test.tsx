import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { attachmentDefaults, message, VIEWER_ID } from '@/lib/api/fixtures-base';
import { appQueryClient } from '@/lib/api/query-client';
import type { Attachment } from '@/lib/api/types';
import { loadSendSheetCatalog } from '@/lib/i18n-send-sheet-catalog';
import type { SendSheetPorts } from '@/lib/send/send-sheet-run';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { forwardRequestOf } from '@/lib/view/forward';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SendSheet } from './send-sheet';

/**
 * LE TRANSFERT DU FIL, DE BOUT EN BOUT (#5866 → #8884) — l'ancienne feuille de
 * destinataires (`ForwardSheet`) est retirée ; ses témoins vivent ici, contre
 * la feuille d'envoi commune et son VRAI répertoire (`useSendSheetDirectory`,
 * le cache des conversations) : cache-first sans squelette, un choix qui a un
 * effet, et le départ qui désigne la source du transfert.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSendSheetCatalog('fr');
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

const seedCache = (): void => {
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [
          {
            id: 'c-cible',
            type: 'group',
            title: 'Équipe déploiement',
            participants: [],
            status: 'active',
            visibility: 'private',
            isActive: true,
            createdAt: new Date('2026-09-01T09:00:00.000Z'),
            updatedAt: new Date('2026-09-01T09:00:00.000Z'),
          },
        ],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
};

const photo = (overrides: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'att-1',
  messageId: 'm1',
  fileName: 'photo.jpg',
  originalName: 'photo.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: 'https://cdn.test/photo.jpg',
  uploadedBy: 'u-autre',
  createdAt: new Date('2026-09-30T09:00:00.000Z').toISOString(),
  ...overrides,
});

const forwardOf = (overrides: Partial<Parameters<typeof message>[0]> = {}): SendSheetRequest =>
  forwardRequestOf({
    conversationId: 'c-src',
    messages: [
      message({
        id: 'm1',
        senderId: 'u-autre',
        content: 'Regarde ça',
        originalLanguage: 'fr',
        createdAt: new Date('2026-09-30T09:00:00.000Z'),
        translations: [],
        ...overrides,
      }),
    ],
    now: Date.parse('2026-09-30T10:00:00.000Z'),
  });

const forwardedTo: string[] = [];

const ports: SendSheetPorts = {
  online: () => true,
  openDirect: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  forward: async (params) => {
    forwardedTo.push(`${params.sourceConversationId ?? ''}->${params.targetConversationId}:${params.messages.map((m) => m.id).join(',')}`);
    return { ok: true, count: params.messages.length };
  },
  sendMessage: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  uploadFiles: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  fetchFile: async () => null,
  uploadMedia: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  publishMedia: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  publishFromAttachment: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  repost: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  createTextPost: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  newClientMessageId: () => 'cid',
};

const mount = async (request: SendSheetRequest) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <SendSheet request={request} viewerId={VIEWER_ID} language="fr" contentLanguage="fr" ports={ports} onClose={() => {}} />
    </QueryClientProvider>,
  );

const row = (host: ParentNode, key: string): HTMLElement | null => host.querySelector(`[data-send-target="${key}"]`);

describe('Transfert du fil — la feuille d’envoi, cache-first', () => {
  test('le cache CHAUD se peint sans aucun squelette', async () => {
    seedCache();
    const host = await mount(forwardOf());
    expect(host.textContent).not.toContain('…');
    expect(row(host, 'conversation:c-cible')).not.toBe(null);
    expect(host.textContent).toContain('Équipe déploiement');
  });

  test('la feuille NOMME son geste : « Transférer »', async () => {
    seedCache();
    const host = await mount(forwardOf());
    expect(host.querySelector('h2')?.textContent).toBe('Transférer');
  });

  test('choisir une conversation la coche — un choix a un effet', async () => {
    seedCache();
    const host = await mount(forwardOf());
    await mounter.click(row(host, 'conversation:c-cible'));
    expect(row(host, 'conversation:c-cible')?.getAttribute('aria-checked')).toBe('true');
  });

  test('envoyer désigne la conversation SOURCE et le message transféré', async () => {
    seedCache();
    const host = await mount(forwardOf());
    await mounter.click(row(host, 'conversation:c-cible'));
    await mounter.click(host.querySelector('[data-send-sheet-send]'));
    await mounter.settle();
    expect(forwardedTo).toEqual(['c-src->c-cible:m1']);
  });
});

describe('Transfert du fil — un seul message portant un seul média', () => {
  test('une photo ouverte offre Ma story / Post / Réel', async () => {
    seedCache();
    const host = await mount(forwardOf({ attachments: [photo()] }));
    expect([...host.querySelectorAll('[data-send-publish]')].map((chip) => chip.textContent)).toEqual(['Ma story', 'Post', 'Réel']);
  });

  test('une photo à VUE UNIQUE n’offre rien et le dit', async () => {
    seedCache();
    const host = await mount(forwardOf({ attachments: [photo({ isViewOnce: true })] }));
    expect(host.querySelector('[data-send-publish]')).toBe(null);
    expect(host.textContent).toContain('Contenu protégé');
  });

  test('un message texte seul n’offre aucune publication', async () => {
    seedCache();
    const host = await mount(forwardOf());
    expect(host.querySelector('[data-send-publish]')).toBe(null);
  });
});
