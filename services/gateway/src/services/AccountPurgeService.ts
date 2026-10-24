import crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { hashPassword } from '../utils/password-hash';
import { clearPendingTwoFactor } from './auth/pending-two-factor';
import { eraseAddressBookOf } from './ContactDirectoryService';
import { purgeGameData, type GamePurgeSummary } from './game/GamePurge';
import { eraseSharedTranslationsOfAccount } from './messaging/sharedTranslationErasure';
import { purgePackData, type PackFileStore, type PackPurgeSummary } from './packs/PackPrivacy';
import {
  eraseReadingTelemetryOf,
  type ReadingTelemetryErasure,
} from './social/readingTelemetryErasure';
import { deleteShareLinksRevokingGuests } from '../socketio/deleteShareLinksRevokingGuests';
import { eraseCallTelemetryOf } from './calls/callTelemetryPrivacy';
import { eraseE2EEDataOfUser } from './e2ee/device-retirement';
import type { ShareLinkRevocationLive } from './cleanupExpiredData';

const logger = enhancedLogger.child({ module: 'AccountPurgeService' });

export type AccountPurgeSummary = {
  readonly sessionsDeleted: number;
  readonly voiceProfileDeleted: number;
  readonly shareLinksDeleted: number;
  readonly notificationsDeleted: number;
  readonly addressBookContactsDeleted: number;
  readonly contactJoinNoticesDeleted: number;
  readonly arrivalAnnouncementsDeleted: number;
  /** Les traductions PARTAGÉES (#9899) que les participants du compte avaient scellées pour les autres. */
  readonly sharedTranslationsDeleted: number;
  readonly game: GamePurgeSummary;
  readonly packs: PackPurgeSummary;
  /** Ce que le compte a vu, lu, ouvert, fait défiler ou capturé (#10499, O6). */
  readonly readingTelemetry: ReadingTelemetryErasure;
  /** Les lignes d'appel dont la télémétrie et la note ont été effacées (#11277) : la ligne, elle, reste. */
  readonly callTelemetryErased: number;
  /** Ses appareils chiffrés, leurs pré-clés publiques et les enveloppes qui lui restaient adressées (#12543). */
  readonly e2eeErased: { readonly devices: number; readonly preKeys: number; readonly envelopes: number };
};

export type AccountPurgeOptions = {
  /** Le volume des téléversements vu par la purge des packs ; le disque réel par défaut. */
  readonly packFiles?: PackFileStore;
  /**
   * Le vivant que la révocation des invités de ses liens éteint (sockets,
   * appel, position) — résolu à l'appel. Sans lui, la révocation reste entière
   * en base et dans les caches (#10492).
   */
  readonly shareLinkLive?: ShareLinkRevocationLive;
};

/**
 * Purge, à l'expiration de la période de grâce (#3632), la portion des
 * données d'un compte supprimé qui ne touche AUCUN autre utilisateur :
 * sessions, profil vocal, liens de partage créés par ce compte, notifications
 * qui lui étaient destinées, et son carnet d'adresses synchronisé (#8284 —
 * `eraseAddressBookOf`, qui retire aussi les annonces « X a rejoint Meeshy »
 * faites à d'autres à son sujet : elles désignent un compte qui n'existe plus),
 * et les traductions PARTAGÉES (#9899) que ses participants avaient scellées
 * pour les autres membres (`eraseSharedTranslationsOfAccount`, par
 * `sharedById` — le `Participant.id`, jamais le `User.id`).
 * Aucune ligne partagée avec un tiers — supprimables sans arbitrage sur ce
 * qu'un AUTRE participant continue de voir. Les notifications d'AUTRES comptes
 * nées de son activité (un message, une réaction) ne sont PAS visées ici :
 * elles suivent l'anonymisation des messages (#5689).
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
 *    `Message.senderId` référence un `Participant`, pas un `User` (#5689,
 *    livré) ;
 *  - les MÉDIAS (`MessageAttachment` / `PostMedia`) — la suppression PHYSIQUE
 *    des octets a sa propre infrastructure (`AttachmentService.deleteAttachment`,
 *    `reclaimPostMediaBytes`) qu'un lot dédié doit réutiliser, jamais dupliquer
 *    (#5690, livré).
 *
 * Les PACKS (#10151, LP3, suivi distinct de #9141 avec sa propre revue) :
 * choix d'installation, bibliothèque de stickers et ses fichiers, propositions
 * non publiées — le périmètre et ses raisons vivent dans
 * `services/packs/PackPrivacy.ts`, seul accès RGPD aux tables de packs.
 *
 * L'anonymisation de l'IDENTITÉ (`User.username`/`email`/`displayName`/…) est
 * livrée par `anonymizeUserIdentity`, ci-dessous — voir son doc-comment pour la
 * décision produit sur `Participant.displayName` (#5691, partagée avec #5689).
 */
