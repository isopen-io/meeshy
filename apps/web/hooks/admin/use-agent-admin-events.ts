/**
 * Hook useAgentAdminEvents — push temps réel du dashboard admin agent.
 *
 * S'abonne à la room Socket.IO `admin:agent` (rôle vérifié côté serveur) et
 * écoute `agent:admin-event` relayé depuis le canal Redis du même nom
 * (mutations de la delivery queue, scans, configs — service agent + gateway).
 *
 * Remplace les pollings courts : le composant garde son fetch initial et
 * fournit `onChange` (refetch REST ciblé), déclenché de manière debouncée
 * quand un event correspond aux `kinds` (et au `conversationId` si fourni).
 * Au reconnect socket, le hook se réabonne et force un resync.
 *
 * @module hooks/admin/use-agent-admin-events
 */

'use client';

import { useEffect, useRef } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AgentAdminEventData,
  type AgentAdminEventKind,
} from '@meeshy/shared/types/socketio-events';

export interface UseAgentAdminEventsOptions {
  /** Kinds d'events qui déclenchent un refetch. */
  kinds: readonly AgentAdminEventKind[];
  /** Si fourni, seuls les events de cette conversation (ou globaux) déclenchent. */
  conversationId?: string;
  /** Refetch REST ciblé — appelé au plus une fois par fenêtre de debounce. */
  onChange: () => void;
  /** Fenêtre de coalescence des bursts d'events. */
  debounceMs?: number;
  /** Quand false, aucun abonnement. Defaults to true. */
  enabled?: boolean;
}

export function useAgentAdminEvents(options: UseAgentAdminEventsOptions): void {
  const { enabled = true, debounceMs = 400 } = options;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const kindsKey = [...options.kinds].sort().join(',');

  useEffect(() => {
    if (!enabled) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function scheduleChange(): void {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        optionsRef.current.onChange();
      }, debounceMs);
    }

    function handleAdminEvent(data: AgentAdminEventData): void {
      const { kinds, conversationId } = optionsRef.current;
      if (!kinds.includes(data.kind)) return;
      if (conversationId && data.conversationId && data.conversationId !== conversationId) return;
      scheduleChange();
    }

    function subscribe(): void {
      socket?.emit(CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE, () => {});
    }

    function handleReconnect(): void {
      subscribe();
      scheduleChange();
    }

    subscribe();
    socket.on(SERVER_EVENTS.AGENT_ADMIN_EVENT, handleAdminEvent);
    socket.on('connect', handleReconnect);

    return () => {
      if (timer) clearTimeout(timer);
      socket.emit(CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE);
      socket.off(SERVER_EVENTS.AGENT_ADMIN_EVENT, handleAdminEvent);
      socket.off('connect', handleReconnect);
    };
  }, [enabled, debounceMs, kindsKey, options.conversationId]);
}
