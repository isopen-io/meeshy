/**
 * Read receipts never walk backwards.
 *
 * Two writers feed `messageReadStatuses` / `readStatusSummaries`, and only one
 * of them is ordered:
 *
 *  - the SOCKET (`presence.service.ts` → `updateReadStatusSummary`) — ordered
 *    per connection, always the freshest thing the server knows;
 *  - the REST BATCH (`use-conversation-messages-rq.ts` →
 *    `messagesService.getReadStatuses(...).then(updateMessageReadStatusBatch)`)
 *    — a SNAPSHOT taken when the request left, applied whenever it comes back.
 *
 * The batch is re-fired every time the user sends a message (its `batchFetched`
 * key is keyed on the latest own message id), so the window is not a cold-start
 * curiosity: send a message, a peer reads an earlier one while the request is in
 * flight, and the snapshot lands last carrying `readCount: 0`.
 *
 * `DeliveryIndicator` renders `readCount > 0` as BLUE double checks and
 * `readCount === 0 && deliveredCount > 0` as GREY ones, so losing that race is
 * visible: the ticks go blue, then back to grey, and stay wrong until the next
 * receipt happens to arrive.
 *
 * `totalMembers` is the discriminator that keeps this from freezing the counts
 * forever: receipts are grow-only only for a FIXED membership. When it moves,
 * the incoming snapshot describes a different conversation and wins outright.
 */

import { act } from '@testing-library/react';
import { useConversationUIStore } from '../../stores/conversation-ui-store';

const CONV = 'conv-1';
const MSG = 'msg-1';

const summary = (totalMembers: number, deliveredCount: number, readCount: number) =>
  ({ totalMembers, deliveredCount, readCount });

beforeEach(() => {
  act(() => {
    useConversationUIStore.setState({
      readStatusSummaries: {},
      messageReadStatuses: {},
      latestOwnMessageIds: {},
    });
  });
});

describe('read receipts are monotonic', () => {
  describe('updateMessageReadStatusBatch', () => {
    it('does not let a late REST snapshot un-read a message the socket already reported read', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(2, 1, 1));
        // The snapshot left before the peer read, and lands after.
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          [MSG]: summary(2, 1, 0),
        });
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(2, 1, 1));
    });

    it('does not let a late snapshot un-deliver a message', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(3, 2, 0));
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          [MSG]: summary(3, 1, 0),
        });
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(3, 2, 0));
    });

    it('applies a snapshot that moves receipts FORWARD', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(2, 1, 0));
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          [MSG]: summary(2, 2, 1),
        });
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(2, 2, 1));
    });

    it('applies a snapshot for a message it has never seen', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          [MSG]: summary(2, 1, 0),
        });
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(2, 1, 0));
    });

    it('accepts lower counts when membership changed — a smaller group is a new reality, not a stale read', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(5, 4, 3));
        // Two members left: the server recomputes against the survivors.
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          [MSG]: summary(3, 2, 1),
        });
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(3, 2, 1));
    });

    it('rejects only the regressing entries of a batch, never its whole payload', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus('stale', summary(2, 1, 1));
        useConversationUIStore.getState().updateMessageReadStatusBatch({
          stale: summary(2, 1, 0),
          fresh: summary(2, 1, 1),
        });
      });

      const statuses = useConversationUIStore.getState().messageReadStatuses;
      expect(statuses.stale).toEqual(summary(2, 1, 1));
      expect(statuses.fresh).toEqual(summary(2, 1, 1));
    });
  });

  describe('updateReadStatusSummary', () => {
    it('ignores a conversation-level receipt that walks the counts backwards', () => {
      act(() => {
        useConversationUIStore.getState().updateReadStatusSummary(CONV, summary(2, 2, 2));
        useConversationUIStore.getState().updateReadStatusSummary(CONV, summary(2, 2, 1));
      });

      expect(useConversationUIStore.getState().readStatusSummaries[CONV]).toEqual(summary(2, 2, 2));
    });

    it('mirrors onto the latest own message only when that message would not regress', () => {
      act(() => {
        useConversationUIStore.getState().setLatestOwnMessageId(CONV, MSG);
        // The per-message REST truth is ahead of the conversation-level one.
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(2, 2, 2));
        useConversationUIStore.getState().updateReadStatusSummary(CONV, summary(2, 1, 0));
      });

      const state = useConversationUIStore.getState();
      expect(state.readStatusSummaries[CONV]).toEqual(summary(2, 1, 0));
      expect(state.messageReadStatuses[MSG]).toEqual(summary(2, 2, 2));
    });

    it('still mirrors forward progress onto the latest own message', () => {
      act(() => {
        useConversationUIStore.getState().setLatestOwnMessageId(CONV, MSG);
        useConversationUIStore.getState().updateReadStatusSummary(CONV, summary(2, 1, 1));
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(2, 1, 1));
    });
  });

  describe('updateMessageReadStatus', () => {
    it('ignores a per-message receipt that walks the counts backwards', () => {
      act(() => {
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(4, 3, 2));
        useConversationUIStore.getState().updateMessageReadStatus(MSG, summary(4, 3, 1));
      });

      expect(useConversationUIStore.getState().messageReadStatuses[MSG]).toEqual(summary(4, 3, 2));
    });
  });
});
