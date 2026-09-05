import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../services/AuthService';
import { PhoneTransferService } from '../../services/PhoneTransferService';
import { SmsService } from '../../services/SmsService';
import type { CacheStore } from '../../services/CacheStore';
import type { AfterResponse } from '../../utils/after-response';

/**
 * Context shared across all auth route modules
 * Contains initialized services and dependencies
 */
export interface AuthRouteContext {
  fastify: FastifyInstance;
  authService: AuthService;
  phoneTransferService: PhoneTransferService;
  smsService: SmsService;
  cacheStore: CacheStore;
  redis: any;
  prisma: any;
  /**
   * Où partent les travaux qui ne conditionnent PAS la réponse (#5216) —
   * l'e-mail de vérification, l'annonce d'arrivée dans le salon global, la
   * reprise de la géolocalisation. Absent ⇒ `deferAfterResponse`, c'est-à-dire
   * `setImmediate` avec sa garde de rejet.
   *
   * **C'est la surface HTTP qui décide de différer**, parce qu'elle est la
   * seule à avoir une réponse à rendre : le service appelé sans requête (seed,
   * création par un administrateur) exécute les mêmes travaux EN LIGNE.
   *
   * Injectable pour que les témoins soient déterministes : un différé leur
   * ferait mesurer le vide, la tâche n'étant pas encore partie quand
   * l'assertion tombe.
   */
  afterResponse?: AfterResponse;
}

/**
 * Standard request body for login
 */
export interface LoginRequestBody {
  username: string;
  password: string;
  rememberDevice?: boolean;
}

/**
 * Le corps de `POST /login/2fa`.
 *
 * Il ne porte PAS `rememberDevice` (#4471) : la préférence d'appareil de
 * confiance est celle exprimée à `POST /login`, et le serveur la retient entre
 * les deux étapes (`pending-device-trust.ts`). L'accepter ici laissait le corps
 * de la seconde requête s'accorder 365 jours de session de confiance sans
 * aucun lien avec ce que la personne avait coché à la première.
 */
export interface TwoFactorRequestBody {
  twoFactorToken: string;
  code: string;
}

/**
 * Standard user response format
 * Used consistently across all auth routes
 */
export interface UserResponseData {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  phoneNumber: string | null;
  role: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  systemLanguage: string;
  regionalLanguage: string;
  customDestinationLanguage: string | null;
  autoTranslateEnabled: boolean;
  isOnline: boolean;
  lastActiveAt: Date | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  twoFactorEnabledAt: Date | null;
  lastPasswordChange: Date | null;
  lastLoginIp: string | null;
  lastLoginLocation: string | null;
  lastLoginDevice: string | null;
  /**
   * `undefined` ⇒ l'appelant n'a pas CHARGÉ la colonne ; `null` ⇒ il l'a
   * chargée et le compte n'a pas de fuseau. La distinction est servie telle
   * quelle : fast-json-stringify supprime la clé dans le premier cas et sert
   * `null` dans le second, si bien qu'aucune route ne DÉCLARE un fuseau
   * qu'elle n'a pas lu (#4641).
   */
  timezone?: string | null;
  profileCompletionRate: number;
  createdAt: Date;
  updatedAt: Date;
  permissions?: any;
}

/**
 * Standard session response format
 */
export interface SessionResponseData {
  id: string;
  deviceType: string | null;
  browserName: string | null;
  osName: string | null;
  location: string | null;
  isMobile: boolean;
  isTrusted: boolean;
  createdAt: Date;
}

/**
 * Utility to format user data consistently across all routes
 *
 * **Un champ que `userSchema` déclare doit avoir un producteur ICI, et un
 * producteur qui ne rende pas la même chose pour tout le monde (#4641).**
 * `banner: user.banner || null` était le contre-exemple : son producteur
 * existait, il rendait `null` pour TOUS les comptes parce que le projecteur
 * d'amont (`AuthService.userToSocketIOUser`) ne portait pas la colonne. Une
 * clé PRÉSENTE et constante est plus coûteuse qu'une clé absente — elle a
 * l'air d'une donnée.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatUserResponse(user: any, permissions?: any): UserResponseData {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    bio: user.bio,
    avatar: user.avatar,
    banner: user.banner || null,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isActive: user.isActive,
    deactivatedAt: user.deactivatedAt,
    systemLanguage: user.systemLanguage,
    regionalLanguage: user.regionalLanguage,
    customDestinationLanguage: user.customDestinationLanguage,
    autoTranslateEnabled: user.autoTranslateEnabled,
    isOnline: user.isOnline,
    lastActiveAt: user.lastActiveAt,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    twoFactorEnabledAt: user.twoFactorEnabledAt,
    lastPasswordChange: user.lastPasswordChange,
    lastLoginIp: user.lastLoginIp,
    lastLoginLocation: user.lastLoginLocation,
    lastLoginDevice: user.lastLoginDevice,
    timezone: user.timezone,
    profileCompletionRate: user.profileCompletionRate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    permissions: permissions || user.permissions
  };
}

/**
 * Utility to format session data consistently
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatSessionResponse(session: any, rememberDevice: boolean = false): SessionResponseData {
  return {
    id: session.id,
    deviceType: session.deviceType,
    browserName: session.browserName,
    osName: session.osName,
    location: session.location,
    isMobile: session.isMobile,
    isTrusted: rememberDevice || false,
    createdAt: session.createdAt
  };
}
