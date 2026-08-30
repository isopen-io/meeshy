/**
 * Le JWT porte SA session — site UNIQUE d'émission, de lecture et de butoir (#4264).
 *
 * ## Ce que l'absence de ce module coûtait
 *
 * #4213 a rendu la révocation EFFECTIVE en refusant `POST /auth/refresh` dès
 * qu'un compte n'a plus AUCUNE session valide. Cette garde porte sur
 * l'EXISTENCE d'une session, faute de pouvoir dire de QUELLE session le jeton
 * provient : la charge utile ne portait que `userId`, `username`, `role`.
 * Révoquer UNE session laissait donc le JWT volé passer tant que son
 * propriétaire restait connecté ailleurs — c'est-à-dire le cas NOMINAL,
 * puisqu'on révoque une session tierce depuis un appareil qu'on garde.
 *
 * Le claim `sid` rattache le jeton à la ligne `UserSession` qui l'a émis, ce
 * qui permet à la garde de nommer au lieu de compter.
 *
 * ## Pourquoi un module, et pas trois lignes de plus dans AuthService
 *
 * CINQ sites émettaient un JWT (connexion, 2FA, inscription, lien magique,
 * `refresh`) et l'un d'eux — `MagicLinkService` — le signait avec son propre
 * `require('jsonwebtoken')`, SANS `role`, et AVANT même de créer la session
 * qu'il aurait dû nommer. Une divergence de forme entre deux jetons du même
 * service : c'est exactement ce qu'un site unique empêche. `AuthService.ts`
 * pesant 1330 lignes (hors budget 800–1100), y ajouter le `sid` était de
 * toute façon interdit avant extraction.
 *
 * ## Aucun décodeur client ne casse (vérifié le 2026-08-29)
 *
 * Le claim est ADDITIF et les trois clients lisent le payload de façon
 * tolérante : web `decodeJwtPayload` rend un `Record<string, unknown>`
 * (`apps/web/utils/jwt.ts`), iOS `AuthManager.isTokenExpired` désérialise en
 * `[String: Any]` et ne lit que `exp`, Android `JwtExpiry` parse avec
 * `Json { ignoreUnknownKeys = true }` et ne lit que `exp`. Aucun ne construit
 * de type strict à partir de la charge — un champ de plus ne lève nulle part.
 */

import jwt from 'jsonwebtoken';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SessionJwt' });

/** Nom du claim qui rattache un jeton à sa ligne `UserSession`. */
export const SESSION_CLAIM = 'sid' as const;

/** Durée de vie d'un JWT d'authentification — inchangée par ce lot. */
export const TOKEN_TTL: jwt.SignOptions['expiresIn'] = '24h';

/** La même durée, en secondes, telle que les routes la renvoient en `expiresIn`. */
export const TOKEN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Charge utile d'un JWT d'authentification Meeshy.
 *
 * `sid` est OPTIONNEL parce qu'un jeton émis avant ce lot n'en porte pas —
 * voir `legacyTokenAdmission` pour la fenêtre de transition, qui est datée et
 * se ferme. Il ne l'est PAS parce qu'un site d'émission aurait le droit de
 * l'omettre : les cinq en posent un.
 */
export interface SessionBoundTokenPayload {
  userId: string;
  username: string;
  role: string;
  /** Identifiant de la ligne `UserSession` qui a émis ce jeton. */
  sid?: string;
  /** Émission, en secondes epoch — posé par `jsonwebtoken`. */
  iat?: number;
  /** Expiration, en secondes epoch — posé par `jsonwebtoken`. */
  exp?: number;
}

/**
 * Ce dont l'émission a besoin de l'utilisateur, et rien de plus. Un
 * `SocketIOUser` complet convient ; une ligne Prisma brute aussi. Réduire la
 * dépendance au strict nécessaire est ce qui permet à `MagicLinkService`
 * d'appeler le même signataire que `AuthService` sans importer l'un l'autre.
 */
export interface TokenSubject {
  id: string;
  username: string;
  role: string;
}

// ─── Butoir de la transition ────────────────────────────────────────────────

/**
 * DÉCISION DATÉE 2026-08-29 (#4264, critère 3) — fin de la fenêtre où un JWT
 * SANS `sid` reste rafraîchissable.
 *
 * Pourquoi une fenêtre : exiger `sid` immédiatement déconnecterait tout le
 * parc installé, pour fermer un cas étroit — c'est le compromis que #4213
 * avait déjà refusé.
 *
 * Pourquoi elle DOIT se fermer : `POST /refresh` vérifie avec
 * `{ ignoreExpiration: true }` — c'est sa raison d'être. Un JWT hérité sans
 * `sid` resterait donc rafraîchissable INDÉFINIMENT, et le repli deviendrait
 * permanent : la garde de ce lot n'atteindrait jamais les jetons qu'elle vise.
 * « Jusqu'à son expiration naturelle » est faux tel quel sur cette route,
 * puisqu'elle ignore précisément l'expiration.
 *
 * DEUX butoirs, parce qu'un seul ne suffit pas :
 *
 *  - `LEGACY_SID_MAX_TOKEN_AGE_MS` borne le JETON (son `iat`). Seul, il se
 *    RÉ-ARME : un renouvellement réussi rend un jeton neuf, encore sans `sid`
 *    faute de session à nommer, et l'âge repart de zéro à chaque passage.
 *  - `LEGACY_SID_WINDOW_CLOSES_AT` borne la FENÊTRE (l'horloge du serveur).
 *    Seule, elle laisserait passer d'ici là un jeton vieux de deux ans.
 *
 * L'âge maximal vaut 30 jours, soit `SESSION_EXPIRY_DESKTOP_DAYS`
 * (`SessionService.ts`) : un client qui ouvre l'application au moins une fois
 * par mois bascule silencieusement sur un jeton porteur de `sid` (le
 * renouvellement en pose un dès qu'une session est nommable) et ne voit rien.
 * Au-delà, il se reconnecte — exactement le coût d'une session de bureau
 * expirée, que le parc supporte déjà.
 */
