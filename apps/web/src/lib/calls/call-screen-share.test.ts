import { describe, expect, test } from 'bun:test';

import { decodeMediaToggled } from './call-decode';
import type { CallMember } from './call-store';
import { callLayout, canShareScreen, screenSharer, statusPills } from './call-view';

/**
 * LE PARTAGE D'ÉCRAN, SANS ÉCRAN (#8063) — ce que la passerelle annonce
 * (`call:media-toggled`, `mediaType: 'screen'`), la disposition que prend
 * l'écran quand un pair partage, et la capacité qui décide si le bouton
 * existe : une WebView Android ou Safari iOS n'ont pas `getDisplayMedia`,
 * le bouton n'y est donc jamais promis.
 */

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-a', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, link: 'connected', ...overrides });

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

describe('call:media-toggled du partage d’écran', () => {
  test('mediaType « screen » se décode, comme l’audio et la vidéo', () => {
    expect(decodeMediaToggled({ callId: 'c', participantId: 'p', userId: 'u', mediaType: 'screen', enabled: true })).toEqual({ callId: 'c', participantId: 'p', userId: 'u', mediaType: 'screen', enabled: true });
    expect(decodeMediaToggled({ callId: 'c', participantId: 'p', mediaType: 'hologram', enabled: true })).toBeNull();
  });
});

describe('la disposition quand un pair partage', () => {
  test('le flux partagé prend la scène, en direct comme en groupe', () => {
    const sharing = member({ screenSharing: true });
    expect(callLayout({ members: { a: sharing }, cameraOn: false, remoteStreams: { 'u-a': liveVideo }, isGroup: false })).toBe('screen');
    expect(callLayout({ members: { a: sharing, b: member({ userId: 'u-b' }) }, cameraOn: true, remoteStreams: { 'u-a': liveVideo }, isGroup: true })).toBe('screen');
  });

  test('sans piste vidéo reçue, l’annonce seule ne vide pas la scène', () => {
    expect(callLayout({ members: { a: member({ screenSharing: true }) }, cameraOn: false, remoteStreams: {}, isGroup: false })).toBe('portrait');
  });

  test('la fin du partage rend l’état de sa caméra', () => {
    expect(callLayout({ members: { a: member({ cameraOn: true }) }, cameraOn: false, remoteStreams: { 'u-a': liveVideo }, isGroup: false })).toBe('video-duo');
  });

  test('celui qui partage est nommé pour la bannière', () => {
    expect(screenSharer({ a: member(), b: member({ userId: 'u-b', name: 'Bruno', screenSharing: true }) })?.name).toBe('Bruno');
    expect(screenSharer({ a: member() })).toBeNull();
  });
});

describe('ce que voit celui qui partage', () => {
  test('une pastille « Vous partagez votre écran »', () => {
    expect(statusPills({ micMuted: false, screenSharing: true, members: {}, quality: null, isGroup: false })).toEqual(['screen-sharing']);
  });
});

describe('la capacité du navigateur', () => {
  test('le bouton n’existe que là où getDisplayMedia existe', () => {
    expect(canShareScreen({ getDisplayMedia: () => Promise.resolve() })).toBe(true);
    expect(canShareScreen({ getUserMedia: () => Promise.resolve() })).toBe(false);
    expect(canShareScreen(undefined)).toBe(false);
  });
});
