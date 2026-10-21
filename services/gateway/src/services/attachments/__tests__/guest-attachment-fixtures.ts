/**
 * Fichiers COMPLETS et structurellement valides, construits octet par octet,
 * pour les témoins de la garde des pièces jointes d'invité (#10001). Une
 * en-tête seule ne suffit plus : la garde parcourt le conteneur jusqu'au
 * dernier octet, donc chaque fabrique rend un fichier entier.
 */

const ascii = (text: string): Buffer => Buffer.from(text, 'latin1');
const u32be = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
};
const u32le = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

// ─── MPEG audio (MP3) ───────────────────────────────────────────────────────

/** MPEG-1 Layer III, 128 kb/s, 44,1 kHz, sans remplissage : 417 octets par trame. */
const MP3_FRAME_LENGTH = 417;

export function mp3Frames(count: number): Buffer {
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(MP3_FRAME_LENGTH - 4, 0x55)]);
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

export function mp3WithId3(count: number): Buffer {
  const id3Body = Buffer.alloc(20);
  const id3 = Buffer.concat([ascii('ID3'), Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x14]), id3Body]);
  return Buffer.concat([id3, mp3Frames(count)]);
}

// ─── ADTS (AAC brut) ────────────────────────────────────────────────────────

export function adtsFrames(count: number): Buffer {
  const payload = Buffer.alloc(120, 0x21);
  const frameLength = 7 + payload.length;
  const header = Buffer.from([
    0xff,
    0xf1,
    (1 << 6) | (4 << 2),
    (2 << 6) | ((frameLength >> 11) & 0x03),
    (frameLength >> 3) & 0xff,
    ((frameLength & 0x07) << 5) | 0x1f,
    0xfc,
  ]);
  const frame = Buffer.concat([header, payload]);
  return Buffer.concat(Array.from({ length: count }, () => frame));
}

// ─── ISO BMFF (M4A / MP4) ───────────────────────────────────────────────────

function box(type: string, ...payloads: readonly Buffer[]): Buffer {
  const body = Buffer.concat(payloads);
  return Buffer.concat([u32be(8 + body.length), ascii(type), body]);
}

function trak(handler: string): Buffer {
  const hdlr = box('hdlr', Buffer.alloc(8), ascii(handler), Buffer.alloc(12), Buffer.from([0]));
  return box('trak', box('tkhd', Buffer.alloc(84)), box('mdia', box('mdhd', Buffer.alloc(24)), hdlr, box('minf', box('smhd', Buffer.alloc(8)))));
}

function isoFile(majorBrand: string, handlers: readonly string[]): Buffer {
  return Buffer.concat([
    box('ftyp', ascii(majorBrand), u32be(0), ascii(`${majorBrand}isommp42`)),
    box('wide'),
    box('mdat', Buffer.alloc(2048, 0x11)),
    box('moov', box('mvhd', Buffer.alloc(100)), ...handlers.map(trak)),
  ]);
}

/** Le vocal iOS (`AVAudioRecorder`, AAC dans un conteneur M4A). */
export function m4aVoice(): Buffer {
  return isoFile('M4A ', ['soun']);
}

/** Un M4A valide dont la boîte `mdat`, posée en dernier, se termine par une archive ZIP. */
export function m4aWithZipInLastBox(): Buffer {
  return Buffer.concat([
    box('ftyp', ascii('M4A '), u32be(0), ascii('M4A isommp42')),
    box('moov', box('mvhd', Buffer.alloc(100)), trak('soun')),
    box('mdat', Buffer.alloc(512, 0x11), EMPTY_ZIP),
  ]);
}

/** Une vidéo MP4 (piste image + piste son), que l'on déclarera `audio/mp4`. */
export function mp4Video(): Buffer {
  return isoFile('isom', ['vide', 'soun']);
}

// ─── WebM (vocal web, MediaRecorder) ────────────────────────────────────────

const UNKNOWN_SIZE = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

function ebmlSize(length: number): Buffer {
  if (length < 0x7f) return Buffer.from([0x80 | length]);
  const buffer = Buffer.alloc(8);
  buffer[0] = 0x01;
  buffer.writeUIntBE(length, 2, 6);
  return buffer;
}

