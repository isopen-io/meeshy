import { describe, expect, it } from 'vitest';

import { canonicalMediaMimeType } from '../../utils/media-mime-type';
import { isAudioMimeType, isVideoMimeType } from '../../types/attachment';

describe('canonicalMediaMimeType — un son reste un son, quel que soit le nom que le système lui donne (#9693)', () => {
  it.each(['audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'AUDIO/X-WAV'])('ramène %s au WAV accepté', (declared) => {
    const canonical = canonicalMediaMimeType({ mimeType: declared, fileName: 'note.wav' });
    expect(canonical).toBe('audio/wav');
    expect(isAudioMimeType(canonical)).toBe(true);
  });

  it.each(['audio/x-mp3', 'audio/x-mpeg', 'audio/mpeg3', 'audio/x-mpeg-3', 'audio/mpg'])('ramène %s au MP3 accepté', (declared) => {
    expect(canonicalMediaMimeType({ mimeType: declared, fileName: 'chanson.mp3' })).toBe('audio/mpeg');
  });

  it.each([
    ['chanson.mp3', 'audio/mpeg'],
    ['note.WAV', 'audio/wav'],
    ['memo.m4a', 'audio/mp4'],
    ['voix.aac', 'audio/aac'],
    ['clip.mp4', 'video/mp4'],
  ])('déduit le type de l’extension quand le système n’en donne aucun (%s)', (fileName, expected) => {
    expect(canonicalMediaMimeType({ mimeType: '', fileName })).toBe(expected);
    expect(canonicalMediaMimeType({ mimeType: 'application/octet-stream', fileName })).toBe(expected);
    expect(canonicalMediaMimeType({ mimeType: null, fileName })).toBe(expected);
  });

  it('un MP4 déclaré par extension reste une vidéo acceptée', () => {
    expect(isVideoMimeType(canonicalMediaMimeType({ mimeType: '', fileName: 'clip.mp4' }))).toBe(true);
  });

  it('ne touche ni un type déjà juste ni ses paramètres', () => {
    expect(canonicalMediaMimeType({ mimeType: 'audio/mpeg', fileName: 'x.mp3' })).toBe('audio/mpeg');
    expect(canonicalMediaMimeType({ mimeType: 'audio/webm;codecs=opus', fileName: 'voice.webm' })).toBe('audio/webm;codecs=opus');
    expect(canonicalMediaMimeType({ mimeType: 'audio/x-m4a', fileName: 'memo.m4a' })).toBe('audio/x-m4a');
    expect(canonicalMediaMimeType({ mimeType: 'video/mp4', fileName: 'son.mp4' })).toBe('video/mp4');
  });

  it('ne devine rien d’un fichier sans extension connue', () => {
    expect(canonicalMediaMimeType({ mimeType: 'application/octet-stream', fileName: 'archive.bin' })).toBe('application/octet-stream');
    expect(canonicalMediaMimeType({ mimeType: '', fileName: 'sans-extension' })).toBe('');
    expect(canonicalMediaMimeType({ mimeType: 'application/pdf', fileName: 'faux.mp3' })).toBe('application/pdf');
  });
});
