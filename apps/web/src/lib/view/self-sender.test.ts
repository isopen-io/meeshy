import { describe, expect, test } from 'bun:test';

import type { Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import { initialsOf } from '@/lib/view/conversation';

import { selfSenderOf } from './self-sender';

/**
 * L'AUTEUR D'UN ENVOI EN VOL EST LE LECTEUR (#10120).
 *
 * Un invité de World Wide entré sous « Recette QA 063842 » voyait sa ligne
 * « Vous » sans auteur pendant l'envoi (repli « Vous » → « VO »), puis sous le
 * pseudo `ano_RecetteQA063842` que sa ligne de participant porte (« AR »). Son
 * envoi en vol porte désormais le nom qu'il a donné, celui que la passerelle
 * sert ensuite — mêmes initiales du premier au dernier rendu.
 */

const participant = (overrides: Partial<Participant>): Participant => ({
  id: 'p-ligne',
  conversationId: 'c-world',
  type: 'user',
  displayName: 'Ligne',
  role: 'member',
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  isOnline: false,
  joinedAt: new Date('2026-10-11T09:00:00.000Z'),
  ...overrides,
});

const INVITE: Viewer = { id: 'p-invite', handle: null, displayName: 'Recette QA 063842', isAnonymous: true };
const COMPTE: Viewer = { id: 'u-amina', handle: 'amina', displayName: 'Amina Diallo', isAnonymous: false };

describe('selfSenderOf', () => {
  test("l'invité est sa ligne de participant, sous le nom qu'il a donné", () => {
    const rows = [participant({ id: 'p-invite', type: 'anonymous', displayName: 'ano_RecetteQA063842' })];
    const sender = selfSenderOf({ participants: rows, viewer: INVITE });
    expect(sender?.id).toBe('p-invite');
    expect(sender?.displayName).toBe('Recette QA 063842');
    expect(initialsOf(sender?.displayName ?? '')).toBe('RQ');
  });

  test('un compte est la ligne de son compte, telle quelle', () => {
    const own = participant({ id: 'p-amina', userId: 'u-amina', displayName: 'Amina Diallo' });
    expect(selfSenderOf({ participants: [participant({}), own], viewer: COMPTE })).toBe(own);
  });

  test("sans ligne à lui, l'envoi part sans auteur", () => {
    expect(selfSenderOf({ participants: [participant({})], viewer: INVITE })).toBeUndefined();
    expect(selfSenderOf({ participants: undefined, viewer: COMPTE })).toBeUndefined();
  });
});
