import { useEffect, useState } from 'react';

import {
  fetchProtectedObjectUrl,
  isProtectedMediaSrc,
  protectedMediaDeps,
  type ProtectedMediaDeps,
  type ProtectedMediaUnavailableReason,
} from './protected-media';

/**
 * CE QUE `useProtectedMediaSrc` REND — revue-correction #7015 (défaut 2).
 *
 * `src` est la source POSABLE en `<audio src>` (ou tout élément média) : la
 * source reçue telle quelle si elle n'exige aucune identité, une URL d'objet
 * une fois résolue, ou `null` tant qu'elle n'est pas prête / si elle ne l'est
 * jamais. `reason` n'est non-`null` QUE dans ce dernier cas — un refus, une
 * absence, une coupure réseau ou un rendu sans identité rendaient auparavant
 * le MÊME `null` muet ; un appelant qui doit DIRE pourquoi (dessiner un état,
 * remonter à la télémétrie) lit `reason` plutôt que de retraiter `null` comme
 * une absence de piste.
 */
export type UseProtectedMediaSrcResult = {
  readonly src: string | null;
  readonly reason: ProtectedMediaUnavailableReason | null;
};

const PENDING: UseProtectedMediaSrcResult = { src: null, reason: null };

/**
 * `useProtectedMediaSrc` (#7015) — LA SOURCE QU'UN ÉLÉMENT MÉDIA PEUT POSER.
 *
 * Rend la source TELLE QUELLE quand elle n'exige aucune identité — le cas de
 * l'écrasante majorité des médias (pièces jointes, `blob:`, `data:`), et cela
 * SYNCHRONEMENT : aucun rendu supplémentaire, aucune fenêtre sans son.
 *
 * Pour la seule route protégée (`/api/v1/static/`), rend `{ src: null, reason:
 * null }` d'abord (en attente), puis `{ src: url, reason: null }` une fois les
 * octets obtenus, ou `{ src: null, reason }` — POUR TOUJOURS — si la
 * passerelle refuse, si le fichier a disparu ou si le réseau tombe. Un
 * appelant qui n'a besoin que de la source continue de lire `src` comme avant
 * (`null` ⇒ « pas de son ») ; un appelant qui doit DÉGRADER visiblement lit
 * `reason` en plus.
 *
 * L'URL d'objet est RÉVOQUÉE au démontage et à chaque changement de source —
 * sans quoi les octets d'une piste restent en mémoire pour toute la vie du
 * document (dimension 3, `CLAUDE.md` § Roadmap). Le lecteur de story remonte
 * la piste à chaque tour de boucle (`key` de l'appelant) : la fuite serait
 * proportionnelle au temps passé sur l'écran.
 */
export function useProtectedMediaSrc(src: string, deps: ProtectedMediaDeps = protectedMediaDeps): UseProtectedMediaSrcResult {
  const protege = isProtectedMediaSrc(src);
  const [resolved, setResolved] = useState<UseProtectedMediaSrcResult>(PENDING);

  useEffect(() => {
    if (!protege) return;
    let objectUrl: string | null = null;
    let abandonne = false;
    // `.catch` OBLIGATOIRE sur une promesse détachée (`CLAUDE.md` § `void p`) :
    // `fetchProtectedObjectUrl` ne rejette jamais, mais le rappel ci-dessous
    // s'exécute HORS du `try` de React, et un rejet sans écouteur est
    // exactement ce que #7015 vient supprimer de la console.
    void fetchProtectedObjectUrl(src, deps)
      .then((result) => {
        if (abandonne) {
          if (result.kind === 'ready') deps.revokeObjectURL(result.url);
          return;
        }
        if (result.kind === 'ready') {
          objectUrl = result.url;
          setResolved({ src: result.url, reason: null });
        } else {
          setResolved({ src: null, reason: result.reason });
        }
      })
      .catch(() => undefined);
    return () => {
      abandonne = true;
      setResolved(PENDING);
      if (objectUrl !== null) deps.revokeObjectURL(objectUrl);
    };
  }, [src, protege, deps]);

  return protege ? resolved : { src, reason: null };
}
