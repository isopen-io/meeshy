package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallRecord

/**
 * Pure list algebra for the call journal. Merges the cache-first stream page with
 * subsequently-paged older records (de-duplicated by [CallRecord.callId], stream
 * order first) and applies the missed-only filter. Kept out of the ViewModel and
 * the Composable so every branch is unit-tested (TDD-COVERAGE §"pure helpers").
 */
object CallHistoryList {

    /**
     * Combines the cached [stream] head with older [paged] records into one list,
     * de-duplicated by [CallRecord.callId] and preserving stream-then-paged order.
     * A record already carried by the stream is never duplicated by a page that
     * re-fetches the head (the first `fetchPage` starts from `cursor = null`).
     */
    fun combine(stream: List<CallRecord>, paged: List<CallRecord>): List<CallRecord> =
        (stream + paged).distinctBy { it.callId }

    /** The visible list: every record, or only the missed ones when [missedOnly]. */
    fun filter(records: List<CallRecord>, missedOnly: Boolean): List<CallRecord> =
        if (missedOnly) records.filter { it.isMissed } else records
}
