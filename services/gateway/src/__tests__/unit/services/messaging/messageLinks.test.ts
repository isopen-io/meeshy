/**
 * `processEditedContentLinks` — la source unique du traitement `[[url]]` /
 * `<url>` sur le chemin d'ÉDITION, quel qu'en soit le transport.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { processEditedContentLinks } from '../../../../services/messaging/messageLinks';

const CONTEXT = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  editorUserId: 'u-editor',
};

function makeLinkService(processed = 'salut m+abc123') {
  return {
    processExplicitLinksInContent: jest.fn<any>().mockResolvedValue({
      processedContent: processed,
      trackingLinks: [{ token: 'abc123' }],
    }),
  };
}

describe('processEditedContentLinks', () => {
  it('rend le contenu traité quand le texte porte un [[url]]', async () => {
    const trackingLinkService = makeLinkService();

    const content = await processEditedContentLinks({
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

    const content = await processEditedContentLinks({
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

    const content = await processEditedContentLinks({
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

    const content = await processEditedContentLinks({
      trackingLinkService,
      content: 'salut [[https://example.com]]',
      ...CONTEXT,
      onError,
    });

    expect(content).toBe('salut [[https://example.com]]');
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('rend le contenu original sans service câblé', async () => {
    const content = await processEditedContentLinks({
      trackingLinkService: null,
      content: 'salut [[https://example.com]]',
      ...CONTEXT,
    });

    expect(content).toBe('salut [[https://example.com]]');
  });
});
