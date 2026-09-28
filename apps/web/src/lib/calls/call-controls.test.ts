import { describe, expect, test } from 'bun:test';

import { callControlSet, chromeHidden, CHROME_IDLE_MS, controlsArrangement, flipOffered, isVideoScene } from './call-controls';
import type { ActiveCall, CallMember } from './call-store';

/**
 * LES COMMANDES DE L'APPEL EN « C ADAPTÉ » (#8391) — ce que `(…)` sort, où
 * ça sort, et quand une vidéo efface ses commandes.
 */

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-a', name: 'Amina', avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected', ...overrides });

const liveVideo = { getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;

const context = (overrides: Partial<Parameters<typeof callControlSet>[0]> = {}) => ({
  phase: { kind: 'connected' } as ActiveCall['phase'],
  callId: 'call-1',
  cameraOn: false,
  screenSharing: false,
  canShare: true,
  canEffect: true,
  canFlip: true,
  ...overrides,
});

describe('ce que (…) sort', () => {
  test('mon image : Caméra, Écran ; l’appel : Sous-titres, Enregistrer, Ajouter, Réagir — la conversation vit dans l’en-tête (#8436)', () => {
    expect(callControlSet(context())).toEqual({ mine: ['camera', 'screen'], call: ['captions', 'record', 'invite', 'react'] });
  });

  test('caméra allumée : Caméra, Retourner, Effets, Écran — l’ordre de la planche', () => {
    expect(callControlSet(context({ cameraOn: true })).mine).toEqual(['camera', 'flip', 'effects', 'screen']);
  });

  test('Retourner n’existe que là où il y a une AUTRE caméra — sinon le bouton n’aurait aucun effet (#8432)', () => {
    expect(callControlSet(context({ cameraOn: true, canFlip: false })).mine).toEqual(['camera', 'effects', 'screen']);
  });

  test('Effets n’existe que caméra allumée, là où le navigateur sait les faire, et jamais sur un écran partagé (#8442)', () => {
    expect(callControlSet(context({ cameraOn: false })).mine).not.toContain('effects');
    expect(callControlSet(context({ cameraOn: true, canEffect: false })).mine).toEqual(['camera', 'flip', 'screen']);
    expect(callControlSet(context({ cameraOn: true, screenSharing: true })).mine).not.toContain('effects');
  });

  test('sans getDisplayMedia, Écran n’est jamais promis — sauf pour arrêter un partage en cours', () => {
    expect(callControlSet(context({ canShare: false })).mine).toEqual(['camera']);
    expect(callControlSet(context({ canShare: false, screenSharing: true })).mine).toEqual(['camera', 'screen']);
  });

  test('pendant la sonnerie : ni Écran, ni Sous-titres, ni Enregistrer — Caméra reste', () => {
    expect(callControlSet(context({ phase: { kind: 'outgoing' } }))).toEqual({ mine: ['camera'], call: [] });
  });

  test('Enregistrer demande un appel identifié ET connecté (pas en reconnexion)', () => {
    expect(callControlSet(context({ callId: null })).call).toEqual(['captions']);
    expect(callControlSet(context({ phase: { kind: 'reconnecting' } })).call).toEqual(['captions', 'invite', 'react']);
  });

  test('Ajouter et Réagir existent en duo comme en groupe, dès qu’un appel identifié est rejoint (#8433, #8439)', () => {
    expect(callControlSet(context({ phase: { kind: 'connected' } })).call).toContain('invite');
    expect(callControlSet(context({ phase: { kind: 'connected' } })).call).toContain('react');
    expect(callControlSet(context({ phase: { kind: 'connecting' } })).call).toEqual([]);
  });

});

describe('une autre caméra où se retourner (#8432)', () => {
  const input = (kind: MediaDeviceKind) => ({ kind }) as MediaDeviceInfo;

  test('une seule caméra : Retourner n’aurait aucun effet', () => {
    expect(flipOffered([input('videoinput'), input('audioinput')])).toBe(false);
  });

  test('deux caméras, ou une liste encore vide : Retourner est offert', () => {
    expect(flipOffered([input('videoinput'), input('videoinput')])).toBe(true);
    expect(flipOffered([])).toBe(true);
  });
});

describe('où les actions sortent', () => {
  test('en duo : deux rails ; en groupe : des rangées dans la pilule', () => {
    expect(controlsArrangement({ isGroup: false })).toBe('rails');
    expect(controlsArrangement({ isGroup: true })).toBe('rows');
  });
});

describe('la scène vidéo', () => {
  const call = (overrides: Partial<Parameters<typeof isVideoScene>[0]> = {}) => ({ members: {}, cameraOn: false, remoteStreams: {}, isGroup: false, phase: { kind: 'connected' } as ActiveCall['phase'], ...overrides });

  test('un appel vocal n’est jamais une scène vidéo', () => {
    expect(isVideoScene(call({ members: { a: member() } }))).toBe(false);
  });

  test('ma caméra, celle du pair ou un écran partagé en font une', () => {
    expect(isVideoScene(call({ cameraOn: true }))).toBe(true);
    expect(isVideoScene(call({ members: { a: member({ cameraOn: true }) }, remoteStreams: { 'u-a': liveVideo } }))).toBe(true);
    expect(isVideoScene(call({ members: { a: member({ screenSharing: true }) }, remoteStreams: { 'u-a': liveVideo } }))).toBe(true);
  });

  test('une grille de groupe sans aucune caméra reste un appel vocal', () => {
    const members = { a: member(), b: member({ userId: 'u-b' }) };
    expect(isVideoScene(call({ isGroup: true, members }))).toBe(false);
    expect(isVideoScene(call({ isGroup: true, members: { ...members, b: member({ userId: 'u-b', cameraOn: true }) } }))).toBe(true);
  });

  test('pendant la sonnerie, rien ne s’efface', () => {
    expect(isVideoScene(call({ cameraOn: true, phase: { kind: 'outgoing' } }))).toBe(false);
  });
});

describe('le masquage automatique', () => {
  const state = (overrides: Partial<Parameters<typeof chromeHidden>[0]> = {}) => ({ videoScene: true, idleMs: CHROME_IDLE_MS, keyboardInside: false, reducedMotion: false, ...overrides });

  test('une vidéo efface ses commandes après 4 s sans geste', () => {
    expect(CHROME_IDLE_MS).toBe(4000);
    expect(chromeHidden(state())).toBe(true);
    expect(chromeHidden(state({ idleMs: CHROME_IDLE_MS - 1 }))).toBe(false);
  });

  test('jamais en audio', () => {
    expect(chromeHidden(state({ videoScene: false, idleMs: 60_000 }))).toBe(false);
  });

  test('jamais avec le focus clavier dans les commandes', () => {
    expect(chromeHidden(state({ keyboardInside: true, idleMs: 60_000 }))).toBe(false);
  });

  test('jamais sous prefers-reduced-motion', () => {
    expect(chromeHidden(state({ reducedMotion: true, idleMs: 60_000 }))).toBe(false);
  });
});
