import type { EditAttributionReader } from '@meeshy/shared/utils/message-edit-attribution';
import type { UnifiedAuthContext } from '../../middleware/auth';

/**
 * #11375 — le LECTEUR d'une réponse REST, tel que `servedEditAttribution` le
 * juge : son `User.id` et son rôle global. Un invité anonyme n'a ni l'un ni
 * l'autre — il reçoit la mention, jamais l'identité du modérateur.
 */
export function editAttributionReaderOf(
  authContext: Pick<UnifiedAuthContext, 'isAnonymous' | 'userId' | 'registeredUser'> | undefined,
): EditAttributionReader {
  if (!authContext || authContext.isAnonymous) return {};
  return { userId: authContext.userId ?? null, globalRole: authContext.registeredUser?.role ?? null };
}
