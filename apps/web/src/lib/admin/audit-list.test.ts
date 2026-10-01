import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import {
  AUDIT_ENTITIES,
  AUDIT_LIST_SPEC,
  GATEWAY_ACTION_PATTERN,
  MAX_ACTION_CODES,
  auditFamilyFilter,
  auditListQuery,
  type AuditListState,
} from './audit-list';
import { AUDIT_FILTER_FAMILIES } from './audit-vocabulary';
import { OBJECT_ID } from './audit-fixtures';
import { parseListState, serializeListState, toggleSort, withFilter, withIdFilter } from './list-state';

/**
 * **LA LISTE DU JOURNAL D'AUDIT** (#8876, #6727) — ce que la passerelle sait trier et
 * filtrer, donc ce que l'adresse peut porter : tri sur la date (croissant ou
 * décroissant), famille d'actions (→ une liste de codes `action=a,b,c`), genre d'élément,
 * période (→ `createdAfter`) ; l'administrateur et le sujet par IDENTIFIANT — c'est par
 * là qu'une fiche membre mène à « tout ce qui la concerne ».
 */
const NOW = new Date('2026-09-30T12:00:00.000Z');
const GATEWAY_ROUTE = fileURLToPath(new URL('../../../../../services/gateway/src/routes/admin/audit-logs.ts', import.meta.url));

const state = (search: string): AuditListState => parseListState(new URLSearchParams(search), AUDIT_LIST_SPEC);
const queryOf = (search: string) => Object.fromEntries(auditListQuery(state(search), NOW).entries());

