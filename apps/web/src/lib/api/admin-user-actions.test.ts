import { describe, expect, test } from 'bun:test';

import { editableFieldsOf, updateAdminUser, updateAdminUserSecurity, updateAdminUserVerifications } from './admin-user-actions';
import type { HttpTransport } from './http';

/**
 * L'ÉDITION D'UN MEMBRE (#6819) — `PATCH /api/v1/admin/users/:userId`.
 *
 * Trois pièges du contrat sont gardés ici, parce que chacun produit un défaut
 * SILENCIEUX :
 *
 * 1. **Le méta-champ s'appelle `reason`, pas `motif`.** La passerelle le
 *    renomme en interne (`motifDe(corps)` lit `corps.reason`, l'audit le
 *    journalise en `reason`), et les deux noms coexistent dans son code.
 *    Envoyer `motif` ferait perdre le motif sans rien signaler — le geste
 *    passerait, la trace serait muette.
 * 2. **Un corps sans champ est refusé par la passerelle** (400, « Aucun champ
 *    à écrire »). On le refuse AVANT l'aller-retour : un refus qui n'apprend
 *    rien ne mérite pas un appel réseau.
 * 3. **Une valeur `undefined` ne compte pas.** En JSON elle n'existe pas, et
 *    `champsPresentes` l'exclut. Un formulaire qui envoie `{ bio: undefined }`
 *    croit écrire et ne présente aucun champ.
 */

const MEMBRE_SERVI = {
  id: 'u-1',
  username: 'amina',
  displayName: 'Amina Diallo',
  email: 'amina@example.test',
  role: 'MODERATOR',
  isActive: true,
  isOnline: false,
};

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('editableFieldsOf — ce que l’appelant présente vraiment', () => {
  test('exclut les valeurs `undefined` — en JSON elles n’existent pas', () => {
    expect(editableFieldsOf({ displayName: 'Amina', bio: undefined })).toEqual(['displayName']);
  });

  test('rend la liste VIDE sur une édition sans rien à écrire', () => {
    expect(editableFieldsOf({})).toEqual([]);
    expect(editableFieldsOf({ bio: undefined, displayName: undefined })).toEqual([]);
  });
});

describe('updateAdminUser — l’adresse, le corps, et ce qui revient', () => {
  test('vise PATCH /api/v1/admin/users/:userId, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    await updateAdminUser({ ...deps(transport), userId: 'u 1/x', edit: { displayName: 'Amina' } });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}`);
  });

  test('envoie un corps PLAT — les champs à la racine, jamais imbriqués', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { displayName: 'Amina', isActive: false } });

    expect(appels[0]?.body).toEqual({ displayName: 'Amina', isActive: false });
  });

  test('le motif voyage sous la clé `reason` — jamais `motif`', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { role: 'ADMIN' }, reason: 'promotion actée' });

    const corps = appels[0]?.body as Record<string, unknown>;
    expect(corps.reason).toBe('promotion actée');
    expect(Object.keys(corps)).not.toContain('motif');
  });

  test('n’envoie PAS `reason` quand il est absent ou blanc — un méta-champ vide n’est pas un motif', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { bio: 'x' }, reason: '   ' });

    expect(Object.keys((appels[0]?.body ?? {}) as Record<string, unknown>)).not.toContain('reason');
  });

  test('REFUSE avant l’aller-retour une édition sans aucun champ', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    const resultat = await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: {} });

    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.status).toBe(0);
    expect(appels).toHaveLength(0);
  });

  test('décode le membre À JOUR que la route rend — pas besoin de recharger', async () => {
    const { transport } = transportEspion({ ...MEMBRE_SERVI, displayName: 'Amina D.' });

    const resultat = await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { displayName: 'Amina D.' } });

    expect(resultat.ok).toBe(true);
    expect(resultat.ok && resultat.data.displayName).toBe('Amina D.');
  });

  test('n’expose pas davantage que la fiche — les champs traçants restent écartés', async () => {
    const { transport } = transportEspion({ ...MEMBRE_SERVI, lastLoginIp: '196.0.0.1', twoFactorBackupCodes: ['a'] });

    const resultat = await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { bio: 'x' } });

    expect(resultat.ok && Object.keys(resultat.data)).not.toContain('lastLoginIp');
    expect(resultat.ok && Object.keys(resultat.data)).not.toContain('twoFactorBackupCodes');
  });

  /**
   * 403 de hiérarchie (l'acteur ne surclasse pas sa cible) et 400 de la loi du
   * champ portent des remèdes DIFFÉRENTS : le premier ne cédera jamais, le
   * second se corrige en changeant ce qu'on écrit. Les aplatir priverait
   * l'écran du seul moyen de le dire.
   */
  test('propage un refus TEL QUEL — 403 de rang et 400 de loi restent distincts', async () => {
    for (const refus of [
      { ok: false as const, status: 403, error: 'Hierarchy' },
      { ok: false as const, status: 400, error: 'Aucun champ à écrire' },
    ]) {
      const { transport } = transportEspion(refus, false);
      const resultat = await updateAdminUser({ ...deps(transport), userId: 'u-1', edit: { bio: 'x' } });

      expect(resultat.ok).toBe(false);
      expect(!resultat.ok && resultat.status).toBe(refus.status);
    }
  });
});

/**
 * SÉCURITÉ ET VÉRIFICATIONS (#7845) — `PATCH …/security` (déverrouiller,
 * double authentification) et `PATCH …/verifications` (e-mail, téléphone, âge).
 * Deux familles à part de l'édition, avec leurs propres routes et leur propre
 * audit : les mêler ferait perdre à l'appelant le coût de son geste.
 */
describe('updateAdminUserSecurity', () => {
  test('vise PATCH …/security avec un corps PLAT, et décode le membre rendu', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    const resultat = await updateAdminUserSecurity({
      ...deps(transport),
      userId: 'u 1',
      change: { unlock: true, twoFactorEnabled: false },
      reason: '  demande vérifiée  ',
    });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/security`);
    expect(appels[0]?.body).toEqual({ unlock: true, twoFactorEnabled: false, reason: 'demande vérifiée' });
    expect(resultat.ok && resultat.data.username).toBe('amina');
  });

  test('refuse un changement VIDE avant le réseau', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    const resultat = await updateAdminUserSecurity({ ...deps(transport), userId: 'u-1', change: { twoFactorEnabled: undefined } });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
  });
});

describe('updateAdminUserVerifications', () => {
  test('vise PATCH …/verifications, sans motif blanc', async () => {
    const { transport, appels } = transportEspion(MEMBRE_SERVI);

    await updateAdminUserVerifications({
      ...deps(transport),
      userId: 'u-1',
      change: { emailVerified: true, ageVerified: false, phoneVerified: undefined },
      reason: '   ',
    });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe('/api/v1/admin/users/u-1/verifications');
    expect(appels[0]?.body).toEqual({ emailVerified: true, ageVerified: false });
  });

  test('propage un refus tel quel', async () => {
    const refus = { ok: false as const, status: 403, error: 'Forbidden' };
    const { transport } = transportEspion(refus, false);

    expect(await updateAdminUserVerifications({ ...deps(transport), userId: 'u-1', change: { phoneVerified: true } })).toEqual(refus);
  });
});
