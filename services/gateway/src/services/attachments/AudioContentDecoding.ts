/**
 * Le CONTENEUR audio d'un INVITÉ se parcourt jusqu'au dernier octet (#10001,
 * #10029) — ce qui ne prouve pas que le fichier ne porte que du son (voir la
 * fin de ce commentaire).
 *
 * `matchesAudioSignature` (`ContentSignature.ts`) ne lit qu'un préfixe : deux
 * octets de synchro MPEG suivis de HTML, ou une vidéo MP4 déclarée audio,
 * passaient. Ce module parcourt le CONTENEUR jusqu'au dernier octet, sans
 * dépendance ni processus externe :
 *
 * - MP3 / ADTS : chaque trame est décodée (en-tête, débit, fréquence, longueur)
 *   et la suivante doit commencer exactement où la précédente finit, jusqu'à
 *   la fin du fichier — au moins deux trames ;
 * - MP4 / M4A : les boîtes de premier niveau couvrent le fichier exactement,
 *   et chaque piste déclarée est une piste SON (`hdlr` = `soun`) ;
 * - WebM : l'arbre EBML est parcouru (tailles inconnues de MediaRecorder
 *   comprises), toute piste est audio (`TrackType` = 2), aucune pièce jointe
 *   Matroska ;
 * - Ogg : chaque page est vérifiée (somme de contrôle comprise) et chaque flux
 *   logique ouvre sur un codec audio (Opus, Vorbis, FLAC, Speex) ;
 * - WAV : le bloc RIFF couvre le fichier exactement, ses sous-blocs sont des
 *   blocs audio connus, `fmt ` et `data` présents.
 *
 * Ce qui RESTE possible, et qu'il faut dire : ce parcours vérifie la FORME du
 * conteneur, jamais le SON. Une charge arbitraire peut se loger partout où il
 * ne lit pas les octets — l'intérieur d'une trame, d'une boîte `mdat` ou d'un
 * bloc Matroska, mais aussi les zones LIBRES qu'il saute : l'étiquette ID3v2
 * (`id3v2Length`, sans borne), les boîtes `free`, `skip`, `uuid`, `udta`,
 * `meta` et `wide` de premier niveau (`ISO_TOP_LEVEL_BOXES`, sans borne), les
 * éléments WebM `Tags` et `Chapters`, les blocs WAV `LIST` et `JUNK`,
 * l'étiquette ID3v1. Un `%PDF-` au début d'une trame fait un polyglotte PDF ; un
 * `ftyp` + `moov` sans échantillon est un « audio » sans son. Les métadonnées
 * (localisation `©xyz` d'un M4A iOS, ID3 `APIC`) sont servies telles quelles.
 * Le seul recours contre un polyglotte est la recherche d'une fin d'archive
 * ZIP dans la fenêtre où les lecteurs ZIP la cherchent.
 *
 * Seul un transcodage prouverait « rien d'autre que du son » (#10045). En
 * attendant, le pré-vol de World Wide nomme les cas démontrés et bloque la
 * production tant que le porteur ne les a pas acceptés (#10057,
 * `worldGuestAttachments.ts`).
 */

export type AudioContainer = 'mpeg' | 'adts' | 'iso-bmff' | 'webm' | 'ogg' | 'wav';

/**
 * Type PLAT, pas une union discriminée : le gateway compile sous
 * `strictNullChecks: false`, où un discriminant booléen ne se resserre pas
 * (même patron que `MessageAttachmentAdmission`). `ok: true` porte `container`,
 * `ok: false` porte `reason`.
 */
export type AudioDecodingVerdict = {
  readonly ok: boolean;
  readonly container?: AudioContainer;
  readonly reason?: string;
};

const refuse = (reason: string): AudioDecodingVerdict => ({ ok: false, reason });

// ─── MPEG audio (MP1/2/3) ───────────────────────────────────────────────────

const MPEG_BITRATES_KBPS: Readonly<Record<string, readonly number[]>> = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

