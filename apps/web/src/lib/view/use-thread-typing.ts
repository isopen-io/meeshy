import { useEffect, type RefObject } from 'react';

import { useTypists } from '@/lib/api/use-typists';
import type { TypingEntry } from '@/lib/api/typing-store';

import { pinToBottom } from './pin-to-bottom';
import { useTypingEmitter } from './use-typing-emitter';

/**
 * L'INDICATEUR DE FRAPPE DU FIL, EXTRAIT (#6171, § 5 étape 0 de la
 * spécification) — `routes/thread.tsx` avait franchi le budget de taille
 * (950 lignes) : le bloc frappe (`useTypists`, `typist`/`typistId`,
 * `useTypingEmitter`, l'effet d'ancrage) en sort ICI, sans changer sa RÈGLE.
 *
 * `typists` — LE ROSTER ENTIER, jamais `typists[0]` (#6171, G1) : c'est
 * `thread-modes.tsx` qui compose le libellé (`typingAnnouncement`) et élit le
 * meneur (`typingLead`) pour l'affichage — ce hook ne fait que les
 * DISTRIBUER.
 *
 * L'ANCRAGE SE DÉCLENCHE À L'APPARITION, PAS AU CHANGEMENT DE MENEUR (#6171,
 * G8) — clé sur `hasTypists = typists.length > 0`, PAS sur `typistId` :
 * l'ancien code s'accrochait à l'identité du PREMIER frappeur, donc rejouait
 * l'ancrage à chaque relève de meneur (keepalive de 3 s qui remplace
 * l'entrée du magasin) ET à chaque frappeur supplémentaire (1 → 2) — la
 * cellule fait 42 px quel que soit le nombre de noms qu'elle affiche, seule
 * son APPARITION pousse le fil.
 *
 * L'INDICATEUR DE FRAPPE DOIT SE VOIR (revue-correction #5793, DOC-COMMENT
 * REPRIS EN BLOC — motif « une valeur posée sur directive ne survit que par
 * son commentaire », `CLAUDE.md` racine) — la cellule s'ajoute APRÈS le
 * dernier message, donc SOUS le bas du défileur. Mesuré au navigateur sur
 * `/c/c-deploiement` : avant la frappe le lecteur est exactement en bas
 * (`scrollHeight − clientHeight − scrollTop === 0`) ; l'apparition ajoute
 * 42 px et le laisse à 42 px du bas — la cellule tombe à y 760..802 dans un
 * scrollport qui s'arrête à 768, soit **34 de ses 42 px cachés**. Le cas
 * NOMINAL d'une conversation vivante (on est en bas) était donc celui où
 * l'indicateur ne se voyait pas. Tant que `typing` valait `true` en dur, il
 * était monté AVANT l'ancrage d'ouverture et le défaut n'existait pas : le
 * rendre réel l'a créé.
 *
 * `nearBottom` est le verdict du chrome (`use-thread-chrome-signals.ts`),
 * pas une seconde marge, et il se lit AVANT la croissance (il est calculé
 * sur `virtualizer.getTotalSize()`, que cette cellule hors `<ol>` ne change
 * pas). Un lecteur qui a remonté son historique n'est JAMAIS ramené en bas —
 * même règle que l'ancrage d'ouverture, qui s'abandonne à la première
 * intention. `pinToBottom` est la loi PARTAGÉE, et `noteProgrammaticScroll`
 * empêche ce défilement de RÉVÉLER le chrome comme le ferait un geste.
 */
export function useThreadTyping(params: {
  readonly conversationId: string;
  readonly viewerId: string;
  readonly scroller: RefObject<HTMLElement | null>;
  readonly nearBottom: boolean;
  readonly noteProgrammaticScroll: () => void;
  /** Injectable (motif `scheduleTimeout`, `api/socket.ts`) — un témoin
   * capture les appels sans dépendre de `requestAnimationFrame`. */
  readonly pin?: typeof pinToBottom;
}): { readonly typists: readonly TypingEntry[]; readonly onTextChange: (text: string) => void } {
  const { conversationId, viewerId, scroller, nearBottom, noteProgrammaticScroll } = params;
  const pin = params.pin ?? pinToBottom;

  const typists = useTypists(conversationId, viewerId);
  const onTextChange = useTypingEmitter(conversationId);

  const hasTypists = typists.length > 0;
  useEffect(() => {
    const element = scroller.current;
    if (!hasTypists || element === null || !nearBottom) return;
    const cancel = pin(element, { frames: 1, onFirstFrame: noteProgrammaticScroll });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTypists]);

  return { typists, onTextChange };
}
