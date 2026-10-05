import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminDashboard } from '@/lib/api/admin-dashboard';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { agentStats, healthAlerts, healthStats, moderationStats, nowStats, platformStats, usageStats } from './dashboard-cards';
import { ADMINISTRATION_RANK } from './user-list';

/**
 * **LES CARTES DU TABLEAU DE BORD, EN MOTS** (#8876, § 4) — libellé, chiffre
 * formaté, légende, et la liste FILTRÉE où chaque carte mène. Fonctions pures :
 * la valeur est dite par la bibliothèque d'interprétation, la cible est celle
 * de la spécification.
 */

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const NOW = new Date('2026-09-30T12:00:00.000Z');
const flat = (text: string | undefined): string => (text ?? '').replace(/[  ]/g, ' ');

const DASHBOARD: AdminDashboard = {
  totalUsers: 1200,
  activeUsers: 900,
  inactiveUsers: 300,
  adminUsers: 2,
  totalAnonymousUsers: 140,
  activeAnonymousUsers: 60,
  totalMessages: 34_000,
  totalCommunities: 5,
  totalTranslations: 21_000,
  totalShareLinks: 40,
  activeShareLinks: 31,
  totalReports: 9,
  newUsers24h: 3,
  newConversations24h: 4,
  newMessages24h: 500,
  newAnonymousUsers24h: 2,
};

const byAnchor = <T extends { readonly anchor: string }>(items: readonly T[], anchor: string): T | undefined => items.find((item) => item.anchor === anchor);

describe('platformStats — huit cartes, chacune vers sa liste filtrée', () => {
  const cardsOf = () => platformStats(DASHBOARD, 'fr');

  test('les huit cartes, dans l’ordre de la spécification', () => {
    expect(cardsOf().map((card) => card.anchor)).toEqual([
      'platform-users',
      'platform-active-users',
      'platform-anonymous',
      'platform-messages',
      'platform-conversations',
      'platform-communities',
      'platform-share-links',
      'platform-admins',
    ]);
  });

  test('les valeurs sont formatées dans la langue d’interface, les légendes en mots', () => {
    expect(cardsOf().map((card) => [card.label, flat(card.value), flat(card.caption)])).toEqual([
      ['Comptes', '1 200', '3 nouveaux en 24 h'],
      ['Comptes actifs', '900', '75 % des comptes · 300 désactivés'],
      ['Participants anonymes', '140', '60 actifs · 2 arrivés en 24 h'],
      ['Messages', '34 000', '500 en 24 h'],
      ['Nouvelles conversations', '4', 'Créées ces 24 dernières heures'],
      ['Communautés', '5', ''],
      ['Liens de partage actifs', '31', 'sur 40'],
      ['Administrateurs', '2', 'Administrateurs et créateur'],
    ]);
  });

  test('les cibles sont les listes filtrées de la spécification', () => {
    expect(cardsOf().map((card) => card.target)).toEqual([
      { kind: 'section', section: 'users' },
      { kind: 'section', section: 'users', search: { isActive: 'true' } },
      { kind: 'section', section: 'anonymous' },
      { kind: 'section', section: 'analytics', search: { tab: 'messages' } },
      { kind: 'section', section: 'conversations', search: { period: '24h', sort: 'createdAt' } },
      { kind: 'section', section: 'communities' },
      { kind: 'section', section: 'shareLinks', search: { isActive: 'true' } },
      { kind: 'section', section: 'users', search: { role: 'ADMINISTRATION' } },
    ]);
  });

  test('la carte « Administrateurs » compte créateur ET administrateurs : sa cible ouvre le MÊME ensemble (rang d’administration)', () => {
    expect(byAnchor(cardsOf(), 'platform-admins')?.target).toEqual({ kind: 'section', section: 'users', search: { role: ADMINISTRATION_RANK } });
    expect(ADMINISTRATION_RANK).toBe('ADMINISTRATION');
  });

  test('« Nouvelles conversations » compte celles de 24 h : sa cible est la liste des dernières 24 h, la plus récente d’abord', () => {
    const target = byAnchor(cardsOf(), 'platform-conversations')?.target;

    expect(target).toEqual({ kind: 'section', section: 'conversations', search: { period: '24h', sort: 'createdAt' } });
  });

  test('en anglais, tout se dit en anglais', () => {
    const en = platformStats(DASHBOARD, 'en');
    expect(en[0]?.label).toBe('Accounts');
    expect(en[1]?.caption).toBe('75% of accounts · 300 deactivated');
    expect(en[2]?.caption).toBe('60 active · 2 joined in 24 h');
  });

  test('un compteur inconnu se dit « — », et sa légende n’est pas inventée', () => {
    const partial = platformStats({ ...DASHBOARD, totalUsers: null, inactiveUsers: null, newUsers24h: null, totalShareLinks: null }, 'fr');
    expect(byAnchor(partial, 'platform-users')).toMatchObject({ value: '—' });
    expect(byAnchor(partial, 'platform-users')?.caption).toBeUndefined();
    expect(byAnchor(partial, 'platform-active-users')?.caption).toBeUndefined();
    expect(byAnchor(partial, 'platform-share-links')?.caption).toBeUndefined();
  });

  test('sans inactifs connus, la légende garde la part et rien d’autre', () => {
    const partial = platformStats({ ...DASHBOARD, inactiveUsers: null }, 'fr');
    expect(flat(byAnchor(partial, 'platform-active-users')?.caption)).toBe('75 % des comptes');
  });

  test('sans charge (chargement), les cartes gardent libellé et cible', () => {
    const loading = platformStats(null, 'fr');
    expect(loading).toHaveLength(8);
    expect(loading.every((card) => card.value === '—' && card.label !== '')).toBe(true);
  });

  test('aucune carte n’affiche un compte brut ni un identifiant', () => {
    for (const card of cardsOf()) expect(`${card.label} ${card.value} ${card.caption ?? ''}`).not.toMatch(/undefined|null|NaN|true|false/);
  });
});

