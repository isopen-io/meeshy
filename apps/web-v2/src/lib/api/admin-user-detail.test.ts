import { describe, expect, test } from 'bun:test';

import { decodeAdminUserDetail } from './admin-user-detail';

/**
 * LE DÉTAIL D'UN MEMBRE (#6819) — et surtout ce qu'il ne doit PAS retenir.
 *
 * `GET /admin/users/:userId` sert `sanitizeUser` NU (pas d'enveloppe, à la
 * différence de la liste dont la `pagination` voyage DANS `data`). Sous
 * `canViewSensitiveData`, cette charge porte des éléments qu'un cache n'a pas
 * à garder : `twoFactorBackupCodes`, `lastLoginIp`, `lastLoginLocation`,
 * `lastLoginDevice`, `registrationIp`, `registrationLocation`,
 * `registrationDevice`, `registrationCountry`.
 *
 * **Le cache des requêtes est PERSISTÉ dans `localStorage`** (`query-client.ts`,
 * `shouldDehydrateQuery` déshydrate tout succès) et **aucun mécanisme
 * d'exemption n'existe**. Tout champ que ce décodeur accepte finit donc écrit
 * sur le disque du navigateur — ici celui d'un administrateur, qui consulte
 * des comptes qui ne sont pas le sien. Des codes de secours de second facteur
 * et des empreintes de connexion y seraient une fuite durable, survivant à la
 * déconnexion.
 *
 * DEUX GARDES POUR UNE RÈGLE, comme pour le port de la sécurité du compte
 * (#6720) : le type ne DÉCLARE pas ces champs, et le décodeur construit son
 * objet champ par champ — jamais un `...spread` de la charge, qui les
 * réintroduirait en silence au premier ajout côté serveur.
 */

const CHARGE_COMPLETE = {
  id: 'u-1',
  username: 'amina',
  firstName: 'Amina',
  lastName: 'Diallo',
  displayName: 'Amina Diallo',
  bio: 'Traductrice',
  avatar: 'https://example.test/a.png',
  role: 'MODERATOR',
  isActive: true,
  isOnline: true,
  emailVerifiedAt: '2026-01-02T10:00:00.000Z',
  phoneVerifiedAt: null,
  lastActiveAt: '2026-09-16T08:00:00.000Z',
  createdAt: '2025-12-01T09:00:00.000Z',
  updatedAt: '2026-09-15T09:00:00.000Z',
  deactivatedAt: null,
  email: 'amina@example.test',
  phoneNumber: '+221770000000',
  timezone: 'Africa/Dakar',
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  lastPasswordChange: '2026-06-01T09:00:00.000Z',
  failedLoginAttempts: 2,
  lockedUntil: null,
  lockedReason: null,
  twoFactorEnabledAt: '2026-05-01T09:00:00.000Z',
  deletedAt: null,
  deletedBy: null,

  // Ce qui ne doit JAMAIS ressortir.
  twoFactorBackupCodes: ['aaaa-bbbb', 'cccc-dddd'],
  lastLoginIp: '196.0.0.1',
  lastLoginLocation: 'Dakar, SN',
  lastLoginDevice: 'iPhone 15 Pro',
  registrationIp: '196.0.0.2',
  registrationLocation: 'Dakar, SN',
  registrationDevice: 'Safari macOS',
  registrationCountry: 'SN',
};

const INTERDITS = [
  'twoFactorBackupCodes',
  'lastLoginIp',
  'lastLoginLocation',
  'lastLoginDevice',
  'registrationIp',
  'registrationLocation',
  'registrationDevice',
  'registrationCountry',
] as const;

describe('decodeAdminUserDetail — ce que le cache ne doit pas garder', () => {
  test('ÉCARTE les huit champs traçants, alors que la charge les porte tous', () => {
    const membre = decodeAdminUserDetail(CHARGE_COMPLETE);

    expect(membre).not.toBeNull();
    const clefs = Object.keys(membre ?? {});
    for (const interdit of INTERDITS) {
      expect(clefs).not.toContain(interdit);
    }
  });

  test('les écarte AUSSI quand la charge est la seule source — aucun spread ne les réintroduit', () => {
    const membre = decodeAdminUserDetail({ ...CHARGE_COMPLETE, champInconnuDuJour: 'valeur' });

    expect(Object.keys(membre ?? {})).not.toContain('champInconnuDuJour');
  });
});

