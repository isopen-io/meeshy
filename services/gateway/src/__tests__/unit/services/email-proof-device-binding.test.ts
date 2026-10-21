/**
 * #10872 — la preuve par LIEN n'ouvre une session sans question que sur
 * l'appareil qui a demandé le lien. Ailleurs : confirmation, et le jeton n'est
 * PAS consommé tant que l'utilisateur n'a pas dit oui. Le CODE (tapé par
 * l'utilisateur, donc son geste) n'est pas concerné.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { verifyEmailProof } from '../../../services/auth/email-proof.service';
import { mintEmailCodePair } from '../../../services/auth/email-code';
import { emailClaimStore } from '../../helpers/email-claim-store';

const sha256 = (v: string) => crypto.createHash('sha256').update(v, 'utf8').digest('hex');
const ADRESSE = 'marie@example.com';
const SECRET = crypto.randomBytes(32).toString('base64url');
const engagement = { recordActivity: jest.fn<any>(async () => undefined) };

const compte = (extra: Record<string, unknown> = {}) => ({
  id: 'marie',
  username: 'marie',
  displayName: 'Marie Martin',
  avatar: 'https://cdn.meeshy.test/marie.png',
  email: ADRESSE,
  password: null,
  isActive: true,
  emailVerifiedAt: new Date(0),
  twoFactorEnabledAt: null,
  emailVerificationToken: sha256('jeton-du-lien'),
  emailVerificationCode: sha256('123456'),
  emailVerificationExpiry: new Date(Date.now() + 60_000),
  emailVerificationDeviceHash: sha256(SECRET),
  ...extra,
});

const parLien = (extra: Record<string, unknown> = {}) => ({ email: ADRESSE, token: 'jeton-du-lien', ...extra });

describe('#10872 — la preuve par lien est liée à l’appareil', () => {
  it('même appareil (secret qui correspond) ⇒ preuve faite, sans question', async () => {
    const store = emailClaimStore([compte()]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien({ linkDeviceSecret: SECRET }), { engagement });

    expect(resultat).toMatchObject({ success: true, userId: 'marie' });
  });

  it('autre appareil (aucun secret) ⇒ confirmation, identité du compte cible, jeton INTACT', async () => {
    const store = emailClaimStore([compte()]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien(), { engagement });

    expect(resultat).toEqual({
      success: false,
      reason: 'confirmation-required',
      error: expect.any(String),
      account: { id: 'marie', username: 'marie', displayName: 'Marie Martin', avatar: 'https://cdn.meeshy.test/marie.png' },
      intent: 'sign-in',
      maskedEmail: 'ma....e@e*****om',
    });
    expect(JSON.stringify(resultat)).not.toContain(ADRESSE);
    expect(store.state.users[0].emailVerificationToken).toBe(sha256('jeton-du-lien'));
  });

  it('secret FAUX ⇒ confirmation, jeton intact', async () => {
    const store = emailClaimStore([compte()]);

    const resultat = await verifyEmailProof(
      store.prisma as never,
      parLien({ linkDeviceSecret: crypto.randomBytes(32).toString('base64url') }),
      { engagement },
    );

    expect(resultat).toMatchObject({ success: false, reason: 'confirmation-required' });
    expect(store.state.users[0].emailVerificationToken).toBe(sha256('jeton-du-lien'));
  });

  it('le oui de l’utilisateur consomme le jeton et fait la preuve', async () => {
    const store = emailClaimStore([compte()]);

    const confirmation = await verifyEmailProof(store.prisma as never, parLien(), { engagement });
    const oui = await verifyEmailProof(store.prisma as never, parLien({ confirmed: true }), { engagement });

    expect(confirmation).toMatchObject({ reason: 'confirmation-required' });
    expect(oui).toMatchObject({ success: true, userId: 'marie' });
    expect(store.state.users[0].emailVerificationToken).toBeNull();
  });

  it('un lien NON lié (paire émise avant ce lot, ou par une autre porte) ⇒ confirmation', async () => {
    const store = emailClaimStore([compte({ emailVerificationDeviceHash: undefined })]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien({ linkDeviceSecret: SECRET }), { engagement });

    expect(resultat).toMatchObject({ success: false, reason: 'confirmation-required' });
  });

  it('un jeton FAUX reste un refus « invalide » — la confirmation ne révèle aucun compte', async () => {
    const store = emailClaimStore([compte()]);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, token: 'pas-le-bon' }, { engagement });

    expect(resultat).toMatchObject({ success: false, reason: 'invalid' });
    expect(resultat).not.toHaveProperty('account');
  });

  it('un jeton EXPIRÉ reste « expiré », même sans secret', async () => {
    const store = emailClaimStore([compte({ emailVerificationExpiry: new Date(Date.now() - 1000) })]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien(), { engagement });

    expect(resultat).toMatchObject({ success: false, reason: 'expired' });
  });

  it('le CODE n’est pas concerné : tapé par l’utilisateur, il fait la preuve sans secret', async () => {
    const store = emailClaimStore([compte()]);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '123456' }, { engagement });

    expect(resultat).toMatchObject({ success: true, userId: 'marie' });
  });

  it('consommer le lien efface aussi son empreinte d’appareil', async () => {
    const store = emailClaimStore([compte()]);

    await verifyEmailProof(store.prisma as never, parLien({ linkDeviceSecret: SECRET }), { engagement });

    expect(store.state.users[0].emailVerificationDeviceHash).toBeNull();
  });
});

describe('#10872 — la REVENDICATION d’une adresse suit la même règle', () => {
  const detenteur = compte({ id: 'detenteur', username: 'mariette', emailVerificationToken: sha256('autre-lien') });
  const revendiquant = {
    id: 'revendiquant',
    username: 'marie_vraie',
    displayName: 'Marie Vraie',
    avatar: null,
    email: 'attente-revendication@claim.meeshy.invalid',
    claimedEmail: ADRESSE,
    isActive: false,
    password: null,
    emailVerificationToken: sha256('jeton-du-lien'),
    emailVerificationCode: sha256('654321'),
    emailVerificationExpiry: new Date(Date.now() + 60_000),
    emailVerificationDeviceHash: null,
  };

  it('lien de revendication sans secret ⇒ confirmation sur le compte REVENDIQUANT, rien transféré', async () => {
    const store = emailClaimStore([detenteur, revendiquant]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien(), { engagement });

    expect(resultat).toMatchObject({ reason: 'confirmation-required', account: { id: 'revendiquant', username: 'marie_vraie' } });
    expect(store.byId('revendiquant')).toMatchObject({ isActive: false, emailVerificationToken: sha256('jeton-du-lien') });
  });

  it('#10879 — la question DIT la revendication : nature `claim-email` et adresse MASQUÉE, jamais en clair', async () => {
    const store = emailClaimStore([detenteur, revendiquant]);

    const resultat = await verifyEmailProof(store.prisma as never, parLien({ email: 'Marie@Example.com' }), { engagement });

    expect(resultat).toMatchObject({ reason: 'confirmation-required', intent: 'claim-email', maskedEmail: 'ma....e@e*****om' });
    expect(JSON.stringify(resultat).toLowerCase()).not.toContain(ADRESSE);
  });
});

describe('#10872 — la paire émise porte l’empreinte de l’appareil demandeur', () => {
  it('liée : la colonne porte l’empreinte ; non liée : null (une paire neuve efface l’ancienne liaison)', () => {
    expect(mintEmailCodePair(15, new Date(), { linkDeviceHash: sha256(SECRET) }).columns.emailVerificationDeviceHash).toBe(sha256(SECRET));
    expect(mintEmailCodePair(15).columns.emailVerificationDeviceHash).toBeNull();
  });
});
