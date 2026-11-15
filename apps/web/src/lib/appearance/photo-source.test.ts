import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { HttpRequest } from '@/lib/api/http';
import { mediaHubConversationKey } from '@/lib/api/media-hub-cache';

import { loadPhotoSource, photoSourceOf } from './photo-source';

const ID = 'a'.repeat(24);

const withGallery = (conversationId: string, attachment: Record<string, unknown>): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData([...mediaHubConversationKey(conversationId), 'visual', ''], { pages: [{ messages: [{ attachments: [attachment] }] }], pageParams: [undefined] });
  return queryClient;
};

const gateway = (reply: (request: HttpRequest) => unknown): { readonly deps: ConversationsDeps; readonly calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const request = async (req: HttpRequest) => {
    calls.push(req);
    return reply(req);
  };
  return { deps: { source: 'gateway', transport: Object.assign(request, { request }) } as unknown as ConversationsDeps, calls };
};

describe('la source de la photo d’un fond', () => {
  test('retrouve la vignette et la pleine définition dans la galerie en cache', () => {
    const queryClient = withGallery('c1', { id: ID, fileUrl: 'https://cdn.x/p.jpg', thumbnailUrl: 'https://cdn.x/t.jpg' });
    expect(photoSourceOf(queryClient, 'c1', ID)).toEqual({ thumb: 'https://cdn.x/t.jpg', full: 'https://cdn.x/p.jpg' });
  });

  test('sans galerie en cache, aucune adresse n’est devinée — la route authentifiée de la pièce ne se charge pas dans une image', () => {
    expect(photoSourceOf(new QueryClient(), 'c1', ID)).toBeNull();
  });

  test('ne lit pas la galerie d’une AUTRE conversation', () => {
    expect(photoSourceOf(withGallery('c2', { id: ID, fileUrl: 'https://cdn.x/autre.jpg' }), 'c1', ID)).toBeNull();
  });
});

describe('charger la photo d’un fond choisi ailleurs (autre appareil, cache vidé)', () => {
  test('la galerie en cache sert sans réseau', async () => {
    const { deps, calls } = gateway(() => ({ ok: false, status: 500, error: 'x' }));
    const source = await loadPhotoSource({ queryClient: withGallery('c1', { id: ID, fileUrl: 'https://cdn.x/p.jpg' }), deps, conversationId: 'c1', attachmentId: ID });
    expect(source).toEqual({ thumb: null, full: 'https://cdn.x/p.jpg' });
    expect(calls).toHaveLength(0);
  });

  test('sinon les métadonnées de la pièce (appartenance vérifiée) donnent ses adresses lisibles par une image', async () => {
    const { deps, calls } = gateway(() => ({ ok: true, data: { attachment: { id: ID, fileUrl: 'https://cdn.x/p.jpg', thumbnailUrl: 'https://cdn.x/t.jpg' } } }));
    const source = await loadPhotoSource({ queryClient: new QueryClient(), deps, conversationId: 'c1', attachmentId: ID });
    expect(source).toEqual({ thumb: 'https://cdn.x/t.jpg', full: 'https://cdn.x/p.jpg' });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET /api/v1/attachments/${ID}/metadata`]);
  });

  test('une pièce disparue ou hors de portée (ancien membre) rend `null` : le fond retombe sur Signature', async () => {
    const { deps } = gateway(() => ({ ok: false, status: 404, error: 'ATTACHMENT_NOT_FOUND' }));
    expect(await loadPhotoSource({ queryClient: new QueryClient(), deps, conversationId: 'c1', attachmentId: ID })).toBeNull();
  });

  test('une panne passagère ÉCHOUE (la dernière photo connue reste affichée), sans conclure à une disparition', async () => {
    const { deps } = gateway(() => ({ ok: false, status: 503, error: 'down' }));
    const outcome = await loadPhotoSource({ queryClient: new QueryClient(), deps, conversationId: 'c1', attachmentId: ID }).then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(outcome).toBe('rejected');
  });

  test('hors passerelle (vitrine), rien n’est demandé', async () => {
    const { deps, calls } = gateway(() => ({ ok: true, data: {} }));
    expect(await loadPhotoSource({ queryClient: new QueryClient(), deps: { ...deps, source: 'fixtures' } as ConversationsDeps, conversationId: 'c1', attachmentId: ID })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('une pièce chiffrée ne se peint jamais (#10665)', () => {
  test('la galerie en cache : Signature, jamais l’adresse du chiffré', () => {
    expect(photoSourceOf(withGallery('c1', { id: ID, fileUrl: 'https://cdn.x/p.enc', isEncrypted: true }), 'c1', ID)).toBeNull();
  });

  test('les métadonnées : Signature aussi, et le serveur ne reçoit que l’identifiant', async () => {
    const seen: string[] = [];
    const deps = {
      source: 'gateway',
      transport: {
        request: async (request: { path: string }) => {
          seen.push(request.path);
          return { ok: true, data: { attachment: { id: ID, fileUrl: 'https://cdn.x/p.enc', isEncrypted: true } } };
        },
      },
    } as unknown as ConversationsDeps;
    expect(await loadPhotoSource({ queryClient: new QueryClient(), deps, conversationId: 'c1', attachmentId: ID })).toBeNull();
    expect(seen).toEqual([`/api/v1/attachments/${ID}/metadata`]);
  });
});
