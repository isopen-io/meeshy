import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminAnonymousRow } from '@/lib/api/admin-anonymous';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  ANONYMOUS_PERMISSION_KEYS,
  anonymousConversationRefOf,
  anonymousEntityOf,
  anonymousPermissionPhrase,
  anonymousPresenceOf,
  anonymousStateOf,
} from './user-anonymous';

const NOW = new Date('2026-09-30T12:00:00.000Z');

const row = (overrides: Partial<AdminAnonymousRow> = {}): AdminAnonymousRow => ({
  id: '64f1c2a9e8b7d6c5b4a39281',
  displayName: 'Awa',
  avatar: '',
  language: 'es',
  isActive: true,
  isOnline: false,
  lastActiveAt: null,
  joinedAt: '2026-09-29T08:00:00.000Z',
  leftAt: null,
  conversation: { id: '64f1c2a9e8b7d6c5b4a39299', title: 'Le club', type: 'group' },
  messageCount: 12,
  ...overrides,
});

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

describe('anonymousEntityOf — un invité se nomme, il ne se numérote pas', () => {
  test('le nom servi fait le libellé ; un nom vide se dit « Invité sans nom », jamais « — » ni l’identifiant', () => {
    expect(anonymousEntityOf(row(), 'fr', NOW).label).toBe('Awa');
    expect(anonymousEntityOf(row({ displayName: '' }), 'fr', NOW).label).toBe('Invité sans nom');
    expect(anonymousEntityOf(row({ displayName: '' }), 'en', NOW).label).not.toMatch(/[0-9a-f]{24}/);
  });

  test('c’est la fiche d’un ANONYME, avec une photo seulement si elle est servie', () => {
    const entity = anonymousEntityOf(row({ avatar: 'https://cdn.test/awa.png' }), 'fr', NOW);
    expect(entity.kind).toBe('anonymous');
    expect(entity.avatarUrl).toBe('https://cdn.test/awa.png');
    expect(anonymousEntityOf(row(), 'fr', NOW).avatarUrl).toBeNull();
  });

  test('la présence est CALCULÉE par la règle partagée : en ligne et active à l’instant ⇒ online, rien de servi ⇒ offline (aucun point)', () => {
    expect(anonymousEntityOf(row({ isOnline: true, lastActiveAt: '2026-09-30T11:59:40.000Z' }), 'fr', NOW).presence).toBe('online');
    expect(anonymousEntityOf(row({ isOnline: false, lastActiveAt: '2026-09-30T11:58:00.000Z' }), 'fr', NOW).presence).toBe('away');
    expect(anonymousEntityOf(row(), 'fr', NOW).presence).toBe('offline');
  });
});

describe('anonymousConversationRefOf — la conversation, nommée', () => {
  test('son titre, et son type dit en mots quand il est servi', () => {
    const ref = anonymousConversationRefOf({ id: 'c1', title: 'Le club', type: 'group' }, 'fr');
    expect(ref).toEqual({ kind: 'conversation', id: 'c1', label: 'Le club', secondary: 'Groupe' });
  });

  test('sans titre : « Conversation sans titre », jamais son identifiant ; sans type : pas de secondaire', () => {
    const ref = anonymousConversationRefOf({ id: '64f1c2a9e8b7d6c5b4a39299', title: '', type: '' }, 'fr');
    expect(ref.label).toBe('Conversation sans titre');
    expect(ref.secondary).toBeNull();
  });
});

describe('anonymousStateOf — un seul état, le plus parlant', () => {
  test('parti > accès retiré > actif', () => {
    expect(anonymousStateOf(row({ leftAt: '2026-09-30T09:00:00.000Z', isActive: false }), 'fr').label).toBe('Parti');
    expect(anonymousStateOf(row({ isActive: false }), 'fr').label).toBe('Accès retiré');
    expect(anonymousStateOf(row(), 'fr').label).toBe('Actif');
  });

  test('chaque état porte son ton et une phrase qui l’explique', () => {
    const revoked = anonymousStateOf(row({ isActive: false }), 'fr');
    expect(revoked.tone).toBe('warning');
    expect(revoked.explain).toContain('lien');
    expect(anonymousStateOf(row(), 'fr').tone).toBe('success');
  });
});

describe('anonymousPresenceOf — la présence masquée se dit « Non communiquée »', () => {
  test('rien de servi (isOnline faux, aucune activité) : Non communiquée, avec sa phrase', () => {
    const hidden = anonymousPresenceOf(row(), NOW, 'fr');
    expect(hidden.label).toBe('Non communiquée');
    expect(hidden.explain).not.toBeNull();
  });

  test('servie : en ligne, absent, inactif', () => {
    expect(anonymousPresenceOf(row({ isOnline: true, lastActiveAt: '2026-09-30T11:59:50.000Z' }), NOW, 'fr').label).toBe('En ligne');
    expect(anonymousPresenceOf(row({ lastActiveAt: '2026-09-30T11:58:00.000Z' }), NOW, 'fr').label).toBe('Absent');
    expect(anonymousPresenceOf(row({ lastActiveAt: '2026-09-30T11:56:00.000Z' }), NOW, 'fr').label).toBe('Inactif');
    expect(anonymousPresenceOf(row({ lastActiveAt: '2026-09-29T11:56:00.000Z' }), NOW, 'fr').label).toBe('Hors ligne');
  });
});

describe('anonymousPermissionPhrase — une permission se DIT en phrase', () => {
  test('les huit permissions servies ont leur phrase, accordée et refusée — jamais canSendMessages', () => {
    for (const key of ANONYMOUS_PERMISSION_KEYS) {
      const yes = anonymousPermissionPhrase(key, true, 'fr');
      const no = anonymousPermissionPhrase(key, false, 'fr');
      expect(yes).not.toBe(no);
      expect(yes).not.toContain('canSend');
      expect(no).not.toContain('canView');
    }
    expect(anonymousPermissionPhrase('canSendFiles', true, 'fr')).toBe('Peut envoyer des fichiers');
    expect(anonymousPermissionPhrase('canSendFiles', false, 'fr')).toBe('Ne peut pas envoyer de fichiers');
    expect(anonymousPermissionPhrase('canViewHistory', true, 'fr')).toBe('Voit les messages écrits avant son arrivée');
  });

  test('une permission future est humanisée et dite Oui / Non, jamais sa clé brute', () => {
    expect(anonymousPermissionPhrase('canStartCalls', true, 'fr')).toBe('Can start calls : Oui');
    expect(anonymousPermissionPhrase('canStartCalls', false, 'fr')).toBe('Can start calls : Non');
  });
});
