import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantType, ParticipantPermissions } from '@meeshy/shared/types/participant';
import { resolveParticipantRights } from '../services/participantRights';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { StatusService } from '../services/StatusService';
import { hashSessionToken } from '../utils/session-token';
import { PermissionDeniedError } from '../errors/custom-errors';
import { getCacheStore } from '../services/CacheStore';
import { enhancedLogger } from '../utils/logger-enhanced';
import { SESSION_CLAIM, legacyTokenRefusal } from '../services/auth/session-jwt';

const authLogger = enhancedLogger.child({ module: 'auth' });

// Reduced from 300s: role/language changes propagate within 60s now.
// Invalidated explicitly on profile updates via cache.del(`auth:user:{userId}`).
const AUTH_USER_CACHE_TTL = 60; // 1 minute
// JWT verification result cached for 55s (slightly shorter than user cache)
const JWT_VERIFY_CACHE_TTL = 55;
const expiredJwtLoggedTokens = new Map<string, number>(); // token prefix -> last log timestamp
const EXPIRED_JWT_LOG_INTERVAL = 60_000; // Log same expired token at most once per minute

// ===== TYPES =====

export type RegisteredUser = {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly avatar?: string;
  readonly banner?: string;
  readonly phoneNumber?: string;
  readonly role: string;
  readonly systemLanguage: string;
  readonly regionalLanguage: string;
  readonly customDestinationLanguage?: string;
  readonly isOnline: boolean;
  readonly lastActiveAt: Date;
  readonly emailVerifiedAt?: Date | null;
  readonly profileCompletionRate?: number;
}

export type UnifiedAuthContext = {
  readonly type: ParticipantType;
  readonly isAuthenticated: boolean;
  readonly isAnonymous: boolean;

  readonly userId?: string;
  readonly jwtToken?: string;
  readonly sessionToken?: string;

  readonly participantId?: string;
  readonly participant?: unknown;

  readonly displayName: string;
  readonly userLanguage: string;
  readonly permissions?: ParticipantPermissions;
  readonly hasFullAccess: boolean;
  readonly canSendMessages: boolean;

  /** @deprecated Use userId + type checks instead */
  readonly registeredUser?: RegisteredUser;
  /** @deprecated Use participantId + permissions instead */
  readonly anonymousUser?: AnonymousUserCompat;
  /** @deprecated Use type checks instead */
  readonly jwtPayload?: unknown;
}

export type AnonymousUserCompat = {
  readonly id: string;
  readonly sessionToken: string;
  readonly username: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly language: string;
  readonly shareLinkId: string;
  readonly permissions: ParticipantPermissions;
}

export type UnifiedAuthRequest = FastifyRequest & {
  authContext: UnifiedAuthContext;
}

// ===== REPLI PAR SESSION DE CONFIANCE =====

/**
 * Retrouve une session de confiance ACTIVE, liée au MÊME `userId`, pour ce
 * jeton de session — politique UNIQUE partagée par tout appelant qui a
 * besoin d'identifier « quelle session de confiance appuie ce jeton de
 * session » (aujourd'hui : `POST /refresh`, `routes/auth/magic-link.ts`,
 * pour glisser la fenêtre d'expiration de la session — cf. sa propre
 * documentation).
 *
 * task-1-fix-round-6 (décision du propriétaire, après clarification d'une
 * mauvaise lecture au round 5) : « une forme de connexion à la fois »,
 * jamais « une application à la fois » — être connecté depuis plusieurs
 * applications (web + iOS + Android) à la fois est un usage EXPLICITEMENT
 * légitime. Le round 5 avait ajouté ici une comparaison d'application
 * (`classifyApplicationSignal`) qui pénalisait cet usage sans jamais rien
 * protéger — une revue adverse a démontré, par exécution, qu'elle reposait
 * sur un `User-Agent` librement falsifiable. Retirée : cette fonction ne
 * discrimine plus JAMAIS sur `userAgent`/`browserName`.
 *
 * Ce que cette fonction NE fait PLUS (round 6, cf. `middleware/auth.ts`
 * `createRegisteredUserContext` et `routes/uploads/tus-handler.ts`) : servir
 * de rattrapage d'un ÉCHEC de vérification de jeton d'authentification (JWT
 * expiré ou à signature invalide). Le propriétaire a explicitement écarté ce
 * mélange de deux FORMES de justificatif — un jeton d'authentification et un
 * jeton de session ne se substituent plus l'un à l'autre nulle part, y
 * compris pour un jeton expiré. Un jeton forgé (signature invalide) reste,
 * comme avant, refusé sans aucun recours — la confiance vient exclusivement
 * de la session, jamais du JWT, mais la session elle-même ne rattrape plus
 * rien : voir `routes/auth/magic-link.ts` (`POST /refresh`) pour l'unique
 * endroit où l'expiration d'un JWT authentique reste tolérée — par le JWT
 * lui-même (`ignoreExpiration`), jamais par un repli de session.
 */
