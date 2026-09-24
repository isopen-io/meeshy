import { useEffect, useRef, useState } from 'react';

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
 * `routes/story.tsx` garde sa propre implémentation inline : c'est un fichier
 * DÉJÀ hors budget (1000-1200 lignes, CLAUDE.md racine) où « on ajoute » est
 * interdit — l'y faire consommer ce hook aurait exigé une extraction plus
 * large, hors du périmètre de ce lot. Les DEUX portent la MÊME loi ; seul le
 * lecteur des Réels, écrit APRÈS cette extraction, la lit d'ici.
 */
export type CommentsSheetHost = {
  /** `null` ⇒ fermée. Sinon, la publication dont le fil est ouvert. */
  readonly postId: string | null;
  readonly open: (postId: string) => void;
  readonly close: () => void;
};

/* `open`/`close` ne sont PAS mémoïsés (`useCallback`) — rien en aval ne
 * compare leur identité (`RailButton` n'est pas `memo()`), et le mémoïser
 * n'aurait payé qu'un import et deux enveloppes pour rien (mesuré :
 * `measure-weight.mjs`, chunk `reels`, marge serrée). */
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

  return {
    postId,
    open: (id: string) => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPostId(id);
    },
    close: () => setPostId(null),
  };
}
