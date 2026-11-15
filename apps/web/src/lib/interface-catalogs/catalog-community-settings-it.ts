import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche italienne du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const itCommunitySettings = {
  'community.settings.title': "Impostazioni",
  'community.settings.section.info': "Informazioni",
  'community.settings.field.name': "Nome",
  'community.settings.field.name.placeholder': "Nome della community",
  'community.settings.field.description': "Descrizione",
  'community.settings.field.description.placeholder': "Di cosa si parla qui?",
  'community.settings.section.privacy': "Privacy",
  'community.settings.avatar.change': "Cambia l’avatar",
  'community.settings.banner.edit': "Modifica",
  'community.settings.banner.change': "Cambia il banner",
  'community.settings.image.uploading': "Caricamento dell’immagine…",
  'community.settings.avatar.uploaded': "Avatar pronto: salva per pubblicarlo.",
  'community.settings.banner.uploaded': "Banner pronto: salva per pubblicarlo.",
  'community.settings.image.error': "Impossibile caricare l’immagine. Riprova.",
  'community.settings.privacy.confirm.title': "Rendere privata la community?",
  'community.settings.privacy.confirm.body': "Ex membri e account bloccati usciranno dalle sue conversazioni, senza ritorno.",
  'community.settings.privacy.confirm.action': "Rendi privata",
  'community.settings.section.danger': "Zona pericolosa",
  'community.settings.save': "Salva",
  'community.settings.saving': "Salvataggio…",
  'community.settings.saved': "Community aggiornata.",
  'community.settings.error.name': "Dalle un nome, di 100 caratteri al massimo.",
  'community.settings.error.description': "La descrizione sta in 500 caratteri.",
  'community.settings.error.refused': "Solo chi ha creato la community può modificarne le impostazioni.",
  'community.settings.error.gone': "Questa community non esiste più.",
  'community.settings.error.offline': "Offline: non è partito nulla.",
  'community.settings.error.default': "Non riuscito. Riprova.",
  'community.settings.delete.label': "Elimina la community",
  'community.settings.delete.confirm.title': "Eliminare «{name}»?",
  'community.settings.delete.confirm.body': "I membri la lasciano e scompare. Le sue conversazioni restano, fuori dalla community. È definitivo.",
  'community.settings.delete.confirm.action': "Elimina",
  'community.settings.refused.title': "Riservato a chi l’ha creata",
  'community.settings.refused.body': "Solo chi ha creato questa community può modificarne le impostazioni.",
} as const satisfies CommunitySettingsCatalog;

export default itCommunitySettings;
