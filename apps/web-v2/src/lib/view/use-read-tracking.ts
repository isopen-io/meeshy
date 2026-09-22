import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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
 * ## DEUX DÉCLENCHEURS, UNE SEULE GARDE
 *
 * 1. **`IntersectionObserver`** — la sentinelle entre dans le cadre.
 * 2. **`visibilitychange`/`focus`** — la fenêtre revient au premier plan
 *    ALORS QUE la sentinelle est DÉJÀ visible (elle n'a pas bougé pendant que
 *    l'onglet était caché, donc l'observateur ne rejoue rien tout seul).
 *
 * Les deux passent par la MÊME tentative (`attemptMark`), qui refuse tant que
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
  /** `true` ⇒ une feuille de détail ou de réactions est ouverte au-dessus du
   * fil ; le suivi de lecture est suspendu en attendant que l'utilisateur
   * la referme (W14 #7372). */
  readonly isModalOpen?: boolean;
  readonly onMark: (conversationId: string, caughtUpToMessageId: string) => void;
}): ReadTracking {
  const { scroller, conversationId, lastMessageId, enabled, isModalOpen, onMark } = params;

  const [target, setTarget] = useState<Element | null>(null);
  const intersectingRef = useRef(false);
  const sentBoundaryRef = useRef<string | null>(null);

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const lastMessageIdRef = useRef(lastMessageId);
  lastMessageIdRef.current = lastMessageId;
  const onMarkRef = useRef(onMark);
  onMarkRef.current = onMark;

  const attemptMark = useCallback(() => {
    if (!intersectingRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (isModalOpen) return;
    const conversation = conversationIdRef.current;
    const boundary = lastMessageIdRef.current;
    if (conversation === undefined || boundary === undefined) return;
    if (sentBoundaryRef.current === boundary) return;
    sentBoundaryRef.current = boundary;
    onMarkRef.current(conversation, boundary);
  }, [isModalOpen]);

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
