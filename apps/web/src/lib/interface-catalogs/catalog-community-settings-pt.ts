import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche portugaise du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const ptCommunitySettings = {
  'community.settings.title': "Definições",
  'community.settings.section.info': "Informações",
  'community.settings.field.name': "Nome",
  'community.settings.field.name.placeholder': "Nome da comunidade",
  'community.settings.field.description': "Descrição",
  'community.settings.field.description.placeholder': "Sobre o que se fala aqui?",
  'community.settings.section.privacy': "Privacidade",
  'community.settings.section.danger': "Zona de perigo",
  'community.settings.save': "Guardar",
  'community.settings.saving': "A guardar…",
  'community.settings.saved': "Comunidade atualizada.",
  'community.settings.error.name': "Dê-lhe um nome, com 100 caracteres no máximo.",
  'community.settings.error.description': "A descrição cabe em 500 caracteres.",
  'community.settings.error.refused': "Só quem criou a comunidade pode alterar as definições.",
  'community.settings.error.gone': "Esta comunidade já não existe.",
  'community.settings.error.offline': "Sem ligação: nada foi enviado.",
  'community.settings.error.default': "Falhou. Tente novamente.",
  'community.settings.delete.label': "Eliminar a comunidade",
  'community.settings.delete.confirm.title': "Eliminar «{name}»?",
  'community.settings.delete.confirm.body': "Os membros saem e ela desaparece. As conversas ficam, fora da comunidade. É definitivo.",
  'community.settings.delete.confirm.action': "Eliminar",
  'community.settings.refused.title': "Reservado a quem a criou",
  'community.settings.refused.body': "Só quem criou esta comunidade pode alterar as definições.",
} as const satisfies CommunitySettingsCatalog;

export default ptCommunitySettings;
