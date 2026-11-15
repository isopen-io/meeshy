import type { ProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';

/** LE CATALOGUE DU DÉCOR DE PROFIL (#10632), langue `pt` — mêmes clés que le français. */
const ptProfileDecor = {
  'profileDecor.banner.entry': "Banner",
  'profileDecor.ring.entry': "Contorno",
  'profileDecor.frame.entry': "Moldura do banner",
  'profileDecor.banner.title': "Banner do perfil",
  'profileDecor.ring.title': "Contorno do avatar",
  'profileDecor.frame.title': "Moldura do banner",
  'profileDecor.none': "Nenhum",
  'profileDecor.photo': "Foto",
  'profileDecor.shop': "Mais na loja",
  'profileDecor.refused': "Esta escolha não está disponível para a tua conta. Fica como antes.",
  'profileDecor.error': "Não foi possível guardar. A escolha anterior foi mantida.",
} satisfies ProfileDecorCatalog;

export default ptProfileDecor;
