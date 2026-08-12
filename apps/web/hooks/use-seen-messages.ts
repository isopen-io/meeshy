'use client';

import { useEffect, useRef } from 'react';
import { messagesService } from '@/services/conversations/messages.service';
import { SeenMessageAccumulator } from '@/utils/seen-message-accumulator';
import { logger } from '@/utils/logger';

/**
 * Détecte les messages RÉELLEMENT affichés et les rapporte au serveur.
 *
 * Le gateway ne marque plus comme lus que les messages qu'un client lui nomme.
 * Sans ce hook, la webapp n'en nomme aucun et retombe sur le chemin historique
 * par fenêtre temporelle, qui déclare lus des messages jamais montrés.
 *
 * Deux observers plutôt qu'un, parce que la liste est **virtualisée** :
 * `IntersectionObserver` dit ce qui est à l'écran, mais les bulles sont montées
 * et démontées au défilement — un balayage unique au montage n'observerait que
 * celles présentes à cet instant. `MutationObserver` suit donc les nœuds
 * entrants et sortants pour maintenir l'abonnement à jour.
 *
 * Observer les nœuds plutôt que d'ajouter un `ref` par bulle évite de toucher
 * `BubbleMessageNormalView`, dont le `ref` sert déjà au scroll-to-message : les
 * bulles portent `id="message-<id>"`, c'est suffisant. En revanche le nœud
 * rapporté par `MutationObserver` est la RACINE de la mutation, pas la bulle :
 * la liste enveloppe chaque bulle dans un `<div key>` sans `id`, d'où la
 * descente dans le sous-arbre (`forEachBubble`).
 *
 * Les messages émis par l'utilisateur lui-même ne sont pas filtrés ici : le
 * gateway les écarte déjà (`senderId: { not: participantId }`), et dupliquer
 * cette règle au client la ferait diverger tôt ou tard.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

const BUBBLE_ID_PREFIX = 'message-';
const DEFAULT_DWELL_MS = 300;
const DEFAULT_IDLE_MS = 1000;
/** Cadence de réveil : assez fine pour que le seuil de présence se déclenche. */
const TICK_MS = 250;

export type UseSeenMessagesOptions = {
  readonly containerRef: { current: HTMLElement | null };
  readonly conversationId: string | null;
  readonly dwellMs?: number;
  readonly idleMs?: number;
  /**
   * Version linguistique RÉELLEMENT affichée pour un message donné.
   *
   * Le hook ne connaît que des nœuds du DOM ; la résolution appartient à
   * l'appelant, qui détient les messages et les préférences du lecteur. Rendre
   * `null` — ou omettre la fonction — n'attribue aucune langue, ce qui vaut
   * mieux que d'en inventer une.
   *
   * Doit rester STABLE entre les rendus : elle fait partie des dépendances de
   * l'effet, une fonction recréée à chaque rendu reconstruirait les observers.
   */
  readonly resolveLanguage?: (messageId: string) => string | null;
};

