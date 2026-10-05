import { describe, expect, test } from 'bun:test';

import { createAdminUser, missingCreateFields, type AdminUserCreateInput } from './admin-user-create';
import type { HttpRequest, HttpTransport } from './http';

/**
 * CRÉER UN COMPTE DEPUIS L'ADMINISTRATION (#8217) — `POST /api/v1/admin/users`,
 * sous `canCreateUsers`. La passerelle normalise l'adresse, refuse un doublon
 * d'adresse ou de pseudonyme en 409 typé (`EMAIL_TAKEN` / `USERNAME_TAKEN`) et
 * un mot de passe trop faible en 400 ; le port transporte, il ne rejoue
 * aucune de ces règles.
 */

const SAISIE: AdminUserCreateInput = {
  username: ' amina ',
  firstName: ' Amina ',
  lastName: 'Diallo',
  email: ' Amina@Example.test ',
  password: 'un secret robuste 2026',
  role: 'USER',
  systemLanguage: 'fr',
};

const MEMBRE_SERVI = {
  id: 'u-new',
  username: 'amina',
  displayName: 'Amina Diallo',
  email: 'amina@example.test',
  role: 'USER',
  isActive: true,
};

const transportScenarise = (reponse: unknown) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: HttpRequest) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('createAdminUser', () => {
  test('vise POST /api/v1/admin/users, champs ÉMONDÉS, mot de passe INTACT', async () => {
    const { transport, appels } = transportScenarise({ ok: true, data: MEMBRE_SERVI });

    const resultat = await createAdminUser({ ...deps(transport), input: SAISIE });

    expect(appels[0]).toEqual({
      method: 'POST',
      path: '/api/v1/admin/users',
      body: {
        username: 'amina',
        firstName: 'Amina',
        lastName: 'Diallo',
        email: 'Amina@Example.test',
        password: 'un secret robuste 2026',
        role: 'USER',
        systemLanguage: 'fr',
      },
    });
    expect(resultat.ok && resultat.data.id).toBe('u-new');
  });

  test('porte l’attestation de l’adresse quand l’administrateur la donne, et seulement alors', async () => {
    const { transport, appels } = transportScenarise({ ok: true, data: MEMBRE_SERVI });

    await createAdminUser({ ...deps(transport), input: SAISIE, emailVerified: true });
    await createAdminUser({ ...deps(transport), input: SAISIE });

    expect((appels[0]?.body as Record<string, unknown>).emailVerified).toBe(true);
    expect('emailVerified' in (appels[1]?.body as Record<string, unknown>)).toBe(false);
  });

  test('relaie un doublon avec son code, pour que l’écran le pose sous son champ', async () => {
    const { transport } = transportScenarise({ ok: false, status: 409, error: 'taken', code: 'USERNAME_TAKEN' });

    const resultat = await createAdminUser({ ...deps(transport), input: SAISIE });

    expect(resultat).toEqual({ ok: false, status: 409, error: 'taken', code: 'USERNAME_TAKEN' });
  });

  test('refuse sans appeler une saisie à laquelle il manque un champ requis', async () => {
    const { transport, appels } = transportScenarise({ ok: true, data: MEMBRE_SERVI });

    const resultat = await createAdminUser({ ...deps(transport), input: { ...SAISIE, lastName: '  ' } });

    expect(resultat.ok).toBe(false);
    expect(appels).toEqual([]);
  });
});

describe('missingCreateFields', () => {
  test('nomme les champs requis vides, blancs compris', () => {
    expect(missingCreateFields({ ...SAISIE, username: ' ', email: '' })).toEqual(['username', 'email']);
    expect(missingCreateFields(SAISIE)).toEqual([]);
  });
});
