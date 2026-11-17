import { useEffect, useRef } from 'react';

import { MeeshyCodeCard } from '@/components/kit/meeshy-code-card';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { addressHost } from '@/lib/links/hub-face';
import { BRAND_BUTTON_STYLE } from '@/routes/links-parts';

/**
 * Mon QR de profil, en grand (K31) : une feuille modale, Échap, le retour et le fond la ferment (pile du retour, `useBackDismiss`), le focus
 * entre sur « Fermer » et revient au bouton qui l'a ouverte. Le QR encode l'adresse canonique.
 * « Fermer » est le seul arrêt de la feuille : Tab y reste plutôt que de passer, derrière le fond, à l'écran recouvert.
 */
export function LinksCodeSheet({ language, url, onClose }: { readonly language: InterfaceLanguage; readonly url: string; readonly onClose: () => void }) {
  const close = useRef<HTMLButtonElement | null>(null);
  useBackDismiss(onClose, { escape: true });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => opener?.focus();
  }, []);
  const label = translateLinkFamilies(language, 'links.face.profile.codeLabel');
  const keepFocusInside = (event: { readonly key: string; preventDefault: () => void }) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    close.current?.focus();
  };
  return (
    <div data-links-code-sheet="" className="fixed inset-0 z-30 grid place-items-center p-4" style={{ backgroundColor: 'var(--color-media-backdrop)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} className="grid justify-items-center gap-4" onClick={(event) => event.stopPropagation()} onKeyDown={keepFocusInside}>
        <MeeshyCodeCard payload={url} label={label} caption={addressHost(url)} size={220} />
        <button ref={close} type="button" onClick={onClose} className="grid place-items-center rounded-chip px-6 text-body font-semibold active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ ...BRAND_BUTTON_STYLE, minHeight: 44 }}>
          {translateLinkFamilies(language, 'links.face.profile.close')}
        </button>
      </div>
    </div>
  );
}