function el(id: readonly number[], ...payloads: readonly Buffer[]): Buffer {
  const body = Buffer.concat(payloads);
  return Buffer.concat([Buffer.from(id), ebmlSize(body.length), body]);
}

function unknownSized(id: readonly number[], ...payloads: readonly Buffer[]): Buffer {
  return Buffer.concat([Buffer.from(id), UNKNOWN_SIZE, ...payloads]);
}

function webmFile(trackTypes: readonly number[]): Buffer {
  const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x86], Buffer.from([1])), el([0x42, 0x82], ascii('webm')), el([0x42, 0x87], Buffer.from([4])));
  const tracks = el(
    [0x16, 0x54, 0xae, 0x6b],
    ...trackTypes.map((type, index) =>
      el([0xae], el([0xd7], Buffer.from([index + 1])), el([0x83], Buffer.from([type])), el([0x86], ascii(type === 2 ? 'A_OPUS' : 'V_VP8'))),
    ),
  );
  const block = (timecode: number): Buffer =>
    unknownSized([0x1f, 0x43, 0xb6, 0x75], el([0xe7], Buffer.from([timecode])), el([0xa3], Buffer.from([0x81, 0x00, 0x00, 0x80]), Buffer.alloc(60, 0x42)));
  return Buffer.concat([
    header,
    unknownSized([0x18, 0x53, 0x80, 0x67], el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]))), tracks, block(0), block(20)),
  ]);
}

/** Le vocal web de Chrome / Firefox : Opus dans un WebM à tailles inconnues. */
export function webmVoice(): Buffer {
  return webmFile([2]);
}

export function webmVideo(): Buffer {
  return webmFile([1, 2]);
}

// ─── Ogg (Opus) ─────────────────────────────────────────────────────────────

const OGG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index << 24;
  for (let bit = 0; bit < 8; bit++) crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
  return crc >>> 0;
});

function oggCrc(page: Buffer): number {
  return page.reduce((crc, byte) => ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0, 0);
}

function oggPage(headerType: number, sequence: number, packet: Buffer): Buffer {
  const lacing = [...Array.from({ length: Math.floor(packet.length / 255) }, () => 255), packet.length % 255];
  const header = Buffer.concat([
    ascii('OggS'),
    Buffer.from([0, headerType]),
    Buffer.alloc(8),
    u32le(0x1234),
    u32le(sequence),
    u32le(0),
    Buffer.from([lacing.length, ...lacing]),
  ]);
  const page = Buffer.concat([header, packet]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

export function oggOpusVoice(): Buffer {
  return Buffer.concat([
    oggPage(0x02, 0, Buffer.concat([ascii('OpusHead'), Buffer.from([1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0])])),
    oggPage(0x00, 1, Buffer.concat([ascii('OpusTags'), u32le(4), ascii('test'), u32le(0)])),
    oggPage(0x04, 2, Buffer.alloc(300, 0x7c)),
  ]);
}

export function oggTheoraVideo(): Buffer {
  return Buffer.concat([
    oggPage(0x02, 0, Buffer.concat([Buffer.from([0x80]), ascii('theora'), Buffer.alloc(35)])),
    oggPage(0x04, 1, Buffer.alloc(100, 0x01)),
  ]);
}

// ─── WAV ────────────────────────────────────────────────────────────────────

export function wavPcm(): Buffer {
  const fmt = Buffer.concat([ascii('fmt '), u32le(16), Buffer.from([1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0])]);
  const samples = Buffer.alloc(400, 0x10);
  const data = Buffer.concat([ascii('data'), u32le(samples.length), samples]);
  return Buffer.concat([ascii('RIFF'), u32le(4 + fmt.length + data.length), ascii('WAVE'), fmt, data]);
}

// ─── Ce qui n'est pas de l'audio ────────────────────────────────────────────

/** Une archive ZIP vide (enregistrement de fin de répertoire central seul). */
export const EMPTY_ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);

export const JPEG_PHOTO = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  ascii('JFIF'),
  Buffer.from([0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
  Buffer.alloc(64, 0x20),
  Buffer.from([0xff, 0xd9]),
]);

export const PDF_DOCUMENT = ascii('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

export const PLAIN_TEXT = Buffer.from('Bonjour le monde — ceci est un fichier texte.\nDeuxième ligne, avec des accents : é à ü 漢字.\n', 'utf8');
