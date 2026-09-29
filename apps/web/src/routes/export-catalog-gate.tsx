import { useEffect, useState, type ReactNode } from 'react';

import { isExportCardCatalogLoaded, loadExportCardCatalog } from '@/lib/i18n-export-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « Imagine » ne se monte qu'une fois SON catalogue chargé : il vit hors du
 * catalogue d'interface, chargé au premier « Imager » — d'un message
 * (`thread-sheets.tsx`) comme d'un commentaire (`comment-image-sheet.tsx`).
 */
export function ExportCatalogGate({ children }: { readonly children: ReactNode }) {
  const language = currentInterfaceLanguage();
  const [ready, setReady] = useState(() => isExportCardCatalogLoaded(language));
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadExportCardCatalog(language).then(
      () => {
        if (live) setReady(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language, ready]);
  return ready ? <>{children}</> : null;
}
