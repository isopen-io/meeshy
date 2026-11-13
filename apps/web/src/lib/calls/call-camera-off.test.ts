import { describe, expect, test } from 'bun:test';

import type { CallCaption } from './call-captions';
import { cameraOffFadeMs, peerSpeakingOnCameraOff } from './call-camera-off';

const caption = (speakerId: string, isFinal: boolean, at: number): CallCaption => ({ id: `${speakerId}-${at}`, speakerId, speakerName: speakerId, original: '…', translated: null, pair: null, isFinal, at, mine: false }) as CallCaption;

describe('G4.6 — le fondu image ↔ avatar', () => {
  test('250 ms, et 120 ms sous « Réduire les animations » : plus court, jamais supprimé', () => {
    expect(cameraOffFadeMs(false)).toBe(250);
    expect(cameraOffFadeMs(true)).toBe(120);
  });
});

describe('G4.2 — l’anneau n’existe qu’à la parole', () => {
  test('le pair dont le dernier segment est en cours parle ; au repos, personne', () => {
    expect(peerSpeakingOnCameraOff([caption('u-peer', false, 2)], 'u-peer')).toBe(true);
    expect(peerSpeakingOnCameraOff([caption('u-peer', true, 2)], 'u-peer')).toBe(false);
    expect(peerSpeakingOnCameraOff([], 'u-peer')).toBe(false);
    expect(peerSpeakingOnCameraOff([caption('u-peer', false, 2)], undefined)).toBe(false);
  });
});
