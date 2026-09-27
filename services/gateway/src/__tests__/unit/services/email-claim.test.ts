/**
 * « Ce n'est pas moi » devant une adresse déjà prise (#8214).
 *
 * Décision porteur 2026-09-27 : quand l'adresse existe, on MONTRE l'identité
 * masquée de son détenteur ; « ce n'est pas moi » crée le compte, qui ne gagne
 * l'adresse qu'en saisissant le code (ou en ouvrant le lien) — OBLIGATOIREMENT,
 * même avec un numéro. L'ancien compte perd l'adresse et garde le reste.
 *
 * Ces témoins jouent `registerAccount` et `verifyEmailProof` contre une base
 * en mémoire qui TIENT l'index unique de l'adresse et l'atomicité des
 * transactions (`helpers/email-claim-store.ts`) : le transfert se mesure sur
 * les lignes écrites, jamais sur la clause envoyée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async (p: string) => `hash(${p})`),
}));

import { registerAccount, type RegistrationDeps } from '../../../services/auth/registration.service';
import { verifyEmailProof } from '../../../services/auth/email-proof.service';
import { isRegistrationRefusal } from '../../../services/auth/registration-refusal';
import {
  pendingSessionTokenForAccount,
  readEmailVerificationWatch,
} from '../../../services/auth/email-verification-watch';
import { emailClaimStore, type EmailClaimStore } from '../../helpers/email-claim-store';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const ADRESSE = 'marie@example.com';

/** Le compte qui DÉTIENT l'adresse — créé par faute de frappe, ou par quelqu'un d'autre. */
const detenteur = (extra: Record<string, unknown> = {}) => ({
  id: 'ancien',
  username: 'mariette',
  displayName: 'Mariette Dupont',
  avatar: 'https://cdn.example/a.png',
  email: ADRESSE,
  password: 'hash(ancien-secret)',
  phoneNumber: null,
  isActive: true,
  emailVerifiedAt: null,
  emailVerificationToken: sha256('lien-ancien'),
  emailVerificationCode: sha256('111111'),
  emailVerificationExpiry: new Date(Date.now() + 60_000),
  ...extra,
});

let codeSuivant = 200000;
const deps = (store: EmailClaimStore) => {
  const sendEmailVerification = jest.fn(async (_p: Record<string, unknown>) => ({ success: true }));
  const codes: string[] = [];
  const liens: string[] = [];
  const d: RegistrationDeps = {
    prisma: store.prisma as never,
    emailService: { sendEmailVerification } as never,
    frontendUrl: 'https://meeshy.test',
    toSocketIOUser: (u) => u as never,
    verificationToken: () => {
      const raw = `lien-${liens.length + 1}`;
      liens.push(raw);
      return { raw, hash: sha256(raw) };
    },
    verificationCode: () => {
      codeSuivant += 1;
      const code = String(codeSuivant);
      codes.push(code);
      return code;
    },
  };
  return { d, sendEmailVerification, codes, liens };
};

const inscription = (extra: Record<string, unknown> = {}) => ({
  email: 'Marie@Example.com',
  username: 'marie_vraie',
  password: 'Xk9$mQ2vLp8#nR4wZ',
  displayName: 'Marie Martin',
  ...extra,
});

const revendiquer = async (store: EmailClaimStore, extra: Record<string, unknown> = {}) => {
  const outils = deps(store);
  const resultat = await registerAccount(outils.d, { ...inscription(extra), claimEmail: true });
  return { ...outils, resultat };
};