export async function findTrustedSession(
  prisma: Pick<PrismaClient, 'userSession'>,
  params: { userId: string; sessionToken: string }
): Promise<{ id: string } | null> {
  const hashedSessionToken = hashSessionToken(params.sessionToken);
  return prisma.userSession.findFirst({
    where: {
      sessionToken: hashedSessionToken,
      userId: params.userId,
      isValid: true,
      isTrusted: true,
      expiresAt: { gt: new Date() },
    },
  });
}

// ===== VIE D'UNE SESSION NOMMÉE (#4264 critère 4) =====

/**
 * Verdict d'une lecture de session — TROIS états, jamais deux, comme
 * `NotificationService.messageLiveness` (`services/gateway/CLAUDE.md`
 * § « Une garde d'admission se pose sur CHAQUE chemin ») : `UserSession`
 * n'est JAMAIS supprimée physiquement dans ce dépôt (seul `isValid` bascule —
 * `SessionService.invalidateSession`, `services/gateway/src/services/SessionService.ts`),
 * donc une ligne ABSENTE ne PROUVE rien.
 *
 *  - `live`    — la ligne existe, `isValid` est vrai. Admettre.
 *  - `gone`    — la ligne existe, `isValid` est FAUX : la révocation est
 *    ÉCRITE en base, donc PROUVÉE. Refuser (fail-CLOSED sur la preuve).
 *  - `unknown` — la ligne n'a pas été trouvée, ou la lecture a levé : rien
 *    n'est prouvé. Un secondaire en retard sur le jeu de réplicas rend
 *    `null` pour une session tout juste créée — le cas nominal du PREMIER
 *    appel REST suivant un `POST /auth/login` — et ce n'est pas une preuve
 *    de révocation. Admettre (fail-OPEN sur l'absence de preuve).
 *
 * Ne JAMAIS filtrer `isValid` dans le `where` de la lecture (voir
 * `AuthMiddleware.sessionLiveness`) : cela confondrait `gone` et `unknown`
 * sous un seul « non trouvé », et ferait perdre exactement la distinction
 * qui protège la connexion qui vient d'avoir lieu.
 */
type SessionLiveness = 'live' | 'gone' | 'unknown';

/**
 * Motif de refus interne — jamais transmis au client, qui n'apprend que le
 * message générique existant (`'Invalid JWT token'`), comme pour toute autre
 * raison de refus JWT sur ce chemin. Sert uniquement à journaliser
 * précisément côté serveur, sans faire classer ce refus comme une erreur
 * JWT « inattendue » dans le bloc `catch` de `createRegisteredUserContext`.
 */
class SessionRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRevokedError';
  }
}

// ===== SERVICE =====

export class AuthMiddleware {
  constructor(
    private prisma: PrismaClient,
    private statusService?: StatusService
  ) {}

