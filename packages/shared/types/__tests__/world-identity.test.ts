import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as rules from '../guest-attachment-kind-rules';
import * as kinds from '../guest-attachment-kinds';
import * as world from '../world';
import * as identity from '../world-identity';

const source = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

/**
 * Les constantes de World Wide et les règles de familles se lisent SANS Zod
 * (#10038) : un client qui n'a besoin que d'un identifiant ne paie pas le
 * schéma complet de `GET /world`.
 */
describe('identité de World Wide et règles de familles, sans Zod (#10038)', () => {
  it('aucun des deux modules ne charge zod', () => {
    for (const name of ['world-identity.ts', 'guest-attachment-kind-rules.ts']) {
      expect(source(name)).not.toMatch(/from ['"]zod/);
    }
  });

  it('world.ts réexporte les mêmes constantes (rétrocompatible)', () => {
    expect(world.WORLD_CONVERSATION_IDENTIFIER).toBe(identity.WORLD_CONVERSATION_IDENTIFIER);
    expect(world.WORLD_CONVERSATION_TITLE).toBe(identity.WORLD_CONVERSATION_TITLE);
    expect(world.WORLD_SHARE_LINK_IDENTIFIER).toBe(identity.WORLD_SHARE_LINK_IDENTIFIER);
    expect(world.WORLD_GUEST_ATTACHMENT_KINDS).toBe(identity.WORLD_GUEST_ATTACHMENT_KINDS);
    expect(world.GUEST_ATTACHMENT_KIND_CEILINGS).toBe(identity.GUEST_ATTACHMENT_KIND_CEILINGS);
  });

  it('guest-attachment-kinds.ts réexporte les mêmes règles (rétrocompatible)', () => {
    expect(kinds.GUEST_ATTACHMENT_KINDS).toBe(rules.GUEST_ATTACHMENT_KINDS);
    expect(kinds.GUEST_ATTACHMENT_REFUSAL_CODES).toBe(rules.GUEST_ATTACHMENT_REFUSAL_CODES);
    expect(kinds.guestAttachmentKindOfMimeType).toBe(rules.guestAttachmentKindOfMimeType);
    expect(kinds.effectiveGuestAttachmentKinds).toBe(rules.effectiveGuestAttachmentKinds);
  });

  it('une famille se reconnaît sans schéma', () => {
    expect(['text', 'audio', 'image', 'pdf'].every(rules.isGuestAttachmentKind)).toBe(true);
    expect([undefined, null, 1, 'hologram', 'TEXT'].some(rules.isGuestAttachmentKind)).toBe(false);
  });

  it('l’entrée servie garde son avatar et sa bannière', () => {
    const entry = { identifier: 'world', title: 'World Wide', shareLinkIdentifier: 'mshy_world', avatar: 'https://a/x.png', banner: 'https://a/y.png' };
    expect(world.worldEntrySchema.parse(entry)).toEqual(entry);
  });
});
