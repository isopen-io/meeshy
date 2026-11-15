import type { Block, ContentPage, Section } from './type';

/**
 * LE TEXTE LU D'UNE PAGE INSTITUTIONNELLE — ce qu'un lecteur trouve, bloc par
 * bloc, sans le rendu. Les témoins des textes légaux (âge, carnet d'adresses,
 * sous-traitants, sécurité des enfants) lisent ce qu'une page DIT ; chacun
 * réécrivait cette projection, et une jumelle qui oublierait un genre de bloc
 * ferait verdir un témoin sur un texte qu'elle ne lit pas. Le `switch` est
 * exhaustif pour la même raison que celui de `page.tsx`.
 */
export const blockText = (block: Block): string => {
  switch (block.kind) {
    case 'paragraphes':
      return block.body.join(' ');
    case 'list':
      return block.items.join(' ');
    case 'accent':
      return block.body;
    case 'encadre':
      return block.rows.map((row) => row.text).join(' ');
    case 'cartes':
      return block.cards.map((card) => [card.title, card.body ?? '', ...(card.items ?? [])].join(' ')).join(' ');
    case 'mee':
      return block.views.map((view) => view.caption).join(' ');
  }
};

export const sectionText = (section: Section): string => [section.title, ...section.blocks.map(blockText)].join(' ');

export const pageText = (page: ContentPage): string =>
  [page.title, page.hero ?? '', ...page.sections.map(sectionText)].join(' ');
