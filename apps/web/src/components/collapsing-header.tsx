import { useEffect, useRef, type ReactNode } from 'react';

import '@/styles/collapsing-header.css';

/**
 * L'EN-TÊTE QUI SE RÉDUIT (#9563, amendement n° 2) — grand titre au repos, barre
 * compacte et translucide dès que le contenu défile dessous, retour en disque de
 * verre à gauche, actions à droite. Le miroir web de `CollapsibleHeader` (iOS).
 *
 * Il se pose en PREMIER enfant du conteneur qui défile : la barre y reste collée
 * (`sticky`), le grand titre défile avec la page. Le `<h1>` est le grand titre ;
 * le titre de la barre en est un double muet (`aria-hidden`), qui ne se montre
 * que lorsque le grand est passé dessous.
 *
 * RIEN NE SE REND AU DÉFILEMENT. La feuille (`styles/collapsing-header.css`) suit
 * le défilement elle-même là où le navigateur le sait ; l'écouteur d'ici, passif,
 * ne fait que poser ou retirer UN attribut (`data-scrolled`) pour les autres —
 * jamais un état React.
 */

/** Au-delà de ce défilement, le grand titre est sous la barre : elle devient compacte. */
export const COLLAPSE_AT = 36;

export function CollapsingHeader({
  title,
  back,
  trailing,
  notice,
}: {
  readonly title: string;
  /** Le retour, déjà un lien : la barre ne sait pas où il mène. */
  readonly back: ReactNode;
  /** Les actions de droite (un compte, le groupe du rang et des Meeshes). */
  readonly trailing?: ReactNode;
  /** Une bande sous la barre, collée avec elle (« Hors ligne »). */
  readonly notice?: ReactNode;
}) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = bar.current;
    const scroller = element?.parentElement ?? null;
    if (element === null || scroller === null) return undefined;
    const sync = (): void => {
      element.toggleAttribute('data-scrolled', scroller.scrollTop > COLLAPSE_AT);
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    return () => scroller.removeEventListener('scroll', sync);
  }, []);

  return (
    <>
      <div ref={bar} data-collapsing-bar="" className="collapsing-bar">
        <span aria-hidden="true" className="glass collapsing-bar-veil" />
        <div className="relative flex items-center gap-2 px-4 py-2" style={{ minHeight: 60 }}>
          {back}
          <span aria-hidden="true" className="collapsing-bar-title min-w-0 flex-1 truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {title}
          </span>
          {trailing ?? null}
        </div>
        {notice === undefined || notice === null ? null : <div className="relative">{notice}</div>}
      </div>
      <h1 data-collapsing-title="" className="px-4 pb-2 text-large-title font-bold leading-tight" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </h1>
    </>
  );
}
