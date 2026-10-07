import jwt from 'jsonwebtoken';
import { isLoginFromUnrecognisedDevice, type SessionEvidence } from '../../utils/new-device';
import { parseUserAgent } from '../../services/GeoIPService';

/**
 * **Le site UNIQUE qui décide si une connexion mérite une alerte** (#7035).
 *
 * Les deux portes — mot de passe et 2FA — portaient le même bloc de dix-huit
 * lignes, et la même erreur : `if (!session.isTrusted)`, vraie à chaque
 * connexion puisque la session vient de naître. Soixante notifications sur cent
 * sur le compte de recette, toutes depuis le même appareil.
 *
 * Deux sites qui recopient une règle finissent par en porter deux versions.
 * Ici il n'y en a qu'une, et la décision elle-même est une fonction PURE,
 * testée à part (`utils/new-device.ts`).
 */

/** Ce que la porte remet — volontairement minimal, pour rester testable. */
export type NewDeviceContext = {
  readonly userId: string;
  /** La session qui vient de naître : elle doit être EXCLUE de l'historique. */
  readonly currentSessionId: string | undefined;
  readonly deviceInfo: { type?: string | null; vendor?: string | null; model?: string | null; os?: string | null; browser?: string | null } | null;
  readonly userAgent: string | null;
  readonly ipAddress: string;
  /** Le lieu déduit par le SERVEUR de l'adresse attestée (#9608) — jamais d'un en-tête. */
  readonly geoData: { readonly country?: string | null } | null;
};

type SessionReader = {
  findMany(args: unknown): Promise<SessionEvidence[]>;
};

type NotificationSender = {
  createLoginNewDeviceNotification(params: {
    recipientUserId: string;
    deviceInfo: unknown;
    ipAddress: string;
    geoData: unknown;
    revokeToken: string;
  }): Promise<unknown>;
};

/**
 * Combien de sessions antérieures on relit pour reconnaître l'appareil.
 *
 * Borné parce qu'un compte ancien peut en compter des milliers, et qu'on ne
 * paie pas une lecture non bornée sur le chemin de connexion. Deux cents
 * couvre très largement le parc d'un utilisateur réel — et se tromper ici ne
 * fait QUE réémettre une alerte de trop, jamais en taire une.
 */
const HISTORIQUE_MAX = 200;

/**
 * Émet la notification « nouvelle connexion » si — et seulement si —
 * l'appareil est inconnu du compte.
 *
 * Ne lève jamais : une alerte qu'on n'a pas pu décider ne doit pas faire
 * échouer une connexion par ailleurs valide. Le silence est journalisé par
 * l'appelant via le `.catch` qu'il fournit.
 */
export async function notifyIfLoginFromNewDevice(
  sessions: SessionReader | undefined,
  notifications: NotificationSender | undefined,
  jwtSecret: string,
  context: NewDeviceContext
): Promise<'alerte-emise' | 'appareil-connu' | 'indisponible'> {
  if (!sessions || !notifications) return 'indisponible';

  const precedentes = await sessions.findMany({
    where: {
      userId: context.userId,
      ...(context.currentSessionId ? { id: { not: context.currentSessionId } } : {}),
    },
    select: {
      deviceType: true,
      deviceVendor: true,
      deviceModel: true,
      osName: true,
      browserName: true,
      userAgent: true,
      country: true,
    },
    orderBy: { createdAt: 'desc' },
    take: HISTORIQUE_MAX,
  });

  // #9608 — l'appareil se relit dans l'agent, le lieu dans l'adresse attestée ;
  // le modèle déclaré par l'en-tête ne peut qu'ajouter une alerte.
  const inconnu = isLoginFromUnrecognisedDevice(
    precedentes,
    {
      userAgent: context.userAgent,
      declaredModel: context.deviceInfo?.model ?? null,
      attestedCountry: context.geoData?.country ?? null,
    },
    parseUserAgent
  );
  if (!inconnu) return 'appareil-connu';

  const revokeToken = jwt.sign({ userId: context.userId, action: 'revoke-all' }, jwtSecret, {
    expiresIn: '24h',
  });
  await notifications.createLoginNewDeviceNotification({
    recipientUserId: context.userId,
    deviceInfo: context.deviceInfo,
    ipAddress: context.ipAddress,
    geoData: context.geoData,
    revokeToken,
  });
  return 'alerte-emise';
}
