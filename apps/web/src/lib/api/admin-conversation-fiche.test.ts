import { describe, expect, test } from 'bun:test';

import {
  adminConversationFicheKey,
  adminConversationMembersKey,
  adminConversationMembersRootKey,
  decodeAdminConversationFiche,
  decodeAdminConversationMember,
  loadAdminConversationFiche,
  loadAdminConversationMembers,
} from './admin-conversation-fiche';
import { estClefSouveraine } from './souverain';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * **LA FICHE D'UNE CONVERSATION ET SES MEMBRES** (#8876) — les décodeurs, champ
 * par champ : les réglages reprennent le décodeur partagé (défauts du schéma
 * compris), la communauté et la personne qui a fermé sont NOMMÉES, l'aperçu des
 * membres est celui de la liste, et un champ que la passerelle ne sert pas
 * n'entre pas dans le type.
 */
const OBJECT_ID = (n: number) => n.toString(16).padStart(24, '0');

const SERVED_FICHE = {
  id: OBJECT_ID(1),
  identifier: 'mshy_atelier',
  title: 'Atelier du jeudi',
  description: 'Le groupe du jeudi soir',
  type: 'group',
  avatar: 'https://cdn.test/atelier.png',
  banner: null,
  isActive: true,
  closedAt: '2026-09-20T09:00:00.000Z',
  communityId: OBJECT_ID(2),
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-28T10:00:00.000Z',
  lastMessageAt: '2026-09-29T18:30:00.000Z',
  memberCount: 7,
  messageCount: 1204,
  settings: { defaultWriteRole: 'member', isAnnouncementChannel: false, slowModeSeconds: 30, autoTranslateEnabled: true, encryptionMode: 'server' },
  community: { id: OBJECT_ID(2), name: 'Lycée Njanda', identifier: 'lycee-njanda' },
  closedBy: { id: OBJECT_ID(3), username: 'awa', displayName: 'Awa Diop', avatar: null, email: 'secret@x.test' },
  participantsPreview: [
    { id: OBJECT_ID(11), userId: OBJECT_ID(21), type: 'user', displayName: 'Awa Diop', avatar: null, role: 'creator', joinedAt: '2026-08-01T10:00:00.000Z', isActive: true },
    { id: OBJECT_ID(12), userId: null, type: 'anonymous', displayName: 'Invité', avatar: null, role: 'member', joinedAt: null, isActive: true },
  ],
  shareLinkCount: 2,
  agentEnabled: true,
  secret: 'jamais',
};

describe('decodeAdminConversationFiche — champ par champ, forme figée', () => {
  test('rend la fiche : réglages, communauté nommée, fermeture nommée, aperçu, liens, agent', () => {
    expect(decodeAdminConversationFiche(SERVED_FICHE)).toEqual({
      id: OBJECT_ID(1),
      identifier: 'mshy_atelier',
      title: 'Atelier du jeudi',
      description: 'Le groupe du jeudi soir',
      type: 'group',
      avatar: 'https://cdn.test/atelier.png',
      banner: null,
      isActive: true,
      closedAt: '2026-09-20T09:00:00.000Z',
      closedBy: { id: OBJECT_ID(3), username: 'awa', displayName: 'Awa Diop', avatar: null },
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
      lastMessageAt: '2026-09-29T18:30:00.000Z',
      memberCount: 7,
      messageCount: 1204,
      settings: { defaultWriteRole: 'member', isAnnouncementChannel: false, slowModeSeconds: 30, autoTranslateEnabled: true, encryptionMode: 'server' },
      community: { id: OBJECT_ID(2), name: 'Lycée Njanda', identifier: 'lycee-njanda' },
      participantsPreview: [
        { id: OBJECT_ID(11), userId: OBJECT_ID(21), kind: 'user', displayName: 'Awa Diop', avatar: null, role: 'creator', joinedAt: '2026-08-01T10:00:00.000Z' },
        { id: OBJECT_ID(12), userId: null, kind: 'anonymous', displayName: 'Invité', avatar: null, role: 'member', joinedAt: null },
      ],
      shareLinkCount: 2,
      agentEnabled: true,
    });
  });

  test('ne laisse passer AUCUN champ voisin : ni l’e-mail de la personne, ni un champ inconnu', () => {
    const decoded = JSON.stringify(decodeAdminConversationFiche(SERVED_FICHE));
    expect(decoded).not.toContain('secret');
    expect(decoded).not.toContain('communityId');
  });

  test('sans communauté, sans fermeture, sans agent : `null`, `null`, `false` — jamais une valeur inventée', () => {
    const fiche = decodeAdminConversationFiche({ id: OBJECT_ID(1), community: null, closedBy: null, closedAt: null, messageCount: null });
    expect(fiche?.community).toBe(null);
    expect(fiche?.closedBy).toBe(null);
    expect(fiche?.closedAt).toBe(null);
    expect(fiche?.messageCount).toBe(null);
    expect(fiche?.agentEnabled).toBe(false);
    expect(fiche?.participantsPreview).toEqual([]);
    expect(fiche?.shareLinkCount).toBe(0);
  });

  test('une charge sans identifiant n’est pas une fiche', () => {
    expect(decodeAdminConversationFiche({ title: 'sans id' })).toBe(null);
    expect(decodeAdminConversationFiche(null)).toBe(null);
  });
});

