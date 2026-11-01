import { describe, expect, it } from 'vitest';
import { resolveRelationAccess, type RelationAccessInput } from '../utils/relation-access';
import {
  CIRCLE_NOTIFY_DEFAULTS,
  CIRCLE_NOTIFY_KEYS,
  CIRCLE_NOTIFY_KEY_FEATURE,
  RELATION_AUDIENCE_CHOICES,
  circleNotifyKey,
} from '../utils/relation-levels';
import { NOTIFICATION_PREFERENCE_DEFAULTS, NotificationPreferenceSchema } from '../types/preferences/notification';
import type { RelationLevel } from '../types/relation';

const VIEWER = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OWNER = 'bbbbbbbbbbbbbbbbbbbbbbbb';

const notified = (level: RelationLevel, over: Partial<RelationAccessInput> = {}): boolean =>
  resolveRelationAccess({
    viewerId: VIEWER,
    targetId: OWNER,
    grantedByViewer: level,
    grantedByTarget: level,
    sharesCommunity: false,
    blockedEitherWay: false,
    viewerMinor: 'unknown',
    targetMinor: 'unknown',
    feature: 'notify.newContent',
    ...over,
  }).allowed;

describe('le réglage d’entourage (#13929) — dix-neuf actions, trois familles', () => {
  it('nomme chaque action par une clé stable, et chaque clé porte la feature de sa famille', () => {
    expect(CIRCLE_NOTIFY_KEYS).toHaveLength(19);
    expect(circleNotifyKey('publication', 'post')).toBe('circlePublicationPost');
    expect(circleNotifyKey('onMyContent', 'comment')).toBe('circleOnMyContentComment');
    expect(circleNotifyKey('elsewhere', 'mention')).toBe('circleElsewhereMention');
    expect(CIRCLE_NOTIFY_KEY_FEATURE.circlePublicationRepost).toBe('notify.newContent');
    expect(CIRCLE_NOTIFY_KEY_FEATURE.circleOnMyContentQuote).toBe('relay.commentersOnMyPosts');
    expect(CIRCLE_NOTIFY_KEY_FEATURE.circleElsewhereReference).toBe('relay.myCommentsElsewhere');
  });

  it('les défauts sont ceux du porteur : publications Proche, activité sur mes contenus Proche, mon activité ailleurs Sang', () => {
    const byPrefix = (prefix: string) =>
      new Set(CIRCLE_NOTIFY_KEYS.filter((k) => k.startsWith(prefix)).map((k) => CIRCLE_NOTIFY_DEFAULTS[k]));
    expect(byPrefix('circlePublication')).toEqual(new Set(['CLOSE']));
    expect(byPrefix('circleOnMyContent')).toEqual(new Set(['CLOSE']));
    expect(byPrefix('circleElsewhere')).toEqual(new Set(['BLOOD']));
  });

  it('la préférence de notification porte chaque clé, au défaut, et un document antérieur se relit au défaut', () => {
    const parsed = NotificationPreferenceSchema.parse({});
    for (const key of CIRCLE_NOTIFY_KEYS) {
      expect(parsed[key]).toBe(CIRCLE_NOTIFY_DEFAULTS[key]);
      expect(NOTIFICATION_PREFERENCE_DEFAULTS[key]).toBe(CIRCLE_NOTIFY_DEFAULTS[key]);
    }
  });

  it('la frontière admet les sept crans et refuse le reste', () => {
    for (const choice of RELATION_AUDIENCE_CHOICES) {
      expect(NotificationPreferenceSchema.partial().parse({ circlePublicationPost: choice }).circlePublicationPost).toBe(choice);
    }
    expect(() => NotificationPreferenceSchema.partial().parse({ circlePublicationPost: 'EVERYONE' })).toThrow();
    expect(() => NotificationPreferenceSchema.partial().parse({ circlePublicationPost: 'ATOM' })).toThrow();
  });
});

describe('la loi lit le cran choisi par le propriétaire (`ownerAudience`)', () => {
  it('sans réglage, le défaut : Proche notifié, Ami non', () => {
    expect(notified('CLOSE')).toBe(true);
    expect(notified('BLOOD')).toBe(true);
    expect(notified('FRIEND')).toBe(false);
  });

  it('un réglage illisible vaut le défaut, jamais une ouverture', () => {
    expect(notified('FRIEND', { ownerAudience: 'EVERYONE' })).toBe(false);
    expect(notified('CLOSE', { ownerAudience: 'EVERYONE' })).toBe(true);
  });

  it('« Ami » ⇒ un Ami est notifié, une Connaissance ne l’est pas', () => {
    expect(notified('FRIEND', { ownerAudience: 'FRIEND' })).toBe(true);
    expect(notified('ACQUAINTANCE', { ownerAudience: 'FRIEND' })).toBe(false);
  });

  it('« Connaissance » ⇒ une Connaissance est notifiée, un membre de la seule Communauté ne l’est pas', () => {
    expect(notified('ACQUAINTANCE', { ownerAudience: 'ACQUAINTANCE' })).toBe(true);
    expect(notified('PUBLIC', { ownerAudience: 'ACQUAINTANCE', sharesCommunity: true })).toBe(false);
  });

  it('« Communauté » ⇒ un co-membre est notifié, un inconnu sans lien ne l’est pas', () => {
    expect(notified('PUBLIC', { ownerAudience: 'COMMUNITY', sharesCommunity: true })).toBe(true);
    expect(notified('PUBLIC', { ownerAudience: 'COMMUNITY' })).toBe(false);
  });

  it('« Public » ⇒ la loi ne borne plus par le niveau (l’éventail borne la population), mais jamais un bloqué', () => {
    expect(notified('PUBLIC', { ownerAudience: 'PUBLIC' })).toBe(true);
    expect(notified('BLOOD', { ownerAudience: 'PUBLIC', blockedEitherWay: true })).toBe(false);
  });

  it('« Personne » ⇒ personne, Sang compris', () => {
    expect(notified('BLOOD', { ownerAudience: 'NOBODY' })).toBe(false);
  });

  it('« Sang » ⇒ seul Sang', () => {
    expect(notified('BLOOD', { ownerAudience: 'BLOOD' })).toBe(true);
    expect(notified('CLOSE', { ownerAudience: 'BLOOD' })).toBe(false);
  });

  it('le blocage coupe tout, quel que soit le réglage', () => {
    for (const choice of RELATION_AUDIENCE_CHOICES) {
      expect(notified('BLOOD', { ownerAudience: choice, blockedEitherWay: true })).toBe(false);
    }
  });

  it('le réglage est ignoré hors des features d’entourage : il n’ouvre pas la présence', () => {
    expect(notified('PUBLIC', { feature: 'presence.online', ownerAudience: 'PUBLIC' })).toBe(false);
  });

  it('les trois features d’entourage le lisent', () => {
    for (const feature of ['notify.newContent', 'relay.commentersOnMyPosts', 'relay.myCommentsElsewhere'] as const) {
      expect(notified('FRIEND', { feature, ownerAudience: 'FRIEND' })).toBe(true);
      expect(notified('BLOOD', { feature, ownerAudience: 'NOBODY' })).toBe(false);
    }
  });
});
