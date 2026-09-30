import { beforeAll, describe, expect, test } from 'bun:test';

import { decodeAdminRanking } from '@/lib/api/admin-ranking';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  OBJECT_ID,
  servedConversationRank,
  servedMessageRank,
  servedRanking,
  servedShareRank,
  servedTrackingRank,
  servedUserRank,
} from './ranking-fixtures';
import type { RankingCriterionCode, RankingEntityType } from './ranking-state';
import { rankingRowViews } from './ranking-view';

const NOW = new Date('2026-09-30T12:00:00.000Z');

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const viewsOf = (
  served: readonly unknown[],
  request: { readonly entityType: RankingEntityType; readonly criterion: RankingCriterionCode },
  options: { readonly language?: 'fr' | 'en'; readonly showValue?: boolean } = {},
) =>
  rankingRowViews(decodeAdminRanking(servedRanking(served), { ...request, period: '30d' }).rows, {
    language: options.language ?? 'fr',
    now: NOW,
    showValue: options.showValue ?? true,
  });

describe('la vue d’une ligne — des noms, jamais des identifiants', () => {
  test('un membre : son nom, son @username, son rang, son total et sa dernière activité lue en relatif', () => {
    const [first, second] = viewsOf([servedUserRank(1), servedUserRank(2, { displayName: null })], { entityType: 'users', criterion: 'messages_sent' });

    expect(first).toMatchObject({
      key: OBJECT_ID(1),
      rank: 1,
      entity: { kind: 'user', id: OBJECT_ID(1), label: 'Membre 1', secondary: '@membre1' },
      creator: null,
      value: 99,
    });
    expect(first?.when?.relative).toBe('il y a 2 heures');
    expect(second).toMatchObject({ rank: 2, entity: { label: '@membre2' } });
  });

  test('« Unknown » ne se lit jamais : un compte disparu est « Personne inconnue », barré, sans fiche', () => {
    const [view] = viewsOf([servedUserRank(3, { username: 'Unknown', displayName: undefined })], { entityType: 'users', criterion: 'messages_sent' });

    expect(view?.entity).toEqual({ kind: 'user', id: OBJECT_ID(3), label: 'Personne inconnue', deleted: true });
  });

  test('une conversation : son titre ; sans titre, « Conversation sans titre » et jamais son identifiant', () => {
    const [named, untitled] = viewsOf(
      [servedConversationRank(1), servedConversationRank(2, { title: 'Sans titre', type: 'direct' })],
      { entityType: 'conversations', criterion: 'message_count' },
    );

    expect(named?.entity).toMatchObject({ kind: 'conversation', label: 'Conversation 1', secondary: 'Groupe' });
    expect(untitled?.entity).toMatchObject({ kind: 'conversation', label: 'Conversation sans titre', secondary: 'Conversation privée' });
    expect(JSON.stringify([named, untitled])).not.toContain('mshy_conv');
  });

  test('l’avatar d’une conversation n’est posé que s’il existe ; sinon le glyphe du genre reste', () => {
    const [plain, pictured] = viewsOf(
      [servedConversationRank(1), servedConversationRank(2, { image: 'https://cdn.exemple/c.png' })],
      { entityType: 'conversations', criterion: 'message_count' },
    );

    expect('avatarUrl' in (plain?.entity ?? {})).toBe(false);
    expect(pictured?.entity).toMatchObject({ avatarUrl: 'https://cdn.exemple/c.png' });
  });

  test('un message : « Message de {auteur} dans {conversation} », la date et le type — jamais son texte', () => {
    const [view] = viewsOf([servedMessageRank(1, { messageType: 'audio', content: 'texte secret' })], { entityType: 'messages', criterion: 'most_replies' });

    expect(view?.entity).toEqual({
      kind: 'conversation',
      id: OBJECT_ID(201),
      label: 'Message de Auteur 1 dans Discussion 1',
      secondary: '28 sept. 2026 · Message vocal',
    });
    expect(JSON.stringify(view)).not.toContain('texte secret');
  });

  test('l’auteur d’un message est un invité sans compte : nom d’invité ; sans nom, « Invité sans nom »', () => {
    const views = viewsOf(
      [
        servedMessageRank(2, { sender: { id: OBJECT_ID(9), userId: null, displayName: 'Invité 7', avatar: null } }),
        servedMessageRank(3, { sender: { id: OBJECT_ID(8), userId: null, displayName: null, avatar: null } }),
      ],
      { entityType: 'messages', criterion: 'most_reactions' },
    );

    expect(views[0]?.entity.label).toBe('Message de Invité 7 dans Discussion 2');
    expect(views[1]?.entity.label).toBe('Message de Invité sans nom dans Discussion 3');
  });

  test('un message dont la conversation a disparu : la puce est barrée, elle ne mène nulle part', () => {
    const [view] = viewsOf([servedMessageRank(4, { conversation: undefined })], { entityType: 'messages', criterion: 'most_reactions' });

    expect(view?.entity).toMatchObject({ id: OBJECT_ID(4), deleted: true, label: 'Message de Auteur 4 dans Conversation sans titre' });
  });

  test('un lien de suivi : « Lien vers {hôte} » et son créateur nommé — ni jeton ni adresse complète', () => {
    const [view] = viewsOf([servedTrackingRank(1)], { entityType: 'links', criterion: 'tracking_links_most_visited' });

    expect(view).toMatchObject({
      entity: { kind: 'trackingLink', id: OBJECT_ID(1), label: 'Lien vers exemple1.org' },
      creator: { kind: 'user', id: OBJECT_ID(101), label: 'Créateur 1', secondary: '@createur1' },
      value: 899,
    });
    expect(view?.when?.relative).toBe('il y a 4 semaines');
    expect(JSON.stringify(view)).not.toContain('Ab3xYz');
  });

  test('un lien de suivi sans hôte lisible retombe sur « Lien de suivi sans nom »', () => {
    const [view] = viewsOf([servedTrackingRank(2, { originalUrl: null })], { entityType: 'links', criterion: 'tracking_links_most_unique' });
    expect(view?.entity.label).toBe('Lien de suivi sans nom');
  });

  test('un lien de partage : son nom, ou « Lien sans nom » — sa conversation en secondaire, son créateur nommé', () => {
    const [named, unnamed] = viewsOf(
      [servedShareRank(1), servedShareRank(2, { name: null, conversation: undefined, creator: undefined })],
      { entityType: 'links', criterion: 'share_links_most_used' },
    );

    expect(named).toMatchObject({
      entity: { kind: 'shareLink', label: 'Lien 1', secondary: 'Salon 1' },
      creator: { label: 'Hôte 1', secondary: '@hote1' },
    });
    expect(unnamed).toMatchObject({ entity: { label: 'Lien sans nom', secondary: null }, creator: null });
  });

  test('« activité la plus récente » ne montre aucune valeur : la passerelle ordonne sans compter', () => {
    const [view] = viewsOf(
      [servedConversationRank(1, { count: 0, lastActivity: '2026-09-30T11:45:00.000Z' })],
      { entityType: 'conversations', criterion: 'recent_activity' },
      { showValue: false },
    );

    expect(view?.value).toBeNull();
    expect(view?.when?.relative).toBe('il y a 15 minutes');
  });

  test('le même classement se lit dans la langue d’interface', () => {
    const [view] = viewsOf([servedMessageRank(1)], { entityType: 'messages', criterion: 'most_reactions' }, { language: 'en' });

    expect(view?.entity.label).toBe('Message from Auteur 1 in Discussion 1');
    expect(view?.entity.secondary).toBe('Sep 28, 2026 · Text');
  });

  test('le rang suit l’ordre servi, à partir de un', () => {
    const views = viewsOf([servedUserRank(1), servedUserRank(2), servedUserRank(3)], { entityType: 'users', criterion: 'messages_sent' });
    expect(views.map((view) => view.rank)).toEqual([1, 2, 3]);
  });
});
