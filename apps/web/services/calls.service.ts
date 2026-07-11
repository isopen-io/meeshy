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
}

export const callsService = new CallsService();
