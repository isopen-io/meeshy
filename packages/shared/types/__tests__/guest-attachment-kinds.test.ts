import { describe, expect, it } from 'vitest';

import {
  allowedAttachmentKindsSchema,
  effectiveGuestAttachmentKinds,
  guestAttachmentKindOfMimeType,
} from '../guest-attachment-kinds';
import { GUEST_ATTACHMENT_KIND_CEILINGS, WORLD_CONVERSATION_IDENTIFIER } from '../world';

describe('effectiveGuestAttachmentKinds', () => {
  it('un lien sans liste ne restreint pas par famille', () => {
    expect(effectiveGuestAttachmentKinds({ allowedAttachmentKinds: [], conversationIdentifier: 'team' }, GUEST_ATTACHMENT_KIND_CEILINGS)).toBeNull();
    expect(effectiveGuestAttachmentKinds({ conversationIdentifier: 'team' }, GUEST_ATTACHMENT_KIND_CEILINGS)).toBeNull();
  });

  it('un lien qui liste ses familles ne garde que les connues', () => {
    expect(effectiveGuestAttachmentKinds({ allowedAttachmentKinds: ['pdf', 'hologram', 'text'] })).toEqual(['text', 'pdf']);
    expect(effectiveGuestAttachmentKinds({ allowedAttachmentKinds: ['hologram'] })).toEqual([]);
  });

  it('World Wide est plafonnée par la conversation, même quand son lien ne dit rien', () => {
    const world = { conversationIdentifier: WORLD_CONVERSATION_IDENTIFIER };
    expect(effectiveGuestAttachmentKinds({ ...world, allowedAttachmentKinds: [] }, GUEST_ATTACHMENT_KIND_CEILINGS)).toEqual(['text', 'audio']);
    expect(effectiveGuestAttachmentKinds({ ...world, allowedAttachmentKinds: ['audio', 'image', 'pdf'] }, GUEST_ATTACHMENT_KIND_CEILINGS)).toEqual(['audio']);
  });

  it('la forme servie se valide : tableau de familles ou null', () => {
    expect(allowedAttachmentKindsSchema.parse(['text', 'audio'])).toEqual(['text', 'audio']);
    expect(allowedAttachmentKindsSchema.parse(null)).toBeNull();
    expect(allowedAttachmentKindsSchema.safeParse(['video']).success).toBe(false);
  });
});

describe('guestAttachmentKindOfMimeType', () => {
  it.each([
    ['text/plain', 'text'],
    ['text/plain; charset=utf-8', 'text'],
    ['audio/webm;codecs=opus', 'audio'],
    ['AUDIO/MP4', 'audio'],
    ['image/jpeg', 'image'],
    ['application/pdf', 'pdf'],
    ['image/svg+xml', null],
    ['text/html', null],
    ['video/mp4', null],
    ['', null],
  ])('%s → %s', (mimeType, kind) => {
    expect(guestAttachmentKindOfMimeType(mimeType)).toBe(kind);
  });
});