  async createAuthContext(
    authorizationHeader?: string,
    sessionToken?: string
  ): Promise<UnifiedAuthContext> {
    const jwtToken = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : null;

    if (jwtToken) {
      return this.createRegisteredUserContext(jwtToken, sessionToken);
    }

    if (sessionToken) {
      return this.createAnonymousUserContext(sessionToken);
    }

    return this.createUnauthenticatedContext();
  }

  /**
   * Verdict de vie de la session NOMMÉE par le claim `sid` d'un JWT — voir
   * {@link SessionLiveness}. Lit par IDENTITÉ (`id` + `userId`), JAMAIS en
   * filtrant `isValid` dans le `where` : c'est ce qui permet de distinguer
   * `gone` (prouvé — la ligne existe et porte `isValid: false`) de `unknown`
   * (rien trouvé, y compris par retard de réplication).
   *
   * `userId` est dans le `where` par défense en profondeur, comme pour
   * `findTrustedSession` ci-dessus : sans lui, un `sid` valide appartenant à
   * un AUTRE compte suffirait à passer la garde. En pratique cela ne peut
   * pas arriver avec un JWT authentique — `signSessionToken` signe toujours
   * `userId` et `sid` pour le MÊME utilisateur (`session-jwt.ts`) — mais le
   * filtre ne coûte rien et documente l'invariant sur place.
   */
  private async sessionLiveness(sid: string, userId: string): Promise<SessionLiveness> {
    try {
      const session = await this.prisma.userSession.findFirst({
        where: { id: sid, userId },
        select: { isValid: true },
      });
      if (!session) return 'unknown';
      return session.isValid ? 'live' : 'gone';
    } catch (error) {
      authLogger.warn(
        '[AUTH] Lecture de session en échec — admission fail-open, aucune preuve de révocation (#4264 critère 4)',
        { sid, userId, error }
      );
      return 'unknown';
    }
  }