describe('la spécification — une liste blanche, rien de plus', () => {
  test('par défaut : la plus récente d’abord, trente par page, aucun filtre', () => {
    expect(state('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, ids: {}, q: '', offset: 0, limit: 30 });
  });

  test('lit la famille, le genre, la période, l’administrateur et le sujet dans l’adresse', () => {
    const parsed = state(`family=security&entity=User&period=7d&admin=${OBJECT_ID(2)}&subject=${OBJECT_ID(3)}&order=asc&limit=50&offset=30`);

    expect(parsed).toEqual({
      sort: 'createdAt',
      order: 'asc',
      filters: { family: 'security', entity: 'User', period: '7d' },
      ids: { admin: OBJECT_ID(2), subject: OBJECT_ID(3) },
      q: '',
      offset: 30,
      limit: 50,
    });
  });

  test('ignore une famille, un genre ou une période inconnus, et un identifiant qui n’a pas la forme d’un ObjectId', () => {
    const parsed = state('family=everything&entity=Nothing&period=forever&admin=../../etc&subject=12');

    expect(parsed.filters).toEqual({});
    expect(parsed.ids).toEqual({});
  });

  test('le tri de la date bascule entre décroissant et croissant', () => {
    const toggled = toggleSort(state(''), 'createdAt', AUDIT_LIST_SPEC);

    expect(toggled.order).toBe('asc');
    expect(toggleSort(toggled, 'createdAt', AUDIT_LIST_SPEC).order).toBe('desc');
  });

  test('l’état s’écrit dans l’adresse et en revient tel quel', () => {
    const written = withIdFilter(withFilter(state('order=asc'), 'family', 'bans', AUDIT_LIST_SPEC), 'subject', OBJECT_ID(3), AUDIT_LIST_SPEC);

    const address = serializeListState(written, AUDIT_LIST_SPEC).toString();

    expect(parseListState(new URLSearchParams(address), AUDIT_LIST_SPEC)).toEqual(written);
  });

  test('les genres d’éléments offerts sont ceux que la passerelle accepte', () => {
    expect([...AUDIT_ENTITIES]).toEqual([
      'User',
      'Conversation',
      'ConversationShareLink',
      'Community',
      'Report',
      'Post',
      'Broadcast',
      'TrackingLink',
      'FriendRequest',
      'AgentLlmConfig',
      'Agent',
    ]);
  });
});

describe('la requête envoyée à la passerelle', () => {
  test('par défaut : la page, la taille, l’ordre — et rien d’autre', () => {
    expect(queryOf('')).toEqual({ offset: '0', limit: '30', order: 'desc' });
  });

  test('l’ordre et la page suivent l’adresse', () => {
    expect(queryOf('order=asc&limit=100&offset=200')).toEqual({ offset: '200', limit: '100', order: 'asc' });
  });

  test('une famille devient une liste de codes séparés par des virgules', () => {
    const { action } = queryOf('family=bans');

    expect(action).toBe('BAN_USER,UNBAN_USER');
  });

  test('la famille « lectures souveraines » envoie les codes souverains de tous les domaines', () => {
    const codes = (queryOf('family=sovereign').action ?? '').split(',');

    expect(codes).toContain('ADMIN_CONVERSATION_MESSAGES_VIEWED');
    expect(codes).toContain('ADMIN_SHARE_LINK_REVEALED');
    expect(codes).toContain('VIEW_USER');
  });

  test('le genre d’élément, l’administrateur et le sujet passent sous les noms que la passerelle attend', () => {
    const query = queryOf(`entity=ConversationShareLink&admin=${OBJECT_ID(2)}&subject=${OBJECT_ID(3)}`);

    expect(query.entity).toBe('ConversationShareLink');
    expect(query.adminId).toBe(OBJECT_ID(2));
    expect(query.userId).toBe(OBJECT_ID(3));
  });

  test('une période devient un createdAfter calculé depuis l’horloge injectée', () => {
    expect(queryOf('period=24h').createdAfter).toBe('2026-09-29T12:00:00.000Z');
    expect(queryOf('period=7d').createdAfter).toBe('2026-09-23T12:00:00.000Z');
    expect(queryOf('period=90d').createdAfter).toBe('2026-07-02T12:00:00.000Z');
  });

  test('sans période, aucune borne n’est envoyée', () => {
    expect('createdAfter' in queryOf('family=bans')).toBe(false);
  });
});

describe('les familles face à ce que la passerelle accepte dans `action`', () => {
  test('toute famille offerte envoie au plus vingt codes, tous acceptés par le motif de la passerelle', () => {
    for (const family of AUDIT_FILTER_FAMILIES) {
      const { send } = auditFamilyFilter(family);

      expect(send.length).toBeGreaterThan(0);
      expect(send.length).toBeLessThanOrEqual(MAX_ACTION_CODES);
      for (const code of send) expect(GATEWAY_ACTION_PATTERN.test(code)).toBe(true);
    }
  });

  test('les deux codes à chiffre (double authentification) passent le motif : la famille les ENVOIE, sans trou', () => {
    const { send, gaps } = auditFamilyFilter('security');

    expect(GATEWAY_ACTION_PATTERN.test('ENABLE_2FA')).toBe(true);
    expect(GATEWAY_ACTION_PATTERN.test('DISABLE_2FA')).toBe(true);
    expect(send).toContain('ENABLE_2FA');
    expect(send).toContain('DISABLE_2FA');
    expect(send).toContain('RESET_PASSWORD');
    expect(gaps).toEqual([]);
  });

  test('aucune famille n’a de trou tant qu’elle tient dans la borne de vingt codes', () => {
    const gapped = AUDIT_FILTER_FAMILIES.filter((family) => auditFamilyFilter(family).gaps.length > 0);

    expect(gapped).toEqual([]);
  });

  test('le motif refuse un code en minuscules ou d’un seul caractère — ce qu’il refuse, la passerelle le refuse', () => {
    expect(GATEWAY_ACTION_PATTERN.test('code_en_minuscules')).toBe(false);
    expect(GATEWAY_ACTION_PATTERN.test('A')).toBe(false);
  });

  test('le motif que ce module suppose est celui que la passerelle déclare — sinon, il faut relire ce fichier', () => {
    const route = readFileSync(GATEWAY_ROUTE, 'utf8');
    const declared = /pattern:\s*'(\^\[A-Z0-9_\][^']*)'/.exec(route)?.[1];

    expect(declared).toBe('^[A-Z0-9_]{2,64}(,[A-Z0-9_]{2,64}){0,19}$');
    expect(MAX_ACTION_CODES).toBe(20);
  });
});
