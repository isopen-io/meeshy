import { describe, expect, test } from 'bun:test';

import {
  ADMIN_CONVERSATION_SORTS,
  ADMIN_MEMBER_ROLES,
  ADMIN_SORT_ORDERS,
  adminUserConversationsQueryKey,
  adminUserConversationsRootKey,
  decodeAdminConversationPage,
  loadAdminUserConversations,
} from './admin-user-conversations';
import type { HttpTransport } from './http';
import { pageServie } from './admin';
import { persistableQuery } from './query-client';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * LES CONVERSATIONS D'UN MEMBRE (#6819) —
 * `GET /api/v1/admin/users/:userId/conversations`, sous `canViewUsers`.
 *
 * **Métadonnées seules : aucun contenu de message.** La route sert le cadre
 * d'une conversation, jamais ce qui s'y dit — et ce décodeur n'invente pas de
 * champ qui laisserait croire le contraire.
 *
 * Trois traits du contrat, tous mesurés :
 *
 * 1. **`memberCount` est RECALCULÉ** depuis `_count` par la passerelle — la
 *    colonne du même nom n'est écrite par personne. On lit donc ce qui est
 *    servi, sans jamais retomber sur une colonne morte.
 * 2. **`membership` peut être `null`** : c'est la ligne du membre visé,
 *    extraite « pour convenance » parmi les participants SERVIS. Or ceux-ci
 *    sont plafonnés à six — un membre absent de ces six n'a pas de
 *    `membership`, ce qui ne veut PAS dire qu'il n'est pas dans la
 *    conversation.
 * 3. **La pagination voyage à côté de `data`** (`sendPaginatedSuccess`), comme
 *    pour les médias et à l'inverse de `GET /admin/users`.
 */

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string }[] = [];
  const transport = {
    request: async (requete: { path: string }) => {
      appels.push({ path: requete.path });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

const CONV = {
  id: 'c-1',
  identifier: 'mshy_abc',
  title: 'Équipe produit',
  type: 'group',
  isActive: true,
  memberCount: 12,
  createdAt: '2026-08-01T10:00:00.000Z',
  lastMessageAt: '2026-09-15T18:00:00.000Z',
  participants: [{ userId: 'u-1', displayName: 'Amina', role: 'MEMBER', isActive: true }],
  membership: { userId: 'u-1', displayName: 'Amina', role: 'MEMBER', isActive: true },
};

/**
 * LA PAGE TELLE QUE LE PRODUIT LA REÇOIT (#6862, revue-correction) — l'enveloppe
 * de la passerelle passe par la MÊME conversion que `createHttpTransport`
 * (`resultatServi`) puis par la MÊME lecture que les ports (`pageServie`).
 * Passer l'enveloppe brute au décodeur laissait `pagination` là où la
 * production ne la trouve jamais : le témoin verdissait sur un chemin
 * inexistant.
 */
const servie = (enveloppe: unknown) => pageServie(resultatServi(enveloppe));

describe('decodeAdminConversationPage — le cadre, jamais le contenu', () => {
  test('lit la pagination au niveau de l’ENVELOPPE, pas dans `data`', () => {
    const page = decodeAdminConversationPage(
      servie({ data: [CONV], pagination: { total: 37, offset: 20, limit: 20, hasMore: true } }),
      20,
    );

    expect(page.total).toBe(37);
    expect(page.hasMore).toBe(true);
    expect(page.conversations).toHaveLength(1);
  });

  test('garde `memberCount` SERVI — la colonne du même nom n’est écrite par personne', () => {
    expect(decodeAdminConversationPage(servie({ data: [CONV] }), 0).conversations[0]?.memberCount).toBe(12);
  });

  test('un `membership` ABSENT reste null — le membre peut être hors des six servis', () => {
    const page = decodeAdminConversationPage(servie({ data: [{ ...CONV, membership: null }] }), 0);

    expect(page.conversations[0]?.membership).toBeNull();
    expect(page.conversations[0]?.id).toBe('c-1');
  });

  test('conserve les participants servis, plafonnés côté serveur', () => {
    expect(decodeAdminConversationPage(servie({ data: [CONV] }), 0).conversations[0]?.participants).toHaveLength(1);
  });

  test('un titre absent devient null — jamais une chaîne vide affichable', () => {
    const page = decodeAdminConversationPage(servie({ data: [{ ...CONV, title: '' }] }), 0);

    expect(page.conversations[0]?.title).toBeNull();
  });

  test('écarte les entrées sans identifiant, tolère une charge illisible', () => {
    expect(decodeAdminConversationPage(servie({ data: [{ title: 'sans id' }] }), 0).conversations).toHaveLength(0);
    expect(decodeAdminConversationPage(servie(null), 0).conversations).toEqual([]);
  });
});

describe('loadAdminUserConversations — l’adresse et le filtre', () => {
  test('vise la route du membre, identifiant ENCODÉ, pagination par OFFSET', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserConversations({ ...deps(transport), userId: 'u 1/x', offset: 40 });

    expect(appels[0]?.path).toContain(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/conversations`);
    expect(appels[0]?.path).toContain('offset=40');
    expect(appels[0]?.path).not.toContain('page=');
  });

  test('n’envoie `type` que s’il est demandé — un filtre vide n’est pas un filtre', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserConversations({ ...deps(transport), userId: 'u-1', offset: 0 });
    await loadAdminUserConversations({ ...deps(transport), userId: 'u-1', offset: 0, type: 'group' });

    expect(appels[0]?.path).not.toContain('type=');
    expect(appels[1]?.path).toContain('type=group');
  });

  test('propage un refus TEL QUEL', async () => {
    const { transport } = transportEspion({ ok: false as const, status: 403, error: 'Forbidden' }, false);

    const resultat = await loadAdminUserConversations({ ...deps(transport), userId: 'u-1', offset: 0 });

    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.status).toBe(403);
  });
});

/**
 * LE TRI, LES FILTRES ET LE CADRE ÉLARGI (#7845 D) — la liste se trie par une
 * LISTE BLANCHE (miroir de `TRIS_MEMBRE` / `ORDRES` côté passerelle, qui rend
 * 400 sur tout le reste), et chaque ligne porte désormais ses réglages, son
 * nombre de messages et la ligne du membre visé, même au-delà du sixième.
 */
describe('loadAdminUserConversations — tri et filtres (#7845)', () => {
  test('émet sort, order, search et role quand ils sont demandés', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserConversations({
      ...deps(transport),
      userId: 'u-1',
      offset: 0,
      sort: 'title',
      order: 'asc',
      search: 'équipe',
      role: 'admin',
    });

    const query = new URLSearchParams(appels[0]?.path.split('?')[1]);
    expect(query.get('sort')).toBe('title');
    expect(query.get('order')).toBe('asc');
    expect(query.get('search')).toBe('équipe');
    expect(query.get('role')).toBe('admin');
  });

  test('omet les valeurs VIDES — une recherche blanche n’est pas une recherche', async () => {
    const { transport, appels } = transportEspion({ data: [] });

    await loadAdminUserConversations({ ...deps(transport), userId: 'u-1', offset: 0, search: '   ', role: '' });

    for (const absent of ['sort=', 'order=', 'search=', 'role=']) {
      expect(appels[0]?.path).not.toContain(absent);
    }
  });

  test('les listes blanches reflètent celles de la passerelle', () => {
    expect([...ADMIN_CONVERSATION_SORTS]).toEqual(['lastMessageAt', 'createdAt', 'title', 'joinedAt']);
    expect([...ADMIN_SORT_ORDERS]).toEqual(['asc', 'desc']);
    expect([...ADMIN_MEMBER_ROLES]).toEqual(['creator', 'admin', 'moderator', 'member']);
  });

  test('la clé distingue chaque tri, et reste sous la racine que l’écran invalide', () => {
    const parDefaut = adminUserConversationsQueryKey('u-1', 0, '');
    const parTitre = adminUserConversationsQueryKey('u-1', 0, '', { sort: 'title', order: 'asc', search: 'x', role: 'admin' });

    expect(parDefaut).toEqual(['admin-souverain', 'user', 'u-1', 'conversations', 0, '', 'lastMessageAt', 'desc', '', '']);
    expect(parTitre).toEqual(['admin-souverain', 'user', 'u-1', 'conversations', 0, '', 'title', 'asc', 'x', 'admin']);
    expect(parTitre.slice(0, 4)).toEqual([...adminUserConversationsRootKey('u-1')]);
  });
});

describe('decodeAdminConversationPage — le cadre élargi (#7845)', () => {
  const RICHE = {
    ...CONV,
    description: 'Tout sur le produit',
    banner: 'https://example.test/b.png',
    closedAt: '2026-09-20T10:00:00.000Z',
    communityId: 'com-1',
    updatedAt: '2026-09-21T10:00:00.000Z',
    messageCount: 420,
    settings: {
      defaultWriteRole: 'moderator',
      isAnnouncementChannel: true,
      slowModeSeconds: 30,
      autoTranslateEnabled: false,
      encryptionMode: 'server',
      secret: 'x',
    },
    membership: { userId: 'u-1', displayName: 'Amina', role: 'admin', nickname: 'Mina', isActive: true, joinedAt: '2026-08-02T10:00:00.000Z' },
  };

  test('décode description, bannière, fermeture, réglages et nombre de messages', () => {
    const ligne = decodeAdminConversationPage(servie({ data: [RICHE] }), 0).conversations[0];

    expect(ligne?.description).toBe('Tout sur le produit');
    expect(ligne?.banner).toBe('https://example.test/b.png');
    expect(ligne?.closedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(ligne?.communityId).toBe('com-1');
    expect(ligne?.updatedAt).toBe('2026-09-21T10:00:00.000Z');
    expect(ligne?.messageCount).toBe(420);
    expect(ligne?.settings).toEqual({
      defaultWriteRole: 'moderator',
      isAnnouncementChannel: true,
      slowModeSeconds: 30,
      autoTranslateEnabled: false,
      encryptionMode: 'server',
    });
    expect(ligne?.membership?.nickname).toBe('Mina');
    expect(ligne?.membership?.role).toBe('admin');
  });

  test('un rôle historique en CAPITALES se rabat — `CREATOR` reste le créateur protégé', () => {
    const ligne = decodeAdminConversationPage(servie({ data: [{ ...RICHE, membership: { ...RICHE.membership, role: 'CREATOR' } }] }), 0).conversations[0];

    expect(ligne?.membership?.role).toBe('creator');
  });

  test('la liste ne touche pas le disque : sa racine est souveraine', () => {
    expect(persistableQuery({ state: { status: 'success' }, queryKey: adminUserConversationsQueryKey('u-1', 0, '') })).toBe(false);
  });

  test('`messageCount` reste NULL sans ligne de statistiques — jamais un zéro inventé', () => {
    const ligne = decodeAdminConversationPage(servie({ data: [{ ...RICHE, messageCount: null }] }), 0).conversations[0];

    expect(ligne?.messageCount).toBeNull();
  });

  test('des réglages absents se lisent comme « non servis », pas comme des valeurs', () => {
    const ligne = decodeAdminConversationPage(servie({ data: [CONV] }), 0).conversations[0];

    expect(ligne?.settings).toEqual({
      defaultWriteRole: null,
      isAnnouncementChannel: false,
      slowModeSeconds: 0,
      autoTranslateEnabled: null,
      encryptionMode: null,
    });
    expect(ligne?.description).toBeNull();
    expect(ligne?.closedAt).toBeNull();
  });
});
