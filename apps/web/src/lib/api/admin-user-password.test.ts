import { describe, expect, test } from 'bun:test';

import { fetchAdminPasswordProposals, resetAdminUserPassword } from './admin-user-password';
import type { HttpTransport } from './http';

/**
 * RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE (#6819) —
 * `POST /api/v1/admin/users/:userId/reset-password`, sous `canResetPasswords`
 * (ADMIN+) et `requireHierarchy`.
 *
 * ## Pourquoi les propositions viennent de la passerelle (#8051)
 *
 * La passerelle applique `validatePasswordStrength` : longueur ≥
 * `PASSWORD_MIN_LENGTH` (6) ET un score `zxcvbn` **proportionnel à la
 * longueur**. Un secret composé côté client à partir du pseudo pourrait être
 * REFUSÉ après coup ; `POST …/password-proposals` compose ET juge les quatre
 * niveaux, donc ce que l'écran affiche a déjà été accepté.
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

const PROPOSITIONS = { simple: 'alice482', easy: 'Alice-4821!', medium: 'Alice.k7Qm!4821', hard: 'Xq4mR9pTw2sKfH7nJbVc' };

describe('fetchAdminPasswordProposals — quatre niveaux, servis par la passerelle', () => {
  test('vise POST /api/v1/admin/users/:userId/password-proposals, identifiant ENCODÉ, sans corps', async () => {
    const { transport, appels } = transportEspion(PROPOSITIONS);

    const resultat = await fetchAdminPasswordProposals({ ...deps(transport), userId: 'u 1/x' });

    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/password-proposals`);
    expect(appels[0]?.body).toBeUndefined();
    expect(resultat).toEqual({ ok: true, data: PROPOSITIONS });
  });

  test('refuse une réponse à laquelle il manque un niveau — un niveau absent n’est pas un niveau vide', async () => {
    const { transport } = transportEspion({ simple: 'alice482', easy: 'Alice-4821!', hard: 'Xq4mR9pTw2sKfH7nJbVc' });

    const resultat = await fetchAdminPasswordProposals({ ...deps(transport), userId: 'u-1' });

    expect(resultat.ok).toBe(false);
  });

  test('relaie tel quel un refus de la passerelle', async () => {
    const { transport } = transportEspion({ ok: false, status: 403, error: 'Access denied' }, false);

    const resultat = await fetchAdminPasswordProposals({ ...deps(transport), userId: 'u-1' });

    expect(resultat).toEqual({ ok: false, status: 403, error: 'Access denied' });
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