const MPEG_SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/** Longueur de la trame MPEG qui commence à `offset`, ou `null` si l'en-tête n'en est pas une. */
function mpegFrameLength(buffer: Buffer, offset: number): number | null {
  if (offset + 4 > buffer.length) return null;
  const [b0, b1, b2] = [buffer[offset], buffer[offset + 1], buffer[offset + 2]];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return null;
  const layer = 4 - layerBits;
  const bitrateIndex = b2 >> 4;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null;
  const family = versionBits === 3 ? 1 : 2;
  const bitrate = MPEG_BITRATES_KBPS[`${family}-${layer}`][bitrateIndex] * 1000;
  const sampleRate = MPEG_SAMPLE_RATES[versionBits][sampleRateIndex];
  const padding = (b2 >> 1) & 0x01;
  if (layer === 1) return (Math.floor((12 * bitrate) / sampleRate) + padding) * 4;
  const coefficient = layer === 3 && family === 2 ? 72 : 144;
  return Math.floor((coefficient * bitrate) / sampleRate) + padding;
}

/** Taille d'une étiquette ID3v2 en tête, en-tête et pied compris — 0 sans étiquette. */
function id3v2Length(buffer: Buffer): number | null {
  if (buffer.length < 10 || buffer.toString('latin1', 0, 3) !== 'ID3') return 0;
  const sizeBytes = [buffer[6], buffer[7], buffer[8], buffer[9]];
  if (sizeBytes.some((byte) => byte >= 0x80)) return null;
  const size = sizeBytes.reduce((acc, byte) => (acc << 7) | byte, 0);
  const footer = (buffer[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** Fin des trames : la fin du fichier, ou le début d'une étiquette ID3v1 finale. */
function framedEnd(buffer: Buffer): number {
  const tagStart = buffer.length - 128;
  return tagStart >= 0 && buffer.toString('latin1', tagStart, tagStart + 3) === 'TAG' ? tagStart : buffer.length;
}

function walkFrames(
  buffer: Buffer,
  frameLength: (buffer: Buffer, offset: number) => number | null,
  container: AudioContainer,
): AudioDecodingVerdict {
  const start = id3v2Length(buffer);
  if (start === null || start > buffer.length) return refuse('invalid ID3v2 tag');
  const end = framedEnd(buffer);
  let offset = start;
  let frames = 0;
  while (offset < end) {
    const length = frameLength(buffer, offset);
    if (length === null || length <= 0 || offset + length > end) return refuse(`no valid ${container} frame at byte ${offset}`);
    offset += length;
    frames += 1;
  }
  return frames >= 2 ? { ok: true, container } : refuse('fewer than two audio frames');
}

// ─── ADTS (AAC brut) ────────────────────────────────────────────────────────

function adtsFrameLength(buffer: Buffer, offset: number): number | null {
  if (offset + 7 > buffer.length) return null;
  const [b0, b1, b2, b3, b4, b5] = [0, 1, 2, 3, 4, 5].map((index) => buffer[offset + index]);
  if (b0 !== 0xff || (b1 & 0xf6) !== 0xf0) return null;
  if (((b2 >> 2) & 0x0f) > 12) return null;
  const headerLength = (b1 & 0x01) === 1 ? 7 : 9;
  const frameLength = ((b3 & 0x03) << 11) | (b4 << 3) | (b5 >> 5);
  return frameLength > headerLength ? frameLength : null;
}

function isAdtsHeader(buffer: Buffer, offset: number): boolean {
  return offset + 2 <= buffer.length && buffer[offset] === 0xff && (buffer[offset + 1] & 0xf6) === 0xf0;
}

// ─── ISO base media (MP4 / M4A) ─────────────────────────────────────────────

const ISO_TOP_LEVEL_BOXES = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide', 'moof', 'mfra', 'sidx', 'styp', 'emsg', 'prft', 'pdin', 'udta', 'meta', 'uuid']);

type IsoBox = { readonly type: string; readonly start: number; readonly bodyStart: number; readonly end: number };

/** Les boîtes enfants de `[from, to)`, ou `null` si elles ne couvrent pas exactement l'intervalle. */
function isoBoxes(buffer: Buffer, from: number, to: number): readonly IsoBox[] | null {
  const boxes: IsoBox[] = [];
  let offset = from;
  while (offset < to) {
    if (offset + 8 > to) return null;
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const largeSize = size32 === 1;
    if (largeSize && offset + 16 > to) return null;
    const size = size32 === 0 ? to - offset : largeSize ? Number(buffer.readBigUInt64BE(offset + 8)) : size32;
    const headerLength = largeSize ? 16 : 8;
    if (size < headerLength || offset + size > to) return null;
    boxes.push({ type, start: offset, bodyStart: offset + headerLength, end: offset + size });
    offset += size;
  }
  return boxes;
}

function childBox(buffer: Buffer, parent: IsoBox, type: string): IsoBox | undefined {
  return isoBoxes(buffer, parent.bodyStart, parent.end)?.find((box) => box.type === type);
}

function trackHandler(buffer: Buffer, trak: IsoBox): string | null {
  const mdia = childBox(buffer, trak, 'mdia');
  const hdlr = mdia ? childBox(buffer, mdia, 'hdlr') : undefined;
  if (!hdlr || hdlr.bodyStart + 12 > hdlr.end) return null;
  return buffer.toString('latin1', hdlr.bodyStart + 8, hdlr.bodyStart + 12);
}

function decodeIsoBmff(buffer: Buffer): AudioDecodingVerdict {
  const boxes = isoBoxes(buffer, 0, buffer.length);
  if (!boxes || boxes.length === 0 || boxes[0].type !== 'ftyp') return refuse('ISO boxes do not cover the file');
  const foreign = boxes.find((box) => !ISO_TOP_LEVEL_BOXES.has(box.type));
  if (foreign) return refuse(`unexpected top-level box "${foreign.type}"`);
  const moov = boxes.filter((box) => box.type === 'moov');
  if (moov.length !== 1) return refuse('exactly one moov box is required');
  const moovChildren = isoBoxes(buffer, moov[0].bodyStart, moov[0].end);
  if (!moovChildren) return refuse('moov children do not cover the box');
  const handlers = moovChildren.filter((box) => box.type === 'trak').map((trak) => trackHandler(buffer, trak));
  if (handlers.length === 0) return refuse('no track');
  return handlers.every((handler) => handler === 'soun') ? { ok: true, container: 'iso-bmff' } : refuse('a track is not a sound track');
}

// ─── WebM / EBML ────────────────────────────────────────────────────────────

const EBML_HEADER = 0x1a45dfa3;
const EBML_DOCTYPE = 0x4282;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const CLUSTER = 0x1f43b675;
const SEGMENT_CHILDREN = new Set([0x114d9b74, 0x1549a966, TRACKS, CLUSTER, 0x1c53bb6b, 0x1043a770, 0x1254c367, 0xec, 0xbf]);
const CLUSTER_CHILDREN = new Set([0xe7, 0xa3, 0xa0, 0xa7, 0xab, 0x5854, 0xec, 0xbf]);
const TRACK_TYPE_AUDIO = 2;

type EbmlHeader = { readonly id: number; readonly dataStart: number; readonly size: number | null };

function vintLength(firstByte: number): number {
  for (let length = 1; length <= 8; length++) if (firstByte & (0x80 >> (length - 1))) return length;
  return 0;
}

function readEbmlHeader(buffer: Buffer, offset: number): EbmlHeader | null {
  if (offset >= buffer.length) return null;
  const idLength = vintLength(buffer[offset]);
  if (idLength === 0 || idLength > 4 || offset + idLength >= buffer.length) return null;
  const id = buffer.readUIntBE(offset, idLength);
  const sizeOffset = offset + idLength;
  const sizeLength = vintLength(buffer[sizeOffset]);
  if (sizeLength === 0 || sizeOffset + sizeLength > buffer.length) return null;
  const marker = 0xff >> sizeLength;
  const bytes = [buffer[sizeOffset] & marker, ...buffer.subarray(sizeOffset + 1, sizeOffset + sizeLength)];
  const unknown = bytes[0] === marker && bytes.slice(1).every((byte) => byte === 0xff);
  const size = bytes.reduce((acc, byte) => acc * 256 + byte, 0);
  return { id, dataStart: sizeOffset + sizeLength, size: unknown ? null : size };
}

function ebmlChildren(buffer: Buffer, from: number, to: number): readonly EbmlHeader[] | null {
  const children: EbmlHeader[] = [];
  let offset = from;
  while (offset < to) {
    const header = readEbmlHeader(buffer, offset);
    if (!header || header.size === null || header.dataStart + header.size > to) return null;
    children.push(header);
    offset = header.dataStart + header.size;
  }
  return children;
}

function ebmlUint(buffer: Buffer, element: EbmlHeader): number {
  return element.size === null || element.size === 0 || element.size > 6 ? -1 : buffer.readUIntBE(element.dataStart, element.size);
}

function webmTrackTypes(buffer: Buffer, tracks: EbmlHeader): readonly number[] | null {
  const entries = ebmlChildren(buffer, tracks.dataStart, tracks.dataStart + (tracks.size ?? 0));
  if (!entries) return null;
  return entries
    .filter((entry) => entry.id === TRACK_ENTRY)
    .map((entry) => {
      const fields = ebmlChildren(buffer, entry.dataStart, entry.dataStart + (entry.size ?? 0));
      const type = fields?.find((field) => field.id === TRACK_TYPE);
      return type ? ebmlUint(buffer, type) : -1;
    });
}

/** Fin d'un Cluster de taille inconnue : là où commence un élément qui n'en est pas un enfant. */
function unknownClusterEnd(buffer: Buffer, from: number, to: number): number | null {
  let offset = from;
  while (offset < to) {
    const header = readEbmlHeader(buffer, offset);
    if (!header) return null;
    if (!CLUSTER_CHILDREN.has(header.id)) return offset;
    if (header.size === null || header.dataStart + header.size > to) return null;
    offset = header.dataStart + header.size;
  }
  return offset;
}

function decodeWebm(buffer: Buffer): AudioDecodingVerdict {
  const header = readEbmlHeader(buffer, 0);
  if (!header || header.id !== EBML_HEADER || header.size === null) return refuse('missing EBML header');
  const headerEnd = header.dataStart + header.size;
  const headerFields = ebmlChildren(buffer, header.dataStart, headerEnd);
  const docType = headerFields?.find((field) => field.id === EBML_DOCTYPE);
  if (!docType || buffer.toString('latin1', docType.dataStart, docType.dataStart + (docType.size ?? 0)) !== 'webm') {
    return refuse('EBML DocType is not webm');
  }
  const segment = readEbmlHeader(buffer, headerEnd);
  if (!segment || segment.id !== SEGMENT) return refuse('missing Segment');
  const segmentEnd = segment.size === null ? buffer.length : segment.dataStart + segment.size;
  if (segmentEnd !== buffer.length) return refuse('data after the Segment');

  const trackTypes: number[] = [];
  let offset = segment.dataStart;
  while (offset < segmentEnd) {
    const element = readEbmlHeader(buffer, offset);
    if (!element || !SEGMENT_CHILDREN.has(element.id)) return refuse(`unexpected Segment element at byte ${offset}`);
    if (element.size === null) {
      if (element.id !== CLUSTER) return refuse('unknown size outside a Cluster');
      const end = unknownClusterEnd(buffer, element.dataStart, segmentEnd);
      if (end === null) return refuse(`malformed Cluster at byte ${offset}`);
      offset = end;
      continue;
    }
    const end = element.dataStart + element.size;
    if (end > segmentEnd) return refuse(`element overruns the Segment at byte ${offset}`);
    if (element.id === CLUSTER && unknownClusterEnd(buffer, element.dataStart, end) !== end) return refuse(`malformed Cluster at byte ${offset}`);
    if (element.id === TRACKS) {
      const types = webmTrackTypes(buffer, element);
      if (!types) return refuse('malformed Tracks');
      trackTypes.push(...types);
    }
    offset = end;
  }
  if (trackTypes.length === 0) return refuse('no track');
  return trackTypes.every((type) => type === TRACK_TYPE_AUDIO) ? { ok: true, container: 'webm' } : refuse('a track is not an audio track');
}

// ─── Ogg ────────────────────────────────────────────────────────────────────

const OGG_CRC_TABLE: readonly number[] = Array.from({ length: 256 }, (_, index) => {
  let crc = index << 24;
  for (let bit = 0; bit < 8; bit++) crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
  return crc >>> 0;
});

function oggPageCrc(page: Buffer): number {
  let crc = 0;
  for (let index = 0; index < page.length; index++) {
    const byte = index >= 22 && index < 26 ? 0 : page[index];
    crc = ((crc << 8) ^ OGG_CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  }
  return crc;
}

const OGG_AUDIO_CODEC_MAGICS: readonly Buffer[] = [
  Buffer.from('OpusHead', 'latin1'),
  Buffer.from('\x01vorbis', 'latin1'),
  Buffer.from('\x7fFLAC', 'latin1'),
  Buffer.from('Speex   ', 'latin1'),
];

function decodeOgg(buffer: Buffer): AudioDecodingVerdict {
  let offset = 0;
  let pages = 0;
  while (offset < buffer.length) {
    if (offset + 27 > buffer.length || buffer.toString('latin1', offset, offset + 4) !== 'OggS') return refuse(`no Ogg page at byte ${offset}`);
    if (buffer[offset + 4] !== 0 || (buffer[offset + 5] & 0xf8) !== 0) return refuse(`invalid Ogg page header at byte ${offset}`);
    const segmentCount = buffer[offset + 26];
    const tableEnd = offset + 27 + segmentCount;
    if (tableEnd > buffer.length) return refuse('truncated Ogg segment table');
    const bodyLength = buffer.subarray(offset + 27, tableEnd).reduce((sum, lacing) => sum + lacing, 0);
    const pageEnd = tableEnd + bodyLength;
    if (pageEnd > buffer.length) return refuse('truncated Ogg page');
    const page = buffer.subarray(offset, pageEnd);
    if (page.readUInt32LE(22) !== oggPageCrc(page)) return refuse(`Ogg checksum mismatch at byte ${offset}`);
    const beginsStream = (buffer[offset + 5] & 0x02) !== 0;
    if (beginsStream && !OGG_AUDIO_CODEC_MAGICS.some((magic) => buffer.subarray(tableEnd, tableEnd + magic.length).equals(magic))) {
      return refuse('an Ogg stream is not an audio codec');
    }
    if (pages === 0 && !beginsStream) return refuse('first Ogg page does not begin a stream');
    offset = pageEnd;
    pages += 1;
  }
  return pages >= 2 ? { ok: true, container: 'ogg' } : refuse('fewer than two Ogg pages');
}

// ─── WAV ────────────────────────────────────────────────────────────────────

const WAV_CHUNKS = new Set(['fmt ', 'data', 'fact', 'LIST', 'cue ', 'bext', 'id3 ', 'ID3 ', 'smpl', 'inst', 'PEAK', 'JUNK', 'junk', 'FLLR', 'iXML', 'acid', 'cart', 'plst']);

function decodeWav(buffer: Buffer): AudioDecodingVerdict {
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') {
    return refuse('missing RIFF/WAVE header');
  }
  if (8 + buffer.readUInt32LE(4) !== buffer.length) return refuse('RIFF size does not cover the file');
  const seen = new Set<string>();
  let offset = 12;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) return refuse('truncated WAV chunk');
    const id = buffer.toString('latin1', offset, offset + 4);
    if (!WAV_CHUNKS.has(id)) return refuse(`unexpected WAV chunk "${id}"`);
    const size = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > buffer.length) return refuse('WAV chunk overruns the file');
    seen.add(id);
    offset = end;
  }
  return seen.has('fmt ') && seen.has('data') ? { ok: true, container: 'wav' } : refuse('WAV without fmt and data chunks');
}

