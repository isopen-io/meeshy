import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche anglaise du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const enCommunitySettings = {
  'community.settings.title': "Settings",
  'community.settings.section.info': "Info",
  'community.settings.field.name': "Name",
  'community.settings.field.name.placeholder': "Community name",
  'community.settings.field.description': "Description",
  'community.settings.field.description.placeholder': "What is this place about?",
  'community.settings.section.privacy': "Privacy",
  'community.settings.avatar.change': "Change avatar",
  'community.settings.banner.edit': "Edit",
  'community.settings.banner.change': "Change banner",
  'community.settings.image.uploading': "Uploading image…",
  'community.settings.avatar.uploaded': "Avatar ready: save to publish it.",
  'community.settings.banner.uploaded': "Banner ready: save to publish it.",
  'community.settings.image.error': "The image could not be uploaded. Try again.",
  'community.settings.privacy.confirm.title': "Make the community private?",
  'community.settings.privacy.confirm.body': "Former members and blocked accounts will leave its conversations for good.",
  'community.settings.privacy.confirm.action': "Make private",
  'community.settings.section.danger': "Danger zone",
  'community.settings.save': "Save",
  'community.settings.saving': "Saving…",
  'community.settings.saved': "Community updated.",
  'community.settings.error.name': "Give it a name, 100 characters at most.",
  'community.settings.error.description': "The description fits in 500 characters.",
  'community.settings.error.refused': "Only the community’s creator can change its settings.",
  'community.settings.error.gone': "This community no longer exists.",
  'community.settings.error.offline': "Offline: nothing was sent.",
  'community.settings.error.default': "Failed. Try again.",
  'community.settings.delete.label': "Delete community",
  'community.settings.delete.confirm.title': "Delete “{name}”?",
  'community.settings.delete.confirm.body': "Its members leave and it disappears. Its conversations remain, outside the community. This cannot be undone.",
  'community.settings.delete.confirm.action': "Delete",
  'community.settings.refused.title': "Creator only",
  'community.settings.refused.body': "Only the creator of this community can change its settings.",
} as const satisfies CommunitySettingsCatalog;

export default enCommunitySettings;
