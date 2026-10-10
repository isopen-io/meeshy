import { createContext } from 'react';

/**
 * LA TUILE QU'UN SAUT DE CITATION MET EN ÉVIDENCE (#9911) — la citation d'une
 * pièce nommée mène au message ET à SA tuile, comme iOS
 * (`MessageListViewController+QuotedMedia.swift`). Le fil la publie
 * (`useThreadJump().highlightedPieceId`) ; la grille de médias la lit, sans
 * qu'aucune rangée n'ait à la recevoir en propriété.
 */
export const HighlightedPieceContext = createContext<string | null>(null);
