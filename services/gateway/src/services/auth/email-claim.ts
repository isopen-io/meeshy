/**
 * LA REVENDICATION D'UNE ADRESSE DÉJÀ DÉTENUE (#8214) — SITE UNIQUE.
 *
 * Décision porteur 2026-09-27 : une adresse détenue par un compte — vérifiée ou
 * non — ne bloque plus une inscription par un refus muet. On MONTRE l'identité
 * masquée du détenteur ; « c'est moi » mène à la récupération (#8216, clients) ;
 * « ce n'est pas moi » crée le compte, qui ne GAGNE l'adresse qu'en saisissant
 * le code ou en ouvrant le lien envoyés à cette adresse. L'ancien compte perd
 * l'adresse et garde pseudo, numéro, mot de passe et contenu.
 *
 * ## Les trois états d'un compte revendiquant
 *
 * | état | `isActive` | `email` | `claimedEmail` |
 * |---|---|---|---|
 * | revendication en cours | `false` | `claim-<aléa>@claiming.meeshy.invalid` | l'adresse |
 * | revendication éteinte (une plus récente l'a remplacée) | `false` | idem | l'adresse, sans clé |
 * | adresse gagnée | `true` | l'adresse, `emailVerifiedAt` posé | `null` |
 *
 * `isActive: false` ferme TOUTES les portes d'un coup — mot de passe, pseudo,
 * numéro, lien magique, SMS : chacune ne cherche que des comptes actifs. C'est
 * la garde fail-closed du « jamais de session, même avec un numéro » : aucune
 * porte n'a à se souvenir de la revendication.
 *
 * ## Le transfert, en UNE transaction
 *
 * 1. la clé présentée se CONSOMME, conditionnée à la paire lue (usage unique) ;
 * 2. le détenteur reçoit `released-<id>@released.meeshy.invalid` — unique par
 *    construction, non routable (RFC 2606) — perd `emailVerifiedAt`, sa paire
 *    code + lien, ses liens magiques et ses réinitialisations (ils prouvaient
 *    la boîte qu'il n'a plus), et porte `emailReleasedAt` ;
 * 3. le revendiquant reçoit l'adresse, vérifiée, et devient actif ;
 * 4. un `SecurityEvent` est posé sur le détenteur.
 *
 * L'étape 2 précède l'étape 3 DANS la transaction : l'index unique
 * `User_email_key` ne voit jamais deux lignes. Une transaction qui perd la
 * course (conflit d'écriture, clé déjà consommée, adresse prise entre-temps)
 * s'annule en entier : une revendication non prouvée n'a aucun effet.
 *
 * ## La course entre deux revendications
 *
 * Une nouvelle revendication ÉTEINT les clés des précédentes et libère leur
 * pseudo (`retireEarlierClaims`) :
 * une seule paire vit par adresse, et les essais de code restent bornés comme
 * pour tout compte. Reste la course de CRÉATION, où deux paires vivent un
 * instant : la première preuve gagne, et une adresse prouvée par son détenteur
 * APRÈS le dépôt d'une revendication rend celle-ci caduque — la seconde preuve
 * n'enlève donc jamais l'adresse à la première.
 *
 * @module services/auth/email-claim
 */

import crypto from 'crypto';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

import { maskDisplayName, maskUsername } from '../PhonePasswordResetService';
import { ensureGlobalConversationMembership } from '../conversations/ensureGlobalConversationMembership';
import { normalizeEmail } from '../../utils/normalize';
import { unsetOrNull } from '../../utils/prisma-unset';
import { hashPassword } from '../../utils/password-hash';
import { revokePasswordResetTokensForEmailChange } from '../../utils/password-reset-revocation';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { emailCodeMatches, emailTokenMatches } from './email-code';
import { markEmailVerificationWatchesProven } from './email-verification-watch';
import type { EmailOwner } from './registration-refusal';

const logger = enhancedLogger.child({ module: 'EmailClaim' });

export const CLAIM_EMAIL_DOMAIN = 'claiming.meeshy.invalid';
export const RELEASED_EMAIL_DOMAIN = 'released.meeshy.invalid';
export const EMAIL_RELEASED_EVENT = 'EMAIL_RELEASED_BY_CLAIM';
const REVOKED_REASON = 'EMAIL_RELEASED';

/** L'adresse d'attente d'un revendiquant — unique, non routable, jamais montrée. */
export const claimPlaceholderEmail = (): string =>
  `claim-${crypto.randomBytes(12).toString('hex')}@${CLAIM_EMAIL_DOMAIN}`;

