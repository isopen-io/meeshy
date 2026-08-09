/**
 * `processExplicitLinks` — la source unique du traitement `[[url]]` / `<url>`,
 * à l'ENVOI comme à l'ÉDITION, quel qu'en soit le transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  processExplicitLinks,
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
} from '../../../../services/messaging/messageLinks';

const CONTEXT = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  createdBy: 'u-editor',
};

function makeLinkService(processed = 'salut m+abc123') {
  return {
    processExplicitLinksInContent: jest.fn<any>().mockResolvedValue({
      processedContent: processed,
      trackingLinks: [{ token: 'abc123' }],
    }),
  };
}

describe('processExplicitLinks', () => {
  it('rend le contenu traité quand le texte porte un [[url]]', async () => {
    const trackingLinkService = makeLinkService();

    const content = await processExplicitLinks({
      trackingLinkService,
      content: 'salut [[https://example.com]]',
      ...CONTEXT,
    });

    expect(content).toBe('salut m+abc123');
    expect(trackingLinkService.processExplicitLinksInContent).toHaveBeenCalledWith({
      content: 'salut [[https://example.com]]',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      createdBy: 'u-editor',
    });
  });

  it('rend le contenu traité quand le texte porte un <url>', async () => {
    const trackingLinkService = makeLinkService('voir m+def456');

    const content = await processExplicitLinks({
      trackingLinkService,
      content: 'voir <https://example.com>',
      ...CONTEXT,
    });

    expect(content).toBe('voir m+def456');
  });

  // Le court-circuit vit ICI, pas chez l'appelant : un texte sans syntaxe
  // traçable ne doit coûter aucune requête, et c'est une garde qu'un nouvel
  // écrivain oublierait. Il protège aussi le contenu d'un aller-retour de
  // protection markdown dont il n'a aucun besoin.
  it("ne touche PAS le service quand le texte ne porte aucune syntaxe traçable", async () => {
    const trackingLinkService = makeLinkService();

    const content = await processExplicitLinks({
      trackingLinkService,
      content: 'bonjour https://example.com et [texte](https://example.org)',
      ...CONTEXT,
    });

    expect(content).toBe('bonjour https://example.com et [texte](https://example.org)');
    expect(trackingLinkService.processExplicitLinksInContent).not.toHaveBeenCalled();
  });

  // Un lien perdu ne doit pas transformer une édition réussie en 500 : le
  // contenu ORIGINAL est écrit, l'édition aboutit.
  it("rend le contenu original quand le traitement lève, et le signale", async () => {
    const boom = new Error('tracking link store down');
    const trackingLinkService = {
      processExplicitLinksInContent: jest.fn<any>().mockRejectedValue(boom),
    };
    const onError = jest.fn();

    const content = await processExplicitLinks({
      trackingLinkService,
      content: 'salut [[https://example.com]]',
      ...CONTEXT,
      onError,
    });

    expect(content).toBe('salut [[https://example.com]]');
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('rend le contenu original sans service câblé', async () => {
    const content = await processExplicitLinks({
      trackingLinkService: null,
      content: 'salut [[https://example.com]]',
      ...CONTEXT,
    });

    expect(content).toBe('salut [[https://example.com]]');
  });
});

/**
 * `reconcileEditedLinks` — les DEUX moitiés que tout message porteur d'une URL
 * doit à ses liens après édition : la réécriture des syntaxes explicites, et le
 * mapping des URLs BRUTES que seule la création recomposait.
 */
