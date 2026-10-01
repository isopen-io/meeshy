import type { ReactNode } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import { meeStickerOfTemplate } from '@/lib/mee/catalog';
import { renderMeeSticker } from '@/lib/mee/render';

/**
 * UN STICKER MEE DANS LA BULLE (#9034) — redessiné depuis le catalogue avec
 * les valeurs envoyées, donc ANIMÉ et net à toute taille. Chargé à la
 * demande (`message-body-blocks.tsx`) : le fil n'embarque pas les deux cents
 * scènes tant que personne n'en envoie. Un gabarit inconnu de ce binaire
 * rend `fallback` — l'image jointe.
 */
export default function MeeBubbleSticker({
  sticker,
  side,
  fallback,
}: {
  readonly sticker: MessageSticker;
  readonly side: number;
  readonly fallback: ReactNode;
}) {
  const mee = meeStickerOfTemplate(sticker.templateId);
  if (mee === undefined) return <>{fallback}</>;
  return (
    <span
      data-mee-bubble={mee.id}
      role="img"
      aria-label={mee.title}
      style={{ display: 'inline-block', width: side, height: side }}
      dangerouslySetInnerHTML={{ __html: renderMeeSticker(mee, { uid: `bubble-${mee.id}`, slots: sticker.slots ?? {} }) }}
    />
  );
}
