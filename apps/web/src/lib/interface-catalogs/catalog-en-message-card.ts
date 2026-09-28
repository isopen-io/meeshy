import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const enMessageCard = {
  'message.menu.export': 'Export as image',
  'export.card.title': 'Export as image',
  'export.card.footer': 'Exported by {name}',
  'export.card.styles': 'Style',
  'export.card.style.aurore': 'Aurora',
  'export.card.style.editorial': 'Editorial',
  'export.card.style.manuscrit': 'Handwritten',
  'export.card.preview': 'Image preview',
  'export.card.rendering': 'Preparing image…',
  'export.card.save': 'Save image',
  'export.card.truncated': 'Long message: the end is cut off in the image.',
  'export.announce.gallery': 'Image saved to your gallery',
  'export.announce.shared': 'Image ready',
  'export.announce.cancelled': 'Export cancelled',
  'export.announce.expired': 'Tap again to save',
  'export.announce.failed': 'Couldn’t create the image',
  'export.announce.unavailable': 'This device can’t save the image',
  'message.menu.exportQuick': 'Quick export',
  'export.card.options': 'Show',
  'export.card.option.title': 'Conversation title',
  'export.card.option.authors': 'Author names',
  'export.card.option.date': 'Date',
  'export.card.default.save': 'Use as default format',
  'export.card.default.current': 'Default format',
  'export.announce.defaultSaved': 'Default format saved',
} satisfies MessageCardCatalogSlice;

export default enMessageCard;
