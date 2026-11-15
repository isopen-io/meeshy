import type { PackPreviewCatalog } from '@/lib/i18n-pack-preview-catalog';

/** LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION (#16267), langue `it` — mêmes clés que le français. */
const itPackPreview = {
  'packs.sheet.items': "Elementi del pack",
  'packs.sheet.publisher': "Editore: {author}",
  'packs.sheet.state.embedded': "Incluso in Meeshy",
  'packs.sheet.state.installed': "Installato",
  'packs.sheet.state.download': "Da scaricare",
  'packs.sheet.size': "Peso: {size}",
  'packs.sheet.loading': "Caricamento degli elementi…",
  'packs.sheet.failed': "Impossibile caricare gli elementi di questo pack",
  'packs.preview.title': "Anteprima",
  'packs.preview.position': "{index} di {count}",
  'packs.preview.previous': "Elemento precedente",
  'packs.preview.next': "Elemento successivo",
  'packs.preview.zoomIn': "Ingrandisci",
  'packs.preview.zoomOut': "Riduci",
  'packs.preview.close': "Torna al negozio",
  'packs.preview.others': "Altre proposte",
  'packs.preview.equip': "Equipaggia",
  'packs.preview.equipped': "Equipaggiato",
  'packs.preview.equipFailed': "Impossibile equipaggiare l’elemento — riprova",
  'packs.preview.animated': "Animato",
  'packs.preview.wallpaperHint': "Uno sfondo si sceglie in ogni conversazione, da «Sfondo e colore».",
  'packs.preview.bubble.in1': "Hai visto questo nuovo sfondo?",
  'packs.preview.bubble.out': "Sì, sta benissimo!",
  'packs.preview.bubble.in2': "Lo adotto 😍",
} satisfies PackPreviewCatalog;

export default itPackPreview;