describe('adresse déjà détenue, SANS revendication — le refus montre le détenteur masqué', () => {
  it('reste un EMAIL_TAKEN, et porte le pseudo et le nom affiché MASQUÉS, avec l’avatar', async () => {
    const store = emailClaimStore([detenteur()]);
    const refus = await registerAccount(deps(store).d, inscription()).catch((e: unknown) => e);

    expect(isRegistrationRefusal(refus)).toBe(true);
    expect(refus).toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
      emailOwner: { maskedDisplayName: 'M**e D**t', maskedUsername: 'm******e', avatar: 'https://cdn.example/a.png' },
    });
  });

  it('ne livre ni l’adresse, ni l’identifiant, ni le pseudo en clair', async () => {
    const store = emailClaimStore([detenteur()]);
    const refus = (await registerAccount(deps(store).d, inscription()).catch((e: unknown) => e)) as { emailOwner: unknown };

    const servi = JSON.stringify(refus.emailOwner);
    expect(servi).not.toContain('mariette');
    expect(servi).not.toContain('ancien');
    expect(servi).not.toContain('example.com');
  });

  it('un détenteur sans avatar n’en invente pas', async () => {
    const store = emailClaimStore([detenteur({ avatar: null })]);
    const refus = (await registerAccount(deps(store).d, inscription()).catch((e: unknown) => e)) as { emailOwner: Record<string, unknown> };

    expect(refus.emailOwner).not.toHaveProperty('avatar');
  });

  it('aucun compte n’est créé', async () => {
    const store = emailClaimStore([detenteur()]);
    await registerAccount(deps(store).d, inscription()).catch(() => undefined);

    expect(store.state.users).toHaveLength(1);
  });
});

describe('« ce n’est pas moi » — la revendication crée un compte INACTIF, sans l’adresse', () => {
  it('le compte naît inactif, sous une adresse non routable à lui, l’adresse revendiquée à part', async () => {
    const store = emailClaimStore([detenteur()]);
    const { resultat } = await revendiquer(store);

    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    expect(nouveau).toMatchObject({ isActive: false, claimedEmail: ADRESSE });
    expect(nouveau?.emailVerifiedAt ?? null).toBeNull();
    expect(String(nouveau?.email)).toMatch(/@claiming\.meeshy\.invalid$/);
    expect(resultat).toMatchObject({ claimedEmail: ADRESSE });
  });

  it('même AVEC un numéro, le compte reste inactif', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store, { phoneNumber: '+33612345678', phoneCountryCode: 'FR' });

    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    expect(nouveau?.isActive).toBe(false);
  });

  it('l’adresse reste au détenteur, intacte, tant que rien n’est prouvé', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);

    expect(store.byId('ancien')).toMatchObject({ email: ADRESSE, emailVerificationCode: sha256('111111') });
  });

  it('envoie le code ET le lien À L’ADRESSE revendiquée', async () => {
    const store = emailClaimStore([detenteur()]);
    const { sendEmailVerification, codes, liens } = await revendiquer(store);

    const envoi = sendEmailVerification.mock.calls[0]?.[0];
    expect(envoi?.to).toBe(ADRESSE);
    expect(envoi?.verificationCode).toBe(codes[0]);
    expect(String(envoi?.verificationLink)).toContain(`token=${liens[0]}`);
    expect(String(envoi?.verificationLink)).toContain(`email=${encodeURIComponent(ADRESSE)}`);
  });

  it('ne rejoint aucun salon avant la preuve', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);

    expect(store.state.participants).toHaveLength(0);
  });

  it('une adresse qui n’est détenue par PERSONNE s’inscrit normalement, la revendication est sans objet', async () => {
    const store = emailClaimStore([]);
    const { resultat } = await revendiquer(store);

    const nouveau = store.state.users[0];
    expect(nouveau?.email).toBe(ADRESSE);
    expect(nouveau?.isActive).not.toBe(false);
    expect(nouveau).not.toHaveProperty('claimedEmail');
    expect(resultat).not.toHaveProperty('claimedEmail');
  });

  it('revendiquer à NOUVEAU avec le même pseudo réussit — c’est ainsi qu’on redemande le code', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);
    const seconde = await revendiquer(store);

    expect(seconde.resultat).toMatchObject({ claimedEmail: ADRESSE });
    const vivants = store.state.users.filter((u) => u.username === 'marie_vraie');
    expect(vivants).toHaveLength(1);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: seconde.codes[0] });
    expect(resultat).toMatchObject({ success: true, userId: vivants[0]?.id });
  });

  it('une NOUVELLE revendication de la même adresse éteint les clés des précédentes', async () => {
    const store = emailClaimStore([detenteur()]);
    const premiere = await revendiquer(store);
    await revendiquer(store, { username: 'marie_bis' });

    const refus = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: premiere.codes[0] });
    expect(refus.success).toBe(false);
    expect(store.byId('ancien')?.email).toBe(ADRESSE);
  });
});

