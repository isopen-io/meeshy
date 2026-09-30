import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminAuditTarget } from '@/lib/api/admin-audit';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { OBJECT_ID, servedAuditPerson } from './audit-fixtures';
import { auditEntityLabel, auditPersonRef, auditTargetOf } from './audit-target';

/**
 * **LA CIBLE D'UNE ENTRÉE, NOMMÉE** (#8876, #6727) — la passerelle résout le libellé par
 * genre d'élément ; ce module en fait ce que l'écran affiche : une puce vers la fiche
 * (genre, vrai nom, secondaire interprété) ou, pour un genre sans fiche, un texte.
 * **Jamais l'identifiant en guise de nom** : sans libellé connu, le genre se dit par son
 * nom générique.
 */
beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
});

const target = (type: string, label: string | null, secondary: string | null = null): AdminAuditTarget => ({ type, id: OBJECT_ID(9), label, secondary });

const entityOf = (value: AdminAuditTarget) => {
  const display = auditTargetOf(value, 'fr');
  if (display.kind !== 'entity') throw new Error(`cible sans fiche : ${display.label}`);
  return display.entity;
};

describe('auditTargetOf — chaque genre d’élément se nomme', () => {
  test('un compte : son nom et son @username, lien vers sa fiche', () => {
    expect(entityOf(target('User', 'Jean Martin', '@jean'))).toEqual({
      kind: 'user',
      id: OBJECT_ID(9),
      label: 'Jean Martin',
      secondary: '@jean',
    });
  });

  test('une conversation : son titre et son type nommé', () => {
    expect(entityOf(target('Conversation', 'Les voisins', 'group'))).toMatchObject({ kind: 'conversation', label: 'Les voisins', secondary: 'Groupe' });
  });

  test('une conversation sans titre connu se dit « Conversation sans titre », jamais son identifiant, et n’est pas dite supprimée', () => {
    const entity = entityOf(target('Conversation', null, 'direct'));

    expect(entity.label).toBe('Conversation sans titre');
    expect(entity.deleted).toBeUndefined();
  });

  test('une communauté : son nom et son identifiant public', () => {
    expect(entityOf(target('Community', 'Les Dakarois', 'dakarois'))).toMatchObject({ kind: 'community', label: 'Les Dakarois', secondary: 'dakarois' });
  });

  test('un lien de partage : son nom et la conversation qu’il ouvre ; sans nom, « Lien sans nom »', () => {
    expect(entityOf(target('ConversationShareLink', 'Invitation été', 'Les voisins'))).toMatchObject({
      kind: 'shareLink',
      label: 'Invitation été',
      secondary: 'Les voisins',
    });
    expect(entityOf(target('ConversationShareLink', null)).label).toBe('Lien sans nom');
  });

  test('un lien de suivi : son nom, sinon sa campagne, sinon « Lien de suivi sans nom »', () => {
    expect(entityOf(target('TrackingLink', 'Rentrée', 'rentree-2026'))).toMatchObject({ kind: 'trackingLink', label: 'Rentrée', secondary: 'rentree-2026' });
    expect(entityOf(target('TrackingLink', null)).label).toBe('Lien de suivi sans nom');
  });

  test('une publication : son type et son auteur, jamais son contenu', () => {
    const entity = entityOf(target('Post', 'Awa Diop', 'STORY'));

    expect(entity).toMatchObject({ kind: 'post', label: 'Story de Awa Diop' });
    expect(entity.secondary ?? null).toBeNull();
  });

  test('un signalement : son motif en mots, et le genre d’élément signalé', () => {
    expect(entityOf(target('Report', 'harassment', 'user'))).toMatchObject({ kind: 'report', label: 'Signalement · Harcèlement', secondary: 'Membre' });
  });

  test('une diffusion : son nom et son objet', () => {
    expect(entityOf(target('Broadcast', 'Nouveautés de rentrée', 'Bonne rentrée'))).toMatchObject({
      kind: 'broadcast',
      label: 'Nouveautés de rentrée',
      secondary: 'Bonne rentrée',
    });
  });

  test('une demande de contact : les deux noms tels que la passerelle les compose', () => {
    expect(entityOf(target('FriendRequest', 'Awa Diop → Jean Martin'))).toMatchObject({ kind: 'invitation', label: 'Awa Diop → Jean Martin' });
  });

  test('un genre sans fiche (modèle de l’agent, agent) est un texte : un nom de genre, jamais un lien', () => {
    expect(auditTargetOf(target('AgentLlmConfig', null), 'fr')).toEqual({ kind: 'plain', label: 'Modèle de l’agent', secondary: null });
    expect(auditTargetOf(target('Agent', null), 'fr')).toEqual({ kind: 'plain', label: 'Agent', secondary: null });
  });

  test('un genre inconnu se dit « Élément » : jamais le nom brut du genre', () => {
    expect(auditTargetOf(target('SomethingNew', null), 'fr')).toEqual({ kind: 'plain', label: 'Élément', secondary: null });
  });
});

describe('un élément sans nom connu', () => {
  const GENERIC: readonly (readonly [string, string])[] = [
    ['User', 'Compte'],
    ['Community', 'Communauté'],
    ['Broadcast', 'Diffusion'],
    ['Report', 'Signalement'],
    ['Post', 'Publication'],
    ['FriendRequest', 'Demande de contact'],
  ];

  for (const [type, generic] of GENERIC) {
    test(`${type} se dit par son genre (« ${generic} ») et est marqué supprimé`, () => {
      const entity = entityOf(target(type, null));

      expect(entity.label).toBe(generic);
      expect(entity.deleted).toBe(true);
      expect(entity.label).not.toContain(OBJECT_ID(9));
    });
  }
});

describe('auditEntityLabel — le genre d’élément, dit en mots', () => {
  test('les onze genres sont nommés ; un genre inconnu aussi', () => {
    expect(auditEntityLabel('ConversationShareLink', 'fr')).toBe('Lien de partage');
    expect(auditEntityLabel('AgentLlmConfig', 'fr')).toBe('Modèle de l’agent');
    expect(auditEntityLabel('Whatever', 'fr')).toBe('Élément');
  });
});

describe('auditPersonRef — une personne du journal', () => {
  test('nom affiché en libellé, @username en secondaire, photo', () => {
    expect(auditPersonRef({ id: OBJECT_ID(2), username: 'awa', displayName: 'Awa Diop', avatar: 'https://cdn.exemple.test/a.jpg' }, 'fr')).toEqual({
      kind: 'user',
      id: OBJECT_ID(2),
      label: 'Awa Diop',
      secondary: '@awa',
      avatarUrl: 'https://cdn.exemple.test/a.jpg',
    });
  });

  test('sans nom affiché, le @username est le libellé et n’est pas répété en secondaire', () => {
    const ref = auditPersonRef({ ...servedAuditPerson(2), displayName: null, username: 'awa' }, 'fr');

    expect(ref.label).toBe('@awa');
    expect(ref.secondary).toBeNull();
  });
});
