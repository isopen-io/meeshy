import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), PT — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const pt = {
  'appearance.title': 'Fundo e cor',
  'appearance.preview': 'Pré-visualização',
  'appearance.background': 'Fundo',
  'appearance.signature': 'Signature',
  'appearance.solid': 'Cor lisa',
  'appearance.photo': 'Foto da conversa',
  'appearance.photo_empty': 'Nenhuma foto foi enviada nesta conversa',
  'appearance.photo_unavailable': 'Não é possível carregar as fotos agora',
  'appearance.photo_more': 'Mais fotos',
  'appearance.photo_item': 'Foto {index}',
  'appearance.veil': 'Véu',
  'appearance.blur': 'Desfoque',
  'appearance.accent': 'Destaque',
  'appearance.auto': 'Automático',
  'appearance.animate': 'Animações',
  'appearance.shop': 'Mais na loja',
  'appearance.reset': 'Voltar ao padrão',
  'appearance.err_generic': 'Não foi possível guardar esta escolha e ela foi desfeita.',
  'appearance.err_not_owned': 'Este fundo não está nos seus packs.',
  'appearance.err_photo': 'Esta foto já não está disponível.',
  'appearance.pack_group': 'Pack {name}',
  'appearance.picked': 'Selecionado',
} satisfies AppearanceCatalog;

export default pt;
