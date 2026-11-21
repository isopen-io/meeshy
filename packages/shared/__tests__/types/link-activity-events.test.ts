import { describe, expect, it } from 'vitest';
import { SERVER_EVENTS, type ServerToClientEvents } from '../../types/socketio-events';
import { LINK_ACTIVITY_SERVER_EVENTS } from '../../types/socketio-events/link-activity-event-names';
import type {
  AffiliateReferralJoinedEventData,
  CommunityLinkEntryEventData,
  ShareLinkArrivalEventData,
  TrackingLinkClickedEventData,
} from '../../types/socketio-events';

describe("l'activité d'un lien en temps réel (#19446)", () => {
  it('déclare les quatre noms au format entity:action-word, répandus dans SERVER_EVENTS', () => {
    expect(LINK_ACTIVITY_SERVER_EVENTS).toEqual({
      TRACKING_LINK_CLICKED: 'tracking-link:clicked',
      SHARE_LINK_ARRIVAL: 'share-link:arrival',
      COMMUNITY_LINK_ENTRY: 'community-link:entry',
      AFFILIATE_REFERRAL_JOINED: 'affiliate:referral-joined',
    });
    for (const [key, name] of Object.entries(LINK_ACTIVITY_SERVER_EVENTS)) {
      expect(SERVER_EVENTS[key as keyof typeof SERVER_EVENTS]).toBe(name);
      expect(name).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });

  it('donne à chaque nom sa charge dans ServerToClientEvents — des totaux absolus, aucun visiteur', () => {
    const clicked: TrackingLinkClickedEventData = {
      token: 'a1b2c3', totalClicks: 1284, uniqueClicks: 900, lastClickedAt: '2026-11-17T10:00:00.000Z', country: null,
    };
    const arrival: ShareLinkArrivalEventData = {
      linkId: 'mshy_x', currentUses: 23, maxUses: 50,
      arrival: { participantId: '507f1f77bcf86cd799439011', isAnonymous: true, country: 'FR', joinedAt: '2026-11-17T10:00:00.000Z' },
    };
    const entry: CommunityLinkEntryEventData = { communityId: '507f1f77bcf86cd799439012', linkId: 'mshy', entries: 4, at: '2026-11-17T10:00:00.000Z' };
    const referral: AffiliateReferralJoinedEventData = { tokenId: '507f1f77bcf86cd799439013', referralCount: 14 };
    const listeners: Pick<ServerToClientEvents, 'tracking-link:clicked' | 'share-link:arrival' | 'community-link:entry' | 'affiliate:referral-joined'> = {
      'tracking-link:clicked': (data) => expect(data).toEqual(clicked),
      'share-link:arrival': (data) => expect(data).toEqual(arrival),
      'community-link:entry': (data) => expect(data).toEqual(entry),
      'affiliate:referral-joined': (data) => expect(data).toEqual(referral),
    };
    listeners['tracking-link:clicked'](clicked);
    listeners['share-link:arrival'](arrival);
    listeners['community-link:entry'](entry);
    listeners['affiliate:referral-joined'](referral);
  });
});
