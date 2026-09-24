import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * LA LOI D'HÔTE DE LA FEUILLE DE COMMENTAIRES (#6484, D-89) — ce qu'un écran
 * qui monte `PublicationCommentsSheet` doit tenir, extrait du lecteur de
 * stories (`routes/story.tsx`, `commentsOpen`/`returnFocusRef`/`openComments`)
 * pour que le lecteur des Réels n'en écrive pas une SECONDE copie :
 *
 *  - **CE QUI AVAIT LE FOCUS QUAND LA FEUILLE S'OUVRE EST MÉMORISÉ PAR
 *    L'HÔTE**, jamais par la feuille — c'est l'hôte qui rend le rail `inert`
 *    (D-90), et un sous-arbre inerte ÉJECTE le focus qu'il contient ; une
 *    feuille qui lirait `document.activeElement` à son montage trouverait
 *    déjà `<body>` (revue #7112, story.tsx).
 *  - **LE FOCUS REVIENT D'OÙ IL EST PARTI**, une fois l'inertie levée
 *    (`isConnected` : le bouton d'origine peut ne plus être là si le contenu
 *    a changé pendant que la feuille était ouverte).
 *  - **UN CHANGEMENT DE CLÉ FERME LA FEUILLE** — la story ou le réel suivant
 *    n'hérite pas du fil de son voisin.
 *
 * LES DEUX LECTEURS la lisent d'ici — `routes/story.tsx` (qui y a perdu ses
 * trois effets inline : une EXTRACTION, 1020 → 992 lignes) et
 * `routes/reels.tsx`. Ce qui reste propre à un hôte y reste : la PAUSE de la
 * story (son horloge avance seule ; un réel, comme sur iOS, continue de jouer
 * sous la feuille) et l'inertie de ce que la feuille recouvre (D-90).
 */
export type CommentsSheetHost = {
  /** `null` ⇒ fermée. Sinon, la publication dont le fil est ouvert. */
  readonly postId: string | null;
  readonly open: (postId: string) => void;
  readonly close: () => void;
};

/* `open`, `close` et l'hôte lui-même GARDENT LEUR IDENTITÉ tant que l'état ne
 * change pas (revue-correction #6484). Ils sont lus en aval par des
 * mémoïsations et des effets : `openComments` (`useCallback`) puis
 * `railHandlers` (`useMemo`) du lecteur de stories, et l'écouteur d'Échap de
 * la feuille (`useEffect([onClose])`). Rendus neufs à chaque rendu, ils
 * défaisaient les deux premières et réabonnaient le troisième à chaque
 * rendu de l'hôte. Ce module vit dans un chunk PARTAGÉ par les deux lecteurs :
 * la mémoïsation ne pèse ni sur `reels`, ni sur `story_reader`. */
export function useCommentsSheetHost(closeWhenChanges: unknown): CommentsSheetHost {
  const [postId, setPostId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (postId !== null) return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target !== null && target.isConnected) target.focus();
  }, [postId]);

  useEffect(() => {
    setPostId(null);
    // `closeWhenChanges` est la clé de fermeture (l'identité du réel/story
    // actif) — le hook ne lit jamais sa VALEUR, seulement son changement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeWhenChanges]);

  const open = useCallback((id: string) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPostId(id);
  }, []);
  const close = useCallback(() => setPostId(null), []);

  return useMemo(() => ({ postId, open, close }), [postId, open, close]);
}
