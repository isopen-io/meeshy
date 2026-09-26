/**
 * UNE ADRESSE DEVIENT UN COMPTE EN UN GESTE (#8033) — la fonction UNIQUE que
 * partagent la connexion par mot de passe et la porte « e-mail seul ».
 *
 * Directive porteur 2026-09-26 : « Lorsqu'on essaye de se connecter avec un
 * email qui n'existe pas, il faut directement créer le compte et envoyer le
 * code et le lien pour valider son compte ! » — amendée le même jour : par la
 * porte « e-mail seul », un compte EXISTANT reçoit lui aussi code + lien, et
 * c'est leur vérification qui ouvre la session.
 *
 * ## Les deux portes
 *
 * | état de l'adresse                          | `password-login`          | `email-only`               |
 * |--------------------------------------------|---------------------------|----------------------------|
 * | aucun compte                               | créé, vérification requise | créé, vérification requise |
 * | compte actif, sans mot de passe, non vérifié | code renvoyé              | code envoyé                |
 * | compte actif, autre état                   | `existing-account`        | code de CONNEXION envoyé   |
 * | compte supprimé (`isActive: false`)        | `unavailable`             | `unavailable`              |
 *
 * La troisième porte, `proven-password` (#8055), n'est ouverte que par
 * `POST /login` APRÈS que `authenticate` a vérifié le mot de passe d'un compte
 * non vérifié et sans numéro — un compte qui n'est pas encore actif. Elle
 * renvoie le code de vérification (débit compté comme `password-login`), ne
 * crée jamais de compte (`unavailable` sans ligne) et rend `existing-account`
 * si l'adresse a été prouvée entre-temps.
 *
 * ## Sécurité — ce que ce module ne fait JAMAIS
 *
 * - **Il ne stocke aucun mot de passe.** Celui tapé à la connexion n'entre pas
 *   ici : sinon un tiers qui tape VOTRE adresse vous imposerait SON mot de
 *   passe. Le compte naît sans (`User.password = null`, #6424) ; un mot de
 *   passe ne se pose qu'avec le code (`POST /auth/verify-email`).
 * - **Il n'ouvre aucune session.** Seule la preuve de possession de l'adresse
 *   (le code ou le lien) le fait.
 * - **Il ne réanime pas un compte supprimé.** `User.email` est unique : une
 *   ligne `isActive: false` garde son adresse. Recréer planterait sur la
 *   contrainte, et réactiver rendrait un compte que son détenteur a fermé —
 *   l'adresse est donc « indisponible », sans exception ni e-mail.
 * - **Il ne laisse pas arroser une adresse.** Chaque envoi se compte par
 *   adresse ET par IP (même discipline que `MagicLinkService.checkRateLimit`).
 *   Par la porte « e-mail seul », le compte se lit APRÈS le débit : un refus
 *   de débit ne dit rien de l'existence du compte.
 *
 * @module services/auth/account-from-email
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { RequestContext } from '../GeoIPService';
import type { CacheStore } from '../CacheStore';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { normalizeEmail } from '../../utils/normalize';
import type { AfterResponse } from '../../utils/after-response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { isRegistrationRefusal } from './registration-refusal';
import type { RegisterData, RegisterResult } from './registration.service';
import {
  LOGIN_CODE_TTL_MINUTES,
  emailCodeLink,
  mintEmailCodePair,
  verificationTtlMinutes,
} from './email-code';

const logger = enhancedLogger.child({ module: 'AccountFromEmail' });

const PRODUCTION = process.env.NODE_ENV === 'production';

/** Envois (création ou code) par adresse et par heure. */
export const ACCOUNT_EMAIL_SENDS_PER_HOUR = PRODUCTION ? 3 : 20;
/** Envois par adresse IP et par heure — la borne qui empêche d'arroser en tournant. */
export const ACCOUNT_IP_SENDS_PER_HOUR = PRODUCTION ? 10 : 50;

const HOUR_SECONDS = 3600;

