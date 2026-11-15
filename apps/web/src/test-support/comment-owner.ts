import type { OwnerCredential } from '@/lib/api/owner-session';

/** TÉMOINS SEULS — l'auteur EST le lecteur connecté : la garde de propriétaire (#9743) laisse passer. */
export const ownerPresent: OwnerCredential = () => ({ kind: 'registered', token: 'jeton-de-test' });
