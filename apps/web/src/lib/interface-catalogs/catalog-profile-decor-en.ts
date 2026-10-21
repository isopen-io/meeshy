import type { ProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';

/** LE CATALOGUE DU DÉCOR DE PROFIL (#10632), langue `en` — mêmes clés que le français. */
const enProfileDecor = {
  'profileDecor.banner.entry': "Banner",
  'profileDecor.ring.entry': "Ring",
  'profileDecor.frame.entry': "Banner frame",
  'profileDecor.banner.title': "Profile banner",
  'profileDecor.ring.title': "Avatar ring",
  'profileDecor.frame.title': "Banner frame",
  'profileDecor.none': "None",
  'profileDecor.photo': "Photo",
  'profileDecor.shop': "More in the shop",
  'profileDecor.refused': "This choice is not available for your account. It stays as before.",
  'profileDecor.error': "Could not save. Your previous choice is kept.",
} satisfies ProfileDecorCatalog;

export default enProfileDecor;
