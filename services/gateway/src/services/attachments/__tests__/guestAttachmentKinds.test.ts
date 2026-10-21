/**
 * #10001 — un invité de World Wide ne joint que du texte `.txt` et de l'audio,
 * et chaque famille se MÉRITE par le contenu entier, jamais par l'extension ni
 * par le type déclaré (#10029). Les liens qui ne listent aucune famille gardent
 * le comportement d'avant.
 */

import { describe, expect, it } from '@jest/globals';
import { GUEST_ATTACHMENT_REFUSAL_CODES, GUEST_ATTACHMENT_MAX_BYTES } from '@meeshy/shared/types/guest-attachment-kinds';
import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world';
import { classifyAnonymousAttachment, type ShareLinkAnonymousFlags } from '../ContentSignature';
import { openWorldGuestAttachmentDoors, residualWorldGuestAttachmentDoors } from '../../world/worldGuestAttachments';
import {
  EMPTY_ZIP,
  JPEG_PHOTO,
  PDF_DOCUMENT,
  PLAIN_TEXT,
  adtsFrames,
  m4aVoice,
  m4aWithZipInLastBox,
  mp3Frames,
  mp3WithId3,
  mp4Video,
  oggOpusVoice,
  oggTheoraVideo,
  wavPcm,
  webmVideo,
  webmVoice,
} from './guest-attachment-fixtures';

const worldGuestLink = (overrides: Partial<ShareLinkAnonymousFlags> = {}): ShareLinkAnonymousFlags => ({
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  allowedAttachmentKinds: ['text', 'audio'],
  conversation: { identifier: WORLD_CONVERSATION_IDENTIFIER },
  ...overrides,
});

const classifyForWorld = (mimeType: string, bytes: Buffer, fileName?: string, link = worldGuestLink()) =>
  classifyAnonymousAttachment(mimeType, bytes, link, { fileName });

describe('invité de World Wide — ce qui passe', () => {
  it.each([
    ['un fichier texte UTF-8 .txt', 'text/plain', PLAIN_TEXT, 'notes.txt'],
    ['un texte déclaré avec son jeu de caractères', 'text/plain; charset=utf-8', PLAIN_TEXT, 'notes.txt'],
    ['un vocal iOS (M4A)', 'audio/mp4', m4aVoice(), 'voice.m4a'],
    ['un vocal web Chrome (WebM Opus)', 'audio/webm', webmVoice(), 'voice.webm'],
    ['un vocal web Firefox (Ogg Opus)', 'audio/ogg', oggOpusVoice(), 'voice.ogg'],
    ['un MP3 sans étiquette', 'audio/mpeg', mp3Frames(5), 'song.mp3'],
    ['un MP3 étiqueté ID3', 'audio/mpeg', mp3WithId3(5), 'song.mp3'],
    ['un AAC brut ADTS', 'audio/aac', adtsFrames(4), 'clip.aac'],
    ['un WAV PCM', 'audio/wav', wavPcm(), 'clip.wav'],
  ])('accepte %s', (_label, mimeType, bytes, fileName) => {
    expect(classifyForWorld(mimeType, bytes, fileName)).toEqual({ allowed: true });
  });

  it('accepte un vocal même quand le lien semé ne liste encore aucune famille — le plafond est sur la conversation', () => {
    expect(classifyForWorld('audio/webm', webmVoice(), 'voice.webm', worldGuestLink({ allowedAttachmentKinds: [] }))).toEqual({
      allowed: true,
    });
  });
});