function messageIdOf(node: Node): string | null {
  if (!(node instanceof HTMLElement)) return null;
  if (!node.id.startsWith(BUBBLE_ID_PREFIX)) return null;
  const id = node.id.slice(BUBBLE_ID_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * Applique `visit` à toute bulle du nœud muté : lui-même s'il en est une, ET
 * ses descendants.
 *
 * `MutationObserver` rapporte le nœud RACINE de chaque insertion/retrait, pas
 * les bulles. Or la liste enveloppe chaque `BubbleMessage` dans un
 * `<div key={message.id}>` (`messages-display.tsx`, branche virtualisée comme
 * branche simple) : le nœud inséré est ce wrapper, sans `id`, et la bulle
 * porteuse de `id="message-<id>"` n'est qu'un descendant. Ne regarder que le
 * nœud lui-même ne matchait donc JAMAIS en production.
 *
 * Un sous-arbre retiré conserve ses descendants, donc la même descente vaut
 * pour le détachement.
 */
function forEachBubble(node: Node, visit: (element: HTMLElement) => void): void {
  if (!(node instanceof HTMLElement)) return;
  if (node.id.startsWith(BUBBLE_ID_PREFIX)) visit(node);
  node.querySelectorAll<HTMLElement>(`[id^="${BUBBLE_ID_PREFIX}"]`).forEach(visit);
}

export function useSeenMessages({
  containerRef,
  conversationId,
  dwellMs = DEFAULT_DWELL_MS,
  idleMs = DEFAULT_IDLE_MS,
  resolveLanguage,
}: UseSeenMessagesOptions): void {
  // Conservé entre les rendus pour que le démontage puisse vider ce qui a été
  // acquis sans être encore parti.
  const flushRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !conversationId) return;

    const accumulator = new SeenMessageAccumulator({ dwellMs });
    const elementIds = new WeakMap<Element, string>();
    let lastActivityAt = Date.now();
    let disposed = false;

    const send = (ids: string[]) => {
      if (ids.length === 0) return;
      // La langue est résolue au moment du DÉPART, pas de l'apparition : une
      // traduction arrivée entre-temps change ce que le lecteur a sous les yeux,
      // et c'est l'état courant qui fait foi.
      const languages = resolveLanguage
        ? new Map(ids.map((id) => [id, resolveLanguage(id)]))
        : undefined;
      void messagesService.markAsRead(conversationId, ids, languages).catch((error) => {
        // Une lecture perdue n'est pas un incident bloquant : le prochain lot
        // repartira, et le serveur est write-once.
        logger.warn('[SeenMessages]', 'échec du signalement de lecture', { error });
      });
    };

    const flush = () => {
      send(accumulator.drain(Date.now()));
    };
    flushRef.current = flush;

    const intersection = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        lastActivityAt = now;
        for (const entry of entries) {
          const messageId = elementIds.get(entry.target);
          if (!messageId) continue;
          if (entry.isIntersecting) accumulator.appeared(messageId, now);
          else accumulator.disappeared(messageId, now);
        }
      },
      // Moitié visible : une bulle qui dépasse à peine du bord n'est pas lue.
      { root: container, threshold: 0.5 }
    );

    const attach = (element: HTMLElement) => {
      const messageId = messageIdOf(element);
      if (!messageId) return;
      elementIds.set(element, messageId);
      intersection.observe(element);
    };

    const detach = (element: HTMLElement) => {
      intersection.unobserve(element);
      // Sortir du DOM vaut disparition : sans cela, une bulle démontée resterait
      // « visible » pour l'accumulateur et finirait par être comptée lue.
      const messageId = elementIds.get(element);
      if (messageId) accumulator.disappeared(messageId, Date.now());
    };

    container.querySelectorAll<HTMLElement>(`[id^="${BUBBLE_ID_PREFIX}"]`).forEach(attach);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes?.forEach?.((node) => forEachBubble(node, attach));
        record.removedNodes?.forEach?.((node) => forEachBubble(node, detach));
      }
    });
    mutations.observe(container, { childList: true, subtree: true });

    // Un intervalle plutôt qu'un timer par bulle : le seuil de présence doit se
    // déclencher même quand plus aucun événement n'arrive (utilisateur immobile).
    const tick = setInterval(() => {
      if (disposed) return;
      const now = Date.now();
      if (accumulator.isBatchReady(now) || now - lastActivityAt >= idleMs) {
        lastActivityAt = now;
        flush();
      }
    }, TICK_MS);

    // Onglet masqué : l'utilisateur part, ce qui est acquis doit partir aussi.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      mutations.disconnect();
      intersection.disconnect();
      // Fermer la conversation ne doit pas perdre une lecture déjà acquise.
      flush();
      flushRef.current = null;
    };
  }, [containerRef, conversationId, dwellMs, idleMs, resolveLanguage]);
}