describe('la preuve — le transfert, en UNE transaction', () => {
  const transfere = async (preuve: 'code' | 'lien', ancien: Record<string, unknown> = {}) => {
    const store = emailClaimStore([detenteur(ancien)]);
    store.state.magicLinkTokens.push({ id: 'ml-1', userId: 'ancien', isRevoked: false, expiresAt: new Date(Date.now() + 60_000) });
    store.state.passwordResetTokens.push({ id: 'pr-1', userId: 'ancien', isRevoked: false, expiresAt: new Date(Date.now() + 60_000) });
    const { codes, liens } = await revendiquer(store);
    const resultat = await verifyEmailProof(
      store.prisma as never,
      preuve === 'code' ? { email: ADRESSE, code: codes[0] } : { email: ADRESSE, token: liens[0] },
    );
    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    return { store, resultat, nouveau, ancien: store.byId('ancien') };
  };

  it.each(['code', 'lien'] as const)('par le %s : le nouveau compte reçoit l’adresse, vérifiée, et devient actif', async (preuve) => {
    const { resultat, nouveau } = await transfere(preuve);

    expect(resultat).toMatchObject({ success: true, userId: nouveau?.id, alreadyVerified: false, secondFactor: 'absent' });
    expect(nouveau).toMatchObject({ email: ADRESSE, isActive: true, claimedEmail: null });
    expect(nouveau?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('l’ancien compte reçoit une adresse non routable UNIQUE, et garde pseudo, numéro, mot de passe', async () => {
    const { ancien } = await transfere('code', { phoneNumber: '+33700000000' });

    expect(ancien).toMatchObject({
      email: 'released-ancien@released.meeshy.invalid',
      username: 'mariette',
      phoneNumber: '+33700000000',
      password: 'hash(ancien-secret)',
      isActive: true,
      emailVerifiedAt: null,
    });
    expect(ancien?.emailReleasedAt).toBeInstanceOf(Date);
  });

  it('l’ancien compte perd TOUT ce qui ouvrait une porte par l’adresse : code, lien, liens magiques, réinitialisations', async () => {
    const { ancien, store } = await transfere('code');

    expect(ancien).toMatchObject({ emailVerificationCode: null, emailVerificationToken: null, emailVerificationExpiry: null });
    expect(store.state.magicLinkTokens[0]).toMatchObject({ isRevoked: true });
    expect(store.state.passwordResetTokens[0]).toMatchObject({ isRevoked: true });
  });

  it('un SecurityEvent est posé sur l’ancien compte', async () => {
    const { store, nouveau } = await transfere('code');

    expect(store.state.securityEvents).toEqual([
      expect.objectContaining({
        userId: 'ancien',
        eventType: 'EMAIL_RELEASED_BY_CLAIM',
        metadata: expect.objectContaining({ claimantUserId: nouveau?.id }),
      }),
    ]);
  });

  it('l’index unique ne voit JAMAIS deux lignes : une seule porte l’adresse après le transfert', async () => {
    const { store } = await transfere('code');

    expect(store.byEmail(ADRESSE)).toHaveLength(1);
  });

  it('le nouveau compte rejoint le salon global à la preuve', async () => {
    const { store, nouveau } = await transfere('code');

    expect(store.state.participants).toEqual([expect.objectContaining({ userId: nouveau?.id, conversationId: 'conv-meeshy' })]);
  });

  it('la preuve marque « prouvées » les attentes de l’appareil qui a revendiqué', async () => {
    const store = emailClaimStore([detenteur()]);
    const { codes } = await revendiquer(store);
    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    store.state.watches.push({ id: 'w', userId: nouveau?.id, provenAt: null, expiresAt: new Date(Date.now() + 60_000) });

    await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: codes[0] });

    expect(store.state.watches[0]?.provenAt).toBeInstanceOf(Date);
  });
});

describe('l’attente de l’appareil qui revendique', () => {
  it('se lie au compte REVENDIQUANT — jamais au détenteur — et passe « prouvée » au transfert', async () => {
    const store = emailClaimStore([detenteur()]);
    const { codes } = await revendiquer(store);
    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');

    const { pendingSessionToken } = await pendingSessionTokenForAccount(store.prisma as never, nouveau?.id ?? '');
    expect(store.state.watches).toEqual([expect.objectContaining({ userId: nouveau?.id })]);
    expect(await readEmailVerificationWatch(store.prisma as never, pendingSessionToken ?? '')).toEqual({ kind: 'pending' });

    await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: codes[0] });

    expect(await readEmailVerificationWatch(store.prisma as never, pendingSessionToken ?? '')).toEqual({ kind: 'proven' });
  });

  it('une preuve du DÉTENTEUR ne la marque pas', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);
    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    const { pendingSessionToken } = await pendingSessionTokenForAccount(store.prisma as never, nouveau?.id ?? '');

    await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '111111' });

    expect(await readEmailVerificationWatch(store.prisma as never, pendingSessionToken ?? '')).toEqual({ kind: 'pending' });
  });
});

