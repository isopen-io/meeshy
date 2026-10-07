/**
 * Ce qu'une session retient de ce que son client DÉCLARE, au rafraîchissement
 * du jeton et à la connexion de la socket (#9610).
 *
 * L'ouverture l'écrit (`createSession`) ; ce module le TIENT À JOUR quand
 * l'application se met à jour sur le même appareil. Deux règles :
 *  - **un champ que le client ne déclare pas n'est jamais effacé** — un ancien
 *    client garde ce que le serveur a relevé ou déduit ;
 *  - **rien de neuf, rien d'écrit** : la session est lue, comparée, et seuls les
 *    champs qui ont changé partent ; un client qui ne déclare rien ne coûte pas
 *    même la lecture.
 *
 * L'écriture vise la session NOMMÉE par le `sid` du JWT vérifié, bornée au
 * compte et à une session vivante — une session d'un autre compte ou close ne
 * bouge pas. Best-effort : ne lève jamais, un relevé perdu attend le suivant.
 */
import type { ClientSessionInfo } from '@meeshy/shared/utils/client-session';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'SessionClientInfo' });

export const SESSION_CLIENT_FIELDS = ['appVersion', 'appBuild', 'platform', 'deviceName', 'deviceModel', 'osVersion'] as const;
type SessionClientField = (typeof SESSION_CLIENT_FIELDS)[number];

export type StoredSessionClientInfo = Readonly<Record<SessionClientField, string | null>>;
export type SessionClientChanges = Partial<Record<SessionClientField, string>>;

export const SESSION_CLIENT_SELECT = {
  appVersion: true,
  appBuild: true,
  platform: true,
  deviceName: true,
  deviceModel: true,
  osVersion: true,
} as const;

export function clientInfoChanges(stored: StoredSessionClientInfo, declared: ClientSessionInfo): SessionClientChanges {
  return Object.fromEntries(
    SESSION_CLIENT_FIELDS.flatMap((field) => {
      const value = declared[field];
      return value !== null && value !== stored[field] ? [[field, value]] : [];
    }),
  );
}

const declaresSomething = (declared: ClientSessionInfo): boolean =>
  SESSION_CLIENT_FIELDS.some((field) => declared[field] !== null);

export type SessionClientInfoStore = {
  readonly userSession: {
    findFirst(args: {
      where: { id: string; userId: string; isValid: true };
      select: typeof SESSION_CLIENT_SELECT;
    }): Promise<StoredSessionClientInfo | null>;
    updateMany(args: {
      where: { id: string; userId: string; isValid: true };
      data: SessionClientChanges;
    }): Promise<{ count: number }>;
  };
};

export async function recordSessionClientInfo(
  prisma: SessionClientInfoStore,
  params: { readonly sessionId: string; readonly userId: string; readonly declared: ClientSessionInfo },
): Promise<boolean> {
  if (!declaresSomething(params.declared)) return false;
  const where = { id: params.sessionId, userId: params.userId, isValid: true as const };
  try {
    const stored = await prisma.userSession.findFirst({ where, select: SESSION_CLIENT_SELECT });
    if (stored === null) return false;
    const data = clientInfoChanges(stored, params.declared);
    if (Object.keys(data).length === 0) return false;
    const { count } = await prisma.userSession.updateMany({ where, data });
    return count > 0;
  } catch (error) {
    logger.warn('session client info not recorded', { error });
    return false;
  }
}
