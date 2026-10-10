/**
 * Ce qu'un INVITÉ de World Wide peut joindre — vérifié par le COMPORTEMENT de
 * la garde déployée, jamais par un drapeau (audit adversarial de #10000, #10029).
 *
 * Depuis #10001, la garde n'ouvre aux invités de World Wide que le texte `.txt`
 * et l'audio DÉCODÉ de bout en bout (`ContentSignature.ts`,
 * `AudioContentDecoding.ts`). Avant elle, l'exemption « voix » se méritait sur
 * un en-tête : deux octets de synchro MPEG suivis de HTML, ou une vidéo MP4
 * déclarée `audio/mp4`, passaient. Le pré-vol (`inspectWorldSeed`) soumet donc
 * ces contenus déguisés à la garde, comme un invité du lien semé le ferait, et
 * BLOQUE tant qu'un seul passe : poser `WORLD_SEED_ENABLED=true` en production
 * reste interdit tant que la garde laisse entrer un contenu arbitraire.
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

/** Ce que les chemins d'upload lisent du lien semé pour un invité de World Wide. */
const SEEDED_GUEST_DOOR: ShareLinkAnonymousFlags = {
  allowAnonymousFiles: WORLD_SHARE_LINK_TERMS.allowAnonymousFiles,
  allowAnonymousImages: WORLD_SHARE_LINK_TERMS.allowAnonymousImages,
  allowedAttachmentKinds: WORLD_GUEST_ATTACHMENT_KINDS,
  conversation: { identifier: WORLD_CONVERSATION_IDENTIFIER },
};

/** Les contenus déguisés que la garde laisse joindre à un invité du lien semé — vide quand la porte tient. */
export function openWorldGuestAttachmentDoors(guard: GuestAttachmentGuard = classifyAnonymousAttachment): readonly string[] {
  return DISGUISED_ATTACHMENTS.filter(({ mimeType, bytes }) => guard(mimeType, bytes, SEEDED_GUEST_DOOR).allowed).map(
    ({ label }) => label,
  );
}
