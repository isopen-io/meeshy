import type { DeviceTranslationCatalogSlice } from './catalog-fr-device-translation';

/** La traducción en el dispositivo (#9898) — véase `catalog-fr-device-translation.ts`. */
const esDeviceTranslation = {
  'settings.device_translation': 'Traducir en este dispositivo',
  'settings.device_translation.info': 'Los mensajes se traducen aquí, con un modelo que se descarga una sola vez: unos 110 MB por par de idiomas. Idiomas compatibles: francés, inglés, español, portugués, alemán, italiano y árabe. Los demás idiomas los sigue traduciendo el servidor, en las conversaciones sin cifrado de extremo a extremo. Lo que traduce este dispositivo se comparte con los demás miembros de la conversación, salvo si tienes desactivadas las confirmaciones de lectura.',
} satisfies DeviceTranslationCatalogSlice;

export default esDeviceTranslation;
