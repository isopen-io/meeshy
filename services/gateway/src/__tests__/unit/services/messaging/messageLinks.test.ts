/**
 * @jest-environment node
 *
 * `reconcileEditedLinks` — ce qu'un message édité doit à ses liens.
 *
 * Deux obligations, une seule unité : réécrire `[[url]]` / `<url>` en
 * `m+<token>` (que le chemin socket ne faisait PAS) et recomposer le mapping
 * `metadata.trackingLinks` des URLs brutes (qu'AUCUN chemin d'édition ne
 * faisait). L'ordre entre les deux n'est pas cosmétique : le mapping se calcule
 * sur le contenu déjà réécrit.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
  type LinkReconciler,
} from '../../../../services/messaging/messageLinks';

const MESSAGE = { id: 'msg_1', conversationId: 'conv_1' } as const;
const EDITOR = 'user_editor';

function makeLinkService(overrides: Partial<LinkReconciler> = {}): LinkReconciler {
  return {
    processExplicitLinksInContent: jest.fn(async ({ content }: { content: string }) => ({
      processedContent: content,
    })),
    collectContentTrackingLinks: jest.fn(async (_params: { content: string }) => []),
    ...overrides,
  } as LinkReconciler;
}

describe('reconcileEditedLinks', () => {
  it('rewrites [[url]] to m+<token> and reports the rewritten content', async () => {
    const linkService = makeLinkService({
      processExplicitLinksInContent: jest.fn(async () => ({ processedContent: 'voir m+tok1' })),
    });

    const result = await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'voir [[https://example.com]]',
      editorUserId: EDITOR,
    });

    expect(result.processedContent).toBe('voir m+tok1');
    expect(result.reconciled).toBe(true);
  });

  it('collects the raw-URL mapping on the REWRITTEN content, not the input', async () => {
    // Sans cet ordre, une URL qui vient de devenir `m+<token>` serait
    // recollectée comme URL brute et recevrait un SECOND token.
    const collect = jest.fn(async (_params: { content: string }) => []);
    const linkService = makeLinkService({
      processExplicitLinksInContent: jest.fn(async () => ({ processedContent: 'voir m+tok1' })),
      collectContentTrackingLinks: collect,
    });

    await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'voir [[https://example.com]]',
      editorUserId: EDITOR,
    });

    expect(collect).toHaveBeenCalledWith(expect.objectContaining({ content: 'voir m+tok1' }));
  });

  it('credits both halves to the EDITOR and to the edited message', async () => {
    const process = jest.fn(async ({ content }: { content: string }) => ({ processedContent: content }));
    const collect = jest.fn(async (_params: { content: string }) => []);
    const linkService = makeLinkService({
      processExplicitLinksInContent: process,
      collectContentTrackingLinks: collect,
    });

    await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'texte',
      editorUserId: EDITOR,
    });

    const expected = { conversationId: 'conv_1', messageId: 'msg_1', createdBy: EDITOR };
    expect(process).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(collect).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('returns the raw-URL mapping so the caller can persist metadata.trackingLinks', async () => {
    const linkService = makeLinkService({
      collectContentTrackingLinks: jest.fn(async () => [{ url: 'https://b.com', token: 'tokB' }]),
    });

    const result = await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'voir https://b.com',
      editorUserId: EDITOR,
    });

    expect(result.trackingLinks).toEqual([{ url: 'https://b.com', token: 'tokB' }]);
    expect(result.reconciled).toBe(true);
  });

  it('reconciles to the EMPTY mapping when the edited text no longer carries a URL', async () => {
    // Vide ÉTABLI : l'appelant DOIT effacer `metadata.trackingLinks`, sinon le
    // token d'une URL disparue survit au texte qui la portait.
    const result = await reconcileEditedLinks({
      linkService: makeLinkService(),
      message: MESSAGE,
      content: 'plus aucune adresse',
      editorUserId: EDITOR,
    });

    expect(result.trackingLinks).toEqual([]);
    expect(result.reconciled).toBe(true);
  });

  it('does not claim reconciliation when no link service is wired', async () => {
    const result = await reconcileEditedLinks({
      linkService: null,
      message: MESSAGE,
      content: 'voir https://b.com',
      editorUserId: EDITOR,
    });

    expect(result.reconciled).toBe(false);
    expect(result.trackingLinks).toEqual([]);
  });

  it('still yields the edited text when the link processing throws', async () => {
    // L'édition de l'utilisateur n'est pas optionnelle : une panne de tracking
    // ne doit pas l'annuler. Elle ne doit pas non plus autoriser l'appelant à
    // écraser le mapping existant — d'où `reconciled: false`.
    const onError = jest.fn();
    const linkService = makeLinkService({
      processExplicitLinksInContent: jest.fn(async () => {
        throw new Error('tracking down');
      }),
    });

    const result = await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'voir [[https://example.com]]',
      editorUserId: EDITOR,
      onError,
    });

    expect(result.processedContent).toBe('voir [[https://example.com]]');
    expect(result.reconciled).toBe(false);
    expect(result.trackingLinks).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });

  it('never rejects — a failing collector cannot turn an edit into a 500', async () => {
    const linkService = makeLinkService({
      collectContentTrackingLinks: jest.fn(async () => {
        throw new Error('collector down');
      }),
    });

    await expect(
      reconcileEditedLinks({ linkService, message: MESSAGE, content: 'texte', editorUserId: EDITOR })
    ).resolves.toEqual(expect.objectContaining({ reconciled: false }));
  });
});

describe('mergeTrackingLinksIntoMetadata', () => {
  it('preserves the neighbours sharing the metadata blob', async () => {
    // `postReplyTo` est un snapshot GELÉ, irrécupérable une fois la story
    // expirée : l'écraser en écrivant `{ trackingLinks }` détruirait la citation.
    const merged = mergeTrackingLinksIntoMetadata(
      { postReplyTo: { id: 'post_1' }, location: { lat: 1, lng: 2 } },
      [{ url: 'https://b.com', token: 'tokB' }]
    );

    expect(merged).toEqual({
      postReplyTo: { id: 'post_1' },
      location: { lat: 1, lng: 2 },
      trackingLinks: [{ url: 'https://b.com', token: 'tokB' }],
    });
  });

  it('replaces the previous mapping rather than merging into it', async () => {
    const merged = mergeTrackingLinksIntoMetadata(
      { trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      [{ url: 'https://b.com', token: 'tokB' }]
    );

    expect(merged).toEqual({ trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] });
  });

  it('drops the key when the edited text no longer carries a URL', async () => {
    const merged = mergeTrackingLinksIntoMetadata(
      { postReplyTo: { id: 'post_1' }, trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      []
    );

    expect(merged).toEqual({ postReplyTo: { id: 'post_1' } });
  });

  it('yields null when nothing is left to store', async () => {
    expect(mergeTrackingLinksIntoMetadata({ trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] }, [])).toBeNull();
    expect(mergeTrackingLinksIntoMetadata(null, [])).toBeNull();
  });

  it('ignores a metadata blob that is not an object', async () => {
    expect(mergeTrackingLinksIntoMetadata('corrupted', [{ url: 'https://b.com', token: 'tokB' }])).toEqual({
      trackingLinks: [{ url: 'https://b.com', token: 'tokB' }],
    });
    expect(mergeTrackingLinksIntoMetadata(['array'], [])).toBeNull();
  });
});
