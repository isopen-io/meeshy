package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure, immutable dedup ring — the port of the iOS
 * `VoIPDedupRing` (capacity 24, ttl 30s). A retried / delayed push arriving
 * twice within the window must be recognised as already-seen; an entry older
 * than the ttl is forgotten; and the ring never grows past its capacity.
 *
 * Tested through `contains` / `insert` / `remove` only — no reflection.
 */
class SeenCallRingTest {

    private fun ring(capacity: Int = 3, ttl: Long = 1_000L): SeenCallRing =
        SeenCallRing(capacity = capacity, ttlMillis = ttl)

    // --- contains after insert ---------------------------------------------

    @Test
    fun `a fresh ring contains nothing`() {
        assertThat(ring().contains("c1", nowMillis = 0)).isFalse()
    }

    @Test
    fun `an inserted id is contained within the ttl window`() {
        val r = ring().insert("c1", nowMillis = 0)
        assertThat(r.contains("c1", nowMillis = 999)).isTrue()
    }

    @Test
    fun `an id past the ttl window is no longer contained`() {
        val r = ring(ttl = 1_000L).insert("c1", nowMillis = 0)
        assertThat(r.contains("c1", nowMillis = 1_000)).isFalse()
    }

    @Test
    fun `re-inserting an id refreshes its freshness window`() {
        val r = ring(ttl = 1_000L)
            .insert("c1", nowMillis = 0)
            .insert("c1", nowMillis = 900)
        // Would have expired at 1000 from the first insert, but the refresh
        // moved the window to [900, 1900).
        assertThat(r.contains("c1", nowMillis = 1_500)).isTrue()
    }

    @Test
    fun `re-inserting an id keeps a single entry`() {
        val r = ring()
            .insert("c1", nowMillis = 0)
            .insert("c1", nowMillis = 10)
        assertThat(r.entries.map { it.callId }).containsExactly("c1")
    }

    // --- capacity -----------------------------------------------------------

    @Test
    fun `the oldest id is evicted past capacity`() {
        val r = ring(capacity = 2)
            .insert("c1", nowMillis = 0)
            .insert("c2", nowMillis = 1)
            .insert("c3", nowMillis = 2)
        assertThat(r.contains("c1", nowMillis = 2)).isFalse()
        assertThat(r.contains("c2", nowMillis = 2)).isTrue()
        assertThat(r.contains("c3", nowMillis = 2)).isTrue()
    }

    @Test
    fun `insert prunes expired entries so they never occupy capacity`() {
        val r = ring(capacity = 2, ttl = 1_000L)
            .insert("stale", nowMillis = 0)
            .insert("c2", nowMillis = 1_100) // "stale" now expired, pruned on insert
            .insert("c3", nowMillis = 1_200)
        assertThat(r.entries.map { it.callId }).containsExactly("c2", "c3").inOrder()
    }

    // --- remove -------------------------------------------------------------

    @Test
    fun `remove forgets an id even within the window`() {
        val r = ring()
            .insert("c1", nowMillis = 0)
            .remove("c1")
        assertThat(r.contains("c1", nowMillis = 100)).isFalse()
    }

    @Test
    fun `removing an absent id is a no-op`() {
        val r = ring().insert("c1", nowMillis = 0)
        assertThat(r.remove("other").entries.map { it.callId }).containsExactly("c1")
    }

    // --- immutability -------------------------------------------------------

    @Test
    fun `insert returns a new ring and leaves the original untouched`() {
        val original = ring()
        original.insert("c1", nowMillis = 0)
        assertThat(original.contains("c1", nowMillis = 0)).isFalse()
    }

    @Test
    fun `defaults mirror the iOS VoIPDedupRing bounds`() {
        val r = SeenCallRing()
        assertThat(r.capacity).isEqualTo(24)
        assertThat(r.ttlMillis).isEqualTo(30_000L)
    }
}
