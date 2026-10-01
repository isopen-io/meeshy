import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_RANKING_STATE,
  RANKING_CRITERIA,
  RANKING_ENTITY_TYPES,
  criteriaOf,
  criterionShowsValue,
  isDefaultRankingState,
  parseRankingState,
  periodScopeOf,
  rankingBranchOf,
  rankingRequestQuery,
  serializeRankingState,
  withCriterion,
  withEntityType,
  withLimit,
  withPeriod,
} from './ranking-state';

const search = (query: string) => new URLSearchParams(query);

describe('le classement — l’état se lit dans l’adresse, par liste blanche', () => {
  test('une adresse vide rend le défaut : les membres, leurs messages, sur 30 jours, vingt-cinq lignes', () => {
    expect(parseRankingState(search(''))).toEqual({ entityType: 'users', criterion: 'messages_sent', period: '30d', limit: 25 });
    expect(parseRankingState(search(''))).toEqual(DEFAULT_RANKING_STATE);
  });

  test('une adresse complète est lue telle quelle', () => {
    expect(parseRankingState(search('entity=conversations&criterion=recent_activity&period=7d&limit=50'))).toEqual({
      entityType: 'conversations',
      criterion: 'recent_activity',
      period: '7d',
      limit: 50,
    });
  });

  test('une valeur inconnue retombe sur le défaut — jamais sur la passerelle', () => {
    expect(parseRankingState(search('entity=robots&criterion=cuisine&period=12d&limit=7'))).toEqual(DEFAULT_RANKING_STATE);
  });

  test('un critère d’un AUTRE genre est refusé : « most_reactions » ne classe pas des membres', () => {
    expect(parseRankingState(search('entity=users&criterion=most_reactions')).criterion).toBe('messages_sent');
    expect(parseRankingState(search('entity=messages&criterion=most_reactions')).criterion).toBe('most_reactions');
  });

  test('les alias historiques de la passerelle ne sont PAS proposés ni lus', () => {
    for (const alias of ['messages', 'reactions', 'conversations', 'members', 'clicks', 'uses', 'replies']) {
      const codes = RANKING_ENTITY_TYPES.flatMap((entity) => criteriaOf(entity).map((definition) => definition.code as string));
      expect(codes).not.toContain(alias);
    }
    expect(parseRankingState(search('entity=users&criterion=messages')).criterion).toBe('messages_sent');
    expect(parseRankingState(search('entity=links&criterion=clicks')).criterion).toBe('tracking_links_most_visited');
  });

  test('les trente-quatre critères canoniques sont tous là, vingt et un pour les membres', () => {
    expect(criteriaOf('users')).toHaveLength(21);
    expect(criteriaOf('conversations')).toHaveLength(6);
    expect(criteriaOf('messages')).toHaveLength(3);
    expect(criteriaOf('links')).toHaveLength(4);
    expect(Object.values(RANKING_CRITERIA).flat()).toHaveLength(34);
  });
});

describe('le classement — les gestes écrivent une adresse propre', () => {
  test('le défaut ne s’écrit pas : l’adresse est vide', () => {
    expect(serializeRankingState(DEFAULT_RANKING_STATE).toString()).toBe('');
    expect(isDefaultRankingState(DEFAULT_RANKING_STATE)).toBe(true);
  });

  test('seul ce qui s’écarte du défaut est écrit, et se relit à l’identique', () => {
    const state = withLimit(withPeriod(withCriterion(withEntityType(DEFAULT_RANKING_STATE, 'links'), 'share_links_most_used'), '90d'), '100');
    const written = serializeRankingState(state).toString();

    expect(written).toBe('entity=links&criterion=share_links_most_used&period=90d&limit=100');
    expect(parseRankingState(search(written))).toEqual(state);
    expect(isDefaultRankingState(state)).toBe(false);
  });

  test('changer de genre remet le critère à son défaut ; rechoisir le même genre ne change rien', () => {
    const onReactions = withCriterion(DEFAULT_RANKING_STATE, 'reactions_given');
    expect(withEntityType(onReactions, 'users')).toBe(onReactions);
    expect(withEntityType(onReactions, 'conversations').criterion).toBe('message_count');
    expect(withEntityType(onReactions, 'messages').criterion).toBe('most_reactions');
    expect(withEntityType(onReactions, 'links').criterion).toBe('tracking_links_most_visited');
  });

  test('un critère, une période ou une limite inconnus ne se posent pas', () => {
    expect(withCriterion(DEFAULT_RANKING_STATE, 'cuisine').criterion).toBe('messages_sent');
    expect(withPeriod(DEFAULT_RANKING_STATE, '3d').period).toBe('30d');
    expect(withLimit(DEFAULT_RANKING_STATE, '1000').limit).toBe(25);
  });

  test('la requête porte les noms exacts du schéma de la passerelle', () => {
    expect(rankingRequestQuery(withEntityType(DEFAULT_RANKING_STATE, 'messages')).toString()).toBe(
      'entityType=messages&criterion=most_reactions&period=30d&limit=25',
    );
  });
});

describe('le classement — ce que la période fait à chaque critère', () => {
  test('un critère qui porte sur tout l’historique ignore la période : le sélecteur ne sera pas dessiné', () => {
    expect(periodScopeOf('users', 'most_contacts')).toBe('none');
    expect(periodScopeOf('conversations', 'member_count')).toBe('none');
    expect(periodScopeOf('links', 'share_links_most_used')).toBe('none');
    expect(periodScopeOf('links', 'share_links_most_unique_sessions')).toBe('none');
  });

  test('pour les liens de suivi et les arrivées par lien, la période borne les liens CRÉÉS — pas les clics', () => {
    expect(periodScopeOf('links', 'tracking_links_most_visited')).toBe('creation');
    expect(periodScopeOf('users', 'most_tracking_link_clicks')).toBe('creation');
    expect(periodScopeOf('users', 'most_referrals_via_sharelinks')).toBe('creation');
  });

  test('ailleurs la période borne l’activité comptée', () => {
    expect(periodScopeOf('users', 'messages_sent')).toBe('activity');
    expect(periodScopeOf('conversations', 'recent_activity')).toBe('activity');
    expect(periodScopeOf('messages', 'most_replies')).toBe('activity');
  });

  test('l’activité récente ordonne sans compter : la passerelle sert zéro, l’écran ne le montre pas', () => {
    expect(criterionShowsValue('conversations', 'recent_activity')).toBe(false);
    expect(criterionShowsValue('conversations', 'message_count')).toBe(true);
    expect(criterionShowsValue('users', 'messages_sent')).toBe(true);
  });

  test('« links » porte deux genres de lignes : le critère décide', () => {
    expect(rankingBranchOf('links', 'tracking_links_most_unique')).toBe('trackingLinks');
    expect(rankingBranchOf('links', 'share_links_most_used')).toBe('shareLinks');
    expect(rankingBranchOf('users', 'messages_sent')).toBe('users');
    expect(rankingBranchOf('conversations', 'message_count')).toBe('conversations');
    expect(rankingBranchOf('messages', 'most_reactions')).toBe('messages');
  });

  test('« Conversations de groupe créées » : le code reste celui de la passerelle, le libellé sera honnête', () => {
    const definition = criteriaOf('users').find((candidate) => candidate.code === 'communities_created');
    expect(definition?.label).toBe('admin.ranking.criterion.users.communities_created');
  });
});
