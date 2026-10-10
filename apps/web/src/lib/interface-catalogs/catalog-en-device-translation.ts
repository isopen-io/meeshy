import type { DeviceTranslationCatalogSlice } from './catalog-fr-device-translation';

/** The on-device translation (#9898) — see `catalog-fr-device-translation.ts`. */
const enDeviceTranslation = {
  'settings.device_translation': 'Translate on this device',
  'settings.device_translation.info': 'Messages are translated here, with a model downloaded only once — about 110 MB per language pair. Supported languages: French, English, Spanish, Portuguese, German, Italian and Arabic. Other languages are still translated by the server, in conversations that are not end-to-end encrypted. What this device translates is shared with the other members of the conversation, unless your read receipts are off.',
} satisfies DeviceTranslationCatalogSlice;

export default enDeviceTranslation;
