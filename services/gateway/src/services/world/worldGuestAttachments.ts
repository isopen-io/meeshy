/**
 * Ce qu'un INVITÉ de World Wide peut joindre — vérifié par le COMPORTEMENT de
 * la garde déployée, jamais par un drapeau (audit adversarial de #10000, #10029).
 *
 * Depuis #10001, la garde n'ouvre aux invités de World Wide que le texte `.txt`
 * et l'audio dont le CONTENEUR est parcouru jusqu'au dernier octet
 * (`ContentSignature.ts`, `AudioContentDecoding.ts`). Avant elle, l'exemption
 * « voix » se méritait sur un en-tête : deux octets de synchro MPEG suivis de
 * HTML, ou une vidéo MP4 déclarée `audio/mp4`, passaient.
 *
 * Le pré-vol (`inspectWorldSeed`) soumet à la garde DEUX corpus, comme un
 * invité du lien semé le ferait :
 *
 * - les contenus DÉGUISÉS que la garde doit refuser : un seul qui passe bloque,
 *   sans recours ;
 * - les risques RÉSIDUELS que la garde laisse encore passer, nommés par l'audit
 *   adversarial de #10001 (commentaire de #10045) : une charge arbitraire logée
 *   là où le parcours du conteneur ne lit pas les octets (étiquette ID3v2, début
 *   d'une trame, boîte `free`), ou un conteneur sans aucun son. Le parcours ne
 *   prouve PAS « rien d'autre que du son » ; seul un transcodage le prouverait
 *   (#10045). Chacun bloque tant que le porteur ne l'a pas accepté par son nom
 *   (#10057) ; quand la garde se resserre, il sort de la liste de lui-même et ne
 *   demande plus rien.
 *
 * Ce corpus ne dit pas TOUT ce qui passe : il dit ce qui a été démontré. Les
 * autres zones libres connues (éléments WebM `Tags` et `Chapters`, blocs WAV
 * `LIST` et `JUNK`, étiquette ID3v1) relèvent du même risque et de la même
 * décision.
 *
 * C'est le témoin de fin de #10001 en production.
 */

import { WORLD_CONVERSATION_IDENTIFIER, WORLD_GUEST_ATTACHMENT_KINDS } from '@meeshy/shared/types/world';
import {
  classifyAnonymousAttachment,
  type AnonymousAttachmentVerdict,
  type ShareLinkAnonymousFlags,
} from '../attachments/ContentSignature';
import { WORLD_SHARE_LINK_TERMS } from './worldConversation';

export type GuestAttachmentGuard = (
  declaredMimeType: string,
  buffer: Buffer,
  shareLink: ShareLinkAnonymousFlags,
) => AnonymousAttachmentVerdict;

type DisguisedAttachment = {
  readonly label: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
};

const ascii = (text: string): Buffer => Buffer.from(text, 'latin1');

const DISGUISED_ATTACHMENTS: readonly DisguisedAttachment[] = [
  {
    label: 'mpeg-sync-html',
    mimeType: 'audio/mpeg',
    bytes: Buffer.concat([Buffer.from([0xff, 0xfb]), ascii('<html><script>alert(1)</script></html>')]),
  },
  {
    label: 'adts-sync-zip',
    mimeType: 'audio/aac',
    bytes: Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])]),
  },
  {
    label: 'mp4-video-as-audio',
    mimeType: 'audio/mp4',
    bytes: Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      ascii('ftypisom'),
      Buffer.from([0x00, 0x00, 0x02, 0x00]),
      ascii('isomiso2avc1mp41'),
      Buffer.from([0x00, 0x00, 0x00, 0x08]),
      ascii('moov'),
    ]),
  },
  {
    label: 'jpeg-as-octet-stream',
    mimeType: 'application/octet-stream',
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  },
  {
    label: 'mp3-frames-then-zip',
    mimeType: 'audio/mpeg',
    bytes: Buffer.concat([
      ...Array.from({ length: 3 }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)])),
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      Buffer.alloc(18),
    ]),
  },
  {
    label: 'jpeg-as-text',
    mimeType: 'text/plain',
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]),
  },
  { label: 'html', mimeType: 'text/html', bytes: ascii('<!doctype html><script>alert(1)</script>') },
  { label: 'svg', mimeType: 'image/svg+xml', bytes: ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') },
];

