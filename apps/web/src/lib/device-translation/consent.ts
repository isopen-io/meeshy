import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

/**
 * **LE CONSENTEMENT AU TÉLÉCHARGEMENT DU MODÈLE** (#9898) — plusieurs
 * centaines de Mo ne partent jamais sans que le lecteur l'ait accepté. Tant
 * qu'il n'a rien dit, l'appareil ne traduit pas et le serveur reste seul.
 *
 * POC : l'acceptation se pose par `deviceTranslationConsent().grant()` (la
 * console, ou l'écran de réglages qui viendra). L'écran qui la demande, avec
 * la taille mesurée par le banc (#9897), est la suite de #9898.
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
