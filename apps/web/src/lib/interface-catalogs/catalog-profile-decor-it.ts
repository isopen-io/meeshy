import type { ProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';

/** LE CATALOGUE DU DÉCOR DE PROFIL (#10632), langue `it` — mêmes clés que le français. */
const itProfileDecor = {
  'profileDecor.banner.entry': "Banner",
  'profileDecor.ring.entry': "Contorno",
  'profileDecor.frame.entry': "Cornice del banner",
  'profileDecor.banner.title': "Banner del profilo",
  'profileDecor.ring.title': "Contorno dell’avatar",
  'profileDecor.frame.title': "Cornice del banner",
  'profileDecor.none': "Nessuno",
  'profileDecor.photo': "Foto",
  'profileDecor.shop': "Altro nel negozio",
  'profileDecor.refused': "Questa scelta non è disponibile per il tuo account. Resta com’era.",
  'profileDecor.error': "Impossibile salvare. La scelta precedente è mantenuta.",
} satisfies ProfileDecorCatalog;

export default itProfileDecor;