export type AccountDoor = 'password-login' | 'email-only' | 'proven-password';

export type AccountFromEmailOutcome =
  | { readonly kind: 'verification-required'; readonly accountCreated: boolean; readonly email: string }
  | { readonly kind: 'existing-account' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rate-limited' };

export type AccountFromEmailInput = {
  readonly email: string;
  readonly door: AccountDoor;
  readonly requestContext?: RequestContext;
  /** Rang 4 du Prisme pour un compte à créer : `X-Device-Locale` ou `Accept-Language`. */
  readonly deviceLocale?: string;
};

export type AccountCodeMailer = {
  sendEmailVerification(params: {
    to: string;
    name: string;
    verificationLink: string;
    verificationCode: string;
    expiryHours: number;
    expiryMinutes?: number;
    language: string;
  }): Promise<{ success: boolean; error?: string }>;
  sendLoginCodeEmail(params: {
    to: string;
    name: string;
    code: string;
    link: string;
    expiryMinutes: number;
    language: string;
  }): Promise<{ success: boolean; error?: string }>;
};

export type AccountFromEmailDeps = {
  readonly prisma: PrismaClient;
  readonly throttle: Pick<CacheStore, 'get' | 'set'>;
  readonly mailer: AccountCodeMailer;
  readonly frontendUrl: string;
  /** La création — `registerAccount`, câblée par `AuthService`, avec la durée de vie du code. */
  readonly register: (data: RegisterData, requestContext: RequestContext | undefined, ttlMinutes: number) => Promise<RegisterResult>;
  readonly afterResponse?: AfterResponse;
};

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  firstName: true,
  lastName: true,
  isActive: true,
  password: true,
  emailVerifiedAt: true,
  ...RECIPIENT_LANG_SELECT,
} as const;

/** Compter un envoi ; `false` quand l'adresse OU l'IP a épuisé son heure. */
async function consumeSend(throttle: AccountFromEmailDeps['throttle'], email: string, ip: string): Promise<boolean> {
  const emailKey = `ratelimit:account-from-email:email:${email}`;
  const ipKey = `ratelimit:account-from-email:ip:${ip}`;
  try {
    const emailCount = parseInt((await throttle.get(emailKey)) ?? '0', 10) || 0;
    const ipCount = parseInt((await throttle.get(ipKey)) ?? '0', 10) || 0;
    if (emailCount >= ACCOUNT_EMAIL_SENDS_PER_HOUR || ipCount >= ACCOUNT_IP_SENDS_PER_HOUR) return false;
    await throttle.set(emailKey, String(emailCount + 1), HOUR_SECONDS);
    await throttle.set(ipKey, String(ipCount + 1), HOUR_SECONDS);
    return true;
  } catch (error) {
    // Même choix que `MagicLinkService.checkRateLimit` : une panne du magasin
    // ne ferme pas la porte d'entrée du produit.
    logger.error('débit indisponible — envoi autorisé', error as Error);
    return true;
  }
}

/** Programme un envoi qui ne conditionne pas la réponse ; son échec se journalise. */
async function aCote(deps: AccountFromEmailDeps, task: () => Promise<void>, label: string): Promise<void> {
  if (deps.afterResponse) {
    deps.afterResponse(task, label);
    return;
  }
  try {
    await task();
  } catch (error) {
    logger.error(`envoi échoué (${label})`, error as Error);
  }
}

type AccountRow = {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  firstName: string;
  lastName: string;
  isActive: boolean;
  password: string | null;
  emailVerifiedAt: Date | null;
  systemLanguage?: string | null;
  regionalLanguage?: string | null;
  customDestinationLanguage?: string | null;
  deviceLocale?: string | null;
};

/**
 * Émettre une paire neuve pour un compte EXISTANT et l'envoyer.
 *
 * Un compte encore non vérifié reçoit l'e-mail de VÉRIFICATION ; un compte
 * vérifié reçoit un code de CONNEXION — même paire, autre mot : on ne souhaite
 * pas la bienvenue à quelqu'un qui est là depuis un an.
 */
