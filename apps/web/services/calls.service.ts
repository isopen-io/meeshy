import { apiService } from './api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type { CallSession } from '@meeshy/shared/types/video-call';

/**
 * REST client for call session queries.
 *
 * `getActiveCall` backs the cold-rehydration join path (live call bubble →
 * `useCallStore.requestJoin` → CallManager): it revalidates that the call is
 * STILL active before any media is acquired, with no dependency on a
 * previously received `call:initiated` socket event — a page reloaded
 * mid-call can therefore still join. Gateway route:
 * `GET /conversations/:conversationId/active-call` (auth required, anonymous
 * users refused, rate-limited 10/min). `data` is `null` when no call is
 * active in the conversation.
 */
class CallsService {
  async getActiveCall(conversationId: string): Promise<ApiResponse<CallSession | null>> {
    return apiService.get<CallSession | null>(`/conversations/${conversationId}/active-call`);
  }

  /**
   * Remove a participant from an active call. `userId` must be the caller's
   * own id (self-leave) or the caller must hold moderator/admin rights in
   * the conversation (kick) — the gateway is the sole authority on this,
   * this client makes no assumption about who's allowed to call it.
   *
   * Gateway route: `DELETE /calls/:callId/participants/:userId`. On success
   * the gateway broadcasts `CALL_EVENTS.PARTICIPANT_LEFT` to every other
   * participant's socket (fixed 2026-08-15, see
   * `tasks/2026-08-13-group-calls-gap-analysis.md`) — the existing
   * `SERVER_EVENTS.CALL_PARTICIPANT_LEFT` listener in `VideoCallInterface`
   * already tears down the removed participant's stream/peer connection for
   * everyone, this call has nothing further to reconcile locally.
   */
  async removeParticipant(callId: string, userId: string): Promise<ApiResponse<CallSession>> {
    return apiService.delete<CallSession>(`/calls/${callId}/participants/${userId}`);
  }
}

export const callsService = new CallsService();
