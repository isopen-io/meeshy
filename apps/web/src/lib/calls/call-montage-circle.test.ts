import { describe, expect, test } from 'bun:test';

import { accentPaletteOf } from '@/lib/accent';

import { frameDate, montageCircle, type CircleConversation, type MontageCall } from './call-montage-circle';
import type { CallMember } from './call-store';

/**
 * QUI UN CADRE MONTRE, ET CE QU'IL ÉCRIT (#8743, spec § 2, § 4.5) — les
 * personnes de l'appel, moi compris (celui qu'on appelle et qui n'a pas
 * encore décroché n'y est pas encore), avec le nom qu'on voit déjà dans
 * l'appel et leur @pseudo quand la conversation le connaît ; le nom du
 * groupe en groupe seulement ; la date ; l'accent de la conversation.
 */

const member = (userId: string, name: string, link: CallMember['link'] = 'connected'): CallMember => ({
  userId,
  name,
  avatar: null,
  micMuted: false,
  cameraOn: true,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link,
});

const call = (members: readonly CallMember[], options: Partial<Pick<MontageCall, 'isGroup' | 'title'>> = {}): MontageCall => ({
  conversationId: 'c1',
  isGroup: options.isGroup ?? false,
  title: options.title ?? 'Awa',
  members: Object.fromEntries(members.map((entry) => [entry.userId, entry])),
});

const viewer = { id: 'u-me', handle: 'moi', displayName: 'Sam' };

const conversation = (overrides: Partial<CircleConversation> = {}): CircleConversation => ({
  id: 'c1',
  title: 'Les Copains',
  type: 'group',
  participants: [{ userId: 'u-awa', user: { id: 'u-awa', username: 'awa' } }, { userId: 'u-karim' }] as unknown as CircleConversation['participants'],
  ...overrides,
});

describe('montageCircle — les personnes', () => {
  test('les autres, dans leur ordre d’arrivée, puis moi ; l’invité qui sonne n’y est pas encore', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa'), member('u-bruno', 'Bruno', 'ringing'), member('u-karim', 'Karim', 'reconnecting')]), viewer, conversation: conversation(), date: 'd' });
    expect(circle.people).toEqual([
      { id: 'u-awa', name: 'Awa', handle: 'awa', isSelf: false },
      { id: 'u-karim', name: 'Karim', handle: null, isSelf: false },
      { id: 'u-me', name: 'Sam', handle: 'moi', isSelf: true },
    ]);
  });

  test('sans conversation en cache, aucun @pseudo inventé ; un invité sans identifiant reste moi', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa')]), viewer: { id: null, handle: null, displayName: 'Invité' }, conversation: undefined, date: 'd' });
    expect(circle.people).toEqual([
      { id: 'u-awa', name: 'Awa', handle: null, isSelf: false },
      { id: 'self', name: 'Invité', handle: null, isSelf: true },
    ]);
  });
});

describe('montageCircle — les textes', () => {
  test('en groupe : le nom de la conversation, sa date, son accent', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa'), member('u-karim', 'Karim')], { isGroup: true, title: 'Titre de l’appel' }), viewer, conversation: conversation(), date: '29 sept. 2026' });
    const palette = accentPaletteOf(conversation());
    expect(circle.texts).toEqual({ groupName: 'Les Copains', isGroup: true, date: '29 sept. 2026', accent: { primary: palette.primary, secondary: palette.secondary } });
  });

  test('en groupe sans conversation en cache : le titre de l’appel ; sans accent connu, `null` (le cadre retombe sur l’indigo Meeshy)', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa')], { isGroup: true, title: 'Les Copains' }), viewer, conversation: undefined, date: 'd' });
    expect(circle.texts).toMatchObject({ groupName: 'Les Copains', isGroup: true, accent: null });
  });

  test('en duo : aucun nom de groupe, même si la conversation porte un titre', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa')]), viewer, conversation: conversation({ type: 'direct' }), date: 'd' });
    expect(circle.texts.groupName).toBeNull();
    expect(circle.texts.isGroup).toBe(false);
  });

  test('un nom de groupe vide n’en est pas un', () => {
    const circle = montageCircle({ call: call([member('u-awa', 'Awa')], { isGroup: true, title: '  ' }), viewer, conversation: conversation({ title: ' ' }), date: 'd' });
    expect(circle.texts.groupName).toBeNull();
  });
});

describe('frameDate — la date du jour, au format court de la langue', () => {
  test('français, anglais', () => {
    const at = new Date(2026, 8, 29, 18, 0, 0);
    expect(frameDate(at, 'fr')).toBe('29 sept. 2026');
    expect(frameDate(at, 'en')).toBe('Sep 29, 2026');
  });
});
