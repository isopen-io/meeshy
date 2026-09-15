import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { safeAreaInsets } from './safe-area';
import { threadInsets, type ThreadInsets } from './thread-insets';

/**
 * LE CÂBLAGE DES RÉSERVES DU DÉFILEUR (#6213) — miroir du `GeometryReader`
 * qu'iOS pose sous son composeur (`ConversationView.swift:2013-2019`,
 * `updateComposerHeight`) : la hauteur du bord bas est MESURÉE, jamais
 * supposée, parce qu'elle grandit avec le texte saisi, la bande de citation
 * et le tiroir de pièces jointes.
 *
 * La mesure initiale est posée par la CALLBACK DE RÉF, qui court au moment
 * du layout — avant la peinture : sinon la première image montrerait le fil
 * avec la réserve de repli, et il sauterait d'une centaine de pixels sous les
 * yeux du lecteur.
 *
 * L'escamotage du chrome ne rentre PAS ici, et c'est voulu : `EdgeHiddenChrome`
 * translate le composeur, il ne le redimensionne pas — `ResizeObserver` reste
 * muet, la réserve ne bouge pas, le fil ne se re-scale pas pendant le geste
 * (« le composeur garde sa hauteur mesurée », `ConversationView.swift:2026-2028`).
 */
export function useThreadInsets(): {
  /** À poser en `ref` sur l'élément qui occupe le bord bas (composeur, barre de sélection). */
  readonly bottomEdgeRef: (node: HTMLElement | null) => void;
  readonly insets: ThreadInsets;
  /** Les cotes, prêtes à poser sur l'hôte commun du fil. */
  readonly vars: CSSProperties;
} {
  const [bottomEdgeHeight, setBottomEdgeHeight] = useState(0);
  const [safe, setSafe] = useState(() => safeAreaInsets());
  const observed = useRef<{ node: HTMLElement; observer: ResizeObserver } | null>(null);

  /* L'encoche CHANGE — rotation, passage en plein écran, barre d'URL mobile
     qui se replie. Une lecture unique au montage figeait la réserve sur la
     valeur du portrait. */
  useEffect(() => {
    const reread = () => setSafe(safeAreaInsets());
    reread();
    window.addEventListener('resize', reread);
    window.addEventListener('orientationchange', reread);
    return () => {
      window.removeEventListener('resize', reread);
      window.removeEventListener('orientationchange', reread);
    };
  }, []);

  const bottomEdgeRef = useCallback((node: HTMLElement | null) => {
    if (observed.current !== null) {
      observed.current.observer.disconnect();
      observed.current = null;
    }
    if (node === null) {
      /* Le bord bas se DÉMONTE en Résumé Vivant : sans cette remise à zéro la
         réserve gardait la hauteur du composeur d'avant, et le Résumé
         s'ouvrait avec cent pixels de vide en bas. */
      setBottomEdgeHeight(0);
      return;
    }
    /* `offsetHeight` (boîte de BORDURE) et non `contentRect` (boîte de
       CONTENU) : la racine du composeur porte `pb-safe`, donc son encoche
       vit dans son PADDING — `contentRect` l'aurait justement laissée dehors,
       et la dernière bulle serait repassée sous l'indicateur home. */
    const observer = new ResizeObserver(() => setBottomEdgeHeight(node.offsetHeight));
    observer.observe(node);
    observed.current = { node, observer };
    setBottomEdgeHeight(node.offsetHeight);
  }, []);

  const insets = threadInsets({ bottomEdgeHeight, safeAreaTop: safe.top, safeAreaBottom: safe.bottom });

  return {
    bottomEdgeRef,
    insets,
    vars: {
      '--thread-pad-top': `${insets.top}px`,
      '--thread-pad-bottom': `${insets.bottom}px`,
      '--thread-notice-bottom': `${insets.noticeBottom}px`,
      '--thread-scroll-button-bottom': `${insets.scrollButtonBottom}px`,
      '--day-pill-top': `${insets.dayPillTop}px`,
    } as CSSProperties,
  };
}
