import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { decodePerson } from '@/lib/api/friend-requests';
import { decodeMentionSuggestion } from '@/lib/api/mention-suggestions';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { mediaCarrierOf } from '@/lib/view/media';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';
import { PeerAvatar } from './peer-avatar';

/**
 * **LE CONTOUR SERVI VOYAGE JUSQU'À L'AVATAR** (#10946) — de la charge
 * (`profileDecor.avatarRing`, #10945) à la PROJECTION que l'écran lit, puis au
 * dessin que `PeerAvatar` résout. Un décodeur qui projette la personne la
 * perdait en silence : `decodePerson` et `decodeMentionSuggestion` ne
 * gardaient que le nom et la photo.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(() => releaseHappyDomIfRegistered());

const filet: ServedProfileDecorItem = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };
const decor = { profileDecor: { avatarRing: filet } };

describe('PeerAvatar résout la référence servie (#10946)', () => {
  test('une référence de contour ⇒ le contour est peint, dans l’empreinte de l’avatar', () => {
    const html = renderToStaticMarkup(<PeerAvatar presenceKey="u1" ringRef={filet} initials="AW" color="#6366F1" size={40} />);
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('width:40px;height:40px');
  });

  test('sans référence, l’avatar d’avant', () => {
    expect(renderToStaticMarkup(<PeerAvatar presenceKey="u1" ringRef={null} initials="AW" color="#6366F1" size={40} />)).not.toContain('data-avatar-ring');
    expect(renderToStaticMarkup(<PeerAvatar presenceKey="u1" initials="AW" color="#6366F1" size={40} />)).not.toContain('data-avatar-ring');
  });
});

describe('les projections de personne gardent leur contour (#10946)', () => {
  test('decodePerson (recherche, demandes d’ami, nouvelle conversation)', () => {
    expect(decodePerson({ id: 'u1', username: 'awa', ...decor })?.ring).toEqual(filet);
    expect(decodePerson({ id: 'u1', username: 'awa' })?.ring).toBeUndefined();
  });

  test('decodeMentionSuggestion (suggestions de mention)', () => {
    expect(decodeMentionSuggestion({ id: 'u1', username: 'awa', ...decor })?.ring).toEqual(filet);
    expect(decodeMentionSuggestion({ id: 'u1', username: 'awa' })?.ring).toBeUndefined();
  });

  test('l’auteur d’un post du fil, et celui de l’original republié', () => {
    const model = resolveFeedCardModel(
      {
        id: 'p1',
        type: 'POST',
        createdAt: '2026-09-13T11:55:00.000Z',
        author: { id: 'u1', username: 'awa', ...decor },
        repostOf: { id: 'p0', type: 'POST', createdAt: '2026-09-13T10:00:00.000Z', content: 'x', author: { id: 'u2', username: 'ben', ...decor } },
      },
      { preferredLanguages: ['fr'], now: new Date('2026-09-13T12:00:00.000Z') },
    );
    expect(model.author.ring).toEqual(filet);
    expect(model.repostOf?.author.ring).toEqual(filet);
  });
});

describe('la visionneuse de média d’un message porte la personne qui l’a envoyé (#10956, #10946)', () => {
  const caption = { text: '', language: 'fr', translated: false } as const;

  test('le compte de l’expéditeur (sa clé de présence) et son contour voyagent avec son nom', () => {
    const carrier = mediaCarrierOf({
      message: { sender: { id: 'p-awa', userId: 'u-awa', displayName: 'Awa', ...decor }, createdAt: new Date('2026-09-13T10:13:00.000Z') },
      caption,
    });
    expect(carrier.sender?.presenceKey).toBe('u-awa');
    expect(carrier.sender?.ringRef).toEqual(filet);
  });

  test('un invité sans compte se lit par sa ligne de participant ; sans identifiant, aucune clé', () => {
    const guest = mediaCarrierOf({ message: { sender: { id: 'p-guest', displayName: 'Invité' }, createdAt: new Date() }, caption });
    expect(guest.sender?.presenceKey).toBe('p-guest');
    expect(guest.sender?.ringRef).toBeUndefined();
    const bare = mediaCarrierOf({ message: { sender: { displayName: 'Awa' }, createdAt: new Date() }, caption });
    expect(bare.sender?.presenceKey).toBeUndefined();
  });
});

describe('le point de présence garde un diamètre lisible (#10955)', () => {
  const dotWidth = (size: number): number => Number(/data-presence="online"[^>]*style="width:([0-9.]+)px/.exec(renderToStaticMarkup(<Avatar initials="AW" color="#6366F1" size={size} presence="online" />))?.[1]);

  test('sur un petit avatar (réaction, frappe : 20 px), jamais sous 6 px', () => {
    expect(dotWidth(20)).toBe(6);
  });

  test('au-delà, 0,26 du diamètre (44 px ⇒ 11,44 px)', () => {
    expect(dotWidth(44)).toBeCloseTo(11.44, 5);
  });
});
