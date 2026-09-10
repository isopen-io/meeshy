import { useCallback, useEffect, useRef, useState } from 'react';

/** MÊME DURÉE que l'ancien `actionNotice` de `useMessageMenu` avant
 * l'unification — « Message copié » de la capture cible tient 1,5 s.
 *
 * EXPORTÉE pour que son témoin puisse l'ÉPINGLER (« la durée du produit est
 * bien 1,5 s ») sans avoir à l'ATTENDRE : attendre 1,5 s en horloge réelle
 * laissait un minuteur en vol après la dernière assertion, et sous charge le
 * `setText` d'expiration retombait hors de tout `act()` — voir #5888. */
export const ANNOUNCEMENT_DURATION_MS = 1500;

export type Announcer = {
  /** Le texte À LIRE en ce moment — `''` hors annonce, jamais `undefined` :
   * l'hôte le pose tel quel dans son UNIQUE région `role="status"`. */
  readonly text: string;
  /** Pose une annonce et réarme son propre effacement — voir le doc-comment
   * ci-dessous : n'importe quelle source peut appeler, la DERNIÈRE gagne. */
  readonly announce: (message: string) => void;
};

/**
 * LA RÉGION LIVE UNIQUE DU FIL (revue #5814, défaut majeur 9) — avant ce
 * hook, `useSend` (« Message envoyé » / « Message non envoyé ») et
 * `useMessageMenu` (« Message copié », refus de réaction, « Message
 * protégé »…) portaient chacun son PROPRE état, combinés dans
 * `routes/thread.tsx` par `announcement || messageMenu.actionNotice`. Deux
 * défauts dans ce seul `||` :
 *
 *  1. `useSend.announcement` n'était JAMAIS remis à `''` — un premier envoi
 *     réussi le fixait à « Message envoyé » pour le RESTE DE LA SESSION,
 *     masquant tout `actionNotice` derrière lui (mesuré, `recette6.mjs`) ;
 *  2. même corrigé, la source de GAUCHE aurait toujours gagné sur celle de
 *     DROITE dans la même image — un choix arbitraire entre deux annonces
 *     indépendantes, jamais « la plus récente ».
 *
 * CE HOOK REMPLACE LES DEUX ÉTATS PAR UN SEUL, possédé par l'hôte
 * (`routes/thread.tsx`) et passé en paramètre à `useSend`/`useMessageMenu` :
 * `announce()` REMPLACE inconditionnellement le texte affiché et réarme son
 * propre minuteur de {@link ANNOUNCEMENT_DURATION_MS} — la dernière source à
 * appeler est donc TOUJOURS celle qu'un lecteur d'écran entend, quelle
 * qu'elle soit. Aucune fusion à écrire ailleurs : un seul possesseur d'état,
 * jamais une seconde loi de préséance.
 *
 * `durationMs` n'existe que pour les TÉMOINS, et sa valeur par défaut est la
 * seule employée en production — aucun appelant ne la passe (`thread.tsx:233`
 * est l'unique site). Elle évite qu'un témoin ait à laisser courir 1,5 s
 * d'horloge réelle : c'est ce minuteur en vol après la dernière assertion qui
 * produisait, sous charge, une mise à jour d'état hors `act()` puis une
 * exception du scheduler React APRÈS le démontage de happy-dom (#5888).
 */
export function useLiveAnnouncer(durationMs: number = ANNOUNCEMENT_DURATION_MS): Announcer {
  const [text, setText] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback(
    (message: string) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setText(message);
      timerRef.current = setTimeout(() => setText(''), durationMs);
    },
    [durationMs],
  );

  /** LE MINUTEUR NE SURVIT PAS AU DÉMONTAGE — sans ce nettoyage, un
   * `setText('')` tardif après démontage (l'écran change avant les 1,5 s)
   * appelle un `setState` sur un composant disparu : rétention et
   * avertissement React, exactement ce que « Zero Unnecessary Re-render »
   * (CLAUDE.md § Instant App Principles) interdit. */
  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  return { text, announce };
}