  private async createRegisteredUserContext(
    jwtToken: string,
    sessionToken?: string
  ): Promise<UnifiedAuthContext> {
    try {
      // task-1-fix-round-6 — AVANT : un `jwt.TokenExpiredError` accompagné
      // d'un `sessionToken` retombait sur `jwt.decode` (non vérifié) puis
      // sur `findTrustedSession` pour rattraper l'expiration. Le propriétaire
      // a explicitement écarté ce mélange de DEUX FORMES de justificatif —
      // un jeton d'authentification expiré est désormais refusé ici sans
      // aucun recours, quelle que soit la session de confiance présentée.
      // Cette tolérance n'existe plus QUE sur `POST /refresh`
      // (`routes/auth/magic-link.ts`), la route dont c'est la raison d'être.
      let jwtPayload: Record<string, unknown>;

      // Cache JWT verification result to avoid repeated HMAC-SHA256 per request
      const tokenHash = crypto.createHash('sha256').update(jwtToken).digest('hex');
      const jwtCacheKey = `jwt:v:${tokenHash}`;
      const cache = getCacheStore();
      let cachedPayload: Record<string, unknown> | null = null;
      try {
        const raw = await cache.get(jwtCacheKey);
        if (raw) cachedPayload = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* cache miss — proceed to verify */ }

      if (cachedPayload) {
        jwtPayload = cachedPayload;
      } else {
        jwtPayload = jwt.verify(jwtToken, process.env.JWT_SECRET!) as Record<string, unknown>;
        try {
          await cache.set(jwtCacheKey, JSON.stringify(jwtPayload), JWT_VERIFY_CACHE_TTL);
        } catch { /* non-fatal */ }
      }

      const jwtUserId = jwtPayload.userId as string;

      // #4264 critère 4 — la garde REST porte enfin le même gain que
      // `POST /auth/refresh` (#4213, #4264 critères 1-3 — voir
      // `routes/auth/magic-link.ts` et `services/auth/session-jwt.ts`) : un
      // JWT dont la session NOMMÉE est révoquée ne doit plus ouvrir de
      // requête authentifiée, pas seulement un rafraîchissement. Posée ICI,
      // avant tout accès au cache `auth:user:*` ou à la ligne `User` — une
      // session PROUVÉE révoquée n'a besoin de rien charger de plus.
      const sidClaim = jwtPayload[SESSION_CLAIM];
      const sid = typeof sidClaim === 'string' ? sidClaim : undefined;

      if (sid) {
        // Régime NOMINAL — comme `refresh` : c'est la session NOMMÉE par le
        // jeton, et aucune autre, qui décide. `sessionLiveness` ne filtre
        // JAMAIS `isValid` dans son `where` (cf. sa doc) : une ligne ABSENTE
        // (réplica en retard sur un login tout juste fait) n'est PAS une
        // preuve de révocation — c'est le témoin « deux sessions, une
        // révoquée » qui exerce cette branche.
        const verdict = await this.sessionLiveness(sid, jwtUserId);
        if (verdict === 'gone') {
          authLogger.warn('[AUTH] Requête REST refusée : la session nommée par le jeton a été révoquée', {
            userId: jwtUserId,
            sid,
          });
          throw new SessionRevokedError('Session révoquée');
        }
        // 'live' ou 'unknown' : admettre (fail-OPEN sur l'absence de preuve).
      } else {
        // Régime de TRANSITION — jeton émis avant #4264, sans `sid`. Même
        // butoir daté que `refresh` (`legacyTokenRefusal`,
        // `services/auth/session-jwt.ts`) : ne PAS le réinventer ici, sous
        // peine de désaccorder les deux portes le jour où la fenêtre bouge.
        //
        // `refresh` applique EN PLUS, pour ce même régime, la règle de
        // compte de #4213 (« au moins une session valide pour le compte »).
        // Cette route-ci s'arrête au butoir de fenêtre : l'étendre à CHAQUE
        // requête REST demande la même requête `count()` que `refresh`, dont
        // le site vit hors du territoire de ce lot (`routes/auth/magic-link.ts`) —
        // voir le commentaire de livraison pour le suivi.
        const iatClaim = jwtPayload.iat;
        const iat = typeof iatClaim === 'number' ? iatClaim : undefined;
        const refus = legacyTokenRefusal({ iat }, new Date());

        if (refus) {
          authLogger.warn('[AUTH] Requête REST refusée : jeton hérité hors de la fenêtre de transition (#4264)', {
            userId: jwtUserId,
            motif: refus,
          });
          throw new SessionRevokedError('Jeton hérité hors fenêtre de transition');
        }
      }

      const cacheKey = `auth:user:${jwtUserId}`;

      type CachedUserRow = {
        id: string;
        username: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        bio: string | null;
        avatar: string | null;
        banner: string | null;
        phoneNumber: string | null;
        role: string;
        isActive: boolean;
        systemLanguage: string;
        regionalLanguage: string;
        customDestinationLanguage: string | null;
        isOnline: boolean;
        lastActiveAt: string;
        emailVerifiedAt: string | null;
        createdAt: string;
        updatedAt: string;
        deviceLocale: string | null;
        profileCompletionRate: number | null;
      };

      type FullUserRow = Omit<CachedUserRow, 'lastActiveAt' | 'emailVerifiedAt' | 'createdAt' | 'updatedAt'> & {
        lastActiveAt: Date;
        emailVerifiedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
      };

      const deserializeCachedUser = (cached: CachedUserRow): FullUserRow => ({
        ...cached,
        lastActiveAt: new Date(cached.lastActiveAt),
        emailVerifiedAt: cached.emailVerifiedAt ? new Date(cached.emailVerifiedAt) : null,
        createdAt: new Date(cached.createdAt),
        updatedAt: new Date(cached.updatedAt),
      });

      let cachedRow: CachedUserRow | null = null;

      try {
        const raw = await cache.get(cacheKey);
        if (raw) {
          cachedRow = JSON.parse(raw) as CachedUserRow;
        }
      } catch {
        // Redis unavailable or parse error — fall through to Prisma
      }

      let user: FullUserRow | null = null;

      if (cachedRow) {
        if (!cachedRow.isActive) {
          throw new Error('User not found or inactive');
        }
        user = deserializeCachedUser(cachedRow);
      }

      if (!user) {
        const prismaUser = await this.prisma.user.findUnique({
          where: { id: jwtUserId },
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            bio: true,
            avatar: true,
            banner: true,
            phoneNumber: true,
            role: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            isOnline: true,
            lastActiveAt: true,
            isActive: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
            deviceLocale: true,
            profileCompletionRate: true,
          },
        }) as FullUserRow | null;

        user = prismaUser;

        if (user?.isActive) {
          const toCache: CachedUserRow = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            bio: user.bio,
            avatar: user.avatar,
            banner: user.banner,
            phoneNumber: user.phoneNumber,
            role: user.role,
            isActive: user.isActive,
            systemLanguage: user.systemLanguage,
            regionalLanguage: user.regionalLanguage,
            customDestinationLanguage: user.customDestinationLanguage,
            isOnline: user.isOnline,
            lastActiveAt: user.lastActiveAt.toISOString(),
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            deviceLocale: user.deviceLocale,
            profileCompletionRate: user.profileCompletionRate,
          };
          try {
            await cache.set(cacheKey, JSON.stringify(toCache), AUTH_USER_CACHE_TTL);
          } catch {
            // Redis write failure is non-fatal
          }
        }
      }

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      if (this.statusService) {
        this.statusService.updateUserLastSeen(user.id);
        if (!user.isOnline) {
          this.statusService.ensureUserOnline(user.id, false);
        }
      }