const MPEG_FRAME_BYTES = 417;

/** Une trame MPEG-1 Layer III à 128 kbit/s et 44,1 kHz, dont la charge est `payload` puis des zéros. */
const mpegFrame = (payload: Buffer = Buffer.alloc(0)): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), payload, Buffer.alloc(MPEG_FRAME_BYTES - 4 - payload.length)]);

const syncsafe = (size: number): Buffer => Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);

const isoBox = (type: string, body: Buffer): Buffer => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
};

const ARBITRARY_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16 * 1024, 0x41), Buffer.from([0xff, 0xd9])]);

const M4A_HEADER = Buffer.concat([
  isoBox('ftyp', Buffer.concat([ascii('M4A '), Buffer.alloc(4), ascii('isom')])),
  isoBox('moov', isoBox('trak', isoBox('mdia', isoBox('hdlr', Buffer.concat([Buffer.alloc(8), ascii('soun'), Buffer.alloc(12)]))))),
]);

const RESIDUAL_ATTACHMENTS: readonly DisguisedAttachment[] = [
  {
    label: 'id3v2-arbitrary-payload',
    mimeType: 'audio/mpeg',
    bytes: Buffer.concat([ascii('ID3'), Buffer.from([4, 0, 0]), syncsafe(ARBITRARY_JPEG.length), ARBITRARY_JPEG, mpegFrame(), mpegFrame()]),
  },
  {
    label: 'mpeg-frame-pdf-header',
    mimeType: 'audio/mpeg',
    bytes: Buffer.concat([mpegFrame(ascii('%PDF-1.4\n')), mpegFrame()]),
  },
  {
    label: 'mp4-free-box-payload',
    mimeType: 'audio/mp4',
    bytes: Buffer.concat([M4A_HEADER, isoBox('free', Buffer.alloc(64 * 1024, 0x42))]),
  },
  { label: 'mp4-without-samples', mimeType: 'audio/mp4', bytes: M4A_HEADER },
];

/** Ce que les chemins d'upload lisent du lien semé pour un invité de World Wide. */
const SEEDED_GUEST_DOOR: ShareLinkAnonymousFlags = {
  allowAnonymousFiles: WORLD_SHARE_LINK_TERMS.allowAnonymousFiles,
  allowAnonymousImages: WORLD_SHARE_LINK_TERMS.allowAnonymousImages,
  allowedAttachmentKinds: WORLD_GUEST_ATTACHMENT_KINDS,
  conversation: { identifier: WORLD_CONVERSATION_IDENTIFIER },
};

const admittedLabels = (corpus: readonly DisguisedAttachment[], guard: GuestAttachmentGuard): readonly string[] =>
  corpus.filter(({ mimeType, bytes }) => guard(mimeType, bytes, SEEDED_GUEST_DOOR).allowed).map(({ label }) => label);

/** Les contenus déguisés que la garde laisse joindre à un invité du lien semé — vide quand la porte tient. */
export function openWorldGuestAttachmentDoors(guard: GuestAttachmentGuard = classifyAnonymousAttachment): readonly string[] {
  return admittedLabels(DISGUISED_ATTACHMENTS, guard);
}

/** Les risques résiduels démontrés que la garde laisse encore joindre — vide quand elle les refuse tous (#10045). */
export function residualWorldGuestAttachmentDoors(guard: GuestAttachmentGuard = classifyAnonymousAttachment): readonly string[] {
  return admittedLabels(RESIDUAL_ATTACHMENTS, guard);
}