export async function purgeAccountIsolatedData(
  prisma: PrismaClient,
  userId: string,
  options: AccountPurgeOptions = {},
): Promise<AccountPurgeSummary> {
  const [sessions, voiceProfile, shareLinks, notifications, addressBook, sharedTranslations, game, packs, readingTelemetry, callTelemetry, e2ee] =
    await Promise.all([
      prisma.userSession.deleteMany({ where: { userId } }),
      prisma.userVoiceModel.deleteMany({ where: { userId } }),
      // #10492 — les invités de ses liens sont révoqués AVANT la suppression :
      // la ligne emportait la marque d'une révocation différée, et ses invités
      // restaient actifs. Un lien dont la révocation échoue reste, fermé et
      // marqué pour le balayage horaire, et la panne propage.
      deleteShareLinksRevokingGuests({
        prisma,
        io: options.shareLinkLive?.resolveIO?.() ?? null,
        manager: options.shareLinkLive?.resolveManager?.() ?? null,
        where: { createdBy: userId },
      }),
      prisma.notification.deleteMany({ where: { userId } }),
      eraseAddressBookOf(prisma, userId),
      // Une panne PROPAGE, comme celle de chaque suppression voisine : les deux
      // appelants la journalisent. Aucune passe ne la rejoue aujourd'hui — la
      // demande est déjà `GRACE_PERIOD_EXPIRED`, que l'élection horaire ne relit
      // plus (rejeu jusqu'au succès : #10021) ; l'idempotence de la purge
      // l'autorise, elle ne la déclenche pas. La taire ferait compter comme purgé
      // un compte dont des contributions subsistent.
      eraseSharedTranslationsOfAccount(prisma, userId),
      purgeGameData(prisma, userId),
      purgePackData(prisma, userId, { files: options.packFiles }),
      eraseReadingTelemetryOf(prisma, userId),
      eraseCallTelemetryOf(prisma, userId),
      eraseE2EEDataOfUser(prisma, userId),
    ]);

  const summary: AccountPurgeSummary = {
    sessionsDeleted: sessions.count,
    voiceProfileDeleted: voiceProfile.count,
    shareLinksDeleted: shareLinks.count,
    notificationsDeleted: notifications.count,
    addressBookContactsDeleted: addressBook.contactsDeleted,
    contactJoinNoticesDeleted: addressBook.joinNoticesDeleted,
    arrivalAnnouncementsDeleted: addressBook.arrivalAnnouncementsDeleted,
    sharedTranslationsDeleted: sharedTranslations,
    game,
    packs,
    readingTelemetry,
    callTelemetryErased: callTelemetry,
    e2eeErased: e2ee,
  };

  logger.info(
    `[AccountPurge] user=${userId} sessions=${summary.sessionsDeleted} voiceProfile=${summary.voiceProfileDeleted} ` +
      `shareLinks=${summary.shareLinksDeleted} notifications=${summary.notificationsDeleted} ` +
      `addressBook=${summary.addressBookContactsDeleted} joinNotices=${summary.contactJoinNoticesDeleted} ` +
      `arrivalAnnouncements=${summary.arrivalAnnouncementsDeleted} sharedTranslations=${summary.sharedTranslationsDeleted} ` +
      `gameDuos=${summary.game.duosDeleted} ` +
      `packChoices=${packs.choicesDeleted} stickers=${packs.libraryDeleted} packSubmissions=${packs.submissionsDeleted} ` +
      `packsAnonymized=${packs.publishedAnonymized} packFiles=${packs.filesDeleted} packOwnerships=${packs.ownershipsDeleted} ` +
      `impressions=${readingTelemetry.impressions} engagements=${readingTelemetry.engagements} ` +
      `views=${readingTelemetry.views} contentEvents=${readingTelemetry.contentEvents} callTelemetry=${callTelemetry}`
  );

  return summary;
}

export type AccountIdentityAnonymizeSummary = {
  readonly userId: string;
  readonly anonymized: boolean;
};

/** Préfixe des valeurs de repli — jamais une constante seule (collision `@unique`). */
const ANONYMIZED_MARKER = 'compte-supprime';

/** Le préfixe du `username` d'un compte anonymisé — ce par quoi un rattrapage retrouve les comptes déjà purgés. */
export const ANONYMIZED_USERNAME_PREFIX = `${ANONYMIZED_MARKER}-`;

/** Le pseudo EXACT d'un compte anonymisé : préfixe + ses 24 hex, hors de portée de toute validation de pseudo (≤ 32). */
export function anonymizedUsername(userId: string): string {
  return `${ANONYMIZED_USERNAME_PREFIX}${userId}`;
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
      // #10632 — le décor de profil ÉQUIPÉ se voit des autres : il part avec l'avatar et la bannière.
      equippedAvatarRing: null,
      equippedBanner: null,
      equippedBannerFrame: null,
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
      emailVerificationDeviceHash: null,
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
      // Colonnes du défi d'étape 2 — SITE UNIQUE `services/auth/pending-two-factor.ts`
      // (#4542) : jamais nommées ici, le fragment vient de son propre effaceur.
      ...clearPendingTwoFactor(),
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
