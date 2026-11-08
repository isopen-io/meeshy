import type { PackPreviewCatalog } from '@/lib/i18n-pack-preview-catalog';

/** LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION (#16267), langue `en` — mêmes clés que le français. */
const enPackPreview = {
  'packs.sheet.items': "Pack items",
  'packs.sheet.publisher': "Publisher: {author}",
  'packs.sheet.state.embedded': "Built into Meeshy",
  'packs.sheet.state.installed': "Installed",
  'packs.sheet.state.download': "To download",
  'packs.sheet.size': "Size: {size}",
  'packs.sheet.loading': "Loading items…",
  'packs.sheet.failed': "This pack’s items could not be loaded",
  'packs.preview.title': "Preview",
  'packs.preview.position': "{index} of {count}",
  'packs.preview.previous': "Previous item",
  'packs.preview.next': "Next item",
  'packs.preview.zoomIn': "Zoom in",
  'packs.preview.zoomOut': "Zoom out",
  'packs.preview.close': "Back to the shop",
  'packs.preview.others': "More suggestions",
  'packs.preview.equip': "Equip",
  'packs.preview.equipped': "Equipped",
  'packs.preview.equipFailed': "The item could not be equipped — try again",
  'packs.preview.animated': "Animated",
  'packs.preview.wallpaperHint': "A wallpaper is chosen in each conversation, from “Background and color”.",
  'packs.preview.bubble.in1': "Have you seen this new background?",
  'packs.preview.bubble.out': "Yes, it looks really good!",
  'packs.preview.bubble.in2': "I’m taking it 😍",
} satisfies PackPreviewCatalog;

export default enPackPreview;