describe('nowStats — trois cartes temps réel, toutes vers les statistiques', () => {
  test('valeurs et légendes', () => {
    const cards = nowStats({ onlineUsers: 12, messagesLastHour: 340, activeConversations: 27 }, 'fr');
    expect(cards.map((card) => [card.label, card.value])).toEqual([
      ['En ligne maintenant', '12'],
      ['Messages dans la dernière heure', '340'],
      ['Conversations actives', '27'],
    ]);
    expect(cards.every((card) => card.target.kind === 'section' && card.target.section === 'analytics')).toBe(true);
  });

  test('un compteur inconnu se dit « — »', () => {
    expect(nowStats({ onlineUsers: null, messagesLastHour: 1, activeConversations: 2 }, 'fr')[0]?.value).toBe('—');
  });
});

describe('usageStats — les taux en pourcentage, les messages par compte en nombre', () => {
  test('0–100 → pourcentage ; messages par compte reste un compte', () => {
    const cards = usageStats({ engagementRate: 42, growthRate: 7, messagesPerUser: 31, activeUserRate: 42 }, 'fr');
    expect(cards.map((card) => [card.label, flat(card.value)])).toEqual([
      ['Taux d’engagement', '42 %'],
      ['Croissance', '7 %'],
      ['Messages par compte', '31'],
      ['Taux de comptes actifs', '42 %'],
    ]);
  });

  test('en anglais, le pourcentage se dit à l’anglaise', () => {
    expect(usageStats({ engagementRate: 42, growthRate: 7, messagesPerUser: 31, activeUserRate: 42 }, 'en')[0]?.value).toBe('42%');
  });

  test('un taux inconnu se dit « — », jamais « 0 % »', () => {
    expect(usageStats({ engagementRate: null, growthRate: null, messagesPerUser: null, activeUserRate: null }, 'fr').map((card) => card.value)).toEqual([
      '—',
      '—',
      '—',
      '—',
    ]);
  });
});

