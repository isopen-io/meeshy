/**
 * #10286 — un invité ANONYME ne fait jamais de ses adresses des liens suivis.
 *
 * La loi (`linkTrackingAuthorOf`) et ses deux projections : l'ÉDITION
 * (`reconcileEditedLinks` ne mint rien et efface la carte d'un message
 * d'anonyme) et la LECTURE (`servedLinkMetadata` retient la carte des messages
 * écrits avant la loi). L'ENVOI est gardé dans `MessageProcessor.test.ts` et
 * `links-messages.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  linkTrackingAuthorOf,
  servedLinkMetadata,
} from '../../../../services/messaging/linkTrackingAuthor';
import { reconcileEditedLinks } from '../../../../services/messaging/messageLinks';

const MAP = [{ url: 'https://evil.example/login', token: 'tok-1' }];

describe('linkTrackingAuthorOf', () => {
  it('suit les adresses d’un compte inscrit, au nom de son User.id', () => {
    expect(linkTrackingAuthorOf({ type: 'user', userId: 'u-1' })).toEqual({ tracked: true, userId: 'u-1' });
  });

  it('reconnaît un compte inscrit par sa seule relation user chargée', () => {
    expect(linkTrackingAuthorOf({ type: 'user', user: { id: 'u-2' } })).toEqual({ tracked: true, userId: 'u-2' });
  });

  it('ne suit jamais un participant anonyme, même porteur d’un userId', () => {
    expect(linkTrackingAuthorOf({ type: 'anonymous', userId: 'u-1' })).toEqual({ tracked: false });
  });

  it('ne suit pas un participant sans userId', () => {
    expect(linkTrackingAuthorOf({ type: 'user', userId: null })).toEqual({ tracked: false });
    expect(linkTrackingAuthorOf({ userId: '' })).toEqual({ tracked: false });
  });

  it('ne suit pas un expéditeur indéterminé (fail-closed)', () => {
    expect(linkTrackingAuthorOf(null)).toEqual({ tracked: false });
    expect(linkTrackingAuthorOf(undefined)).toEqual({ tracked: false });
  });
});

describe('servedLinkMetadata — les messages d’anonyme écrits avant la loi', () => {
  it('retient la carte trackingLinks et garde les voisins', () => {
    const metadata = { trackingLinks: MAP, location: { lat: 1, lng: 2 } };

    expect(servedLinkMetadata(metadata, { type: 'anonymous', userId: null })).toEqual({ location: { lat: 1, lng: 2 } });
  });

  it('sert null quand la carte était le seul bloc', () => {
    expect(servedLinkMetadata({ trackingLinks: MAP }, { type: 'anonymous', userId: null })).toBeNull();
  });

  it('retient la carte quand l’expéditeur n’est pas chargé', () => {
    expect(servedLinkMetadata({ trackingLinks: MAP }, undefined)).toBeNull();
  });

  it('sert la carte d’un compte inscrit telle quelle', () => {
    const metadata = { trackingLinks: MAP };

    expect(servedLinkMetadata(metadata, { type: 'user', userId: 'u-1' })).toBe(metadata);
  });

  it('laisse un metadata sans carte intact', () => {
    const metadata = { location: { lat: 1, lng: 2 } };

    expect(servedLinkMetadata(metadata, { type: 'anonymous', userId: null })).toBe(metadata);
    expect(servedLinkMetadata(null, { type: 'anonymous', userId: null })).toBeNull();
  });
});

describe('reconcileEditedLinks — l’édition d’un message d’anonyme', () => {
  function makeReconciler() {
    return {
      processExplicitLinksInContent: jest.fn<any>().mockResolvedValue({ processedContent: 'voir m+tok-1' }),
      collectContentTrackingLinks: jest.fn<any>().mockResolvedValue(MAP),
    };
  }

  it('ne mint rien, garde le texte tel qu’écrit et établit une carte VIDE', async () => {
    const linkService = makeReconciler();

    const result = await reconcileEditedLinks({
      linkService,
      message: { id: 'msg-1', conversationId: 'conv-1', sender: { type: 'anonymous', userId: null } },
      content: 'voir <https://evil.example/login> et https://evil.example/login',
      editorUserId: 'u-admin',
    });

    expect(linkService.processExplicitLinksInContent).not.toHaveBeenCalled();
    expect(linkService.collectContentTrackingLinks).not.toHaveBeenCalled();
    expect(result).toEqual({
      processedContent: 'voir <https://evil.example/login> et https://evil.example/login',
      trackingLinks: [],
      reconciled: true,
    });
  });

  it('ne suit rien quand l’expéditeur du message est inconnu', async () => {
    const linkService = makeReconciler();

    const result = await reconcileEditedLinks({
      linkService,
      message: { id: 'msg-1', conversationId: 'conv-1', sender: null },
      content: 'voir https://evil.example/login',
      editorUserId: 'u-admin',
    });

    expect(linkService.collectContentTrackingLinks).not.toHaveBeenCalled();
    expect(result.trackingLinks).toEqual([]);
  });

  it('suit toujours les adresses d’un message de compte inscrit', async () => {
    const linkService = makeReconciler();

    const result = await reconcileEditedLinks({
      linkService,
      message: { id: 'msg-1', conversationId: 'conv-1', sender: { userId: 'u-author' } },
      content: 'voir https://example.com',
      editorUserId: 'u-author',
    });

    expect(linkService.collectContentTrackingLinks).toHaveBeenCalled();
    expect(result.trackingLinks).toEqual(MAP);
  });
});
