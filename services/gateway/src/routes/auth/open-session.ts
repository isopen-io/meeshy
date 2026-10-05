/**
 * Ouvrir une session pour un compte AUTHENTIFIÉ — le site que partagent
 * l'inscription et, depuis #8033, la vérification d'adresse.
 *
 * L'ordre est celui de #4264 : la session naît AVANT le jeton, qui la NOMME ;
 * un jeton rattaché à rien serait refusé au premier `POST /refresh`.
 *
 * @module routes/auth/open-session
 */

import type { SocketIOUser } from '@meeshy/shared/types';
import type { RequestContext } from '../../services/GeoIPService';
import { createSession, generateSessionToken, type SessionData } from '../../services/SessionService';

export type OpenedSession = {
  readonly token: string;
  readonly sessionToken: string;
  readonly session: SessionData;
};

export async function openSession(
  authService: { generateToken(user: SocketIOUser, sessionId?: string | null): string },
  user: SocketIOUser,
  requestContext: RequestContext
): Promise<OpenedSession> {
  const sessionToken = generateSessionToken();
  const session = await createSession({ userId: user.id, token: sessionToken, requestContext });
  const token = authService.generateToken(user, session.id);
  return { token, sessionToken, session };
}
