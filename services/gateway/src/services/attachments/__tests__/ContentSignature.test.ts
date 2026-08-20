import { matchesAudioSignature, matchesImageSignature } from '../ContentSignature';

// ─── Fixtures : octets d'en-tête réels ─────────────────────────────────────────
// Mêmes constantes que `attachments-upload.test.ts` (round 1 sécurité) — un
// texte quelconque ne distinguerait pas la reconnaissance de signature d'un
// simple refus global.

const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]); // EBML (WebM) — MediaRecorder Chrome/Firefox/Edge
const MP4_M4A_HEADER = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypM4A ', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('M4A mp42isom', 'ascii'),
]); // MP4/M4A — AVAudioRecorder .aac par défaut (iOS), MediaRecorder Safari
const OGG_HEADER = Buffer.from('OggS\x00\x02\x00\x00', 'binary'); // Ogg — fallback web (Firefox/Chrome)
const MP3_ID3_HEADER = Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary'); // MP3 (tag ID3v2)
const MP3_FRAMESYNC_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x64]); // MP3 sans tag ID3 (frame sync MPEG)
const WAV_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVEfmt ', 'ascii'),
]); // WAV (RIFF/WAVE)
const AAC_ADTS_HEADER = Buffer.from([0xff, 0xf1, 0x50, 0x80]); // AAC brut (ADTS)

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF_HEADER = Buffer.from('GIF89a', 'ascii');
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
]);

const PDF_HEADER = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'binary');
const ZIP_DOCX_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // docx/zip
const PLAIN_TEXT = Buffer.from('Bonjour, ceci est un simple fichier texte.', 'utf8');

describe('matchesAudioSignature', () => {
  it.each([
    ['WebM/EBML (MediaRecorder Chrome/Firefox/Edge)', WEBM_HEADER],
    ['MP4/M4A ftyp (AVAudioRecorder iOS .aac, MediaRecorder Safari)', MP4_M4A_HEADER],
    ['Ogg (fallback MediaRecorder)', OGG_HEADER],
    ['MP3 avec tag ID3v2', MP3_ID3_HEADER],
    ['MP3 sans tag (frame sync MPEG)', MP3_FRAMESYNC_HEADER],
    ['WAV (RIFF/WAVE)', WAV_HEADER],
    ['AAC brut (ADTS)', AAC_ADTS_HEADER],
  ])('reconnaît %s', (_label, header) => {
    expect(matchesAudioSignature(header)).toBe(true);
  });

  it.each([
    ['un PDF', PDF_HEADER],
    ['un docx/zip', ZIP_DOCX_HEADER],
    ['du texte brut', PLAIN_TEXT],
    ['une image PNG', PNG_HEADER],
    ['un buffer vide', Buffer.alloc(0)],
  ])('rejette %s', (_label, buffer) => {
    expect(matchesAudioSignature(buffer)).toBe(false);
  });
});

describe('matchesImageSignature', () => {
  it.each([
    ['PNG', PNG_HEADER],
    ['JPEG', JPEG_HEADER],
    ['GIF', GIF_HEADER],
    ['WEBP', WEBP_HEADER],
  ])('reconnaît %s', (_label, header) => {
    expect(matchesImageSignature(header)).toBe(true);
  });

  it.each([
    ['un PDF', PDF_HEADER],
    ['un docx/zip', ZIP_DOCX_HEADER],
    ['du texte brut', PLAIN_TEXT],
    ['un fichier audio WebM', WEBM_HEADER],
    ['un buffer vide', Buffer.alloc(0)],
  ])('rejette %s', (_label, buffer) => {
    expect(matchesImageSignature(buffer)).toBe(false);
  });
});
