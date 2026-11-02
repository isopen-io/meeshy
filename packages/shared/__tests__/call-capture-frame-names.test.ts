import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FRAME_MOODS, FRAME_NAME_LANGUAGES, FrameMoodFileSchema, FrameMotifSchema, frameDisplayName, type FrameMoodFile } from '../types/capture-frames';
import { PACK_LANGUAGES } from '../types/content-pack';
import { REPO_ROOT } from '../scripts/generate-glory-frames';

/**
 * LE NOM D'UN CADRE D'APPEL SE LIT DANS LES SEPT LANGUES (#13953) — chaque motif et chaque
 * déclinaison porte `localizedNames` (fr, en, es, pt, de, it, ar) ; `name` reste le nom
 * français, celui que lit un client d'avant, et le repli de toute langue absente.
 */

const FRAMES = join(REPO_ROOT, 'packages/shared/design/call-capture-frames');
const moodFile = (mood: string): FrameMoodFile => FrameMoodFileSchema.parse(JSON.parse(readFileSync(join(FRAMES, `${mood}.json`), 'utf8')));
const motifs = FRAME_MOODS.flatMap((mood) => moodFile(mood).motifs);
const named = motifs.flatMap((motif) => [
  { id: motif.id, name: motif.name, localizedNames: motif.localizedNames },
  ...(motif.styles ?? []).map((style) => ({ id: `${motif.id}.${style.id}`, name: style.name, localizedNames: style.localizedNames })),
]);

describe('les noms des cadres d’appel (#13953)', () => {
  it('les langues des noms sont celles des packs', () => {
    expect([...FRAME_NAME_LANGUAGES]).toEqual([...PACK_LANGUAGES]);
  });

  it('chaque motif et chaque déclinaison a un nom non vide dans les sept langues', () => {
    expect(motifs.length).toBe(52);
    const missing = named.flatMap((entry) =>
      FRAME_NAME_LANGUAGES.filter((language) => (entry.localizedNames?.[language] ?? '').trim().length === 0).map((language) => `${entry.id}:${language}`),
    );
    expect(missing).toEqual([]);
  });

  it('le nom français EST le `name` d’avant : un ancien client lit le même mot', () => {
    expect(named.filter((entry) => entry.localizedNames?.fr !== entry.name).map((entry) => entry.id)).toEqual([]);
  });

  it('chaque langue étrangère est traduite au moins une fois sur deux (aucune recopie en bloc du français)', () => {
    for (const language of FRAME_NAME_LANGUAGES.filter((code) => code !== 'fr')) {
      const translated = motifs.filter((motif) => motif.localizedNames?.[language] !== motif.name).length;
      expect({ language, translated: translated >= motifs.length / 2 }).toEqual({ language, translated: true });
    }
  });

  it('l’arabe est écrit en arabe, hors sigles', () => {
    const latin = motifs.filter((motif) => !/[؀-ۿ]/.test(motif.localizedNames?.ar ?? '') && !/^[A-Z]{2,4}$/.test(motif.name)).map((motif) => motif.id);
    expect(latin).toEqual([]);
  });
});

describe('frameDisplayName', () => {
  const owner = { name: 'Fête', localizedNames: { fr: 'Fête', en: 'Party', 'pt': 'Festa' } };

  it('sert la langue d’interface, son code court ou régional', () => {
    expect(frameDisplayName(owner, 'en')).toBe('Party');
    expect(frameDisplayName(owner, 'pt-BR')).toBe('Festa');
    expect(frameDisplayName(owner, 'EN_us')).toBe('Party');
  });

  it('retombe sur `name` quand la langue manque ou que le cadre est d’avant', () => {
    expect(frameDisplayName(owner, 'de')).toBe('Fête');
    expect(frameDisplayName({ name: 'Fête' }, 'en')).toBe('Fête');
    expect(frameDisplayName({ name: 'Fête', localizedNames: { en: '  ' } }, 'en')).toBe('Fête');
  });
});

describe('FrameMotifSchema, rétrocompatible', () => {
  const minimal = JSON.parse(readFileSync(join(FRAMES, 'jovial.json'), 'utf8')).motifs[0] as Record<string, unknown>;
  const { localizedNames: _dropped, ...legacy } = minimal;

  it('un motif d’avant, sans `localizedNames`, se lit toujours', () => {
    expect(FrameMotifSchema.safeParse(legacy).success).toBe(true);
  });

  it('refuse un nom vide ou une langue inconnue', () => {
    expect(FrameMotifSchema.safeParse({ ...legacy, localizedNames: { en: '' } }).success).toBe(false);
    expect(FrameMotifSchema.safeParse({ ...legacy, localizedNames: { xx: 'Party' } }).success).toBe(false);
  });
});
