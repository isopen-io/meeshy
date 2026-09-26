/**
 * L'ATTENTE D'UNE PREUVE D'ADRESSE (#8083) — SITE UNIQUE.
 *
 * Constat de recette : inscription sans numéro sur le téléphone, lien de
 * l'e-mail ouvert sur l'ordinateur — le navigateur est connecté, et l'écran du
 * code, sur le téléphone, reste figé : il n'apprend jamais que l'adresse est
 * prouvée.
 *
 * Décision porteur (2026-09-26, « si et seulement si ») : le téléphone ne se
 * connecte QUE par le code saisi sur lui ou le lien ouvert sur lui. Aucune
 * session ne voyage d'un appareil à l'autre. Ce module rend donc à l'appareil
 * demandeur un jeton qui ne sait dire qu'une chose — `pending` ou `proven` —
 * pour que son écran puisse annoncer « Adresse confirmée — saisissez le code
 * reçu ».
 *
 * ## Ce que le jeton ne fait JAMAIS
 *
 * - **Il n'ouvre aucune session**, ni ne se change en une : aucune route n'en
 *   accepte un pour autre chose que lire l'état.
 * - **Il ne nomme pas l'adresse** ni le compte : la lecture ne rend qu'un état.
 * - **Il ne dit pas si un compte existe** : une adresse sans compte actif
 *   reçoit elle aussi un jeton, NON lié, qui reste `pending` jusqu'à expirer —
 *   la porte « e-mail seul » garde sa réponse unique (anti-énumération).
 * - **Il n'est stocké qu'haché** (SHA-256) ; le jeton brut ne vit que dans la
 *   réponse remise à l'appareil.
 *
 * @module services/auth/email-verification-watch
 */

import crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { normalizeEmail } from '../../utils/normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'EmailVerificationWatch' });

/** Durée d'une attente quand aucun code vivant ne la borne : celle d'un code de connexion. */
export const EMAIL_VERIFICATION_WATCH_FALLBACK_TTL_MS = 15 * 60 * 1000;

const TOKEN_BYTES = 32;

export type EmailVerificationWatchStore = Pick<PrismaClient, 'emailVerificationWatch'>;

export type EmailVerificationWatchStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'proven' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'unknown' };

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** L'empreinte stockée d'un jeton — aussi la seule forme qui entre dans une clé de débit. */
export const emailVerificationWatchHash = (rawToken: string): string => sha256(rawToken);

type WatchedAccount = { id: string; emailVerificationExpiry: Date | null };

/**
 * Émettre l'attente de l'appareil qui vient de recevoir `verification-required`.
 *
 * Appelée APRÈS que le code est parti : l'expiration du code en cours sur le
 * compte borne l'attente. Rend le jeton BRUT, à remettre tel quel au client.
 */
export async function issueEmailVerificationWatch(
  prisma: Pick<PrismaClient, 'user'> & EmailVerificationWatchStore,
  input: { readonly email: string; readonly now?: Date },
): Promise<string> {
  const now = input.now ?? new Date();
  const account = (await prisma.user.findFirst({
    where: { email: { equals: normalizeEmail(input.email), mode: 'insensitive' }, isActive: true },
    select: { id: true, emailVerificationExpiry: true },
  })) as WatchedAccount | null;

  const codeExpiry = account?.emailVerificationExpiry ?? null;
  const expiresAt =
    codeExpiry && codeExpiry.getTime() > now.getTime()
      ? codeExpiry
      : new Date(now.getTime() + EMAIL_VERIFICATION_WATCH_FALLBACK_TTL_MS);

  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  await prisma.emailVerificationWatch.create({
    data: { tokenHash: sha256(rawToken), userId: account?.id ?? null, expiresAt, provenAt: null },
  });
  return rawToken;
}

/**
 * Le champ à étaler dans une réponse `verification-required` : `{}` quand
 * l'émission échoue — le code est déjà parti, l'écran du code reste la bonne
 * suite, et il saura se passer de l'état.
 */
export async function pendingSessionTokenFor(
  prisma: Pick<PrismaClient, 'user'> & EmailVerificationWatchStore,
  email: string,
): Promise<{ pendingSessionToken?: string }> {
  try {
    return { pendingSessionToken: await issueEmailVerificationWatch(prisma, { email }) };
  } catch (error) {
    logger.error("émission de l'attente impossible — réponse sans jeton", error as Error);
    return {};
  }
}

/**
 * La preuve vient d'être faite (code ou lien, où que ce soit) : chaque attente
 * VIVANTE du compte passe à `proven`. Une panne ici ne coûte jamais la preuve
 * elle-même — l'écran du code retombera simplement sur la saisie.
 */
export async function markEmailVerificationWatchesProven(
  prisma: EmailVerificationWatchStore,
  input: { readonly userId: string; readonly now: Date },
): Promise<void> {
  try {
    await prisma.emailVerificationWatch.updateMany({
      where: { userId: input.userId, provenAt: null, expiresAt: { gt: input.now } },
      data: { provenAt: input.now },
    });
  } catch (error) {
    logger.error('marquage des attentes impossible — la preuve tient', error as Error);
  }
}

/** Lire l'état d'une attente. Ne rend jamais que l'état. */
export async function readEmailVerificationWatch(
  prisma: EmailVerificationWatchStore,
  rawToken: string,
  now: Date = new Date(),
): Promise<EmailVerificationWatchStatus> {
  const token = rawToken.trim();
  if (token.length === 0) return { kind: 'unknown' };

  const watch = await prisma.emailVerificationWatch.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, provenAt: true },
  });

  if (!watch) return { kind: 'unknown' };
  if (watch.provenAt) return { kind: 'proven' };
  if (watch.expiresAt.getTime() <= now.getTime()) return { kind: 'expired' };
  return { kind: 'pending' };
}
