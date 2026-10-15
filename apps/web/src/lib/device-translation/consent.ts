import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

/**
 * **LE CONSENTEMENT À LA TRADUCTION SUR L'APPAREIL** (#9898) — l'appareil ne
 * télécharge aucun modèle, ne traduit rien et ne partage rien tant que le
 * lecteur ne l'a pas accepté ; d'ici là, le serveur reste seul.
 *
 * L'acceptation se pose par la bascule Réglages › Données › « Traduire sur
 * cet appareil » (`routes/settings.tsx`). Sa légende dit ce qu'elle engage :
 * les sept langues, la taille d'une paire mesurée par le banc (#9897), et le
 * partage de ce qui est traduit aux autres membres, sauf accusés de lecture
 * coupés (#9899).
 */
const KEY = 'meeshy.device-translation.consent';

export type DeviceTranslationConsent = {
  readonly granted: () => boolean;
  readonly grant: () => void;
  readonly revoke: () => void;
};

export function deviceTranslationConsent(storage: SafeStorage = safeLocalStorage()): DeviceTranslationConsent {
  return {
    granted: () => storage.getItem(KEY) === 'granted',
    grant: () => storage.setItem(KEY, 'granted'),
    revoke: () => storage.removeItem(KEY),
  };
}
