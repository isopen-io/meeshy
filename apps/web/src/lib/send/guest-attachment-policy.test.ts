import { describe, expect, test } from 'bun:test';

import { GUEST_ATTACHMENT_MAX_BYTES } from '@meeshy/shared/types/guest-attachment-kinds';
import { WORLD_GUEST_ATTACHMENT_KINDS, WORLD_SHARE_LINK_IDENTIFIER } from '@meeshy/shared/types/world';

import type { GuestIdentity, SessionState } from '@/lib/api/session';

import { guestAcceptAttribute, guestAttachmentKindsFor, guestAttachmentVerdict } from './guest-attachment-policy';

/**
 * CE QU'UN INVITÉ PEUT JOINDRE (#10003, planche « Attach ») — la règle que le
 * sélecteur, le dépôt et le collage appliquent AVANT que la passerelle ne juge
 * le contenu réel (#10001). Le serveur reste l'autorité ; le client n'OFFRE que
 * les portes ouvertes, et dit pourquoi une autre ne l'est pas.
 */

const guest = (overrides: Partial<GuestIdentity> = {}): GuestIdentity => ({
  participantId: 'p-1',
  nickname: 'Awa',
  conversationId: 'c-world',
  link: 'mshy_some_link',
  mayWrite: true,
  ...overrides,
});

const guestSession = (identity: GuestIdentity): SessionState => ({
  status: 'guest',
  sessionToken: 'anon_token',
  guest: identity,
  expiresAt: Date.now() + 3_600_000,
});

const account: SessionState = {
  status: 'authenticated',
  user: { id: 'u-1', username: 'awa', displayName: 'Awa', avatar: '' },
  token: 'jwt',
  sessionToken: 'session',
  expiresAt: Date.now() + 3_600_000,
};

const file = (name: string, type: string, size = 10): File => {
  const made = new File(['x'], name, { type });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};

describe('guestAttachmentKindsFor — les familles qui gouvernent CE fil', () => {
  test('un compte n’est jamais restreint par famille', () => {
    expect(guestAttachmentKindsFor(account, 'c-world')).toBeNull();
  });

  test('l’invité de ce fil reçoit les familles servies à sa jonction', () => {
    const session = guestSession(guest({ attachmentKinds: ['text', 'audio'] }));
    expect(guestAttachmentKindsFor(session, 'c-world')).toEqual(['text', 'audio']);
  });

  test('un lien qui ne restreint rien (null) laisse les droits d’avant décider', () => {
    expect(guestAttachmentKindsFor(guestSession(guest({ attachmentKinds: null })), 'c-world')).toBeNull();
  });

  test('l’identité d’une AUTRE conversation ne gouverne pas ce fil', () => {
    const session = guestSession(guest({ attachmentKinds: ['text'] }));
    expect(guestAttachmentKindsFor(session, 'c-other')).toBeNull();
  });

  test('une session World Wide enregistrée AVANT le champ prend le plafond .txt et audio', () => {
    const session = guestSession(guest({ link: WORLD_SHARE_LINK_IDENTIFIER }));
    expect(guestAttachmentKindsFor(session, 'c-world')).toEqual([...WORLD_GUEST_ATTACHMENT_KINDS]);
  });

  test('des familles plus larges servies sur World Wide sont resserrées au plafond', () => {
    const session = guestSession(guest({ link: WORLD_SHARE_LINK_IDENTIFIER, attachmentKinds: ['text', 'audio', 'image', 'pdf'] }));
    expect(guestAttachmentKindsFor(session, 'c-world')).toEqual(['text', 'audio']);
  });

  test('une famille enregistrée que ce client ne connaît pas n’ouvre rien — fail-closed', () => {
    const session = guestSession(guest({ attachmentKinds: ['exe', 'text'] }));
    expect(guestAttachmentKindsFor(session, 'c-world')).toEqual(['text']);
  });
});

describe('guestAcceptAttribute — le sélecteur ne propose que les familles ouvertes', () => {
  test('texte : .txt seulement', () => {
    expect(guestAcceptAttribute(['text']).split(',')).toEqual(['.txt', 'text/plain']);
  });

  test('audio : les types audio et leurs extensions', () => {
    const accept = guestAcceptAttribute(['audio']).split(',');
    expect(accept).toContain('audio/*');
    expect(accept).toContain('.mp3');
    expect(accept).toContain('.m4a');
    expect(accept).not.toContain('.txt');
  });
});

describe('guestAttachmentVerdict — ce qui passe, et pourquoi le reste ne passe pas', () => {
  const kinds = ['text', 'audio'] as const;

  test('un .txt passe', () => {
    expect(guestAttachmentVerdict(file('notes.txt', 'text/plain'), kinds)).toEqual({ ok: true });
  });

  test('un .txt sans type déclaré passe par son extension', () => {
    expect(guestAttachmentVerdict(file('notes.txt', ''), kinds)).toEqual({ ok: true });
  });

  test('un audio passe', () => {
    expect(guestAttachmentVerdict(file('voix.m4a', 'audio/mp4'), kinds)).toEqual({ ok: true });
  });

  test('un PDF est refusé pour sa famille', () => {
    expect(guestAttachmentVerdict(file('guide.pdf', 'application/pdf'), kinds)).toEqual({ ok: false, reason: 'kind' });
  });

  test('une image est refusée quand la famille image n’est pas ouverte', () => {
    expect(guestAttachmentVerdict(file('plage.jpg', 'image/jpeg'), kinds)).toEqual({ ok: false, reason: 'kind' });
  });

  test('un .txt déguisé en autre chose par son type reste refusé', () => {
    expect(guestAttachmentVerdict(file('notes.txt', 'application/pdf'), kinds)).toEqual({ ok: false, reason: 'kind' });
  });

  test('au-delà du plafond, le fichier est refusé pour sa taille', () => {
    expect(guestAttachmentVerdict(file('long.mp3', 'audio/mpeg', GUEST_ATTACHMENT_MAX_BYTES + 1), kinds)).toEqual({
      ok: false,
      reason: 'size',
    });
  });
});
