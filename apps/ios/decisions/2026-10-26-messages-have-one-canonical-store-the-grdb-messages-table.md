## 2026-10-26 : Messages have one canonical store, the GRDB `messages` table; `ConversationStore` holds conversations, not messages (#13141)

**Question.** The iOS audit of 2026-10-26 left open which of `MessageStore`, `ConversationSyncEngine` and `ConversationStore` is the source of truth for messages.

**Trace.**

| type | where | what it holds | role |
|---|---|---|---|
| GRDB `messages` table (`MessageRecord`) | `MessagePersistenceActor` (SDK), one database per account (`MessageStoreRouter`, `MessageStoreSession`, #8656) | every message row, offline-readable | **canonical store of messages** |
| `MessageStore` | `apps/ios/Meeshy/Features/Main/Stores/MessageStore.swift` | the WINDOW of the open conversation, observed from GRDB (`fetchMessageWindow`, `loadInitialSnapshot`) | read model of the conversation screen, never a second store |
| `ConversationSyncEngine` | `packages/MeeshySDK/Sources/MeeshySDK/Sync/` | no message rows of its own in GRDB; fetches REST pages and socket events and hands them to the host through `apiMessagePersistor` / `realtimeMessagePersistor` | **synchroniser**: it moves messages into the canonical store |
| `ConversationStore` | `packages/MeeshySDK/Sources/MeeshySDK/Store/` | per-user state of each CONVERSATION (preferences, read cursor, unread count, metadata) in RAM, with an outbox | source of truth of conversation state, holds no message |

The open conversation paints from GRDB only (`ConversationViewModel+InitialLoad.paintFromLocalStore` → `MessageStore.loadInitialSnapshot`), then revalidates from the API, whose pages reach GRDB through `apiMessagePersistor`.

**Decision.** The GRDB `messages` table, reached through `MessagePersistenceActor` and read by `MessageStore`, is THE source of truth for messages. `ConversationSyncEngine` writes into it and does not own messages. `ConversationStore` owns conversation state, never messages. A new message reader reads GRDB.

**Duplications found.**
- **`CacheCoordinator.messages`** (`GRDBCacheStore<String, MeeshyMessage>`, namespace `msg`) is a second, blob-per-conversation copy of each timeline, still written by the sync engine, the optimistic stager, the outbox, the offline queue and the history loader, and read by the freshness check, the thread seed, the long-press preview, the media auto-save and the call-transcript sweep. It already diverges (the send path does not write it, so `ThreadView` seeds without a reply just sent) and forced the E2EE disk law to be written twice (decision 2026-10-25). Follow-up: #13178.
- **Conversations** are held twice: `ConversationStore` (RAM) and `ConversationSyncEngine` (persisted `CacheCoordinator.conversations`), and both apply the same broadcasts (`conversation:updated`, `conversation:deleted`, `conversation:restored`, `user:updated`, `read-status:updated`, `conversation:unread-updated`). Follow-up: #13179.

No product code changes with this decision.
