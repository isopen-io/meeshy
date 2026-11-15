import { execFileSync } from 'child_process';
import path from 'path';
import { MetadataManager, musicMetadataLoader } from '../MetadataManager';

jest.mock('../../../utils/logger-enhanced', () => {
  const silent = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => silent } };
});

const FIXTURES = path.join(__dirname, 'fixtures');
const REAL_DURATION_MS = 3500;
const TOLERANCE_MS = 100;

const GATEWAY_ROOT = path.resolve(__dirname, '../../../..');
const PARSE_WITH_THE_REAL_PARSER =
  'const { parseFile } = await import("music-metadata");' +
  'const { format, common } = await parseFile(process.argv[1]);' +
  'const picture = (common.picture ?? []).map(({ data }) => ({ data: { length: data.length } }));' +
  'process.stdout.write(JSON.stringify({ format, common: { picture } }));';

/**
 * music-metadata est ESM-only et Jest (CommonJS) ne sait pas l'importer : le vrai
 * analyseur tourne dans un Node séparé, sur le vrai fichier. Aucune durée n'est écrite
 * dans ce témoin — elle vient du conteneur.
 */
const realParseFile = (async (filePath: string) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', PARSE_WITH_THE_REAL_PARSER, filePath], {
      cwd: GATEWAY_ROOT,
      encoding: 'utf8',
    }),
  )) as unknown as NonNullable<typeof musicMetadataLoader.parseFile>;

const lowBitrateVoiceNotes: ReadonlyArray<{ file: string; mimeType: string }> = [
  { file: 'audio-duration/vorbis-3500ms.ogg', mimeType: 'audio/ogg' },
  { file: 'audio-duration/opus-3500ms.ogg', mimeType: 'audio/opus' },
  { file: 'audio-duration/webm-opus-3500ms.webm', mimeType: 'audio/webm' },
  { file: 'audio-duration/aac-3500ms.m4a', mimeType: 'audio/mp4' },
  { file: 'audio-duration/mp3-3500ms.mp3', mimeType: 'audio/mpeg' },
  { file: 'audio-duration/wav-3500ms.wav', mimeType: 'audio/wav' },
];

describe('La durée servie d’un vocal est sa durée réelle, quel que soit son débit (#11549)', () => {
  const manager = new MetadataManager(FIXTURES);

  beforeAll(() => {
    musicMetadataLoader.parseFile = realParseFile;
  });

  afterAll(() => {
    delete musicMetadataLoader.parseFile;
  });

  it.each(lowBitrateVoiceNotes)('$file ($mimeType) garde ses 3,5 s', async ({ file, mimeType }) => {
    const metadata = await manager.extractAudioMetadata(file, undefined, mimeType);

    expect(Math.abs(metadata.duration - REAL_DURATION_MS)).toBeLessThanOrEqual(TOLERANCE_MS);
  });

  it.each([
    { file: 'audio-duration/mp3-cover-1500ms.mp3', mimeType: 'audio/mpeg' },
    { file: 'audio-duration/aac-cover-1500ms.m4a', mimeType: 'audio/mp4' },
  ])('$file garde ses 1,5 s : sa pochette ne compte pas dans le débit (#16510)', async ({ file, mimeType }) => {
    const metadata = await manager.extractAudioMetadata(file, undefined, mimeType);

    expect(Math.abs(metadata.duration - 1500)).toBeLessThanOrEqual(TOLERANCE_MS);
  });

  it('un débit faible ne raccourcit pas une durée que le conteneur déclare', () => {
    const verdict = manager.validateAudioCoherence(3500, 7215, 'audio/ogg');

    expect(verdict.estimatedDuration).toBeUndefined();
  });

  it('une durée physiquement impossible pour le poids du fichier reste corrigée', () => {
    const anHourInSevenKilobytes = manager.validateAudioCoherence(3_600_000, 7215, 'audio/ogg');

    expect(anHourInSevenKilobytes.isValid).toBe(false);
    expect(anHourInSevenKilobytes.estimatedDuration).toBeLessThan(3_600_000);
  });
});