      // round 6 — plus de concept de « JWT expiré mais accepté » à ce niveau
      // (il aurait déjà levé plus haut) : dès qu'on atteint ce point, le JWT
      // est valide et non expiré. Bookkeeping pur, ne décide jamais rien.
      if (sessionToken) {
        const hashedSessionToken = hashSessionToken(sessionToken);
        this.prisma.userSession.update({
          where: { sessionToken: hashedSessionToken },
          data: { lastActivityAt: new Date() }
        }).catch(err => {
          authLogger.warn('Failed to update trusted session lastActivityAt (anon)', { err });
        });
      }

      const userLanguage = resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined });

      return {
        type: 'user',
        isAuthenticated: true,
        isAnonymous: false,

        userId: user.id,
        jwtToken,
        sessionToken: sessionToken || undefined,

        displayName: user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username,
        userLanguage,
        hasFullAccess: true,
        canSendMessages: true,

        registeredUser: user as RegisteredUser,
        jwtPayload,
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        const tokenPrefix = jwtToken.slice(-8);
        const now = Date.now();
        const lastLogged = expiredJwtLoggedTokens.get(tokenPrefix) ?? 0;
        if (now - lastLogged > EXPIRED_JWT_LOG_INTERVAL) {
          authLogger.warn('JWT expired', { expiredAt: new Date(error.expiredAt).toISOString() });
          expiredJwtLoggedTokens.set(tokenPrefix, now);
          if (expiredJwtLoggedTokens.size > 100) {
            for (const [key, ts] of expiredJwtLoggedTokens) {
              if (now - ts > EXPIRED_JWT_LOG_INTERVAL * 10) expiredJwtLoggedTokens.delete(key);
            }
          }
        }
      } else if (error instanceof jwt.JsonWebTokenError) {
        authLogger.warn('JWT invalid', { message: error.message });
      } else if (error instanceof SessionRevokedError) {
        // Déjà journalisé avec son motif précis au site d'appel (#4264
        // critère 4) — ne pas dupliquer le log, ni le classer en erreur
        // « inattendue » : c'est une garde qui vient de fonctionner.
      } else {
        authLogger.error('Unexpected JWT error', { error });
      }
      throw new Error('Invalid JWT token');
    }
  }

  private async createAnonymousUserContext(sessionToken: string): Promise<UnifiedAuthContext> {
    try {
      const tokenHash = hashSessionToken(sessionToken);

      const participant = await this.prisma.participant.findFirst({
        // `isActive` ne filtre PLUS ici (#4410) : il se lit et se décide en
        // aval. Tant qu'il était dans le `where`, un invité RÉVOQUÉ et un
        // jeton INVENTÉ rendaient tous deux « aucune ligne », et la
        // distinction n'était pas perdue à la remontée — elle n'était jamais
        // faite. Le message d'erreur nommait pourtant les deux cas.
        where: {
          sessionTokenHash: tokenHash,
          type: 'anonymous',
        },
        select: {
          id: true,
          conversationId: true,
          type: true,
          displayName: true,
          avatar: true,
          role: true,
          language: true,
          permissions: true,
          isActive: true,
          isOnline: true,
          lastActiveAt: true,
          nickname: true,
          anonymousSession: true,
        }
      });

      if (!participant) {
        throw new Error('Anonymous participant not found');
      }

      // L'invité dont le lien a été révoqué (`revokeShareLinkGuests`) porte un
      // jeton VALIDE sur un participant DÉSACTIVÉ. Lui rendre le même 401 nu
      // qu'à un jeton inventé l'envoie retenter indéfiniment un geste qui ne
      // peut pas aboutir — et prive l'opérateur qui reçoit son signalement du
      // seul fait qui explique la panne.
      if (participant.isActive === false) {
        throw new GuestAccessRevokedError();
      }

      if (this.statusService) {
        this.statusService.updateAnonymousLastSeen(participant.id);
      }

      const profile = participant.anonymousSession?.profile;

      const resolvedPermissions: ParticipantPermissions = resolveParticipantRights(participant);

      const displayName = participant.nickname
        || (profile?.firstName && profile?.lastName
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : profile?.username ?? participant.displayName);

      const anonymousCompat: AnonymousUserCompat = {
        id: participant.id,
        sessionToken,
        username: profile?.username ?? participant.displayName,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        language: participant.language,
        shareLinkId: participant.anonymousSession?.shareLinkId ?? '',
        permissions: resolvedPermissions,
      };

      return {
        type: 'anonymous',
        isAuthenticated: true,
        isAnonymous: true,

        sessionToken,
        participantId: participant.id,
        participant,

        displayName,
        userLanguage: participant.language,
        permissions: resolvedPermissions,
        hasFullAccess: false,
        canSendMessages: resolvedPermissions.canSendMessages,

        userId: participant.id,
        anonymousUser: anonymousCompat,
      };

    } catch (error) {
      // La cause TYPÉE traverse (#4410). Ce `catch` uniformisait TOUT en
      // « Invalid session token » — c'est lui qui effaçait la distinction, et
      // pas seulement le `catch` extérieur : une erreur qu'on vient de
      // qualifier ne survit pas à un gestionnaire qui réécrit sans regarder.
      if (error instanceof GuestAccessRevokedError) throw error;
      authLogger.warn('Invalid session token or inactive participant');
      throw new Error('Invalid session token');
    }
  }

  private createUnauthenticatedContext(): UnifiedAuthContext {
    return {
      type: 'anonymous',
      isAuthenticated: false,
      isAnonymous: true,

      userLanguage: 'fr',
      displayName: 'Visiteur',
      userId: 'anonymous',

      canSendMessages: false,
      hasFullAccess: false
    };
  }
}

