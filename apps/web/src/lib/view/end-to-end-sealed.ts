import type { Message } from '@/lib/api/types';

/**
 * UN MESSAGE CHIFFRÉ DE BOUT EN BOUT EST SCELLÉ POUR LE WEB (#12983).
 *
 * Le web ne détient aucune clé libsignal (#10788, décision #12975) : il ne
 * reçoit aucune enveloppe, et la passerelle ne lui sert que le littéral
 * `[Encrypted]`. Même verdict que `e2eeUpgradeRequired` côté passerelle
 * (`services/gateway/src/services/e2ee/e2ee-upgrade-required.ts`) : chiffré ET
 * en mode `e2ee`. Les modes `server` et `hybrid` restent lisibles, le serveur
 * servant leur clair. Le jour où le web aura sa pile, ce verdict cédera la
 * place à la provenance du clair déchiffré sur l'appareil, jamais à la forme
 * du texte.
 */
export const endToEndSealed = (message: Pick<Message, 'isEncrypted' | 'encryptionMode'>): boolean =>
  message.isEncrypted === true && message.encryptionMode === 'e2ee';
