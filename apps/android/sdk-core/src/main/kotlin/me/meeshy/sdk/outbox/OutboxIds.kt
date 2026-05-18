package me.meeshy.sdk.outbox

import java.util.UUID

/**
 * Idempotency-key generation (ARCHITECTURE.md §5; ADR-021).
 *
 * `cmid` (client mutation id) keys the outbox row and the gateway MutationLog
 * dedup; `cid` (client message id) keys an optimistic message bubble. Both are
 * device-scoped — a fresh UUID never collides across devices.
 */
public object OutboxIds {

    public fun cmid(): String = CMID_PREFIX + UUID.randomUUID()

    public fun cid(): String = CID_PREFIX + UUID.randomUUID()

    private const val CMID_PREFIX = "cmid_"
    private const val CID_PREFIX = "cid_"
}
