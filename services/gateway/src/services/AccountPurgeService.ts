import crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { hashPassword } from '../utils/password-hash';

const logger = enhancedLogger.child({ module: 'AccountPurgeService' });

export type AccountPurgeSummary = {
  readonly sessionsDeleted: number;
  readonly voiceProfileDeleted: number;
  readonly shareLinksDeleted: number;
};

/**
 * Purge, à l'expiration de la période de grâce (#3632), la portion des
 * données d'un compte supprimé qui ne touche AUCUN autre utilisateur :
 * sessions, profil vocal, liens de partage créés par ce compte. Trois tables
 * isolées, aucune ligne partagée avec un tiers — supprimables sans arbitrage
 * sur ce qu'un AUTRE participant continue de voir.
 *
 * Idempotent par construction (`deleteMany` sur une ligne déjà absente ne
 * lève pas) : rejouable sans effet de bord si l'appelant retente après un
 * échec partiel.
 *
 * Volontairement HORS DE PORTÉE ici — chacun est un suivi distinct ouvert
 * depuis #3632, jamais une ligne ajoutée à ce module sans sa propre revue :
 *  - les MESSAGES envoyés par ce compte, visibles par d'autres participants —
 *    l'anonymisation doit reprendre exactement la sémantique de « suppression
 *    pour tous » déjà en place (`translations: null, deletedAt: new Date()`,
 *    cf. `routes/messages-writes.ts`), résolue via `Participant.id` puisque
 *    `Message.senderId` référence un `Participant`, pas un `User` (#5689) ;
 *  - les MÉDIAS (`MessageAttachment` / `PostMedia`) — la suppression PHYSIQUE
 *    des octets a sa propre infrastructure (`AttachmentService.deleteAttachment`,
 *    `reclaimPostMediaBytes`) qu'un lot dédié doit réutiliser, jamais dupliquer
 *    (#5690).
 *
 * L'anonymisation de l'IDENTITÉ (`User.username`/`email`/`displayName`/…) est
 * livrée par `anonymizeUserIdentity`, ci-dessous — voir son doc-comment pour la
 * décision produit sur `Participant.displayName` (#5691, partagée avec #5689).
 */
export async function purgeAccountIsolatedData(
  prisma: Pick<PrismaClient, 'userSession' | 'userVoiceModel' | 'conversationShareLink'>,
  userId: string,
): Promise<AccountPurgeSummary> {
  const [sessions, voiceProfile, shareLinks] = await Promise.all([
    prisma.userSession.deleteMany({ where: { userId } }),
    prisma.userVoiceModel.deleteMany({ where: { userId } }),
    prisma.conversationShareLink.deleteMany({ where: { createdBy: userId } }),
  ]);

  const summary: AccountPurgeSummary = {
    sessionsDeleted: sessions.count,
    voiceProfileDeleted: voiceProfile.count,
    shareLinksDeleted: shareLinks.count,
  };

  logger.info(`[AccountPurge] user=${userId} sessions=${summary.sessionsDeleted} voiceProfile=${summary.voiceProfileDeleted} shareLinks=${summary.shareLinksDeleted}`);

  return summary;
}

export type AccountIdentityAnonymizeSummary = {
  readonly userId: string;
  readonly anonymized: boolean;
};

/** Préfixe des valeurs de repli — jamais une constante seule (collision `@unique`). */
const ANONYMIZED_MARKER = 'compte-supprime';

function anonymizedUsername(userId: string): string {
  return `${ANONYMIZED_MARKER}-${userId}`;
}

function anonymizedEmail(userId: string): string {
  return `${ANONYMIZED_MARKER}-${userId}@deleted.meeshy.invalid`;
}

