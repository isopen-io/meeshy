import { describe, expect, test } from 'bun:test';

import { GENERATED_PASSWORD_LENGTH, generateStrongPassword, resetAdminUserPassword } from './admin-user-password';
import type { HttpTransport } from './http';

/**
 * RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE (#6819) —
 * `POST /api/v1/admin/users/:userId/reset-password`, sous `canResetPasswords`
 * (ADMIN+) et `requireHierarchy`.
 *
 * ## Pourquoi l'écran GÉNÈRE au lieu de faire saisir
 *
 * La passerelle applique `validatePasswordStrength` (`users.ts:324`) : longueur
 * ≥ `PASSWORD_MIN_LENGTH` (6) ET un score `zxcvbn` **proportionnel à la
 * longueur** — `≥16 ⇒ 3`, `≥10 ⇒ 2`, sinon `1`. Aucune classe de caractères
 * n'est imposée.
 *
 * Un mot de passe tapé à la main par un administrateur pressé tombe donc dans
 * le palier le plus court avec le score le plus fragile, et peut être REFUSÉ
 * après coup. Un tirage de {@link GENERATED_PASSWORD_LENGTH} caractères entre
 * dans le palier `≥16` — celui dont le doc-comment de `password-strength.ts`
 * dit qu'« une passphrase de 16+ caractères atteint 3-4 sans classes forcées ».
 *
 * Et le geste est plus juste ainsi : l'administrateur TRANSMET un secret, il
 * n'a pas à le composer.
 *
 * ## Ce que le corps ne porte PAS
 *
 * `sendEmail` est accepté par le schéma et **n'envoie rien** — `resetPassword`
 * ne le lit jamais (#6831). L'offrir afficherait une case dont la seule
 * fonction serait de rassurer celui qui la coche : l'administrateur croirait
 * avoir prévenu, le membre découvrirait son mot de passe changé sans un mot.
 */

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

describe('generateStrongPassword — franchir le plancher, pas le frôler', () => {
  test('entre dans le palier des 16+, celui qui atteint le score 3', () => {
    expect(GENERATED_PASSWORD_LENGTH).toBeGreaterThanOrEqual(16);
    expect(generateStrongPassword()).toHaveLength(GENERATED_PASSWORD_LENGTH);
  });

  test('deux tirages diffèrent — sinon ce n’est pas un secret', () => {
    const tirages = new Set(Array.from({ length: 24 }, () => generateStrongPassword()));

    expect(tirages.size).toBe(24);
  });

  /**
   * Un secret se lit à voix haute, se recopie, se dicte au téléphone. `O`/`0`
   * et `l`/`1`/`I` s'y confondent — et un mot de passe mal recopié se solde
   * par une seconde réinitialisation, donc un second secret en circulation.
   */
  test('n’emploie aucun caractère ambigu à l’œil', () => {
    const tire = Array.from({ length: 40 }, () => generateStrongPassword()).join('');

    for (const ambigu of ['O', '0', 'l', '1', 'I']) {
      expect(tire).not.toContain(ambigu);
    }
  });

  test('reste dans un alphabet imprimable et sans espace', () => {
    expect(generateStrongPassword()).toMatch(/^[A-Za-z2-9!@#$%^&*_+=?-]+$/);
  });
});

describe('resetAdminUserPassword — l’adresse et le corps', () => {
  test('vise POST /api/v1/admin/users/:userId/reset-password, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion({ message: 'Password reset successfully' });

    await resetAdminUserPassword({ ...deps(transport), userId: 'u 1/x', newPassword: 'Abcdef23456789!@#xyz' });

    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/reset-password`);
  });

  test('n’envoie PAS `sendEmail` — accepté par le schéma, ignoré par le service (#6831)', async () => {
    const { transport, appels } = transportEspion({ message: 'ok' });

    await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'Abcdef23456789!@#xyz' });

    expect(Object.keys((appels[0]?.body ?? {}) as Record<string, unknown>)).not.toContain('sendEmail');
  });

  test('porte le motif sous `reason`, et l’omet quand il est blanc', async () => {
    const { transport, appels } = transportEspion({ message: 'ok' });

    await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'Abcdef23456789!@#xyz', reason: 'compte compromis' });
    await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'Abcdef23456789!@#xyz', reason: '  ' });

    expect((appels[0]?.body as Record<string, unknown>).reason).toBe('compte compromis');
    expect(Object.keys((appels[1]?.body ?? {}) as Record<string, unknown>)).not.toContain('reason');
  });

  /**
   * La route ne rend qu'un message — aucune donnée du membre. Le port ne doit
   * donc rien prétendre décoder : il dit que c'est fait, et l'écran recharge
   * ce qu'il veut afficher.
   */
  test('rend un succès NU — la route ne sert aucune donnée du membre', async () => {
    const { transport } = transportEspion({ message: 'Password reset successfully' });

    const resultat = await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'Abcdef23456789!@#xyz' });

    expect(resultat.ok).toBe(true);
  });

  test('REFUSE avant l’aller-retour un mot de passe trop court pour le plancher', async () => {
    const { transport, appels } = transportEspion({ message: 'ok' });

    const resultat = await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'court' });

    expect(resultat.ok).toBe(false);
    expect(appels).toHaveLength(0);
  });

  test('propage un refus TEL QUEL — 403 de rang et 400 de force restent distincts', async () => {
    for (const refus of [
      { ok: false as const, status: 403, error: 'Hierarchy' },
      { ok: false as const, status: 400, error: 'Password requirements: password strength score is 1/4 (minimum: 3/4)' },
    ]) {
      const { transport } = transportEspion(refus, false);
      const resultat = await resetAdminUserPassword({ ...deps(transport), userId: 'u-1', newPassword: 'Abcdef23456789!@#xyz' });

      expect(resultat.ok).toBe(false);
      expect(!resultat.ok && resultat.status).toBe(refus.status);
    }
  });
});