export const LEGACY_SID_WINDOW_CLOSES_AT = new Date('2026-09-30T00:00:00.000Z');

/** Âge maximal, en millisecondes, d'un jeton hérité encore rafraîchissable. */
export const LEGACY_SID_MAX_TOKEN_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Motif journalisable d'un refus — jamais rendu au client, qui n'apprend que
 * « reconnectez-vous » : distinguer les trois lui dirait quelque chose de
 * l'état du compte sans qu'il ait prouvé quoi que ce soit.
 *
 * Un motif nu plutôt qu'un `{ admitted: boolean }` discriminé : ce service
 * compile avec `strictNullChecks: false`, où un discriminant booléen littéral
 * ne rétrécit PLUS l'union — le champ du refus devenait alors inaccessible au
 * site d'appel. Une garde dont le motif ne compile pas se journalise sans
 * motif, et un refus sans motif ne se diagnostique pas.
 */
export type LegacyTokenRefusal = 'window-closed' | 'token-too-old' | 'token-undatable';

/**
 * Un jeton SANS `sid` a-t-il encore le droit d'être renouvelé ? Rend le
 * motif du REFUS, ou `null` quand il est encore admis.
 *
 * Fonction PURE : l'horloge est un paramètre, jamais `Date.now()` capturé
 * dedans — un butoir dont on ne peut pas déplacer l'instant dans un témoin
 * n'est pas testable, et un butoir non testé n'est pas un butoir.
 *
 * Un jeton sans `iat` est REFUSÉ (`token-undatable`) : on ne peut pas borner
 * l'âge de ce qu'on ne sait pas dater, et `jsonwebtoken` pose toujours `iat`
 * sauf `noTimestamp` — que ce dépôt n'utilise nulle part. Échouer fermé est
 * ici gratuit pour les clients légitimes.
 */
export function legacyTokenRefusal(
  payload: Pick<SessionBoundTokenPayload, 'iat'>,
  now: Date
): LegacyTokenRefusal | null {
  if (now.getTime() >= LEGACY_SID_WINDOW_CLOSES_AT.getTime()) {
    return 'window-closed';
  }

  const iat = payload.iat;
  if (typeof iat !== 'number' || !Number.isFinite(iat)) {
    return 'token-undatable';
  }

  const ageMs = now.getTime() - iat * 1000;
  if (ageMs > LEGACY_SID_MAX_TOKEN_AGE_MS) {
    return 'token-too-old';
  }

  return null;
}

// ─── Émission et lecture ────────────────────────────────────────────────────

/**
 * Signe un JWT d'authentification, en le rattachant à sa session quand elle
 * est connue.
 *
 * `sessionId` absent ⇒ le claim est OMIS, pas posé à `undefined` : un
 * `{ sid: undefined }` survit à `JSON.stringify` autrement qu'une absence
 * seulement par chance, et la lecture en aval distingue « pas de session
 * nommée » de « session nommée vide ». Seul `POST /refresh` d'un jeton hérité
 * sans jeton de session présentable emprunte encore cette branche.
 */
export function signSessionToken(params: {
  readonly user: TokenSubject;
  readonly secret: string;
  readonly sessionId?: string | null;
  readonly expiresIn?: jwt.SignOptions['expiresIn'];
}): string {
  const { user, secret, sessionId, expiresIn = TOKEN_TTL } = params;

  const payload: SessionBoundTokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    ...(sessionId ? { [SESSION_CLAIM]: sessionId } : {}),
  };

  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Vérifie signature ET expiration, et rend la charge utile — `null` sur tout
 * échec.
 *
 * `TokenExpiredError` est un cas ATTENDU (le client part alors renouveler) :
 * le journaliser en `error` noyait les vraies pannes de signature sous le
 * bruit du flux nominal. Le seul appelant qui doit en plus distinguer
 * « expiré » de « forgé » est `POST /refresh`, qui garde son propre
 * `verify`/`decode` : cette distinction y porte une décision de sécurité
 * argumentée sur place, pas une commodité.
 */
export function verifySessionToken(
  token: string,
  secret: string
): SessionBoundTokenPayload | null {
  try {
    return jwt.verify(token, secret) as SessionBoundTokenPayload;
  } catch (error: unknown) {
    const named = error as { name?: string; expiredAt?: Date };
    if (named?.name === 'TokenExpiredError') {
      logger.debug('[session-jwt] JWT expiré (attendu avant un renouvellement)', {
        exp: named.expiredAt,
      });
    } else {
      logger.error('[session-jwt] Vérification du JWT en échec', error as Error);
    }
    return null;
  }
}