// ─── Polyglotte ZIP ─────────────────────────────────────────────────────────

/** La fenêtre où un lecteur ZIP cherche la fin du répertoire central : 22 octets + commentaire (≤ 65 535). */
const ZIP_EOCD_WINDOW = 22 + 0xffff;
const ZIP_EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

export function carriesZipTrailer(buffer: Buffer): boolean {
  return buffer.subarray(Math.max(0, buffer.length - ZIP_EOCD_WINDOW)).includes(ZIP_EOCD);
}

// ─── Aiguillage ─────────────────────────────────────────────────────────────

function decodeContainer(buffer: Buffer): AudioDecodingVerdict {
  const head = buffer.toString('latin1', 0, 4);
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === EBML_HEADER) return decodeWebm(buffer);
  if (buffer.length >= 8 && buffer.toString('latin1', 4, 8) === 'ftyp') return decodeIsoBmff(buffer);
  if (head === 'OggS') return decodeOgg(buffer);
  if (head === 'RIFF') return decodeWav(buffer);
  const start = id3v2Length(buffer);
  if (start === null) return refuse('invalid ID3v2 tag');
  if (isAdtsHeader(buffer, start)) return walkFrames(buffer, adtsFrameLength, 'adts');
  if (mpegFrameLength(buffer, start) !== null) return walkFrames(buffer, mpegFrameLength, 'mpeg');
  return refuse('no known audio container');
}

/** Le fichier ENTIER est-il un audio, et seulement un audio ? */
export function decodeAudioContent(buffer: Buffer): AudioDecodingVerdict {
  const verdict = decodeContainer(buffer);
  if (!verdict.ok) return verdict;
  return carriesZipTrailer(buffer) ? refuse('a ZIP archive hides in the audio') : verdict;
}

