import { describe, expect, test } from 'bun:test';

import { voiceFileLabel } from './voice-file-name';

describe('le nom affiché d’un vocal', () => {
  test('un vocal enregistré sans nom réel n’affiche rien', () => {
    for (const name of ['vocal.webm', 'voice-12.m4a', 'audio_20261014_101500.m4a', 'Recording 3.wav', 'PTT-20261014-WA0001.opus', '3f2a9c1e-77aa-4b1d-9c0e-0a1b2c3d4e5f.webm', '1760436900123.mp4', '', '   ']) {
      expect(voiceFileLabel(name)).toBeNull();
    }
  });

  test('les noms que fabriquent les enregistreurs de l’app (web, iOS) sont masqués', () => {
    for (const name of [
      'Message vocal.webm',
      'Message vocal.ogg',
      'Message vocal-coupe.wav',
      'voice_1760436900.m4a',
      'edited_audio_3F2A9C1E-77AA-4B1D-9C0E-0A1B2C3D4E5F.m4a',
      'v_3F2A9C1E-77AA-4B1D-9C0E-0A1B2C3D4E5F.m4a',
      'meeshy-trim-3F2A9C1E-77AA-4B1D-9C0E-0A1B2C3D4E5F.m4a',
      'New Recording 3.m4a',
    ]) {
      expect(voiceFileLabel(name)).toBeNull();
    }
  });

  test('un mot lisible à côté d’un horodatage garde le nom', () => {
    expect(voiceFileLabel('interview-2026-10-14.m4a')).toBe('interview-2026-10-14.m4a');
    expect(voiceFileLabel('Message pour Amina.m4a')).toBe('Message pour Amina.m4a');
  });

  test('un fichier nommé par son auteur garde son nom', () => {
    expect(voiceFileLabel('reunion.m4a')).toBe('reunion.m4a');
  });

  test('un nom trop long est tronqué AU MILIEU, extension gardée', () => {
    const label = voiceFileLabel('compte-rendu-du-comite-de-pilotage-de-octobre.m4a', 24);
    expect(label?.length).toBe(24);
    expect(label?.endsWith('.m4a')).toBe(true);
    expect(label?.startsWith('compte-')).toBe(true);
    expect(label).toContain('…');
  });

  test('un nom court n’est pas touché', () => {
    expect(voiceFileLabel('interview-maire.mp3', 24)).toBe('interview-maire.mp3');
  });

  test('un nom hostile ne fige pas le fil (aucun retour arrière exponentiel)', () => {
    const hostile = `vocal${'1'.repeat(5000)}x.m4a`;
    const started = performance.now();
    voiceFileLabel(hostile);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
