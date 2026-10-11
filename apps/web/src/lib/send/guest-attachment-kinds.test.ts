import { describe, expect, test } from 'bun:test';

import {
  GUEST_ATTACHMENT_KINDS,
  GUEST_ATTACHMENT_KIND_EXTENSIONS,
  GUEST_ATTACHMENT_MAX_BYTES,
  GUEST_ATTACHMENT_REFUSAL_CODES,
  guestAttachmentKindOfMimeType,
} from '@meeshy/shared/types/guest-attachment-kinds';
import { WORLD_GUEST_ATTACHMENT_KINDS, WORLD_SHARE_LINK_IDENTIFIER } from '@meeshy/shared/types/world';

import {
  GUEST_KINDS,
  GUEST_KIND_EXTENSIONS,
  GUEST_KIND_MAX_BYTES,
  GUEST_KIND_REFUSAL_CODES,
  WORLD_GUEST_KINDS,
  WORLD_LINK_IDENTIFIER,
  guestKindOfMimeType,
} from './guest-attachment-kinds';

/** Chaque jumelle web rougit au premier écart avec sa source partagée. */
describe('les familles de pièces jointes d’un invité — jumelles de @meeshy/shared', () => {
  test('les familles', () => {
    expect([...GUEST_KINDS]).toEqual([...GUEST_ATTACHMENT_KINDS]);
  });

  test('le plafond de taille', () => {
    expect(GUEST_KIND_MAX_BYTES).toBe(GUEST_ATTACHMENT_MAX_BYTES);
  });

  test('les extensions', () => {
    expect(GUEST_KIND_EXTENSIONS).toEqual(GUEST_ATTACHMENT_KIND_EXTENSIONS);
  });

  test('les codes de refus', () => {
    expect(GUEST_KIND_REFUSAL_CODES).toEqual(GUEST_ATTACHMENT_REFUSAL_CODES);
  });

  test('la clé de World Wide et son plafond', () => {
    expect(WORLD_LINK_IDENTIFIER).toBe(WORLD_SHARE_LINK_IDENTIFIER);
    expect([...WORLD_GUEST_KINDS]).toEqual([...WORLD_GUEST_ATTACHMENT_KINDS]);
  });

  test('la famille déclarée par un type MIME', () => {
    const samples = ['text/plain', 'text/plain; charset=utf-8', 'audio/mpeg', 'AUDIO/MP4', 'image/png', 'image/svg+xml', 'application/pdf', 'video/mp4', '', 'text/vcard'];
    for (const mime of samples) expect(guestKindOfMimeType(mime)).toBe(guestAttachmentKindOfMimeType(mime));
  });
});