// ===== MIDDLEWARE FASTIFY =====

/**
 * La clé sous laquelle chaque middleware rendu par
 * `createUnifiedAuthMiddleware` DÉCLARE son régime (#4489).
 *
 * Deux appels de la même fabrique produisent deux fonctions dont la SOURCE
 * compilée est identique — `options` est une variable capturée, que
 * `Function.prototype.toString()` ne montre pas. Un lecteur qui reconnaît
 * l'appel ne peut donc pas savoir si ce middleware GARDE (`requireAuth: true`
 * ⇒ 401 sans jeton) ou s'il ENRICHIT seulement (`requireAuth: false` ⇒ sert
 * l'anonyme, et pose `authContext` si un jeton est présent). Le manifeste des
 * routes annonçait pour cette raison dix-huit routes ouvertes comme gardées.
 *
 * La fabrique ATTACHE donc son régime à ce qu'elle rend, plutôt que de laisser
 * un lecteur le déduire d'un texte qui ne le porte pas. `Symbol.for` — pas un
 * symbole de module — pour que la clé survive à deux instanciations du module.
 * Non énumérable : rien de ce qui sérialise un hook ne doit changer de forme.
 */
/**
 * L'accès d'un invité a été RETIRÉ — son jeton est valide, son participant est
 * désactivé (#4410).
 *
 * Un type, pas une chaîne : c'est ce qui permet au `catch` du middleware de
 * traduire la cause en code stable sans reconnaître un message. Un message se
 * reformule, et le jour où il l'est, le refus redevient muet sans que rien ne
 * rougisse.
 *
 * ## L'arbitrage de confidentialité, tranché
 *
 * Dire « ton accès a été retiré » confirme au porteur du jeton que le lien a
 * EXISTÉ et qu'il y était admis. C'est acceptable, et pour une raison qui se
 * mesure : seul un jeton qui CORRESPOND à un participant réel obtient cette
 * réponse. Un jeton inventé ne trouve aucune ligne et reçoit le 401 générique.
 * L'information n'est donc rendue qu'à quelqu'un qui détenait déjà la preuve
 * de son admission.
 *
 * Ce qui reste tu, et qui n'est pas négociable : PAR QUI, QUAND, et quelle
 * conversation. Le refus dit qu'il n'y a rien à retenter, pas ce qui s'est
 * passé.
 */
