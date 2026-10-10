import type { DeviceTranslationCatalogSlice } from './catalog-fr-device-translation';

/** Die Übersetzung auf dem Gerät (#9898) — siehe `catalog-fr-device-translation.ts`. */
const deDeviceTranslation = {
  'settings.device_translation': 'Auf diesem Gerät übersetzen',
  'settings.device_translation.info': 'Nachrichten werden hier übersetzt, mit einem Modell, das nur einmal geladen wird – etwa 110 MB pro Sprachpaar. Unterstützte Sprachen: Französisch, Englisch, Spanisch, Portugiesisch, Deutsch, Italienisch und Arabisch. Andere Sprachen übersetzt weiterhin der Server, in Unterhaltungen ohne Ende-zu-Ende-Verschlüsselung. Was dieses Gerät übersetzt, wird mit den anderen Mitgliedern der Unterhaltung geteilt – außer bei ausgeschalteten Lesebestätigungen.',
} satisfies DeviceTranslationCatalogSlice;

export default deDeviceTranslation;