describe('decodeAdminConversationMember — nommé, jamais désigné par son identifiant', () => {
  test('le nom COURANT du compte prime sur la copie gardée à l’arrivée', () => {
    const member = decodeAdminConversationMember({
      id: OBJECT_ID(11),
      userId: OBJECT_ID(21),
      type: 'user',
      displayName: 'Ancien nom',
      avatar: 'https://cdn.test/copie.png',
      role: 'MODERATOR',
      isActive: true,
      isOnline: true,
      joinedAt: '2026-08-01T10:00:00.000Z',
      nickname: 'Surnom',
      user: { id: OBJECT_ID(21), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.test/awa.png', email: 'secret@x.test' },
    });

    expect(member).toEqual({
      id: OBJECT_ID(11),
      userId: OBJECT_ID(21),
      kind: 'user',
      displayName: 'Awa Diop',
      username: 'awa',
      avatar: 'https://cdn.test/awa.png',
      role: 'moderator',
      isActive: true,
      isOnline: true,
      joinedAt: '2026-08-01T10:00:00.000Z',
    });
  });

  test('un invité anonyme n’a ni compte ni pseudo : son nom vient de sa ligne de participation', () => {
    const member = decodeAdminConversationMember({ id: OBJECT_ID(12), userId: null, type: 'anonymous', displayName: 'Invité', role: 'member', isActive: false, isOnline: false, user: null });
    expect(member).toMatchObject({ userId: null, kind: 'anonymous', displayName: 'Invité', username: null, isActive: false, isOnline: false });
  });

  test('une ligne sans identifiant est écartée', () => {
    expect(decodeAdminConversationMember({ userId: OBJECT_ID(21) })).toBe(null);
  });
});

function transportRendant(charge: unknown, vues: HttpRequest[]): HttpTransport {
  const transport = (() => {
    throw new Error('appel positionnel non utilisé');
  }) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest): Promise<ApiResult<unknown>> => {
    vues.push(request);
    return resultatServi(charge);
  }) as HttpTransport['request'];
  return transport;
}

describe('les lectures', () => {
  test('la fiche frappe l’adresse du catalogue, identifiant échappé', async () => {
    const vues: HttpRequest[] = [];
    const result = await loadAdminConversationFiche({ source: 'gateway', transport: transportRendant({ data: SERVED_FICHE }, vues), conversationId: 'c 1' });

    expect(result.ok).toBe(true);
    expect(vues[0]?.method).toBe('GET');
    expect(vues[0]?.path).toBe('/api/v1/admin/conversations/c%201');
  });

  test('une fiche illisible est un échec, jamais une fiche vide', async () => {
    const result = await loadAdminConversationFiche({ source: 'gateway', transport: transportRendant({ data: { titre: 'x' } }, []), conversationId: 'c1' });
    expect(result.ok).toBe(false);
  });

  test('les membres : pagination À CÔTÉ de `data`, offset et taille transmis', async () => {
    const vues: HttpRequest[] = [];
    const result = await loadAdminConversationMembers({
      source: 'gateway',
      transport: transportRendant(
        {
          data: [{ id: OBJECT_ID(11), userId: OBJECT_ID(21), type: 'user', displayName: 'Awa', role: 'member', isActive: true, isOnline: false }, { userId: 'sans-ligne' }],
          pagination: { total: 42, offset: 20, limit: 20, hasMore: true },
        },
        vues,
      ),
      conversationId: 'c1',
      offset: 20,
      limit: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(42);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.rows.map((row) => row.displayName)).toEqual(['Awa']);
    expect(vues[0]?.path).toBe('/api/v1/admin/conversations/c1/participants?offset=20&limit=20');
  });

  test('un refus remonte tel quel', async () => {
    const transport = (() => {
      throw new Error('appel positionnel non utilisé');
    }) as unknown as HttpTransport;
    transport.request = (async () => ({ ok: false, status: 403, error: 'refusé' })) as HttpTransport['request'];

    const result = await loadAdminConversationMembers({ source: 'gateway', transport, conversationId: 'c1', offset: 0, limit: 20 });
    expect(result).toEqual({ ok: false, status: 403, error: 'refusé' });
  });
});

describe('les clés sont SOUVERAINES — rien ne part sur le disque', () => {
  test('fiche et pages de membres descendent du préfixe souverain', () => {
    expect(estClefSouveraine(adminConversationFicheKey('c1'))).toBe(true);
    expect(estClefSouveraine(adminConversationMembersKey('c1', 0, 20))).toBe(true);
  });

  test('invalider la fiche invalide aussi ses membres : la racine est un préfixe', () => {
    const fiche = adminConversationFicheKey('c1');
    expect(adminConversationMembersRootKey('c1').slice(0, fiche.length)).toEqual([...fiche]);
    expect(adminConversationMembersKey('c1', 20, 50).slice(0, adminConversationMembersRootKey('c1').length)).toEqual([...adminConversationMembersRootKey('c1')]);
  });

  test('deux conversations, deux pages, deux tailles : des clés distinctes', () => {
    expect(adminConversationMembersKey('c1', 0, 20)).not.toEqual(adminConversationMembersKey('c2', 0, 20));
    expect(adminConversationMembersKey('c1', 0, 20)).not.toEqual(adminConversationMembersKey('c1', 20, 20));
    expect(adminConversationMembersKey('c1', 0, 20)).not.toEqual(adminConversationMembersKey('c1', 0, 50));
  });
});
