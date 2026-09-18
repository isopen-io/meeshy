import { useEffect, useState } from 'react';

import {
  fetchProtectedObjectUrl,
  isProtectedMediaSrc,
  protectedMediaDeps,
  type ProtectedMediaDeps,
} from './protected-media';

/**
 * `useProtectedMediaSrc` (#7015) — LA SOURCE QU'UN ÉLÉMENT MÉDIA PEUT POSER.
 *
 * Rend la source TELLE QUELLE quand elle n'exige aucune identité — le cas de
 * l'écrasante majorité des médias (pièces jointes, `blob:`, `data:`), et cela
 * SYNCHRONEMENT : aucun rendu supplémentaire, aucune fenêtre sans son.
 *
 * Pour la seule route protégée (`/api/v1/static/`), rend `null` d'abord, puis
 * l'URL d'OBJET une fois les octets obtenus — et `null` POUR TOUJOURS si la
 * passerelle refuse, si le fichier a disparu ou si le réseau tombe. Un
 * appelant lit donc `null` comme « pas de son », jamais comme « attends
 * encore » : c'est la dégradation propre exigée par #7015, et elle n'a qu'une
 * forme.
 *
 * L'URL d'objet est RÉVOQUÉE au démontage et à chaque changement de source —
 * sans quoi les octets d'une piste restent en mémoire pour toute la vie du
 * document (dimension 3, `CLAUDE.md` § Roadmap). Le lecteur de story remonte
 * la piste à chaque tour de boucle (`key` de l'appelant) : la fuite serait
 * proportionnelle au temps passé sur l'écran.
 */
export function useProtectedMediaSrc(src: string, deps: ProtectedMediaDeps = protectedMediaDeps): string | null {
  const protege = isProtectedMediaSrc(src);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!protege) return;
    let objectUrl: string | null = null;
    let abandonne = false;
    // `.catch` OBLIGATOIRE sur une promesse détachée (`CLAUDE.md` § `void p`) :
    // `fetchProtectedObjectUrl` ne rejette jamais, mais le rappel ci-dessous
    // s'exécute HORS du `try` de React, et un rejet sans écouteur est
    // exactement ce que #7015 vient supprimer de la console.
    void fetchProtectedObjectUrl(src, deps)
      .then((url) => {
        if (abandonne) {
          if (url !== null) deps.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setResolved(url);
      })
      .catch(() => undefined);
    return () => {
      abandonne = true;
      setResolved(null);
      if (objectUrl !== null) deps.revokeObjectURL(objectUrl);
    };
  }, [src, protege, deps]);

  return protege ? resolved : src;
}
