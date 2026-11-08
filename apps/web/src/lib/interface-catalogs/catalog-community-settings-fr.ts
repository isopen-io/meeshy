/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche française du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const frCommunitySettings = {
  'community.settings.title': "Réglages",
  'community.settings.section.info': "Infos",
  'community.settings.field.name': "Nom",
  'community.settings.field.name.placeholder': "Nom de la communauté",
  'community.settings.field.description': "Description",
  'community.settings.field.description.placeholder': "De quoi parle-t-on ici ?",
  'community.settings.section.privacy': "Confidentialité",
  'community.settings.section.danger': "Zone dangereuse",
  'community.settings.save': "Enregistrer",
  'community.settings.saving': "Enregistrement…",
  'community.settings.saved': "Communauté mise à jour.",
  'community.settings.error.name': "Donnez-lui un nom, de 100 caractères au plus.",
  'community.settings.error.description': "La description tient en 500 caractères.",
  'community.settings.error.refused': "Seul le créateur de la communauté peut la régler.",
  'community.settings.error.gone': "Cette communauté n’existe plus.",
  'community.settings.error.offline': "Hors ligne : rien n’est parti.",
  'community.settings.error.default': "Échec. Réessayez.",
  'community.settings.delete.label': "Supprimer la communauté",
  'community.settings.delete.confirm.title': "Supprimer « {name} » ?",
  'community.settings.delete.confirm.body': "Ses membres la quittent et elle disparaît. Ses conversations restent, hors de la communauté. C’est définitif.",
  'community.settings.delete.confirm.action': "Supprimer",
  'community.settings.refused.title': "Réservé au créateur",
  'community.settings.refused.body': "Seul le créateur de cette communauté peut modifier ses réglages.",
} as const;

export default frCommunitySettings;
