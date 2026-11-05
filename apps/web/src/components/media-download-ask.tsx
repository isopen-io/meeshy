import { useState } from 'react';

import { formatPreviewFileSize } from '@meeshy/shared/utils/conversation-preview-strings';

import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useAutoDownload } from '@/lib/media/use-auto-download';
import { useOnline } from '@/lib/net/online';

import { Glyph } from './glyph';

/**
 * **LA BULLE DEMANDE AU-DELÀ DE LA POLITIQUE** (#6333) — miroir du
 * téléchargement manuel d'iOS : une image que la politique de l'appareil ne
 * laisse pas partir seule n'est pas demandée au serveur ; sa case montre son
 * aperçu flou et sa taille, et un toucher la télécharge. Sous 100 Ko elle part
 * toujours seule (`isSmallMediaAutoDownload`) ; hors ligne rien ne se demande —
 * le cache du navigateur sert ce qu'il a.
 */
export type MediaAsk = { readonly asking: boolean; readonly accept: () => void };

export function useMediaAsk(attachment: Pick<Attachment, 'fileSize'>): MediaAsk {
  const auto = useAutoDownload('image', attachment.fileSize);
  const online = useOnline();
  const [accepted, setAccepted] = useState(false);
  return { asking: online && !auto && !accepted, accept: () => setAccepted(true) };
}

export const mediaAskLabel = (attachment: Pick<Attachment, 'fileSize'>, name: string): string => {
  const language = currentInterfaceLanguage();
  return attachment.fileSize > 0
    ? translate(language, 'media.download.ask', { name, size: formatPreviewFileSize(language, attachment.fileSize) })
    : translate(language, 'media.download.askUnsized', { name });
};

/** La pastille posée sur l'aperçu : la flèche et la taille, jamais un écran vide. */
export function MediaDownloadPill({ attachment }: { readonly attachment: Pick<Attachment, 'fileSize'> }) {
  const size = attachment.fileSize > 0 ? formatPreviewFileSize(currentInterfaceLanguage(), attachment.fileSize) : null;
  return (
    <span
      aria-hidden="true"
      data-media-download-pill
      className="absolute inset-0 m-auto flex h-11 w-fit items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold text-on-media"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-media-backdrop) 62%, transparent)' }}
    >
      <Glyph name="downloadSimple" size={18} />
      {size}
    </span>
  );
}
