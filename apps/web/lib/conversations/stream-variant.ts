/**
 * Les deux variantes de `BubbleStreamPage`, et la géométrie de défilement que
 * chacune commande.
 *
 * - `stream` — le feed d'accueil (`/`, conversation « meeshy ») : récent EN
 *   HAUT, le comportement historique du BubbleStream, bit-à-bit inchangé.
 * - `thread` — la conversation partagée (`/chat/:linkId`, participants
 *   anonymes) : géométrie de MESSAGERIE, ancien en haut / récent en bas.
 *   C'est la SEULE géométrie compatible avec la perspective Focal :
 *   `focalFocusLine` (lib/conversations/focal-geometry.ts) ancre la ligne de
 *   focus près du BAS du viewport — récent en haut, tous les messages
 *   récents tombaient dans la zone lointaine (opacité 0.18, échelle 0.60),
 *   d'où les « messages grisés » de la vue anonyme d'avant cette loi.
 */
export type StreamVariant = 'stream' | 'thread';

export interface StreamScrollLayout {
  readonly reverseOrder: boolean;
  readonly scrollDirection: 'up' | 'down';
  readonly scrollButtonDirection: 'up' | 'down';
}

const LAYOUT_BY_VARIANT: Readonly<Record<StreamVariant, StreamScrollLayout>> = {
  stream: { reverseOrder: false, scrollDirection: 'down', scrollButtonDirection: 'up' },
  thread: { reverseOrder: true, scrollDirection: 'up', scrollButtonDirection: 'down' },
};

export function streamScrollLayout(variant: StreamVariant): StreamScrollLayout {
  return LAYOUT_BY_VARIANT[variant];
}