/** L'adresse que reçoit le compte qui a cédé la sienne — unique par son identifiant. */
export const releasedEmail = (userId: string): string => `released-${userId}@${RELEASED_EMAIL_DOMAIN}`;

/** Le détenteur, masqué comme `phoneOwnerInfo` — jamais l'adresse, jamais l'identifiant. */
export function maskedEmailOwner(row: {
  readonly displayName: string | null;
  readonly username: string;
  readonly avatar: string | null;
}): EmailOwner {
  return {
    maskedDisplayName: maskDisplayName(row.displayName),
    maskedUsername: maskUsername(row.username),
    ...(row.avatar ? { avatar: row.avatar } : {}),
  };
}

/**
 * Éteint les revendications antérieures de la même adresse : leurs clés, et
 * leur PSEUDO, rendu libre (`claim-<id>`). Redemander le code, c'est
 * revendiquer à nouveau — souvent sous le même pseudo, qu'un compte inactif
 * jamais prouvé ne doit pas retenir.
 */
export async function retireEarlierClaims(prisma: Pick<PrismaClient, 'user'>, email: string): Promise<void> {
  const earlier = await prisma.user.findMany({
    where: { claimedEmail: normalizeEmail(email), isActive: false },
    select: { id: true },
  });
  await retireClaims(prisma, earlier);
}

/**
 * Éteindre des revendications : clés, pseudo (`claim-<id>`), numéro et jetons
 * de recherche. La ligne reste — inactive, sans rien qui la rattache à
 * personne — pour ne pas avoir à défaire ce qui a pu y être accroché (#8227).
 */
async function retireClaims(prisma: Pick<PrismaClient, 'user'>, claims: ReadonlyArray<{ readonly id: string }>): Promise<number> {
  const written = await Promise.all(
    claims.map(({ id }) =>
      prisma.user.updateMany({
        where: { id, isActive: false },
        data: {
          username: `claim-${id}`,
          // Une revendication éteinte n'est plus personne : aucun jeton de recherche.
          searchTokens: [],
          phoneNumber: null,
          emailVerificationToken: null,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
        },
      }),
    ),
  );
  return written.reduce((total, { count }) => total + count, 0);
}

/**
 * LE BALAYAGE DES REVENDICATIONS ABANDONNÉES (#8227) : une revendication
 * jamais prouvée dont la paire a expiré s'éteint et libère son pseudo. Un
 * compte actif n'est jamais touché (`isActive: false` dans chaque écriture).
 */
export async function sweepAbandonedEmailClaims(prisma: Pick<PrismaClient, 'user'>, now: Date): Promise<number> {
  const abandoned = await prisma.user.findMany({
    where: { isActive: false, claimedEmail: { not: null }, emailVerificationExpiry: { lt: now } },
    select: { id: true },
  });
  return retireClaims(prisma, abandoned);
}

export type EmailClaimStore = Pick<
  PrismaClient,
  'user' | '$transaction' | 'emailVerificationWatch' | 'conversation' | 'participant' | 'message'
>;

export type EmailClaimProof = {
  readonly email: string;
  readonly code?: string;
  readonly token?: string;
  readonly password?: string;
};

/**
 * `none` — aucune revendication ne répond à cette clé ; `expired` — la paire a
 * expiré ; `lost` — la course est perdue, rien n'a été écrit ; `proven` — le
 * transfert est fait.
 */
export type EmailClaimOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'proven'; readonly userId: string; readonly verifiedAt: Date; readonly passwordSet: boolean };

type ClaimantRow = {
  id: string;
  createdAt: Date;
  displayName: string | null;
  username: string;
  password: string | null;
  emailVerificationToken: string | null;
  emailVerificationCode: string | null;
  emailVerificationExpiry: Date | null;
};

type HolderRow = {
  id: string;
  email: string;
  password: string | null;
  phoneNumber: string | null;
  emailVerifiedAt: Date | null;
};

class ClaimLost extends Error {
  constructor() {
    super('revendication perdue');
    this.name = 'ClaimLost';
  }
}

/** Conflit d'écriture (`P2034`) ou index unique (`P2002`) : la course est perdue. */
const lostTheRace = (error: unknown): boolean => {
  if (error instanceof ClaimLost) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2034' || code === 'P2002';
};