/**
 * Anonymise, à l'expiration de la période de grâce (#3632, suivi #5691), la
 * ligne `User` d'un compte supprimé : identité, contact, recherche, secrets
 * d'authentification. La ligne SURVIT — jamais un `delete` — parce que
 * `Participant.userId` et donc `Message.senderId → Participant.id` (#5689)
 * continuent de la référencer pour tout historique visible par d'autres
 * participants.
 *
 * `username`/`email`/`referralCode` portent `@unique` en base : la valeur de
 * repli est dérivée de `userId` (jamais une constante partagée entre deux
 * comptes supprimés), même patron que `jetonConsomme()`
 * (`routes/account-deletion.ts`).
 *
 * Idempotent par construction — `updateMany` filtre sur `username` DÉJÀ
 * anonymisé : rejouable sans effet de bord (`anonymized: false` la seconde
 * fois, jamais d'erreur d'unicité en réappliquant la même valeur).
 *
 * **Décision produit (#5691, partagée avec #5689) — `Participant.displayName`
 * n'est PAS réécrit ici.** C'est une copie dénormalisée, figée par
 * conversation au moment où le participant l'a rejointe — un instantané
 * historique, pas l'identité vivante du compte. Le retranscrire exigerait un
 * balayage non borné de `Participant` sur potentiellement des milliers de
 * conversations, pour un gain de confidentialité marginal : le contenu que ce
 * compte a écrit est anonymisé séparément (#5689, `Message.deletedAt`), et
 * c'est LUI que `privacy.json` promet anonymisé (« les messages … sont
 * anonymisés ») — jamais le nom qui apparaissait à côté. C'est la même
 * sémantique que le dépôt applique déjà à un message supprimé : le contenu
 * disparaît, l'historique structurel (qui a écrit quoi) survit pour les
 * autres participants. `User` — l'identité INTERROGEABLE (recherche,
 * connexion, contact) — est la seule chose que cette fonction anonymise.
 */
export async function anonymizeUserIdentity(
  prisma: Pick<PrismaClient, 'user'>,
  userId: string,
): Promise<AccountIdentityAnonymizeSummary> {
  const username = anonymizedUsername(userId);
  const email = anonymizedEmail(userId);
  const inertPassword = await hashPassword(crypto.randomBytes(32).toString('hex'));

  const result = await prisma.user.updateMany({
    where: { id: userId, username: { not: username } },
    data: {
      username,
      usernameHistory: [],
      email,
      phoneNumber: null,
      phoneCountryCode: null,
      firstName: 'Compte',
      lastName: 'supprimé',
      displayName: null,
      avatar: null,
      banner: null,
      bio: '',
      birthDate: null,
      searchTokens: [],
      blockedUserIds: [],
      referralCode: null,
      // Défense en profondeur — le compte est déjà `isActive: false`, donc
      // injoignable par login ; un hash INERTE (jamais une chaîne non-bcrypt,
      // cf. `utils/password-hash.ts`) garantit qu'une comparaison échoue aussi
      // si cette garde venait à sauter ailleurs.
      password: inertPassword,
      pendingEmail: null,
      pendingEmailVerificationToken: null,
      pendingEmailVerificationExpiry: null,
      pendingPhoneNumber: null,
      pendingPhoneVerificationCode: null,
      pendingPhoneVerificationExpiry: null,
      emailVerificationToken: null,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
      phoneVerificationCode: null,
      phoneVerificationExpiry: null,
      lastLoginIp: null,
      lastLoginLocation: null,
      lastLoginDevice: null,
      registrationIp: null,
      registrationLocation: null,
      registrationDevice: null,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
      twoFactorPendingSecret: null,
      twoFactorChallengeHash: null,
      twoFactorChallengeExpiresAt: null,
      signalIdentityKeyPublic: null,
      signalIdentityKeyPrivate: null,
      signalRegistrationId: null,
      signalPreKeyBundleVersion: null,
      // `engagementScore`/`currentStreakDays`/`longestStreakDays`/`lastStreakDate`
      // (#5691) : NON réécrits — agrégats d'engagement, pas des données
      // personnelles identifiantes ; les vider casserait des agrégats globaux
      // sans bénéfice de confidentialité (décision confirmée, pas par défaut).
    },
  });

  const anonymized = result.count > 0;
  logger.info(`[AccountAnonymize] user=${userId} anonymized=${anonymized}`);

  return { userId, anonymized };
}