async function sendCodeToAccount(deps: AccountFromEmailDeps, account: AccountRow, ttlMinutes: number): Promise<void> {
  const pair = mintEmailCodePair(ttlMinutes);
  await deps.prisma.user.update({ where: { id: account.id }, data: { ...pair.columns } });

  const link = emailCodeLink(deps.frontendUrl, pair.rawToken, account.email);
  const name = account.displayName || `${account.firstName} ${account.lastName}`.trim() || account.username;
  const language = recipientLanguage(account, 'fr');

  await aCote(
    deps,
    async () => {
      const resultat = account.emailVerifiedAt
        ? await deps.mailer.sendLoginCodeEmail({ to: account.email, name, code: pair.code, link, expiryMinutes: ttlMinutes, language })
        : await deps.mailer.sendEmailVerification({
            to: account.email,
            name,
            verificationLink: link,
            verificationCode: pair.code,
            expiryHours: ttlMinutes / 60,
            expiryMinutes: ttlMinutes,
            language,
          });
      if (!resultat.success) logger.error("échec de l'envoi du code", { error: resultat.error });
    },
    'account-code-email',
  );
}

const ttlFor = (door: AccountDoor): number =>
  door === 'email-only' ? LOGIN_CODE_TTL_MINUTES : verificationTtlMinutes();

const isPendingSignup = (account: AccountRow): boolean => account.password === null && account.emailVerifiedAt === null;

/** Le compte attend-il son code, vu depuis cette porte ? */
const awaitsCode = (account: AccountRow, door: AccountDoor): boolean =>
  door === 'proven-password' ? account.emailVerifiedAt === null : isPendingSignup(account);

/**
 * Démarrer — ou reprendre — un compte depuis une adresse. Voir le tableau en
 * tête de module.
 */
export async function startAccountFromEmail(
  deps: AccountFromEmailDeps,
  input: AccountFromEmailInput,
): Promise<AccountFromEmailOutcome> {
  const email = normalizeEmail(input.email);
  const ip = input.requestContext?.ip || 'unknown';
  const ttlMinutes = ttlFor(input.door);

  if (input.door === 'email-only' && !(await consumeSend(deps.throttle, email, ip))) {
    return { kind: 'rate-limited' };
  }

  const account = (await deps.prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: ACCOUNT_SELECT,
  })) as AccountRow | null;

  if (account && !account.isActive) {
    logger.info('adresse portée par un compte supprimé — indisponible');
    return { kind: 'unavailable' };
  }

  if (!account && input.door === 'proven-password') {
    return { kind: 'unavailable' };
  }

  if (account && input.door !== 'email-only' && !awaitsCode(account, input.door)) {
    return { kind: 'existing-account' };
  }

  if (input.door !== 'email-only' && !(await consumeSend(deps.throttle, email, ip))) {
    // Un compte en attente garde son code en cours : on ne le régénère pas, on
    // ne renvoie rien, et l'écran de saisie du code reste la bonne suite.
    return account ? { kind: 'verification-required', accountCreated: false, email } : { kind: 'rate-limited' };
  }

  if (account) {
    await sendCodeToAccount(deps, account, ttlMinutes);
    return { kind: 'verification-required', accountCreated: false, email };
  }

  try {
    await deps.register({ email, deviceLocale: input.deviceLocale }, input.requestContext, ttlMinutes);
  } catch (error) {
    // La course entre deux demandes simultanées pour la même adresse : la
    // seconde trouve la ligne que la première vient d'écrire. Le compte existe,
    // un code est parti — la réponse est la même, sans second envoi.
    if (isRegistrationRefusal(error) && error.code === 'EMAIL_TAKEN') {
      return { kind: 'verification-required', accountCreated: false, email };
    }
    throw error;
  }

  logger.info('compte créé depuis une adresse — vérification requise', { door: input.door });
  return { kind: 'verification-required', accountCreated: true, email };
}
