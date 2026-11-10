import type { WriteRestrictionCatalogSlice } from './catalog-fr-write-restriction';

/** La restriction d'écriture servie (#9928) — voir `catalog-fr-write-restriction.ts`. */
const ptWriteRestriction = {
  'composer.writeRestriction.minorGlobal': 'O Global abre-se à escrita quando fizeres 18 anos',
  'composer.writeRestriction.endToEnd': 'Conversa criptografada de ponta a ponta: escreva pelo app Meeshy',
  'composer.writeRestriction.endToEnd.shell': 'Conversa criptografada de ponta a ponta: escreva em um dos seus dispositivos criptografados',
  'composer.writeRestriction.externalPending': 'Criptografado de ponta a ponta. O envio para o WhatsApp ainda não está aberto: por enquanto nada sai daqui.',
  'age.blocked.title': 'O Meeshy é para maiores de 13 anos',
  'age.blocked.body': 'Esta conta não pode ser usada antes dos teus 13 anos.',
  'age.blocked.confirm': 'Percebi',
} satisfies WriteRestrictionCatalogSlice;

export default ptWriteRestriction;