describe('moderationStats — la file et son délai', () => {
  test('en attente et en cours mènent à la liste filtrée par statut ; le délai se dit en durée', () => {
    const cards = moderationStats({ pending: 6, underReview: 2, averageResolutionHours: 5.5 }, 'fr');
    expect(cards.map((card) => [card.label, flat(card.value)])).toEqual([
      ['En attente', '6'],
      ['En cours d’examen', '2'],
      ['Délai moyen de résolution', '5 h 30 min'],
    ]);
    expect(cards[0]?.target).toEqual({ kind: 'section', section: 'reports', search: { status: 'pending' } });
    expect(cards[1]?.target).toEqual({ kind: 'section', section: 'reports', search: { status: 'under_review' } });
    expect(cards[2]?.caption).toBe('Hors dossiers classés sans suite');
  });

  test('sans dossier résolu (0 h servi) le délai est « — », jamais « 0 ms »', () => {
    expect(moderationStats({ pending: 0, underReview: 0, averageResolutionHours: 0 }, 'fr')[2]?.value).toBe('—');
  });
});

describe('healthStats — la santé de la plateforme', () => {
  const monitoring = {
    database: { status: 'up', latencyMs: 4 },
    redis: { status: 'down', latencyMs: null },
    connections: 120,
    connectedUsers: 80,
    breakers: [
      { name: 'translator', state: 'OPEN' },
      { name: 'redis', state: 'CLOSED' },
    ],
  };

  test('l’état se dit en mots, la latence en durée, les coupe-circuits ouverts se comptent et se nomment', () => {
    const cards = healthStats(monitoring, 'fr');
    expect(cards.map((card) => [card.label, flat(card.value), flat(card.caption)])).toEqual([
      ['Base de données', 'Opérationnel', 'Réponse en 4 ms'],
      ['Redis (cache)', 'Hors service', 'Ne répond pas'],
      ['Connexions en temps réel', '120', '80 comptes connectés'],
      ['Coupe-circuits ouverts', '1', 'Coupés : translator'],
    ]);
    expect(cards.every((card) => card.target.kind === 'section' && card.target.section === 'monitoring')).toBe(true);
  });

  test('sans coupe-circuit ouvert, on dit que tout répond', () => {
    const cards = healthStats({ ...monitoring, breakers: [{ name: 'redis', state: 'CLOSED' }] }, 'fr');
    expect(cards[3]?.value).toBe('0');
    expect(cards[3]?.caption).toBe('Tous les services répondent');
  });

  test('une dépendance que la charge ne mentionne pas est « Inconnu », jamais « Opérationnel »', () => {
    const cards = healthStats({ ...monitoring, database: { status: null, latencyMs: null } }, 'fr');
    expect(cards[0]?.value).toBe('Inconnu');
    expect(cards[0]?.caption).toBeUndefined();
  });

  test('sans charge, des cartes en attente', () => {
    expect(healthStats(null, 'fr').map((card) => card.value)).toEqual(['—', '—', '—', '—']);
  });

  test('les alertes ne parlent que de ce qui ne va pas', () => {
    expect(healthAlerts(monitoring, 'fr')).toEqual([
      'Le cache Redis ne répond pas.',
      'Des coupe-circuits sont ouverts : des appels sont refusés le temps que le service se rétablisse.',
    ]);
    expect(healthAlerts({ ...monitoring, redis: { status: 'up', latencyMs: 2 }, breakers: [] }, 'fr')).toEqual([]);
  });
});

describe('agentStats — configurations, messages, dernière activité', () => {
  test('la dernière activité se dit en relatif, avec la date en légende', () => {
    const cards = agentStats({ totalConfigs: 4, activeConfigs: 3, messagesSent: 486, lastActivityAt: '2026-09-30T09:00:00.000Z' }, NOW, 'fr');
    expect(cards.map((card) => [card.label, flat(card.value)])).toEqual([
      ['Configurations actives', '3'],
      ['Messages publiés', '486'],
      ['Dernière activité', 'il y a 3 heures'],
    ]);
    expect(cards[0]?.caption).toBe('sur 4 configurations');
    expect(flat(cards[2]?.caption)).toContain('30 sept. 2026');
    expect(cards.every((card) => card.target.kind === 'section' && card.target.section === 'agent')).toBe(true);
  });

  test('sans activité, « Aucune activité » — jamais « Jamais » ni une date vide', () => {
    const cards = agentStats({ totalConfigs: 1, activeConfigs: 0, messagesSent: 0, lastActivityAt: null }, NOW, 'fr');
    expect(cards[2]?.value).toBe('Aucune activité');
    expect(cards[2]?.caption).toBeUndefined();
  });
});
