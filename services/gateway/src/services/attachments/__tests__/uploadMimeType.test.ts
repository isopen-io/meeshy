/**
 * #9693 — un .mp3, un .wav ou un .mp4 sonore se déclare comme ce qu'il EST,
 * quel que soit le nom que le système de l'expéditeur lui a donné.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { admittedUploadMimeType, audioOnlyContainerMimeType } from '../uploadMimeType';
import { MP3_SIGNATURE_BYTES, PDF_SIGNATURE_BYTES } from './signature-fixtures';

const WAV_BYTES = Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'), Buffer.alloc(32)]);
const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from('ftypM4A \x00\x00\x02\x00isomiso2', 'latin1'), Buffer.alloc(16)]);

describe('admittedUploadMimeType — le type déclaré, ramené au nom accepté', () => {
  it('ramène un WAV nommé audio/x-wav à audio/wav', () => {
    expect(admittedUploadMimeType({ declared: 'audio/x-wav', fileName: 'note.wav', head: WAV_BYTES })).toBe('audio/wav');
  });

  it('déduit un MP3 de son extension quand le type est générique et que les octets le confirment', () => {
    expect(admittedUploadMimeType({ declared: 'application/octet-stream', fileName: 'chanson.mp3', head: MP3_SIGNATURE_BYTES })).toBe('audio/mpeg');
  });

  it('déduit un MP4 de son extension quand les octets portent une boîte ftyp', () => {
    expect(admittedUploadMimeType({ declared: 'application/octet-stream', fileName: 'son.mp4', head: MP4_BYTES })).toBe('video/mp4');
  });

  it('garde le type générique quand les octets démentent l’extension — jamais un refus là où il n’y en avait pas', () => {
    expect(admittedUploadMimeType({ declared: 'application/octet-stream', fileName: 'faux.mp3', head: PDF_SIGNATURE_BYTES })).toBe('application/octet-stream');
  });

  it('ne réécrit jamais une déclaration précise', () => {
    expect(admittedUploadMimeType({ declared: 'audio/webm;codecs=opus', fileName: 'voice.mp3', head: MP3_SIGNATURE_BYTES })).toBe('audio/webm;codecs=opus');
  });
});

describe('audioOnlyContainerMimeType — un MP4 sans image est un son', () => {
  it('rend audio/mp4 pour un MP4 qui ne porte qu’une piste audio', () => {
    expect(audioOnlyContainerMimeType('video/mp4', { video: false, audio: true })).toBe('audio/mp4');
  });

  it('garde video/mp4 dès qu’une piste vidéo existe', () => {
    expect(audioOnlyContainerMimeType('video/mp4', { video: true, audio: true })).toBe('video/mp4');
  });

  it('garde le type déclaré quand la sonde n’a rien dit', () => {
    expect(audioOnlyContainerMimeType('video/mp4', null)).toBe('video/mp4');
    expect(audioOnlyContainerMimeType('video/mp4', { video: false, audio: false })).toBe('video/mp4');
  });

  it('ne touche à aucun autre conteneur', () => {
    expect(audioOnlyContainerMimeType('video/webm', { video: false, audio: true })).toBe('video/webm');
  });
});
