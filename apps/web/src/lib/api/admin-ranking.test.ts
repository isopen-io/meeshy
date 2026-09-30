import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import {
  OBJECT_ID,
  servedConversationRank,
  servedMessageRank,
  servedRanking,
  servedShareRank,
  servedTrackingRank,
  servedUserRank,
} from '@/lib/admin/ranking-fixtures';
import { DEFAULT_RANKING_STATE, withCriterion, withEntityType } from '@/lib/admin/ranking-state';
import { scriptedGateway } from '@/test-support/scripted-transport';

import { ADMIN_RANKING_QUERY_KEY, adminRankingQueryKey, decodeAdminRanking, loadAdminRanking } from './admin-ranking';

const USERS = { entityType: 'users', criterion: 'messages_sent', period: '30d' } as const;

describe('decodeAdminRanking — les membres', () => {
  test('lit le compte, le nom, l’avatar, le total et la dernière activité', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedUserRank(1, { avatar: 'https://cdn.exemple/a.png' })]), USERS);

    expect(rows).toEqual([
      {
        kind: 'users',
        id: OBJECT_ID(1),
        account: { username: 'membre1', displayName: 'Membre 1', avatar: 'https://cdn.exemple/a.png' },
        count: 99,
        lastActivity: '2026-09-30T10:00:00.000Z',
      },
    ]);
  });

  test('le repli serveur « Unknown » n’est PAS un nom : le compte n’existe plus, la ligne ne mène à aucune fiche', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([servedUserRank(2, { username: 'Unknown', displayName: undefined, avatar: undefined, lastActivity: undefined })]),
      USERS,
    );

    expect(rows).toEqual([{ kind: 'users', id: OBJECT_ID(2), account: null, count: 98, lastActivity: null }]);
    expect(JSON.stringify(rows)).not.toContain('Unknown');
  });

  test('sans présence servie (rôle sans droit), la dernière activité est absente — jamais fabriquée', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedUserRank(3, { lastActivity: undefined })]), USERS);
    expect(rows[0]).toMatchObject({ kind: 'users', lastActivity: null });
  });

  test('un compte sans nom d’affichage reste résolu par son @username', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedUserRank(4, { displayName: null })]), USERS);
    expect(rows[0]).toMatchObject({ account: { username: 'membre4', displayName: null } });
  });

  test('une ligne sans identifiant est écartée ; un compteur illisible vaut zéro, jamais NaN', () => {
    const { rows } = decodeAdminRanking(servedRanking([{ username: 'x', count: 3 }, servedUserRank(5, { count: 'beaucoup' }), null, 'x']), USERS);

    expect(rows.map((row) => row.id)).toEqual([OBJECT_ID(5)]);
    expect(rows[0]).toMatchObject({ count: 0 });
  });

  test('une charge sans liste rend un classement vide, pas une exception', () => {
    expect(decodeAdminRanking({}, USERS).rows).toEqual([]);
    expect(decodeAdminRanking(null, USERS).rows).toEqual([]);
    expect(decodeAdminRanking({ rankings: 'oui' }, USERS).rows).toEqual([]);
  });
});

describe('decodeAdminRanking — les conversations', () => {
  const request = { entityType: 'conversations', criterion: 'message_count', period: '30d' } as const;

  test('lit le titre, le type, l’image et le total — et jette l’identifiant public', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedConversationRank(1, { image: 'https://cdn.exemple/c.png' })]), request);

    expect(rows).toEqual([
      { kind: 'conversations', id: OBJECT_ID(1), title: 'Conversation 1', type: 'group', avatar: 'https://cdn.exemple/c.png', count: 499, lastActivity: null },
    ]);
    expect(JSON.stringify(rows)).not.toContain('mshy_conv1');
  });

  test('le repli serveur « Sans titre » et le repli par identifiant ne sont PAS des titres', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([
        servedConversationRank(2, { title: 'Sans titre', identifier: null }),
        servedConversationRank(3, { title: 'mshy_conv3', identifier: 'mshy_conv3' }),
      ]),
      request,
    );

    expect(rows.map((row) => (row.kind === 'conversations' ? row.title : 'faux'))).toEqual([null, null]);
  });

  test('« activité récente » sert sa dernière activité', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([servedConversationRank(4, { count: 0, lastActivity: '2026-09-30T11:45:00.000Z' })]),
      { entityType: 'conversations', criterion: 'recent_activity', period: '7d' },
    );
    expect(rows[0]).toMatchObject({ lastActivity: '2026-09-30T11:45:00.000Z', count: 0 });
  });
});

