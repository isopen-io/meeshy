/**
 * LA PREUVE DE POSSESSION D'UNE ADRESSE (#8033) — ce que `verifyEmail` accepte,
 * refuse, et écrit.
 *
 * Depuis #8033 le code et le lien ouvrent une session : ils sont un secret de
 * CONNEXION. Ces témoins mesurent qu'ils se comparent sur leur empreinte,
 * qu'ils ne servent qu'une fois, qu'ils expirent, qu'un compte supprimé ne se
 * rouvre pas, et qu'un mot de passe ne se pose qu'avec le code, sur un compte
 * qui n'en a pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/SessionService', () => ({
  initSessionService: jest.fn(),
}));
const mockHashPassword = jest.fn(async (p: string) => `hash(${p})`);
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: mockHashPassword,
}));

import { AuthService } from '../../../services/AuthService';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const DANS_10_MIN = () => new Date(Date.now() + 10 * 60 * 1000);

type Row = Record<string, unknown>;

const compte = (extra: Row = {}): Row => ({
  id: 'user-1',
  email: 'marie@example.com',
  isActive: true,
  password: null,
  emailVerifiedAt: null,
  twoFactorEnabledAt: null,
  emailVerificationToken: sha256('jeton-brut'),
  emailVerificationCode: sha256('123456'),
  emailVerificationExpiry: DANS_10_MIN(),
  ...extra,
});

const verifier = async (
  ligne: Row | null,
  preuve: { code?: string; token?: string; password?: string },
  consume = 1,
  watchUpdateMany: jest.Mock<any> = jest.fn(async () => ({ count: 1 })) as jest.Mock<any>,
) => {
  const findFirst = jest.fn(async () => ligne) as jest.Mock<any>;
  const updateMany = jest.fn(async () => ({ count: consume })) as jest.Mock<any>;
  const prisma = { user: { findFirst, updateMany }, emailVerificationWatch: { updateMany: watchUpdateMany } };
  const service = new AuthService(prisma as never, 'secret');
  const resultat = await service.verifyEmail({ email: 'Marie@Example.com', ...preuve });
  const ecrit = (updateMany.mock.calls[0] as [{ where: Row; data: Row }] | undefined)?.[0];
  return { resultat, findFirst, updateMany, ecrit, watchUpdateMany };
};

beforeEach(() => jest.clearAllMocks());

describe('le code', () => {
  it('ouvre la voie quand son EMPREINTE correspond, et marque l’adresse vérifiée', async () => {
    const { resultat, ecrit } = await verifier(compte(), { code: '123456' });

    expect(resultat).toMatchObject({ success: true, userId: 'user-1', alreadyVerified: false, secondFactor: 'absent' });
    expect(ecrit?.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(ecrit?.data).toMatchObject({ emailVerificationCode: null });
  });

  it('ne consomme PAS le lien (#8083) : deux clés distinctes, chacune ouvre la session de SON appareil', async () => {
    const { ecrit } = await verifier(compte(), { code: '123456' });

    expect(ecrit?.data).not.toHaveProperty('emailVerificationToken');
    expect(ecrit?.data).not.toHaveProperty('emailVerificationExpiry');
  });

  it('ne se compare jamais par la base : la requête ne porte pas le code saisi', async () => {
    const { findFirst } = await verifier(compte(), { code: '123456' });

    expect(JSON.stringify(findFirst.mock.calls)).not.toContain('123456');
  });

  it('est refusé quand il est faux', async () => {
    const { resultat, updateMany } = await verifier(compte(), { code: '654321' });

    expect(resultat.success).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('est refusé quand il a expiré', async () => {
    const { resultat } = await verifier(compte({ emailVerificationExpiry: new Date(Date.now() - 1000) }), { code: '123456' });

    expect(resultat).toMatchObject({ success: false, reason: 'expired' });
  });

  it('ne sert qu’UNE fois : la consommation est conditionnée à la paire lue', async () => {
    const { resultat, ecrit } = await verifier(compte(), { code: '123456' }, 0);

    expect(ecrit?.where).toMatchObject({ id: 'user-1', emailVerificationCode: sha256('123456') });
    expect(resultat.success).toBe(false);
  });

  it('un code écrit EN CLAIR avant #8033 reste reconnu', async () => {
    const { resultat } = await verifier(compte({ emailVerificationCode: '123456' }), { code: '123456' });

    expect(resultat.success).toBe(true);
  });
});

describe('le lien', () => {
  it('ouvre la voie quand son empreinte correspond', async () => {
    const { resultat } = await verifier(compte(), { token: 'jeton-brut' });

    expect(resultat.success).toBe(true);
  });

  it('est refusé quand il ne correspond pas', async () => {
    const { resultat } = await verifier(compte(), { token: 'autre' });

    expect(resultat.success).toBe(false);
  });

  it('ne BRÛLE PAS le code (#8083) : ouvert sur un ordinateur, le code reste à saisir sur le téléphone', async () => {
    const { ecrit } = await verifier(compte(), { token: 'jeton-brut' });

    expect(ecrit?.data).toMatchObject({ emailVerificationToken: null });
    expect(ecrit?.data).not.toHaveProperty('emailVerificationCode');
    expect(ecrit?.data).not.toHaveProperty('emailVerificationExpiry');
  });

  it('le code saisi APRÈS le lien ouvre encore la voie, une seule fois', async () => {
    const apresLeLien = compte({ emailVerifiedAt: new Date('2026-09-26T12:35:39Z'), emailVerificationToken: null });
    const { resultat, ecrit } = await verifier(apresLeLien, { code: '123456' });

    expect(resultat).toMatchObject({ success: true, alreadyVerified: true });
    expect(ecrit?.where).toMatchObject({ emailVerificationToken: null, emailVerificationCode: sha256('123456') });
    expect(ecrit?.data).toMatchObject({ emailVerificationCode: null });
  });

  it('le lien ouvert APRÈS le code ouvre encore la voie', async () => {
    const apresLeCode = compte({ emailVerifiedAt: new Date('2026-09-26T12:35:39Z'), emailVerificationCode: null });
    const { resultat, ecrit } = await verifier(apresLeCode, { token: 'jeton-brut' });

    expect(resultat).toMatchObject({ success: true, alreadyVerified: true });
    expect(ecrit?.data).toMatchObject({ emailVerificationToken: null });
  });

  it('un code DÉJÀ saisi ne se ressaisit pas', async () => {
    const { resultat } = await verifier(compte({ emailVerificationCode: null }), { code: '123456' });

    expect(resultat.success).toBe(false);
  });

  it('un lien DÉJÀ ouvert ne se rouvre pas', async () => {
    const { resultat } = await verifier(compte({ emailVerificationToken: null }), { token: 'jeton-brut' });

    expect(resultat.success).toBe(false);
  });
});

describe('les appareils en attente apprennent la preuve (#8083)', () => {
  it.each([
    ['le code', { code: '123456' }],
    ['le lien', { token: 'jeton-brut' }],
  ])('%s marque « prouvée » chaque attente VIVANTE du compte', async (_cas, preuve) => {
    const { watchUpdateMany } = await verifier(compte(), preuve);
    const appel = (watchUpdateMany.mock.calls[0] as [{ where: Row; data: Row }])[0];

    expect(appel.where).toMatchObject({ userId: 'user-1', provenAt: null });
    expect((appel.where.expiresAt as { gt: Date }).gt).toBeInstanceOf(Date);
    expect(appel.data.provenAt).toBeInstanceOf(Date);
  });

  it('une preuve refusée ne marque rien', async () => {
    const { watchUpdateMany } = await verifier(compte(), { code: '000000' });

    expect(watchUpdateMany).not.toHaveBeenCalled();
  });

  it('une paire déjà consommée par une présentation concurrente ne marque rien', async () => {
    const { watchUpdateMany } = await verifier(compte(), { code: '123456' }, 0);

    expect(watchUpdateMany).not.toHaveBeenCalled();
  });

  it('une panne du marquage ne coûte pas la preuve', async () => {
    const panne = jest.fn(async () => { throw new Error('mongo'); }) as jest.Mock<any>;
    const { resultat } = await verifier(compte(), { code: '123456' }, 1, panne);

    expect(resultat).toMatchObject({ success: true, userId: 'user-1' });
  });
});

describe('un compte déjà vérifié (code de CONNEXION)', () => {
  it('sans paire en cours : aucune preuve ne passe — plus de « déjà vérifié » gratuit', async () => {
    const { resultat } = await verifier(
      compte({ emailVerifiedAt: new Date('2026-01-01'), emailVerificationCode: null, emailVerificationToken: null, emailVerificationExpiry: null }),
      { code: '123456' },
    );

    expect(resultat.success).toBe(false);
  });

  it('avec une paire en cours : ouvre la voie et GARDE la date de vérification', async () => {
    const verifieLe = new Date('2026-01-01');
    const { resultat, ecrit } = await verifier(compte({ emailVerifiedAt: verifieLe }), { code: '123456' });

    expect(resultat).toMatchObject({ success: true, alreadyVerified: true, verifiedAt: verifieLe });
    expect(ecrit?.data).not.toHaveProperty('emailVerifiedAt');
  });
});

describe('le mot de passe optionnel', () => {
  it('est posé avec le code sur un compte qui n’en a pas', async () => {
    const { resultat, ecrit } = await verifier(compte(), { code: '123456', password: 'Un-Secret-9' });

    expect(ecrit?.data.password).toBe('hash(Un-Secret-9)');
    expect(ecrit?.data.lastPasswordChange).toBeInstanceOf(Date);
    expect(resultat).toMatchObject({ success: true, passwordSet: true });
  });

  it('n’écrase JAMAIS un mot de passe existant', async () => {
    const { resultat, ecrit } = await verifier(compte({ password: '$2b$12$ancien' }), { code: '123456', password: 'Un-Secret-9' });

    expect(ecrit?.data).not.toHaveProperty('password');
    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(resultat).toMatchObject({ success: true, passwordSet: false });
  });

  it('est ignoré avec le lien', async () => {
    const { ecrit } = await verifier(compte(), { token: 'jeton-brut', password: 'Un-Secret-9' });

    expect(ecrit?.data).not.toHaveProperty('password');
  });
});

describe('les comptes qui ne s’ouvrent pas', () => {
  it('un compte supprimé n’est même pas cherché', async () => {
    const { findFirst } = await verifier(null, { code: '123456' });

    expect((findFirst.mock.calls[0] as [{ where: Row }])[0].where).toMatchObject({ isActive: true });
  });

  it('une adresse sans compte est refusée comme un code faux', async () => {
    const { resultat } = await verifier(null, { code: '123456' });

    expect(resultat).toMatchObject({ success: false, reason: 'invalid' });
  });

  it('un compte à second facteur le DIT, pour que la route n’ouvre pas de session', async () => {
    const { resultat } = await verifier(compte({ twoFactorEnabledAt: new Date() }), { code: '123456' });

    expect(resultat).toMatchObject({ success: true, secondFactor: 'required' });
  });
});
