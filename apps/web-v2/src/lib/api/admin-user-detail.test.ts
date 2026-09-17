import { describe, expect, test } from 'bun:test';

import { decodeAdminUserDetail, loadAdminUserDetail } from './admin-user-detail';
import type { HttpTransport } from './http';

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
  customDestinationLanguage: 'en',
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

describe('LES TROIS RANGS DU PRISME DU MEMBRE (#6862)', () => {
  /**
   * Le décodeur n'en déclarait que DEUX : `customDestinationLanguage` — le
   * rang 3 — était servi par `sanitizeUser` et JETÉ ici. Tant que la fiche
   * n'affichait que des libellés, l'absence ne se voyait nulle part. Elle se
   * voit depuis que la modale de lecture rend le fil dans le Prisme DU MEMBRE :
   * un prisme amputé de son rang 3 sert l'ORIGINAL là où une traduction
   * existe, et le symptôme n'est pas une erreur — c'est une traduction qui a
   * l'air manquante.
   */
  test('les trois rangs sont décodés — un prisme amputé sert l’original en silence', () => {
    const membre = decodeAdminUserDetail(CHARGE_COMPLETE);

    expect(membre?.systemLanguage).toBe('fr');
    expect(membre?.regionalLanguage).toBe('wo');
    expect(membre?.customDestinationLanguage).toBe('en');
  });

  test('un rang non servi devient la chaîne VIDE, jamais `undefined`', () => {
    // `prismeDuMembre` filtre sur `code.trim() !== ''` : un `undefined` y
    // passerait par `.trim()` et lèverait.
    const membre = decodeAdminUserDetail({ ...CHARGE_COMPLETE, customDestinationLanguage: null });
    expect(membre?.customDestinationLanguage).toBe('');
  });
});

describe('decodeAdminUserDetail — refus', () => {
  test('rend null sur une charge sans identifiant — jamais un membre fantôme', () => {
    for (const charge of [null, undefined, 'ADMIN', 42, [], {}, { username: 'sans-id' }]) {
      expect(decodeAdminUserDetail(charge)).toBeNull();
    }
  });
});

describe('loadAdminUserDetail — l’adresse demandée, et ce qu’un refus devient', () => {
  const transportEspion = (reponse: unknown, ok = true) => {
    const appels: { path: string; method: string }[] = [];
    const transport = {
      request: async (requete: { path: string; method: string }) => {
        appels.push({ path: requete.path, method: requete.method });
        return ok ? { ok: true as const, data: reponse } : reponse;
      },
    } as unknown as HttpTransport;
    return { transport, appels };
  };

  const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

  test('vise /api/v1/admin/users/:userId, en GET', async () => {
    const { transport, appels } = transportEspion(CHARGE_COMPLETE);

    await loadAdminUserDetail({ ...deps(transport), userId: 'u-1' });

    expect(appels).toHaveLength(1);
    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1');
    expect(appels[0]?.method).toBe('GET');
  });

  /**
   * L'identifiant vient de l'URL que le visiteur a ouverte, jamais d'une
   * liste : il traverse le routeur tel qu'il a été tapé. Sans encodage, un
   * identifiant portant `?`, `#` ou `/` réécrirait le chemin demandé — au
   * mieux une requête qui échoue, au pire une AUTRE route de l'administration
   * atteinte avec les droits de celle-ci.
   */
  test('ENCODE l’identifiant — il vient de l’URL, pas d’une liste', async () => {
    const { transport, appels } = transportEspion(CHARGE_COMPLETE);

    await loadAdminUserDetail({ ...deps(transport), userId: 'u 1/../dashboard?x=1' });

    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/../dashboard?x=1')}`);
    expect(appels[0]?.path).not.toContain('/dashboard');
  });

  test('décode la charge SERVIE NUE — pas d’enveloppe à déballer', async () => {
    const { transport } = transportEspion(CHARGE_COMPLETE);

    const resultat = await loadAdminUserDetail({ ...deps(transport), userId: 'u-1' });

    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.data.username).toBe('amina');
    expect(resultat.ok && Object.keys(resultat.data)).not.toContain('lastLoginIp');
  });

  test('propage un refus du transport TEL QUEL — un 404 reste un 404', async () => {
    const refus = { ok: false as const, status: 404, error: 'User not found' };
    const { transport } = transportEspion(refus, false);

    const resultat = await loadAdminUserDetail({ ...deps(transport), userId: 'u-absent' });

    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.status).toBe(404);
    expect(!resultat.ok && resultat.error).toBe('User not found');
  });

  /**
   * La requête a RÉUSSI et la charge est illisible : ce n'est ni un 404 ni une
   * panne réseau. `status: 0` est la convention du port pour ce cas précis
   * (`app-preferences.ts`, `communities.ts` — « Réglages illisibles »,
   * « Communauté illisible »), et elle se distingue à dessein d'un 404, qui
   * dirait que le membre n'existe pas.
   */
  test('une charge ILLISIBLE devient un échec à status 0 — jamais un membre fantôme', async () => {
    const { transport } = transportEspion({ username: 'sans-id' });

    const resultat = await loadAdminUserDetail({ ...deps(transport), userId: 'u-1' });

    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.status).toBe(0);
  });
});