describe('decodeAdminRanking — les messages : jamais de texte', () => {
  const request = { entityType: 'messages', criterion: 'most_reactions', period: '30d' } as const;

  test('nomme l’auteur, la conversation, la date et le type', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedMessageRank(1)]), request);

    expect(rows).toEqual([
      {
        kind: 'messages',
        id: OBJECT_ID(1),
        messageType: 'text',
        createdAt: '2026-09-28T09:30:00.000Z',
        sender: { userId: OBJECT_ID(101), displayName: 'Auteur 1', username: 'auteur1', avatar: null },
        conversation: { id: OBJECT_ID(201), title: 'Discussion 1', type: 'group' },
        count: 39,
      },
    ]);
  });

  test('NE GARDE NI `content` NI `contentPreview` même si une charge les portait (#6919)', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([servedMessageRank(2, { content: 'Mon mot de passe est hunter2', contentPreview: 'Mon mot de passe est hunt…' })]),
      request,
    );

    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['conversation', 'count', 'createdAt', 'id', 'kind', 'messageType', 'sender']);
    expect(JSON.stringify(rows)).not.toContain('hunter2');
  });

  test('un invité d’un lien de partage n’a pas de compte : `userId` est null', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([servedMessageRank(3, { sender: { id: OBJECT_ID(9), userId: null, displayName: 'Invité 7', avatar: null, username: undefined } })]),
      request,
    );
    expect(rows[0]).toMatchObject({ sender: { userId: null, displayName: 'Invité 7', username: null } });
  });

  test('une conversation introuvable (orpheline) se dit null, l’auteur aussi', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedMessageRank(4, { sender: undefined, conversation: undefined })]), request);
    expect(rows[0]).toMatchObject({ sender: null, conversation: null });
  });
});

describe('decodeAdminRanking — les liens', () => {
  test('un lien de suivi ne garde ni son jeton ni son adresse complète : seulement l’hôte de destination', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedTrackingRank(1)]), { entityType: 'links', criterion: 'tracking_links_most_visited', period: '30d' });

    expect(rows).toEqual([
      {
        kind: 'trackingLinks',
        id: OBJECT_ID(1),
        host: 'exemple1.org',
        createdAt: '2026-09-01T08:00:00.000Z',
        creator: { id: OBJECT_ID(101), username: 'createur1', displayName: 'Créateur 1', avatar: null },
        count: 899,
      },
    ]);
    const written = JSON.stringify(rows);
    expect(written).not.toContain('Ab3xYz');
    expect(written).not.toContain('secret=abc123');
  });

  test('une adresse illisible n’a pas d’hôte', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedTrackingRank(2, { originalUrl: 'pas une adresse' })]), {
      entityType: 'links',
      criterion: 'tracking_links_most_unique',
      period: '30d',
    });
    expect(rows[0]).toMatchObject({ host: null });
  });

  test('un lien de partage ne garde NI son identifiant NI son `linkId` : ils ouvrent la conversation', () => {
    const { rows } = decodeAdminRanking(
      servedRanking([servedShareRank(1, { identifier: 'mshy_secret_join', linkId: 'SECRET-LINK-ID' })]),
      { entityType: 'links', criterion: 'share_links_most_used', period: 'all' },
    );

    expect(rows).toEqual([
      {
        kind: 'shareLinks',
        id: OBJECT_ID(1),
        name: 'Lien 1',
        createdAt: '2026-09-02T08:00:00.000Z',
        creator: { id: OBJECT_ID(101), username: 'hote1', displayName: 'Hôte 1', avatar: null },
        conversation: { id: OBJECT_ID(201), title: 'Salon 1', type: 'group' },
        count: 69,
      },
    ]);
    const written = JSON.stringify(rows);
    expect(written).not.toContain('mshy_secret_join');
    expect(written).not.toContain('mshy_join1');
    expect(written).not.toContain('SECRET-LINK-ID');
  });

  test('un lien de partage sans nom se dit null — jamais son secret', () => {
    const { rows } = decodeAdminRanking(servedRanking([servedShareRank(2, { name: null })]), {
      entityType: 'links',
      criterion: 'share_links_most_unique_sessions',
      period: 'all',
    });
    expect(rows[0]).toMatchObject({ name: null });
  });
});

describe('loadAdminRanking — la requête et la clé', () => {
  test('appelle l’adresse du catalogue avec les noms exacts de la passerelle', async () => {
    const state = withCriterion(withEntityType(DEFAULT_RANKING_STATE, 'conversations'), 'reaction_count');
    const path = `${adminEndpoints.ranking}?entityType=conversations&criterion=reaction_count&period=30d&limit=25`;
    const { deps, calls } = scriptedGateway({ [`GET ${path}`]: { ok: true, status: 200, data: servedRanking([servedConversationRank(1)]) } });

    const result = await loadAdminRanking({ ...deps, state });

    expect(calls().map((call) => call.path)).toEqual([path]);
    expect(result.ok && result.data.rows.map((row) => row.kind)).toEqual(['conversations']);
    expect(result.ok && result.data.criterion).toBe('reaction_count');
    expect(result.ok && result.data.period).toBe('30d');
  });

  test('un échec du transport est rendu tel quel, refus compris', async () => {
    const { deps } = scriptedGateway({});
    expect(await loadAdminRanking({ ...deps, state: DEFAULT_RANKING_STATE })).toMatchObject({ ok: false, status: 404 });
  });

  test('la clé est sous le préfixe `admin` (jamais persistée) et porte les quatre choix', () => {
    expect(ADMIN_RANKING_QUERY_KEY[0]).toBe('admin');
    expect(adminRankingQueryKey(DEFAULT_RANKING_STATE)).toEqual(['admin', 'ranking', 'users', 'messages_sent', '30d', 25]);
  });
});
