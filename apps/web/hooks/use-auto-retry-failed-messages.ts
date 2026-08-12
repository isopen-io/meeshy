'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnectionStatus } from '@/hooks/use-connection-status';
import { useFailedMessagesStore, type FailedMessage } from '@/stores/failed-messages-store';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

/**
 * `meeshySocketIOService.sendMessage` resolves with a `MessageAckResponse` and
 * NEVER rejects: socket absent, ack timeout, orchestrator queue full or expired,
 * encryption failure and server-side errors all resolve `{ success: false }`.
 * Delivery therefore has to be read off `success` — a resolved promise proves
 * nothing. The rejection branch is kept purely defensively so one unexpected
 * throw cannot abort the whole queue.
 */
async function attemptSend(msg: FailedMessage): Promise<boolean> {
  try {
    const ack = await meeshySocketIOService.sendMessage(
      msg.conversationId,
      msg.content,
      msg.originalLanguage,
      msg.replyToId,
      undefined,
      msg.attachmentIds?.length ? msg.attachmentIds : undefined,
      undefined,
      msg.clientMessageId,
    );
    return ack?.success === true;
  } catch {
    return false;
  }
}

/** Work the queue still owes an attempt to, read fresh rather than off a snapshot. */
function hasRetryableWork(): boolean {
  return useFailedMessagesStore
    .getState()
    .failedMessages.some(m => m.retryCount < MAX_RETRY_COUNT);
}

/**
 * Replays messages whose send failed, once the connection can actually carry
 * them.
 *
 * The trigger is `isReady` (`isOnline && isSocketConnected`) rather than
 * `navigator.onLine`: when the network comes back, the `online` event fires
 * seconds before the Socket.IO handshake completes, and at cold start the tab is
 * already "online" while the socket is still connecting. Gating on browser
 * connectivity alone and reading socket readiness imperatively — as this hook
 * previously did — meant the guard could only ever be evaluated too early, and
 * nothing re-ran the effect afterwards, so a queue restored from localStorage
 * was never replayed for the whole session.
 */
export function useAutoRetryFailedMessages() {
  const { isReady } = useConnectionStatus();
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const activeRun = useRef<{ started: boolean } | null>(null);
  const [rearm, setRearm] = useState(0);

  useEffect(() => {
    if (!isReady || activeRun.current) return;

    const store = useFailedMessagesStore.getState();
    const retryable = store.failedMessages.filter(m => m.retryCount < MAX_RETRY_COUNT);

    if (retryable.length === 0) return;

    // Ownership token rather than a bare boolean. `clearTimeout` cannot stop a
    // loop that already started and is awaiting an ack, so the slot must be
    // released by the loop itself — a cleanup that cleared a shared flag let a
    // re-run of the effect pass the guard and start a SECOND loop over the same
    // snapshot: double `retryCount`, duplicate sends. The cleanup may only
    // release a run whose loop has not started yet.
    const run = { started: false };
    activeRun.current = run;

    const retrySequential = async () => {
      let drained = false;
      try {
        for (const msg of retryable) {
          // Readiness is re-read from a ref, not captured: a flush interrupted
          // by the connection dropping must stop rather than burn the remaining
          // messages' retry budget on sends that can only fail.
          if (!isReadyRef.current) return;

          store.incrementRetryCount(msg.id);

          const delivered = await attemptSend(msg);
          if (delivered) {
            store.removeFailedMessage(msg.id);
          } else if (msg.retryCount + 1 >= MAX_RETRY_COUNT) {
            store.updateFailedMessage(msg.id, { error: 'Max retries exceeded' });
          }

          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
        drained = true;
      } finally {
        if (activeRun.current === run) activeRun.current = null;
        // A run holds the only reference to the work it did not finish, and
        // nothing else will schedule the remainder: `isReady` is already `true`,
        // so no dependency changes again until the connection drops. Two ways to
        // finish with work outstanding, both re-armed here:
        //
        //  - the run stopped early (readiness flapped mid-flush), leaving its
        //    own snapshot unconsumed;
        //  - the run drained its snapshot, but the queue still owes attempts —
        //    messages that failed again and are still inside MAX_RETRY_COUNT, or
        //    messages queued after the snapshot was taken. Without this, the
        //    budget could only ever be spent one attempt per reconnect: on a
        //    connection that never drops, a message got a single retry and then
        //    sat there untried, neither delivered nor marked exhausted.
        //
        // This cannot spin: every sweep increments `retryCount` for every
        // message it attempts, so each pass strictly shrinks the remaining
        // budget, and `hasRetryableWork` goes false after MAX_RETRY_COUNT passes
        // at the latest. Nothing here is driven by wall time.
        if (!drained || hasRetryableWork()) setRearm(v => v + 1);
      }
    };

    const timeout = setTimeout(() => {
      run.started = true;
      void retrySequential();
    }, RETRY_DELAY_MS);

    return () => {
      clearTimeout(timeout);
      if (!run.started && activeRun.current === run) activeRun.current = null;
    };
  }, [isReady, rearm]);
}