describe('invité de World Wide — ce qui est refusé, avec un code stable', () => {
  const refused = { allowed: false, code: GUEST_ATTACHMENT_REFUSAL_CODES.KIND_NOT_ALLOWED };

  it.each([
    ['un PDF', 'application/pdf', PDF_DOCUMENT, 'doc.pdf'],
    ['une photo JPEG', 'image/jpeg', JPEG_PHOTO, 'photo.jpg'],
    ['un JPEG renommé .txt', 'text/plain', JPEG_PHOTO, 'photo.txt'],
    ['un PDF renommé .txt', 'text/plain', PDF_DOCUMENT, 'doc.txt'],
    ['une archive ZIP', 'application/zip', EMPTY_ZIP, 'a.zip'],
    ['une archive ZIP renommée .txt', 'text/plain', EMPTY_ZIP, 'a.txt'],
    ['un texte valide portant une autre extension', 'text/plain', PLAIN_TEXT, 'page.html'],
    ['un texte valide sans extension', 'text/plain', PLAIN_TEXT, 'notes'],
    ['un texte valide au nom vide', 'text/plain', PLAIN_TEXT, ''],
    ['un audio réel au nom vide', 'audio/mpeg', mp3Frames(5), ''],
    ['un texte déclaré text/html', 'text/html', PLAIN_TEXT, 'page.txt'],
    ['un texte avec un octet NUL', 'text/plain', Buffer.from('abc\u0000def'), 'a.txt'],
    ['un texte en UTF-8 invalide', 'text/plain', Buffer.from([0x61, 0xc3, 0x28, 0x62]), 'a.txt'],
    ['une vidéo MP4 déclarée audio', 'audio/mp4', mp4Video(), 'clip.m4a'],
    ['une vidéo WebM déclarée audio', 'audio/webm', webmVideo(), 'clip.webm'],
    ['une vidéo Ogg Theora déclarée audio', 'audio/ogg', oggTheoraVideo(), 'clip.ogg'],
    ['deux octets de synchro MPEG suivis de HTML', 'audio/mpeg', Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.from('<html><script>alert(1)</script></html>')]), 'x.mp3'],
    ['une seule trame MPEG', 'audio/mpeg', mp3Frames(1), 'x.mp3'],
    ['un polyglotte : trames MP3 réelles suivies d’une archive', 'audio/mpeg', Buffer.concat([mp3Frames(5), EMPTY_ZIP]), 'x.mp3'],
    ['un polyglotte : M4A réel suivi d’une archive', 'audio/mp4', Buffer.concat([m4aVoice(), EMPTY_ZIP]), 'x.m4a'],
    ['un polyglotte : archive logée au bout de la dernière boîte d’un M4A', 'audio/mp4', m4aWithZipInLastBox(), 'x.m4a'],
    ['un polyglotte : WebM réel suivi d’une archive', 'audio/webm', Buffer.concat([webmVoice(), EMPTY_ZIP]), 'x.webm'],
    ['un polyglotte : Ogg réel suivi d’une archive', 'audio/ogg', Buffer.concat([oggOpusVoice(), EMPTY_ZIP]), 'x.ogg'],
    ['un polyglotte : WAV réel suivi d’une archive', 'audio/wav', Buffer.concat([wavPcm(), EMPTY_ZIP]), 'x.wav'],
    ['un audio réel portant une extension d’image', 'audio/mpeg', mp3Frames(5), 'photo.jpg'],
    ['un audio réel déclaré text/plain', 'text/plain', mp3Frames(5), 'a.txt'],
  ])('refuse %s', (_label, mimeType, bytes, fileName) => {
    expect(classifyForWorld(mimeType, bytes, fileName)).toMatchObject(refused);
  });

  it('refuse un fichier au-delà du plafond des invités, avec son propre code', () => {
    const oversized = Buffer.alloc(GUEST_ATTACHMENT_MAX_BYTES + 1, 0x61);
    expect(classifyForWorld('text/plain', oversized, 'big.txt')).toMatchObject({
      allowed: false,
      code: GUEST_ATTACHMENT_REFUSAL_CODES.TOO_LARGE,
    });
  });

  it('juge un texte au plafond sans geler la passerelle — ni un tableau par caractère, ni une seconde de boucle bloquée', () => {
    const atCeiling = Buffer.alloc(GUEST_ATTACHMENT_MAX_BYTES, 'é la vie est belle\n');
    const elapsed = (work: () => unknown): number => {
      const started = performance.now();
      work();
      return performance.now() - started;
    };
    const rounds = Array.from({ length: 7 }, () => ({
      decode: elapsed(() => new TextDecoder('utf-8').decode(atCeiling)),
      classify: elapsed(() => classifyForWorld('text/plain', atCeiling, 'long.txt')),
    }));
    const decodeOnly = Math.min(...rounds.map((round) => round.decode));
    const classified = Math.min(...rounds.map((round) => round.classify));

    expect(classifyForWorld('text/plain', atCeiling, 'long.txt')).toEqual({ allowed: true });
    expect(classified).toBeLessThan(1000);
    expect(classified).toBeLessThan(decodeOnly * 8);
  });

  it.each([
    ['un caractère de contrôle C0 (échappement)', 'abc\u001bdef'],
    ['un caractère de contrôle C1', 'abc\u0085def'],
    ['le caractère DEL', 'abc\u007fdef'],
    ['une tabulation verticale', 'abc\u000bdef'],
  ])('refuse un texte portant %s', (_label, text) => {
    expect(classifyForWorld('text/plain', Buffer.from(text, 'utf-8'), 'a.txt')).toMatchObject(refused);
  });

  it('accepte un texte à tabulations, sauts de page et fins de ligne Windows', () => {
    expect(classifyForWorld('text/plain', Buffer.from('a\tb\fc\r\nd', 'utf-8'), 'a.txt')).toEqual({ allowed: true });
  });

  it('ne laisse pas un lien de World Wide rouvrir une famille que la conversation ne permet pas', () => {
    expect(classifyForWorld('application/pdf', PDF_DOCUMENT, 'doc.pdf', worldGuestLink({ allowedAttachmentKinds: ['pdf', 'image'] }))).toMatchObject(
      refused,
    );
  });

  it('le pré-vol du seed ne trouve plus aucune porte ouverte', () => {
    expect(openWorldGuestAttachmentDoors()).toEqual([]);
  });

  it('la garde laisse encore passer les quatre risques résiduels de l’audit, que le pré-vol nomme au porteur (#10045, #10057)', () => {
    expect(residualWorldGuestAttachmentDoors()).toEqual([
      'id3v2-arbitrary-payload',
      'mpeg-frame-pdf-header',
      'mp4-free-box-payload',
      'mp4-without-samples',
    ]);
  });
});