async function transfer(
  tx: Prisma.TransactionClient,
  input: {
    readonly claimant: ClaimantRow;
    readonly email: string;
    readonly byCode: boolean;
    readonly password: string | null;
    readonly now: Date;
  },
): Promise<void> {
  const { claimant, email, byCode, password, now } = input;

  const consumed = await tx.user.updateMany({
    where: {
      id: claimant.id,
      isActive: false,
      claimedEmail: email,
      emailVerificationToken: claimant.emailVerificationToken,
      emailVerificationCode: claimant.emailVerificationCode,
    },
    data: {
      ...(byCode ? { emailVerificationCode: null } : { emailVerificationToken: null }),
      ...(password ? { password, lastPasswordChange: now } : {}),
    },
  });
  if (consumed.count !== 1) throw new ClaimLost();

  const holder = (await tx.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, password: true, phoneNumber: true, emailVerifiedAt: true },
  })) as HolderRow | null;

  if (holder) {
    const provenSinceTheClaim =
      holder.emailVerifiedAt !== null && holder.emailVerifiedAt.getTime() >= claimant.createdAt.getTime();
    if (provenSinceTheClaim) throw new ClaimLost();

    const released = await tx.user.updateMany({
      where: { id: holder.id, email: holder.email },
      data: {
        email: releasedEmail(holder.id),
        emailVerifiedAt: null,
        emailReleasedAt: now,
        emailVerificationToken: null,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      },
    });
    if (released.count !== 1) throw new ClaimLost();

    await revokePasswordResetTokensForEmailChange(tx, holder.id);
    await tx.magicLinkToken.updateMany({
      where: { userId: holder.id, isRevoked: false, ...unsetOrNull('usedAt') },
      data: { isRevoked: true, revokedReason: REVOKED_REASON },
    });
    await tx.securityEvent.create({
      data: {
        userId: holder.id,
        eventType: EMAIL_RELEASED_EVENT,
        severity: 'HIGH',
        status: 'SUCCESS',
        description: 'Adresse e-mail cédée à une revendication prouvée par code ou lien (#8214)',
        metadata: {
          claimantUserId: claimant.id,
          proof: byCode ? 'code' : 'link',
          hadPhone: holder.phoneNumber !== null,
          hadPassword: holder.password !== null,
          wasVerified: holder.emailVerifiedAt !== null,
          reachable: holder.phoneNumber !== null || holder.password !== null,
        },
      },
    });
  }

  await tx.user.update({
    where: { id: claimant.id },
    data: { email, emailVerifiedAt: now, isActive: true, claimedEmail: null },
  });
}

/**
 * Présente une clé (code ou lien) aux revendications vivantes d'une adresse, et
 * transfère l'adresse à celle qui y répond.
 */
export async function proveEmailClaim(store: EmailClaimStore, proof: EmailClaimProof): Promise<EmailClaimOutcome> {
  const email = normalizeEmail(proof.email);
  const byCode = typeof proof.code === 'string' && proof.code.length > 0;
  const presented = byCode ? proof.code ?? '' : proof.token ?? '';

  const claimants = (await store.user.findMany({
    where: { claimedEmail: email, isActive: false },
    select: {
      id: true,
      createdAt: true,
      displayName: true,
      username: true,
      password: true,
      emailVerificationToken: true,
      emailVerificationCode: true,
      emailVerificationExpiry: true,
    },
  })) as ClaimantRow[];

  const claimant = claimants.find((c) =>
    byCode ? emailCodeMatches(c.emailVerificationCode, presented) : emailTokenMatches(c.emailVerificationToken, presented),
  );
  if (!claimant) return { kind: 'none' };

  const now = new Date();
  if (!claimant.emailVerificationExpiry || claimant.emailVerificationExpiry.getTime() <= now.getTime()) {
    return { kind: 'expired' };
  }

  const setsPassword = byCode && typeof proof.password === 'string' && claimant.password === null;
  const password = setsPassword ? await hashPassword(proof.password as string) : null;

  try {
    await store.$transaction((tx) => transfer(tx, { claimant, email, byCode, password, now }));
  } catch (error) {
    if (!lostTheRace(error)) throw error;
    logger.info('revendication perdue — aucun effet');
    return { kind: 'lost' };
  }

  logger.info(`adresse transférée à un compte revendiquant (${byCode ? 'code' : 'lien'})`);
  await markEmailVerificationWatchesProven(store, { userId: claimant.id, now });
  try {
    await ensureGlobalConversationMembership(
      { prisma: store },
      { userId: claimant.id, displayName: claimant.displayName || claimant.username },
    );
  } catch (error) {
    logger.error('ajout au salon global impossible après transfert', error as Error);
  }

  return { kind: 'proven', userId: claimant.id, verifiedAt: now, passwordSet: password !== null };
}
