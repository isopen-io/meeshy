import { describe, expect, test } from 'bun:test';

import type { ConversationMember } from '@/lib/api/conversation-members';

import type { CallMember } from './call-store';
import { spotlight } from './call-view';
import { callRoles, canRemoveFromCall, removeFromCall } from './call-moderation';

/**
 * LA GRILLE D'UN APPEL DE GROUPE (#3721, parité I2 / I3) — mettre un
 * participant en avant, et le retirer de l'appel quand on modère la
 * conversation. Le rang se lit dans la hiérarchie partagée
 * (`MEMBER_ROLE_HIERARCHY`), la même que la route serveur applique.
 */

const member = (userId: string): CallMember => ({ userId, name: userId, avatar: null, micMuted: false, cameraOn: false, link: 'connected' });

describe('mettre un participant en avant', () => {
  test('le participant choisi passe devant, les autres gardent leur ordre', () => {
    const view = spotlight([member('a'), member('b'), member('c')], 'b');
    expect(view?.featured.userId).toBe('b');
    expect(view?.others.map((m) => m.userId)).toEqual(['a', 'c']);
  });

  test('sans choix, ou quand le participant choisi est parti, la grille revient', () => {
    expect(spotlight([member('a')], null)).toBeNull();
    expect(spotlight([member('a')], 'parti')).toBeNull();
  });
});

describe('qui peut retirer qui', () => {
  test('un modérateur retire un membre, pas un pair de même rang ni un rang supérieur', () => {
    expect(canRemoveFromCall('moderator', 'member')).toBe(true);
    expect(canRemoveFromCall('moderator', 'moderator')).toBe(false);
    expect(canRemoveFromCall('moderator', 'admin')).toBe(false);
    expect(canRemoveFromCall('creator', 'admin')).toBe(true);
  });

  test('un membre ne retire personne, et un rang inconnu ne donne aucun droit', () => {
    expect(canRemoveFromCall('member', 'member')).toBe(false);
    expect(canRemoveFromCall(undefined, 'member')).toBe(false);
    expect(canRemoveFromCall('bigboss', 'member')).toBe(false);
  });

  test('la casse du rang servi ne change rien', () => {
    expect(canRemoveFromCall('ADMIN', 'MEMBER')).toBe(true);
  });
});

describe('les rangs de la conversation, par clé d’appel', () => {
  const conversationMember = (overrides: Partial<ConversationMember>): ConversationMember => ({
    id: 'p-1',
    userId: 'u-1',
    username: 'u1',
    displayName: 'U1',
    avatar: undefined,
    role: 'member',
    ...overrides,
  });

  test('un inscrit par son compte, un invité par son participant', () => {
    const roles = callRoles([conversationMember({ userId: 'u-mod', role: 'moderator' }), conversationMember({ id: 'p-guest', userId: null })]);
    expect(roles.get('u-mod')).toBe('moderator');
    expect(roles.get('p-guest')).toBe('member');
  });

  test('sans liste chargée, aucun rang', () => {
    expect(callRoles(undefined).size).toBe(0);
  });
});

describe('retirer de l’appel', () => {
  const transport = (ok: boolean) => {
    const sent: Array<{ method: string; path: string }> = [];
    return {
      sent,
      deps: {
        source: 'api' as const,
        transport: {
          request: async <T>(request: { method: string; path: string }) => {
            sent.push({ method: request.method, path: request.path });
            return (ok ? { ok: true, data: null } : { ok: false, error: { status: 403, message: 'PERMISSION_DENIED' } }) as never as T;
          },
        },
      },
    };
  };

  test('la requête vise le participant dans CET appel', async () => {
    const t = transport(true);
    expect(await removeFromCall(t.deps as never, { callId: 'call 1', userId: 'u-2' })).toBe(true);
    expect(t.sent).toEqual([{ method: 'DELETE', path: '/api/v1/calls/call%201/participants/u-2' }]);
  });

  test('un refus du serveur est rendu, pas avalé', async () => {
    expect(await removeFromCall(transport(false).deps as never, { callId: 'c', userId: 'u' })).toBe(false);
  });
});
