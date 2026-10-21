import type { DeviceTranslationCatalog } from '@/lib/i18n-device-translation-catalog';

/** La traduzione sul dispositivo (#9898) — vedi `catalog-device-translation-fr.ts`. */
const itDeviceTranslation = {
  'settings.device_translation': 'Traduci su questo dispositivo',
  'settings.device_translation.info': 'I messaggi vengono tradotti qui, con un modello scaricato una sola volta: circa 110 MB per coppia di lingue. Lingue supportate: francese, inglese, spagnolo, portoghese, tedesco, italiano e arabo. Le altre lingue restano tradotte dal server, nelle conversazioni senza crittografia end-to-end. Ciò che questo dispositivo traduce viene condiviso con gli altri membri della conversazione, a meno che le conferme di lettura non siano disattivate.',
} satisfies DeviceTranslationCatalog;

export default itDeviceTranslation;