describe('decodeAdminUserDetail — ce qu’il sert', () => {
  test('décode l’identité, le rôle et l’état', () => {
    const membre = decodeAdminUserDetail(CHARGE_COMPLETE);

    expect(membre?.id).toBe('u-1');
    expect(membre?.username).toBe('amina');
    expect(membre?.displayName).toBe('Amina Diallo');
    expect(membre?.email).toBe('amina@example.test');
    expect(membre?.role).toBe('MODERATOR');
    expect(membre?.isActive).toBe(true);
    expect(membre?.isOnline).toBe(true);
  });

  test('décode ce qui dit l’ÉTAT d’un compte — supprimé, désactivé, verrouillé', () => {
    const membre = decodeAdminUserDetail({
      ...CHARGE_COMPLETE,
      isActive: false,
      deactivatedAt: '2026-09-10T09:00:00.000Z',
      deletedAt: '2026-09-11T09:00:00.000Z',
      deletedBy: 'u-admin',
      lockedUntil: '2026-09-20T09:00:00.000Z',
      lockedReason: 'trop d’essais',
    });

    expect(membre?.isActive).toBe(false);
    expect(membre?.deactivatedAt).toBe('2026-09-10T09:00:00.000Z');
    expect(membre?.deletedAt).toBe('2026-09-11T09:00:00.000Z');
    expect(membre?.deletedBy).toBe('u-admin');
    expect(membre?.lockedUntil).toBe('2026-09-20T09:00:00.000Z');
    expect(membre?.lockedReason).toBe('trop d’essais');
  });

  /**
   * #6822 — la passerelle n'écrit `deletedAt` sur AUCUN chemin d'administration :
   * `DELETE /admin/users/:userId` ne pose que `isActive:false`. Un compte
   * supprimé se présente donc aujourd'hui avec `deletedAt: null`. L'écran doit
   * pouvoir DIRE « désactivé » sans prétendre « supprimé » — d'où la lecture
   * SÉPARÉE des trois champs plutôt qu'un statut calculé ici.
   */
  test('un compte inactif SANS deletedAt reste distinct d’un compte supprimé', () => {
    const membre = decodeAdminUserDetail({ ...CHARGE_COMPLETE, isActive: false, deletedAt: null, deactivatedAt: null });

    expect(membre?.isActive).toBe(false);
    expect(membre?.deletedAt).toBeNull();
    expect(membre?.deactivatedAt).toBeNull();
  });

  test('le nom affiché retombe sur le pseudo — jamais un détail sans nom', () => {
    const membre = decodeAdminUserDetail({ ...CHARGE_COMPLETE, displayName: '' });

    expect(membre?.displayName).toBe('amina');
  });

  test('les dates absentes deviennent null, jamais une chaîne vide', () => {
    const membre = decodeAdminUserDetail({ id: 'u-2', username: 'kwame' });

    expect(membre?.createdAt).toBeNull();
    expect(membre?.emailVerifiedAt).toBeNull();
    expect(membre?.twoFactorEnabledAt).toBeNull();
  });

  test('le second facteur se lit comme un FAIT, pas comme une date à afficher', () => {
    expect(decodeAdminUserDetail(CHARGE_COMPLETE)?.twoFactorEnabled).toBe(true);
    expect(decodeAdminUserDetail({ id: 'u-3', username: 'k' })?.twoFactorEnabled).toBe(false);
  });
});

describe('decodeAdminUserDetail — refus', () => {
  test('rend null sur une charge sans identifiant — jamais un membre fantôme', () => {
    for (const charge of [null, undefined, 'ADMIN', 42, [], {}, { username: 'sans-id' }]) {
      expect(decodeAdminUserDetail(charge)).toBeNull();
    }
  });
});
