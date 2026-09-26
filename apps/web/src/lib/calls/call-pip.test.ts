import { describe, expect, test } from 'bun:test';

import { armAutoPip, pipSource, pipSupport, registerPipOpener, requestCallPip, shouldOfferPip } from './call-pip';
import type { ActiveCall, CallMember } from './call-store';

/**
 * **L'IMAGE DANS L'IMAGE** (#8046, D10) — miroir de `PiPCallController.swift` :
 * la vidéo du pair continue de flotter quand on quitte l'onglet. Le web a
 * deux mécanismes : la fenêtre Document Picture-in-Picture (Chromium récent,
 * elle porte AUSSI les boutons de l'appel) et l'image dans l'image d'une
 * `<video>` (partout ailleurs). La bascule automatique quand l'onglet se
 * masque passe par l'action `enterpictureinpicture` de Media Session — le
 * seul chemin qu'un navigateur accepte sans geste.
 */

const videoStream = (live = true) => ({ getVideoTracks: () => (live ? [{ readyState: 'live' }] : []) }) as unknown as MediaStream;

const member = (userId: string, cameraOn: boolean): CallMember => ({ userId, name: userId, avatar: null, micMuted: false, cameraOn, screenSharing: false, link: 'connected' });

const call = (patch: Partial<ActiveCall> = {}): Pick<ActiveCall, 'members' | 'remoteStreams' | 'localStream' | 'cameraOn' | 'phase'> => ({
  members: { peer: member('peer', true) },
  remoteStreams: { peer: videoStream() },
  localStream: videoStream(),
  cameraOn: true,
  phase: { kind: 'connected' },
  ...patch,
});

describe('pipSupport', () => {
  test('la fenêtre de document d’abord, l’image dans l’image d’une vidéo sinon, rien dans la coque', () => {
    expect(pipSupport({ documentPictureInPicture: {}, pictureInPictureEnabled: true })).toBe('document');
    expect(pipSupport({ pictureInPictureEnabled: true })).toBe('video');
    expect(pipSupport({ pictureInPictureEnabled: false })).toBe('none');
    expect(pipSupport({})).toBe('none');
  });
});

describe('pipSource', () => {
  test('la vidéo du pair d’abord ; à défaut ma caméra ; sans vidéo, rien', () => {
    const both = call();
    expect(pipSource(both)).toEqual({ stream: both.remoteStreams.peer, mirrored: false });
    const mine = call({ members: { peer: member('peer', false) } });
    expect(pipSource(mine)).toEqual({ stream: mine.localStream, mirrored: true });
    expect(pipSource(call({ members: { peer: member('peer', false) }, cameraOn: false }))).toBeNull();
  });
});

describe('shouldOfferPip', () => {
  test('un appel en cours avec de la vidéo, sur un navigateur qui sait ; jamais pendant la sonnerie ni après la fin', () => {
    expect(shouldOfferPip(call(), 'video')).toBe(true);
    expect(shouldOfferPip(call(), 'none')).toBe(false);
    expect(shouldOfferPip(call({ phase: { kind: 'incoming' } }), 'document')).toBe(false);
    expect(shouldOfferPip(call({ phase: { kind: 'ended', reason: 'local', detail: null } }), 'document')).toBe(false);
    expect(shouldOfferPip(call({ members: { peer: member('peer', false) }, cameraOn: false }), 'document')).toBe(false);
  });
});

describe('requestCallPip', () => {
  test('appelle SYNCHRONEMENT la fenêtre enregistrée (dans le geste), et plus rien une fois retirée', () => {
    const calls: string[] = [];
    const unregister = registerPipOpener(async () => {
      calls.push('ouverte');
      return true;
    });
    requestCallPip();
    expect(calls).toEqual(['ouverte']);
    unregister();
    requestCallPip();
    expect(calls).toEqual(['ouverte']);
  });
});

describe('armAutoPip', () => {
  test('pose puis retire l’action Media Session ; un navigateur qui ne la connaît pas ne casse rien', () => {
    const handlers = new Map<string, unknown>();
    const session = { setActionHandler: (action: string, handler: unknown) => void handlers.set(action, handler) };
    const disarm = armAutoPip(session, () => undefined);
    expect(typeof handlers.get('enterpictureinpicture')).toBe('function');
    disarm();
    expect(handlers.get('enterpictureinpicture')).toBeNull();
    const refusing = { setActionHandler: () => { throw new TypeError('unknown action'); } };
    expect(() => armAutoPip(refusing, () => undefined)()).not.toThrow();
    expect(() => armAutoPip(undefined, () => undefined)()).not.toThrow();
  });
});