describe('une revendication NON prouvée n’a aucun effet', () => {
  it('un code faux : rien ne bouge', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '999999' });

    expect(resultat).toMatchObject({ success: false, reason: 'invalid' });
    expect(store.byId('ancien')?.email).toBe(ADRESSE);
    expect(store.state.users.find((u) => u.username === 'marie_vraie')?.isActive).toBe(false);
  });

  it('un code EXPIRÉ : refus « expired », rien ne bouge', async () => {
    const store = emailClaimStore([detenteur()]);
    const { codes } = await revendiquer(store);
    const nouveau = store.state.users.find((u) => u.username === 'marie_vraie');
    if (nouveau) nouveau.emailVerificationExpiry = new Date(Date.now() - 1000);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: codes[0] });

    expect(resultat).toMatchObject({ success: false, reason: 'expired' });
    expect(store.byId('ancien')?.email).toBe(ADRESSE);
  });

  it('le code du DÉTENTEUR reste le sien : il le connecte, il ne transfère rien', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);

    const resultat = await verifyEmailProof(store.prisma as never, { email: ADRESSE, code: '111111' });

    expect(resultat).toMatchObject({ success: true, userId: 'ancien' });
    expect(store.byId('ancien')?.email).toBe(ADRESSE);
  });

  it('le compte revendiquant ne s’ouvre à AUCUNE autre porte : il n’est pas trouvé par son pseudo', async () => {
    const store = emailClaimStore([detenteur()]);
    await revendiquer(store);

    const actif = await store.prisma.user.findFirst({ where: { username: 'marie_vraie', isActive: true } });
    expect(actif).toBeNull();
  });
});

describe('la course', () => {
  it('le code et le lien présentés EN MÊME TEMPS : un seul transfert, une seule ligne sur l’adresse', async () => {
    const store = emailClaimStore([detenteur()]);
    const { codes, liens } = await revendiquer(store);

    const [a, b] = await Promise.all([
      verifyEmailProof(store.prisma as never, { email: ADRESSE, code: codes[0] }),
      verifyEmailProof(store.prisma as never, { email: ADRESSE, token: liens[0] }),
    ]);

    expect([a.success, b.success].filter(Boolean)).toHaveLength(1);
    expect(store.byEmail(ADRESSE)).toHaveLength(1);
    expect(store.state.securityEvents).toHaveLength(1);
  });

  it('deux revendications vivantes prouvées ensemble : la première gagne, la seconde n’enlève RIEN à la gagnante', async () => {
    const store = emailClaimStore([detenteur()]);
    const premiere = await revendiquer(store);
    const idPremiere = store.state.users.find((u) => u.username === 'marie_vraie')?.id;
    const seconde = await revendiquer(store, { username: 'marie_bis' });
    // La seconde a éteint la première ; on la ranime À LA MAIN pour jouer la
    // course de CRÉATION, où les deux clés vivent en même temps.
    const ligne1 = store.byId(idPremiere ?? '');
    if (ligne1) {
      ligne1.emailVerificationCode = sha256(premiere.codes[0] ?? '');
      ligne1.emailVerificationExpiry = new Date(Date.now() + 60_000);
    }

    const [a, b] = await Promise.all([
      verifyEmailProof(store.prisma as never, { email: ADRESSE, code: premiere.codes[0] }),
      verifyEmailProof(store.prisma as never, { email: ADRESSE, code: seconde.codes[0] }),
    ]);

    expect(a.success).toBe(true);
    expect(b.success).toBe(false);
    expect(store.byEmail(ADRESSE)).toEqual([expect.objectContaining({ id: idPremiere })]);
    expect(store.state.users.find((u) => u.username === 'marie_bis')?.isActive).toBe(false);
  });
});
