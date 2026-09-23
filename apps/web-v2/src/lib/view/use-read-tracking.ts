import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { useModalLayersOpen } from './modal-layers';

/**
 * `useReadTracking` (#7201, W1) — « ouvrir un fil, le faire défiler et
 * revenir au premier plan marquent la conversation lue », EXTRAIT de
 * `routes/thread.tsx` (budget de taille, CLAUDE.md § Code Style — le fichier
 * touchait déjà 1126 lignes, motif `use-older-messages.ts` :
 * « le fil réutilisera ce hook » appliqué une fois de plus à ce nouveau
 * besoin).
 *
 * ## LA SENTINELLE, PAS LA RANGÉE
 *
 * Le fil est virtualisé (`@tanstack/react-virtual`, `routes/thread-modes.tsx`) :
 * les `<li>` montent et démontent au défilement, donc observer directement la
 * rangée du dernier message obligerait à réobserver à chaque mesure. La
 * sentinelle est le MÊME motif que celle de l'historique
 * (`use-older-messages.ts` + `use-load-more-sentinel.ts`), en SYMÉTRIE : une
 * prise d'un pixel posée après la dernière rangée plutôt qu'avant la
 * première — « le dernier message devient visible » se lit donc comme « le
 * bas du contenu défilable entre dans le cadre », la lecture la plus simple
 * du critère compatible avec la virtualisation existante.
 *
 * Cet hook n'appelle PAS le réseau lui-même : `onMark` est le seul point de
 * sortie (motif `fetchOlder` d'`useOlderMessages`), câblé par l'écran vers
 * `markCaughtUp` (`lib/api/receipts.ts`) — la discipline optimiste vit LÀ,
 * jamais ici.
 *
 * ## DEUX DÉCLENCHEURS, UNE SEULE TENTATIVE
 *
 * 1. **`IntersectionObserver`** — la sentinelle entre dans le cadre.
 * 2. **`visibilitychange`/`focus`** — la fenêtre revient au premier plan
 *    ALORS QUE la sentinelle est DÉJÀ visible (elle n'a pas bougé pendant que
 *    l'onglet était caché, donc l'observateur ne rejoue rien tout seul).
 *
 * ## LE TROISIÈME REFUS — LA COUCHE QUI RECOUVRE (W14, #7372)
 *
 * La sentinelle reste « intersectante » sous une visionneuse plein écran ou
 * une feuille : l'`IntersectionObserver` ne connaît que la géométrie du
 * défilement, jamais ce qui est posé PAR-DESSUS. Agrandir une photo marquait
 * donc lu le fil qu'elle cache. Le refus se lit dans le registre partagé
 * (`modal-layers.ts`), alimenté par `useBackDismiss` — l'unique passage de
 * toute couche modale — et NON dans un booléen que l'écran calculerait :
 * `routes/thread.tsx` ne connaît pas l'état de la visionneuse, ouverte par
 * `components/attachment-blocks.tsx`.
 *
 * Refuser n'est pas OUBLIER : la frontière n'est jamais consommée tant que le
 * refus tient, et la fermeture de la dernière couche REJOUE la tentative —
 * sans quoi le fil resterait non lu jusqu'au prochain geste.
 *
 * Les deux déclencheurs passent par la MÊME tentative (`attemptMark`), qui
 * refuse tant que
 * `document.visibilityState === 'hidden'` (« jamais quand la fenêtre est
 * cachée », critère de fin #7201) et déduplique par FRONTIÈRE
 * (`caughtUpToMessageId`) : un ref retient la dernière frontière envoyée, une
 * frontière déjà envoyée ne repart jamais — qu'elle vienne d'un second
 * défilement dans le même message ou d'un second retour au premier plan.
 */
export type ReadTracking = {
  /** À poser sur la SENTINELLE, en queue du contenu défilable (`ref={sentinelRef}`). */
  readonly sentinelRef: (node: Element | null) => void;
};

export function useReadTracking(params: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly conversationId: string | undefined;
  /** Le dernier message CONFIRMÉ — jamais un envoi optimiste encore local,
   * que le serveur ne connaît pas. */
  readonly lastMessageId: string | undefined;
  /** `false` ⇒ AUCUN observateur n'est posé — un fil vide ne doit rien
   * observer (même garde que `useOlderMessages`, `rowCount`). */
  readonly enabled: boolean;
  readonly onMark: (conversationId: string, caughtUpToMessageId: string) => void;
}): ReadTracking {
  const { scroller, conversationId, lastMessageId, enabled, onMark } = params;

  const modalLayersOpen = useModalLayersOpen();

  const [target, setTarget] = useState<Element | null>(null);
  const intersectingRef = useRef(false);
  const sentBoundaryRef = useRef<string | null>(null);

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const lastMessageIdRef = useRef(lastMessageId);
  lastMessageIdRef.current = lastMessageId;
  const onMarkRef = useRef(onMark);
  onMarkRef.current = onMark;
  // Un REF, pas une dépendance : `attemptMark` reste stable, donc
  // l'`IntersectionObserver` n'est pas désabonné puis réarmé à chaque
  // ouverture de couche (Zero Unnecessary Re-render). La REPRISE a son propre
  // effet, ci-dessous.
  const modalLayersOpenRef = useRef(modalLayersOpen);
  modalLayersOpenRef.current = modalLayersOpen;

  const attemptMark = useCallback(() => {
    if (!intersectingRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (modalLayersOpenRef.current) return;
    const conversation = conversationIdRef.current;
    const boundary = lastMessageIdRef.current;
    if (conversation === undefined || boundary === undefined) return;
    if (sentBoundaryRef.current === boundary) return;
    sentBoundaryRef.current = boundary;
    onMarkRef.current(conversation, boundary);
  }, []);

  useEffect(() => {
    if (!enabled || target === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        intersectingRef.current = entry.isIntersecting;
        if (entry.isIntersecting) attemptMark();
      },
      { root: scroller.current, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, target, scroller, attemptMark]);

  // La FRONTIÈRE avance (nouveau dernier message CONFIRMÉ) : retenter sans
  // réabonner l'observateur — `attemptMark` fait déjà rien si la sentinelle
  // ne montre plus le bas du fil.
  useEffect(() => {
    attemptMark();
  }, [lastMessageId, attemptMark]);

  // La DERNIÈRE couche modale se referme : le fil redevient lisible, et la
  // frontière retenue pendant le recouvrement part enfin (la sentinelle n'a
  // pas bougé sous la couche, donc l'observateur ne rejouerait rien seul).
  useEffect(() => {
    if (modalLayersOpen) return;
    attemptMark();
  }, [modalLayersOpen, attemptMark]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      attemptMark();
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, [attemptMark]);

  const sentinelRef = useCallback((node: Element | null) => setTarget(node), []);
  return { sentinelRef };
}
