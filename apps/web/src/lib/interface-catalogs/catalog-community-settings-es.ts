import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche espagnole du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const esCommunitySettings = {
  'community.settings.title': "Ajustes",
  'community.settings.section.info': "Información",
  'community.settings.field.name': "Nombre",
  'community.settings.field.name.placeholder': "Nombre de la comunidad",
  'community.settings.field.description': "Descripción",
  'community.settings.field.description.placeholder': "¿De qué se habla aquí?",
  'community.settings.section.privacy': "Privacidad",
  'community.settings.section.danger': "Zona de peligro",
  'community.settings.save': "Guardar",
  'community.settings.saving': "Guardando…",
  'community.settings.saved': "Comunidad actualizada.",
  'community.settings.error.name': "Ponle un nombre, de 100 caracteres como máximo.",
  'community.settings.error.description': "La descripción cabe en 500 caracteres.",
  'community.settings.error.refused': "Solo quien creó la comunidad puede cambiar sus ajustes.",
  'community.settings.error.gone': "Esta comunidad ya no existe.",
  'community.settings.error.offline': "Sin conexión: no se envió nada.",
  'community.settings.error.default': "Error. Inténtalo de nuevo.",
  'community.settings.delete.label': "Eliminar la comunidad",
  'community.settings.delete.confirm.title': "¿Eliminar «{name}»?",
  'community.settings.delete.confirm.body': "Sus miembros la abandonan y desaparece. Sus conversaciones se conservan, fuera de la comunidad. Es definitivo.",
  'community.settings.delete.confirm.action': "Eliminar",
  'community.settings.refused.title': "Solo para quien la creó",
  'community.settings.refused.body': "Solo quien creó esta comunidad puede cambiar sus ajustes.",
} as const satisfies CommunitySettingsCatalog;

export default esCommunitySettings;