describe('les autres liens', () => {
  it('un lien sans liste garde le comportement d’avant : image acceptée quand le lien l’ouvre', () => {
    const legacy: ShareLinkAnonymousFlags = { allowAnonymousFiles: false, allowAnonymousImages: true, conversation: { identifier: 'team' } };
    expect(classifyAnonymousAttachment('image/jpeg', JPEG_PHOTO, legacy)).toEqual({ allowed: true });
  });

  it('un lien qui liste ses familles décide seul, sur le contenu : PDF admis, image refusée', () => {
    const restricted: ShareLinkAnonymousFlags = {
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowedAttachmentKinds: ['pdf'],
      conversation: { identifier: 'team' },
    };
    expect(classifyAnonymousAttachment('application/pdf', PDF_DOCUMENT, restricted, { fileName: 'doc.pdf' })).toEqual({ allowed: true });
    expect(classifyAnonymousAttachment('image/jpeg', JPEG_PHOTO, restricted, { fileName: 'p.jpg' })).toMatchObject({ allowed: false });
  });

  it('une liste qui ne nomme que des familles inconnues n’ouvre rien', () => {
    const unknownOnly: ShareLinkAnonymousFlags = {
      allowAnonymousFiles: true,
      allowAnonymousImages: true,
      allowedAttachmentKinds: ['hologram'],
      conversation: { identifier: 'team' },
    };
    expect(classifyAnonymousAttachment('text/plain', PLAIN_TEXT, unknownOnly, { fileName: 'a.txt' })).toMatchObject({ allowed: false });
  });
});
