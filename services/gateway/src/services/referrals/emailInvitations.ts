/**
 * MES INVITATIONS PAR E-MAIL (#19207, chantier #18857) — la liste « Invitations envoyées » de la
 * vue Parrainage, leur relance et la désinscription de l'invité. Le site UNIQUE qui lit, relance,
 * exporte et efface `EmailInvitation`, et qui tient `EmailInvitationOptOut`.
 *
 * ## L'adresse d'un tiers ne part jamais en clair
 *
 * Toute réponse, et l'export, portent `maskEmailAddress(email)` (`ma•••••@gmail.com`). L'adresse
 * complète ne quitte le serveur que vers son propre destinataire, dans l'e-mail.
 *
 * ## L'état se lit sur le jeton dédié, sans pixel
 *
 * Chaque invitation a son `AffiliateToken` à usage unique : une visite de son lien l'OUVRE
 * (`clickCount`), son usage ou un compte existant à cette adresse la fait REJOINDRE.
 *
 * ## La relance
 *
 * Une par 72 h, trois au plus (`invitationResendWindow`), jamais vers une adresse qui a rejoint
 * Meeshy ou s'est désinscrite. Le compte des relances sert de VERSION : la place se prend par
 * un `updateMany` conditionné à la valeur lue, si bien que deux relances simultanées n'en
 * envoient qu'une ; elle se rend si l'e-mail n'a pas pu partir.
 *
 * ## La désinscription
 *
 * Le serveur ne garde qu'une empreinte HMAC de l'adresse (secret `READER_KEY_HMAC_SECRET`,
 * domaine `invitation-opt-out:`), comme pour un non-inscrit du carnet d'adresses (#9225).
 * Le lien de l'e-mail porte cette empreinte et sa CLÉ (domaine `invitation-opt-out-link:`),
 * que seul l'e-mail transporte : jamais le jeton d'inscription, que le parrain détient
 * (`invitationUrl`) — sans quoi il désinscrirait l'adresse pour tout le monde. Le lien ne
 * dépend d'aucune ligne : il vaut encore après l'effacement du compte du parrain. Une
 * liste où l'on dit pourquoi une adresse est refusée apprendrait au parrain qui l'a refusé : la
 * liste ne dit que « pas de relance possible ».
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  invitationResendWindow,
  invitationState,
  maskEmailAddress,
  type InvitationResendWindow,
  type InvitationState,
} from '@meeshy/shared/utils/referral-funnel';
import { readerKeySecret } from '../posts/readerKey';

export const MAX_INVITATIONS_EXPORTED = 1000;

export type SentInvitation = {
  readonly id: string;
  readonly maskedEmail: string;
  readonly sentAt: string;
  readonly state: InvitationState;
  readonly resendCount: number;
  readonly resendsLeft: number;
  readonly canResend: boolean;
  readonly nextResendAt: string | null;
};

type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly sentAt: Date;
  readonly resendCount: number | null;
  readonly lastResentAt: Date | null;
  readonly affiliateToken: {
    readonly token: string;
    readonly clickCount: number;
    readonly currentUses: number;
    readonly _count: { readonly affiliations: number };
  };
};

const INVITATION_SELECT = {
  id: true,
  email: true,
  sentAt: true,
  resendCount: true,
  lastResentAt: true,
  affiliateToken: {
    select: { token: true, clickCount: true, currentUses: true, _count: { select: { affiliations: true } } },
  },
} as const;

const normalized = (email: string): string => email.trim().toLowerCase();

export const invitationOptOutHash = (email: string, secret: string = readerKeySecret()): string =>
  createHmac('sha256', secret).update(`invitation-opt-out:${normalized(email)}`).digest('hex');

export async function isInvitationOptedOut(prisma: PrismaClient, email: string): Promise<boolean> {
  const row = await prisma.emailInvitationOptOut.findUnique({ where: { emailHash: invitationOptOutHash(email) }, select: { id: true } });
  return row !== null;
}

const emailVariants = (emails: readonly string[]): string[] => [...new Set(emails.flatMap((email) => [email, normalized(email)]))];

async function registeredEmails(prisma: PrismaClient, emails: readonly string[]): Promise<ReadonlySet<string>> {
  if (emails.length === 0) return new Set();
  const variants = emailVariants(emails);
  const users = await prisma.user.findMany({ where: { email: { in: variants } }, select: { email: true }, take: variants.length });
  return new Set(users.flatMap((user) => (user.email ? [normalized(user.email)] : [])));
}

async function optedOutHashes(prisma: PrismaClient, emails: readonly string[]): Promise<ReadonlySet<string>> {
  if (emails.length === 0) return new Set();
  const hashes = [...new Set(emails.map((email) => invitationOptOutHash(email)))];
  const rows = await prisma.emailInvitationOptOut.findMany({ where: { emailHash: { in: hashes } }, select: { emailHash: true }, take: hashes.length });
  return new Set(rows.map((row) => row.emailHash));
}

const isJoined = (row: InvitationRow, registered: ReadonlySet<string>): boolean =>
  row.affiliateToken._count.affiliations > 0 || row.affiliateToken.currentUses > 0 || registered.has(normalized(row.email));

const windowOf = (row: InvitationRow, now: Date): InvitationResendWindow =>
  invitationResendWindow({ sentAt: row.sentAt, lastResentAt: row.lastResentAt, resendCount: row.resendCount, now });

function servedInvitation(row: InvitationRow, context: { readonly joined: boolean; readonly optedOut: boolean; readonly now: Date }): SentInvitation {
  const window = windowOf(row, context.now);
  const blocked = context.joined || context.optedOut;
  return {
    id: row.id,
    maskedEmail: maskEmailAddress(row.email),
    sentAt: row.sentAt.toISOString(),
    state: invitationState({ joined: context.joined, opened: row.affiliateToken.clickCount > 0 || row.affiliateToken.currentUses > 0 }),
    resendCount: row.resendCount ?? 0,
    resendsLeft: blocked ? 0 : window.resendsLeft,
    canResend: !blocked && window.canResend,
    nextResendAt: blocked || !window.nextResendAt ? null : window.nextResendAt.toISOString(),
  };
}

async function servedInvitations(prisma: PrismaClient, rows: readonly InvitationRow[], now: Date): Promise<SentInvitation[]> {
  const emails = rows.map((row) => row.email);
  const [registered, optedOut] = await Promise.all([registeredEmails(prisma, emails), optedOutHashes(prisma, emails)]);
  return rows.map((row) =>
    servedInvitation(row, { joined: isJoined(row, registered), optedOut: optedOut.has(invitationOptOutHash(row.email)), now }),
  );
}

export async function listSentInvitations(
  prisma: PrismaClient,
  params: { readonly senderId: string; readonly limit: number; readonly offset: number; readonly now: Date },
): Promise<{ readonly items: SentInvitation[]; readonly total: number }> {
  const where = { senderId: params.senderId };
  const [rows, total] = await Promise.all([
    prisma.emailInvitation.findMany({ where, orderBy: { sentAt: 'desc' }, skip: params.offset, take: params.limit, select: INVITATION_SELECT }),
    prisma.emailInvitation.count({ where }),
  ]);
  return { items: await servedInvitations(prisma, rows as readonly InvitationRow[], params.now), total };
}

export type ResendRefusal = 'not-found' | 'joined' | 'opted-out' | 'too-soon' | 'exhausted';

export type ResendClaim =
  | { readonly kind: 'refused'; readonly reason: ResendRefusal; readonly nextResendAt: Date | null }
  | { readonly kind: 'claimed'; readonly email: string; readonly token: string; readonly release: () => Promise<void>; readonly served: SentInvitation };

const refused = (reason: ResendRefusal, nextResendAt: Date | null = null): ResendClaim => ({ kind: 'refused', reason, nextResendAt });

const resendCountIs = (count: number | null) =>
  count === null ? { OR: [{ resendCount: { isSet: false } }, { resendCount: null }] } : { resendCount: count };

/** Prend la place d'une relance, ou dit pourquoi elle est refusée. Rien n'est envoyé ici. */
export async function claimInvitationResend(
  prisma: PrismaClient,
  params: { readonly senderId: string; readonly invitationId: string; readonly now: Date },
): Promise<ResendClaim> {
  const { senderId, invitationId, now } = params;
  const row = (await prisma.emailInvitation.findFirst({ where: { id: invitationId, senderId }, select: INVITATION_SELECT })) as InvitationRow | null;
  if (!row) return refused('not-found');
  const [registered, optedOut] = await Promise.all([registeredEmails(prisma, [row.email]), isInvitationOptedOut(prisma, row.email)]);
  if (isJoined(row, registered)) return refused('joined');
  if (optedOut) return refused('opted-out');
  const window = windowOf(row, now);
  if (window.resendsLeft === 0) return refused('exhausted');
  if (!window.canResend) return refused('too-soon', window.nextResendAt);

  const nextCount = (row.resendCount ?? 0) + 1;
  const claimed = await prisma.emailInvitation.updateMany({
    where: { id: row.id, senderId, ...resendCountIs(row.resendCount) },
    data: { resendCount: nextCount, lastResentAt: now },
  });
  if (claimed.count === 0) return refused('too-soon', window.nextResendAt);

  const release = async (): Promise<void> => {
    await prisma.emailInvitation.updateMany({
      where: { id: row.id, senderId, resendCount: nextCount },
      data: { resendCount: row.resendCount ?? 0, lastResentAt: row.lastResentAt },
    });
  };
  const served = servedInvitation({ ...row, resendCount: nextCount, lastResentAt: now }, { joined: false, optedOut: false, now });
  return { kind: 'claimed', email: row.email, token: row.affiliateToken.token, release, served };
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

const OPT_OUT_HEX = /^[0-9a-f]{64}$/;

export const invitationOptOutKey = (emailHash: string, secret: string = readerKeySecret()): string =>
  createHmac('sha256', secret).update(`invitation-opt-out-link:${emailHash}`).digest('hex');

/** Le lien « Ne plus recevoir d'invitation » de l'e-mail : l'empreinte et sa clé, jamais l'adresse. */
export function invitationOptOutUrl(email: string): string {
  const address = invitationOptOutHash(email);
  const params = new URLSearchParams({ address, key: invitationOptOutKey(address) });
  return `${process.env.FRONTEND_URL || 'http://localhost:3100'}/invitations/opt-out?${params.toString()}`;
}

const isOptOutKeyValid = (address: string, key: string): boolean =>
  OPT_OUT_HEX.test(address) && OPT_OUT_HEX.test(key) && timingSafeEqual(Buffer.from(invitationOptOutKey(address), 'hex'), Buffer.from(key, 'hex'));

/** L'invité refuse toute nouvelle invitation. `false` si la clé n'est pas celle de l'empreinte. */
export async function optOutOfInvitations(prisma: PrismaClient, link: { readonly address: string; readonly key: string }): Promise<boolean> {
  if (!isOptOutKeyValid(link.address, link.key)) return false;
  try {
    await prisma.emailInvitationOptOut.create({ data: { emailHash: link.address } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return true;
}

export type ExportedInvitation = {
  readonly maskedEmail: string;
  readonly sentAt: string;
  readonly resendCount: number;
  readonly lastResentAt: string | null;
};

export async function exportSentInvitationsOf(prisma: PrismaClient, senderId: string): Promise<ExportedInvitation[]> {
  const rows = await prisma.emailInvitation.findMany({
    where: { senderId },
    orderBy: { sentAt: 'desc' },
    select: { email: true, sentAt: true, resendCount: true, lastResentAt: true },
    take: MAX_INVITATIONS_EXPORTED,
  });
  return rows.map((row) => ({
    maskedEmail: maskEmailAddress(row.email),
    sentAt: row.sentAt.toISOString(),
    resendCount: row.resendCount ?? 0,
    lastResentAt: row.lastResentAt ? row.lastResentAt.toISOString() : null,
  }));
}

/** Ses invitations partent avec son compte : elles portent l'adresse d'un tiers. */
export async function eraseSentInvitationsOf(prisma: PrismaClient, senderId: string): Promise<number> {
  const { count } = await prisma.emailInvitation.deleteMany({ where: { senderId } });
  return count;
}
