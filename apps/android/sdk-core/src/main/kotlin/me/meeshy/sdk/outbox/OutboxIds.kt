package me.meeshy.sdk.outbox

import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.ObjectIdGuard

/**
 * Idempotency-key generation (ARCHITECTURE.md §5; ADR-021).
 *
 * `cmid` (client mutation id) keys the outbox row and the gateway MutationLog
 * dedup; `cid` (client message id) keys an optimistic message bubble. Both are
 * device-scoped — a fresh UUID never collides across devices.
 *
 * The formats are the gateway's, exactly — `cid_<uuid v4>` and `cmid_<uuid>`, lowercase — and
 * live in `:core:model` ([ClientIdFormat]) where they are proven on a bare JVM; this is the
 * outbox-facing facade.
 */
public object OutboxIds {

    public fun cmid(): String = ClientIdFormat.newCmid()

    public fun cid(): String = ClientIdFormat.newCid()

    /**
     * Whether [id] is a client mutation id minted by [cmid] — an offline placeholder
     * keyed to a durable outbox row and blob, as opposed to a server-assigned id. The
     * story-draft restore reconciler uses this to know which restored media ids resolve
     * against the local blob store versus which live server-side.
     */
    public fun isCmid(id: String): Boolean = id.startsWith(ClientIdFormat.CMID_PREFIX)

    /** `true` only for the exact `cid_<uuid v4 lowercase>` shape the gateway accepts. */
    public fun isValidCid(id: String?): Boolean = ClientIdFormat.isValidCid(id)

    /** `true` only for the exact `cmid_<uuid lowercase>` shape the gateway accepts. */
    public fun isValidCmid(id: String?): Boolean = ClientIdFormat.isValidCmid(id)

    /**
     * A STABLE cmid for one piece of content: the same [seed] gives the same key at every replay,
     * so the gateway's MutationLog recognises the second request instead of writing a duplicate.
     */
    public fun derivedCmid(seed: String): String = ClientIdFormat.derivedCmid(seed)

    /** The key of one story slide published from its queue item — one item, one slide, one key. */
    public fun storySlideCmid(queueItemId: String, slideId: String): String =
        ClientIdFormat.storySlideCmid(queueItemId, slideId)

    /** Whether [id] names something that only exists on this device (`cid_`, `cmid_`, `pending_`). */
    public fun isLocalId(id: String?): Boolean = ObjectIdGuard.isLocalId(id)
}
