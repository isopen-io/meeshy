import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche allemande du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const deCommunitySettings = {
  'community.settings.title': "Einstellungen",
  'community.settings.section.info': "Infos",
  'community.settings.field.name': "Name",
  'community.settings.field.name.placeholder': "Name der Community",
  'community.settings.field.description': "Beschreibung",
  'community.settings.field.description.placeholder': "Worum geht es hier?",
  'community.settings.section.privacy': "Privatsphäre",
  'community.settings.avatar.change': "Avatar ändern",
  'community.settings.banner.edit': "Bearbeiten",
  'community.settings.banner.change': "Banner ändern",
  'community.settings.image.uploading': "Bild wird hochgeladen …",
  'community.settings.avatar.uploaded': "Avatar bereit: speichern, um ihn zu veröffentlichen.",
  'community.settings.banner.uploaded': "Banner bereit: speichern, um es zu veröffentlichen.",
  'community.settings.image.error': "Das Bild konnte nicht hochgeladen werden. Versuche es erneut.",
  'community.settings.section.danger': "Gefahrenzone",
  'community.settings.save': "Speichern",
  'community.settings.saving': "Wird gespeichert…",
  'community.settings.saved': "Community aktualisiert.",
  'community.settings.error.name': "Gib ihr einen Namen mit höchstens 100 Zeichen.",
  'community.settings.error.description': "Die Beschreibung passt in 500 Zeichen.",
  'community.settings.error.refused': "Nur wer die Community erstellt hat, kann sie einstellen.",
  'community.settings.error.gone': "Diese Community gibt es nicht mehr.",
  'community.settings.error.offline': "Offline: Nichts wurde gesendet.",
  'community.settings.error.default': "Fehlgeschlagen. Erneut versuchen.",
  'community.settings.delete.label': "Community löschen",
  'community.settings.delete.confirm.title': "„{name}“ löschen?",
  'community.settings.delete.confirm.body': "Ihre Mitglieder verlassen sie und sie verschwindet. Ihre Unterhaltungen bleiben, außerhalb der Community. Das ist endgültig.",
  'community.settings.delete.confirm.action': "Löschen",
  'community.settings.refused.title': "Nur für die Erstellerin oder den Ersteller",
  'community.settings.refused.body': "Nur wer diese Community erstellt hat, kann ihre Einstellungen ändern.",
} as const satisfies CommunitySettingsCatalog;

export default deCommunitySettings;
