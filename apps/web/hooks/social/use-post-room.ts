/**
 * Hook usePostRoom - Join/leave a post's real-time room over Socket.IO.
 *
 * The gateway broadcasts content-scoped social events to `ROOMS.post(postId)`:
 *   - `comment:added` / `comment:deleted` (for viewers who are NOT friends of
 *     the author, e.g. a PUBLIC post / reel / story detail)
 *   - `post:reaction-added` / `post:reaction-removed` (detailed emoji reactions)
 *   - `comment:reaction-added` / `comment:reaction-removed`
 *   - `story:reacted` / `status:reacted` (room viewers)
 *
 * Membership of `feed:{userId}` alone (see `useSocialSocket`) only covers the
 * author and their friends. A viewer opening someone else's post must also join
 * the post room or those events never arrive — the cache patchers in
 * `usePostSocketCacheSync` then never fire. iOS already does this via
 * `SocialSocketManager.joinPostRoom`; this hook brings web to parity.
 *
 * Mount/`postId` change → `post:join`. Unmount/`postId` change → `post:leave`.
 * The join is re-emitted on socket `connect` so a reconnect re-establishes
 * room membership (mirrors the iOS `.connect` re-join).
 *
 * @module hooks/social/use-post-room
 */

'use client';

import { useEffect } from 'react';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

export interface UsePostRoomOptions {
  /** When false the hook skips joining. Defaults to true. */
  enabled?: boolean;
}

export function usePostRoom(
  postId: string | null | undefined,
  options: UsePostRoomOptions = {},
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled || !postId) return;

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    const join = () => socket.emit(CLIENT_EVENTS.JOIN_POST, { postId });

    join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      socket.emit(CLIENT_EVENTS.LEAVE_POST, { postId });
    };
  }, [enabled, postId]);
}
