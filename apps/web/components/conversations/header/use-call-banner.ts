import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCallStore } from '@/stores/call-store';
import { useUser } from '@/stores';
import { isUserAnonymous } from '@/utils/auth';
import { callsService } from '@/services/calls.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';

/**
 * `currentCall`/`isInCall` (`useCallStore`) only ever describe a call THIS
 * client is already part of — every write site (`CallManager.handleIncomingCall`,
 * `acceptOrJoinCall`, `use-video-call.ts`'s `startCall`) sets both together, so
 * `currentCall && !isInCall` is unreachable by construction. A conversation
 * member who is not yet in the call — the only person this banner exists to
 * help — never gets a `currentCall` at all (they never received, or already
 * dismissed, the `call:initiated` ring). The one data source that actually
 * answers "is a call live in this conversation" independently of whether the
 * viewer joined it is the same REST endpoint the live-bubble join path
 * (`CallSystemMessage` → `requestJoin`) already revalidates against.
 */
const ACTIVE_CALL_POLL_MS = 15_000;

export function useCallBanner(conversationId: string) {
  const isInCall = useCallStore((s) => s.isInCall);
  const requestJoin = useCallStore((s) => s.requestJoin);
  // Gateway route backing this poll requires full auth (`allowAnonymous:
  // false`, see `calls.service.ts`) — an anonymous viewer can never get a
  // 200 here. Left ungated, every conversation header polled it every 15s
  // for the lifetime of the page, each call a guaranteed 401 that also
  // burns against the route's 10/min rate limit for nothing.
  const isAnonymous = isUserAnonymous(useUser());
  const [callDuration, setCallDuration] = useState(0);
  const [dismissedCallId, setDismissedCallId] = useState<string | null>(null);

  const { data: activeCall } = useQuery({
    queryKey: queryKeys.calls.active(conversationId),
    queryFn: async () => {
      const response = await callsService.getActiveCall(conversationId);
      return response.success ? (response.data ?? null) : null;
    },
    enabled: !!conversationId && !isAnonymous,
    refetchInterval: ACTIVE_CALL_POLL_MS,
  });

  // Only ever true for a call the viewer has NOT joined — once they join,
  // `isInCall` flips and the full-screen VideoCallInterface takes over; the
  // banner has nothing left to offer and must not compete with it.
  const hasActiveCall =
    !!activeCall &&
    activeCall.conversationId === conversationId &&
    !CALL_TERMINAL_STATUSES.includes(activeCall.status) &&
    !isInCall;
  const showCallBanner = hasActiveCall && activeCall.id !== dismissedCallId;

  useEffect(() => {
    if (!showCallBanner) {
      setCallDuration(0);
      return;
    }

    // Vague 110 anchored the visible call clock on `answeredAt` (falls back
    // to `startedAt` pre-answer) — same reasoning applies here: a call still
    // ringing hasn't been "in progress" for the time since it was dialed.
    const anchor = activeCall.answeredAt ?? activeCall.startedAt;
    if (!anchor) {
      setCallDuration(0);
      return;
    }

    const updateDuration = () => {
      const start = new Date(anchor);
      setCallDuration(Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000)));
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [showCallBanner, activeCall?.answeredAt, activeCall?.startedAt]);

  const handleJoinCall = useCallback(() => {
    if (!activeCall) return;
    // `metadata.type` is the only whitelisted REST source of the call's
    // audio/video nature (Vague 115) — `participants[].isVideoEnabled` is
    // mutable media state (camera mute), not the call's nature, and was
    // always `false` here anyway since the REST schema never carried it in
    // the first place, silently forcing every join through this banner into
    // audio-only.
    const callType = activeCall.metadata?.type === 'video' ? 'video' : 'audio';
    requestJoin({ callId: activeCall.id, conversationId, callType });
  }, [activeCall, conversationId, requestJoin]);

  const handleDismissCallBanner = useCallback(() => {
    if (activeCall) setDismissedCallId(activeCall.id);
  }, [activeCall]);

  return {
    currentCall: activeCall ?? null,
    callDuration,
    showCallBanner,
    handleJoinCall,
    handleDismissCallBanner,
  };
}
