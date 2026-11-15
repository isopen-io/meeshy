import type { ProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';

/** LE CATALOGUE DU DÉCOR DE PROFIL (#10632), langue `es` — mêmes clés que le français. */
const esProfileDecor = {
  'profileDecor.banner.entry': "Banner",
  'profileDecor.ring.entry': "Contorno",
  'profileDecor.frame.entry': "Marco del banner",
  'profileDecor.banner.title': "Banner del perfil",
  'profileDecor.ring.title': "Contorno del avatar",
  'profileDecor.frame.title': "Marco del banner",
  'profileDecor.none': "Ninguno",
  'profileDecor.photo': "Foto",
  'profileDecor.shop': "Más en la tienda",
  'profileDecor.refused': "Esta opción no está disponible para tu cuenta. Todo queda como antes.",
  'profileDecor.error': "No se pudo guardar. Se conserva tu elección anterior.",
} satisfies ProfileDecorCatalog;

export default esProfileDecor;
