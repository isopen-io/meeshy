import { describe, expect, test } from 'bun:test';

import { decodeAdminConversationPage, loadAdminUserConversations } from './admin-user-conversations';
import type { HttpTransport } from './http';
import { pageServie } from './admin';
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
