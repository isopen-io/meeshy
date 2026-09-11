import { useStore } from 'zustand/react';

import { outboxStore } from '@/lib/send/outbox-store';
import { useOnline } from '@/lib/net/online';

/**
 * **LE PORTILLON DE LA PASTILLE — bon marché, et c'est tout son intérêt** (#6080).
 *
 * La pastille de synchronisation vit dans la coquille, donc dans le chunk
 * d'ENTRÉE : tout ce qu'elle importe est téléchargé AVANT LE PREMIER PIXEL, sur
 * tous les écrans, y compris celui de connexion où elle n'a rien à dire.
 *
 * **Mesuré, pas supposé** (`scripts/measure-weight.mjs`, runtime preact, cible
 * web) : 37,15 Ko sans elle, 42,72 Ko avec — **5,57 Ko**, soit 14 % d'un budget
 * de 40 Ko, pour un objet invisible la quasi-totalité du temps. Le gate du poids
 * l'a refusée, et il avait raison : dans ce dépôt « une lenteur est un BUG, pas
 * une dette » (CLAUDE.md § Roadmap), et 1,85 s de téléchargement sur Fast 3G
 * avant le premier pixel est une lenteur.
 *
 * Ce module est donc la SEULE chose que la coquille importe en statique. Il ne
 * connaît ni glyphe, ni libellé, ni la loi de priorité : il répond à une seule
 * question — *y a-t-il quelque chose à annoncer ?* —, et c'est la réponse OUI
 * qui va chercher le reste (`lazy()`, `components/shell.tsx`).
 *
 * **Il est volontairement PLUS LARGE que la loi.** `resolveSyncPill` décide de
 * l'état exact (et peut conclure `hidden` — une ligne terminale périmée, par
 * exemple) ; ce portillon, lui, s'ouvre dès qu'il y a *matière* à décider. Un
 * portillon plus étroit que la loi cacherait une pastille que la loi voulait
 * peindre ; plus large, il charge au pire un module pour rien. L'asymétrie est
 * choisie dans le sens qui ne perd aucune annonce.
 */
export function useSyncPillArmed(): boolean {
  const online = useOnline();
  const enFile = useStore(outboxStore, (s) => Object.keys(s.entries).length > 0);
  return !online || enFile;
}
