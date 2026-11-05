import type { PackPreviewCatalog } from '@/lib/i18n-pack-preview-catalog';

/** LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION (#16267), langue `es` — mêmes clés que le français. */
const esPackPreview = {
  'packs.sheet.items': "Elementos del pack",
  'packs.sheet.publisher': "Editor: {author}",
  'packs.sheet.state.embedded': "Integrado en Meeshy",
  'packs.sheet.state.installed': "Instalado",
  'packs.sheet.state.download': "Por descargar",
  'packs.sheet.size': "Peso: {size}",
  'packs.sheet.loading': "Cargando los elementos…",
  'packs.sheet.failed': "No se pudieron cargar los elementos de este pack",
  'packs.preview.title': "Vista previa",
  'packs.preview.position': "{index} de {count}",
  'packs.preview.previous': "Elemento anterior",
  'packs.preview.next': "Elemento siguiente",
  'packs.preview.zoomIn': "Ampliar",
  'packs.preview.zoomOut': "Reducir",
  'packs.preview.close': "Volver a la tienda",
  'packs.preview.others': "Otras propuestas",
  'packs.preview.equip': "Equipar",
  'packs.preview.equipped': "Equipado",
  'packs.preview.equipFailed': "No se pudo equipar el elemento — inténtalo de nuevo",
  'packs.preview.animated': "Animado",
  'packs.preview.wallpaperHint': "Un fondo se elige en cada conversación, desde «Fondo y color».",
  'packs.preview.bubble.in1': "¿Has visto este fondo nuevo?",
  'packs.preview.bubble.out': "¡Sí, queda genial!",
  'packs.preview.bubble.in2': "Me lo quedo 😍",
} satisfies PackPreviewCatalog;

export default esPackPreview;