export class GuestAccessRevokedError extends Error {
  constructor() {
    super('Guest access revoked');
    this.name = 'GuestAccessRevokedError';
  }
}

export const AUTH_REGIME = Symbol.for('meeshy.gateway.auth-regime');

/** Ce que déclare un middleware d'authentification sur lui-même. */
export interface AuthRegime {
  /** `true` ⇒ refuse (401) un appelant sans identité. `false` ⇒ ne refuse jamais pour cette raison. */
  readonly requireAuth: boolean;
  /** `true` ⇒ un invité de lien partagé passe. */
  readonly allowAnonymous: boolean;
}

export function createUnifiedAuthMiddleware(
  prisma: PrismaClient,
  options: {
    requireAuth?: boolean;
    allowAnonymous?: boolean;
    statusService?: StatusService;
  } = {}
) {
  const authMiddleware = new AuthMiddleware(prisma, options.statusService);

  const unifiedAuth = async function unifiedAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
      const authContext = await authMiddleware.createAuthContext(
        request.headers.authorization,
        request.headers['x-session-token'] as string
      );

      if (options.requireAuth && !authContext.isAuthenticated) {
        return reply.status(401).send({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      if (!options.allowAnonymous && authContext.isAnonymous && authContext.type !== 'user') {
        return reply.status(403).send({
          error: 'Registered user required',
          code: 'REGISTERED_USER_REQUIRED'
        });
      }

      (request as UnifiedAuthRequest).authContext = authContext;

      // Legacy compat: dynamic property assignment on typed Fastify request requires `any`
      try {
        const req = request as unknown as Record<string, unknown>;
        req.user = req.user || {};
        if (authContext.isAuthenticated && authContext.userId) {
          const reqUser = req.user as Record<string, unknown>;
          reqUser.userId = authContext.userId;
          reqUser.username = authContext.displayName || (authContext.registeredUser && authContext.registeredUser.username);
          reqUser.isAnonymous = !!authContext.isAnonymous;
        } else {
          const reqUser = req.user as Record<string, unknown>;
          reqUser.userId = reqUser.userId || null;
        }
      } catch (e) {
        authLogger.error('Failed to attach legacy request.user', { e });
      }

      try {
        const req = request as unknown as Record<string, unknown>;
        req.auth = {
          userId: authContext.userId,
          isAuthenticated: authContext.isAuthenticated,
          isAnonymous: authContext.isAnonymous
        };
      } catch (e) {
        authLogger.error('Failed to attach request.auth', { e });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      authLogger.warn('Auth failure', { errorMessage });

      // 410 GONE, pas 401 : l'accès n'est pas à re-tenter, il n'existe plus.
      // Même code de statut et même famille de motifs que
      // `POST /anonymous/session/refresh`, qui rendait déjà `LINK_DEACTIVATED`
      // pour ce cas exact — sur la seule porte qui RAFRAÎCHIT une session, pas
      // sur celles qui la consomment. Un client distingue ainsi « réessaie »
      // de « c'est fini », ce qu'aucun 401 ne lui permettait.
      if (error instanceof GuestAccessRevokedError) {
        return reply.status(410).send({
          success: false,
          error: 'GUEST_ACCESS_REVOKED',
          message: "L'acces de cet invite a ete retire"
        });
      }

      if (options.requireAuth) {
        return reply.status(401).send({
          error: errorMessage,
          code: 'AUTH_FAILED'
        });
      }

      const fallbackMiddleware = new AuthMiddleware(prisma);
      (request as UnifiedAuthRequest).authContext = await fallbackMiddleware.createAuthContext();
    }
  };

  const regime: AuthRegime = {
    requireAuth: options.requireAuth === true,
    allowAnonymous: options.allowAnonymous === true,
  };
  Object.defineProperty(unifiedAuth, AUTH_REGIME, { value: regime, enumerable: false });

  return unifiedAuth;
}

// ===== CACHE HELPERS =====

export const AUTH_USER_CACHE_PREFIX = 'auth:user:';

export function authUserCacheKey(userId: string): string {
  return `${AUTH_USER_CACHE_PREFIX}${userId}`;
}

// ===== HELPER FUNCTIONS =====

export function isRegisteredUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'user' && !authContext.isAnonymous;
}

export function isAnonymousUser(authContext: UnifiedAuthContext): boolean {
  return authContext.type === 'anonymous' && authContext.isAnonymous && authContext.isAuthenticated;
}

export function getUserPermissions(authContext: UnifiedAuthContext) {
  if (isRegisteredUser(authContext)) {
    return {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
      hasFullAccess: true
    };
  }

  if (authContext.permissions) {
    return {
      ...authContext.permissions,
      hasFullAccess: false
    };
  }

  if (isAnonymousUser(authContext) && authContext.anonymousUser) {
    return {
      ...authContext.anonymousUser.permissions,
      hasFullAccess: false
    };
  }

  return {
    canSendMessages: false,
    canSendFiles: false,
    canSendImages: false,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    hasFullAccess: false
  };
}

// ===== LEGACY COMPATIBILITY =====

/** @deprecated Use getUserPermissions */
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;

      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        throw new PermissionDeniedError('Authentication required');
      }

      if (!roles.includes(authContext.registeredUser.role)) {
        throw new PermissionDeniedError('Insufficient role');
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        reply.code(403).send({ success: false, error: { code: error.code, message: error.message } });
        return;
      }
      reply.code(403).send({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Insufficient permissions' } });
    }
  };
}

export const requireAdmin = requireRole(['BIGBOSS', 'ADMIN']);
export const requireModerator = requireRole(['BIGBOSS', 'ADMIN', 'MODERATOR']);
export const requireAnalyst = requireRole(['BIGBOSS', 'ADMIN', 'ANALYST']);

export async function requireEmailVerification(request: FastifyRequest, reply: FastifyReply) {
  const authContext = (request as UnifiedAuthRequest).authContext;

  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    reply.code(403).send({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Authentication required' } });
    return;
  }

  if (!authContext.registeredUser.emailVerifiedAt) {
    reply.code(403).send({ success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email verification required' } });
    return;
  }
}