describe('reconcileEditedLinks', () => {
  const MESSAGE = { id: 'msg-1', conversationId: 'conv-1' };

  function makeReconciler(options: {
    processed?: string;
    collected?: Array<{ url: string; token: string }>;
    rewriteRejects?: boolean;
    collectRejects?: boolean;
  } = {}) {
    return {
      processExplicitLinksInContent: jest.fn<any>(
        options.rewriteRejects
          ? () => Promise.reject(new Error('rewrite failed'))
          : () => Promise.resolve({ processedContent: options.processed ?? 'salut m+abc123' })
      ),
      collectContentTrackingLinks: jest.fn<any>(
        options.collectRejects
          ? () => Promise.reject(new Error('collect failed'))
          : () => Promise.resolve(options.collected ?? [])
      ),
    };
  }

  it('collects the raw-URL mapping on the REWRITTEN content, never on the input', async () => {
    const linkService = makeReconciler({ processed: 'salut m+abc123', collected: [{ url: 'https://b.com', token: 'tokB' }] });

    const result = await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'salut [[https://b.com]]',
      editorUserId: 'u-editor',
    });

    expect(linkService.collectContentTrackingLinks).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'salut m+abc123' })
    );
    expect(result).toEqual({
      processedContent: 'salut m+abc123',
      trackingLinks: [{ url: 'https://b.com', token: 'tokB' }],
      reconciled: true,
    });
  });

  // Une URL brute ne porte aucune syntaxe explicite : la réécriture
  // court-circuite. La collecte, elle, doit quand même avoir lieu — c'était tout
  // le défaut.
  it('still collects when nothing gets rewritten', async () => {
    const linkService = makeReconciler({ collected: [{ url: 'https://b.com', token: 'tokB' }] });

    const result = await reconcileEditedLinks({
      linkService,
      message: MESSAGE,
      content: 'juste https://b.com',
      editorUserId: 'u-editor',
    });

    expect(linkService.processExplicitLinksInContent).not.toHaveBeenCalled();
    expect(result.reconciled).toBe(true);
    expect(result.processedContent).toBe('juste https://b.com');
    expect(result.trackingLinks).toEqual([{ url: 'https://b.com', token: 'tokB' }]);
  });

  // Vide ÉTABLI : le texte ne porte plus d'URL. Distinct du vide « rien n'a pu
  // être établi » ci-dessous, et c'est `reconciled` qui les sépare.
  it('reports an established empty mapping when the text carries no URL', async () => {
    const result = await reconcileEditedLinks({
      linkService: makeReconciler({ collected: [] }),
      message: MESSAGE,
      content: 'plus rien',
      editorUserId: 'u-editor',
    });

    expect(result).toEqual({ processedContent: 'plus rien', trackingLinks: [], reconciled: true });
  });

  it('reports NOT reconciled when the rewrite fails, and keeps the user text', async () => {
    const onError = jest.fn();

    const result = await reconcileEditedLinks({
      linkService: makeReconciler({ rewriteRejects: true }),
      message: MESSAGE,
      content: 'salut [[https://a.com]]',
      editorUserId: 'u-editor',
      onError,
    });

    expect(result.reconciled).toBe(false);
    expect(result.processedContent).toBe('salut [[https://a.com]]');
    expect(onError).toHaveBeenCalled();
  });

  // Best-effort de bout en bout : une panne de collecte ne doit pas transformer
  // une édition réussie en 500, et le contenu RÉÉCRIT reste persisté — ses
  // tokens ont été mintés.
  it('never throws when the collection fails, and keeps the rewritten content', async () => {
    const onError = jest.fn();

    const result = await reconcileEditedLinks({
      linkService: makeReconciler({ processed: 'salut m+abc123', collectRejects: true }),
      message: MESSAGE,
      content: 'salut [[https://a.com]]',
      editorUserId: 'u-editor',
      onError,
    });

    expect(result).toEqual({ processedContent: 'salut m+abc123', trackingLinks: [], reconciled: false });
    expect(onError).toHaveBeenCalled();
  });

  it('reports NOT reconciled without a service, rather than an empty mapping', async () => {
    const result = await reconcileEditedLinks({
      linkService: null,
      message: MESSAGE,
      content: 'salut https://a.com',
      editorUserId: 'u-editor',
    });

    expect(result).toEqual({ processedContent: 'salut https://a.com', trackingLinks: [], reconciled: false });
  });
});

/**
 * `mergeTrackingLinksIntoMetadata` — `Message.metadata` est un blob PARTAGÉ.
 */
describe('mergeTrackingLinksIntoMetadata', () => {
  it('preserves the neighbours of the blob while rewriting the mapping', () => {
    const merged = mergeTrackingLinksIntoMetadata(
      { postReplyTo: { id: 'post-1' }, trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      [{ url: 'https://b.com', token: 'tokB' }]
    );

    expect(merged).toEqual({ postReplyTo: { id: 'post-1' }, trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] });
  });

  it('drops the mapping but keeps the neighbours when nothing remains to track', () => {
    expect(mergeTrackingLinksIntoMetadata({ location: { lat: 1 }, trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] }, []))
      .toEqual({ location: { lat: 1 } });
  });

  // `{}` mentirait sur la présence de métadonnées.
  it('returns null when the blob held nothing but the mapping', () => {
    expect(mergeTrackingLinksIntoMetadata({ trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] }, [])).toBeNull();
    expect(mergeTrackingLinksIntoMetadata(null, [])).toBeNull();
  });

  it('tolerates a non-object blob rather than spreading it', () => {
    expect(mergeTrackingLinksIntoMetadata('garbage', [{ url: 'https://b.com', token: 'tokB' }]))
      .toEqual({ trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] });
  });
});
