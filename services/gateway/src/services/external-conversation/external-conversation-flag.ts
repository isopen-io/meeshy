/**
 * LE DRAPEAU DES CONVERSATIONS EXTERNES (#17117, chantier #17007).
 *
 * Toute entrée « écrire à un ami WhatsApp » reste ÉTEINTE en production
 * jusqu'à la signature de l'accord d'interopérabilité avec Meta (design § 6).
 * Le drapeau s'arme par la SEULE valeur exacte `on`, et seulement là où aucun
 * utilisateur réel n'est servi (`isPreSignatureEnvironment` : développement,
 * test, staging déclaré) : armé en production, il reste éteint. La composition
 * de production le pose `off` (garde de configuration dans ses témoins).
 */
import { isPreSignatureEnvironment } from '../external-peer/external-peer-selection';

export const EXTERNAL_CONVERSATIONS_FLAG = 'EXTERNAL_CONVERSATIONS' as const;

const ARMED = 'on';

export function externalConversationsEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[EXTERNAL_CONVERSATIONS_FLAG] === ARMED && isPreSignatureEnvironment(env);
}
