package me.meeshy.sdk.sync

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

/**
 * SyncEngine — état pur de suivi du `_seq` per-user (détection de gap EXACTE,
 * cœur du bénéfice multi-device). Miroir des tests iOS
 * `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/SyncSeqStateTests.swift` et web
 * `apps/web/__tests__/lib/sync-seq-state.test.ts` : mêmes cas, même règle.
 */
class SyncSeqStateTest {

    @Test
    fun `first event never reports a gap`() {
        // Aucun `lastSeq` connu → le tout premier event ne peut pas être un trou.
        assertThat(SyncSeqState().detectGap(5L)).isFalse()
    }

    @Test
    fun `contiguous seq is not a gap`() {
        assertThat(SyncSeqState().record(5L).detectGap(6L)).isFalse()
    }

    @Test
    fun `jump ahead is a gap`() {
        assertThat(SyncSeqState().record(5L).detectGap(7L)).isTrue()
    }

    @Test
    fun `duplicate or reordered seq is not a gap`() {
        val state = SyncSeqState().record(5L)
        assertThat(state.detectGap(5L)).isFalse()
        assertThat(state.detectGap(4L)).isFalse()
    }

    @Test
    fun `record advances lastSeq`() {
        assertThat(SyncSeqState().lastSeq).isNull()
        assertThat(SyncSeqState().record(10L).lastSeq).isEqualTo(10L)
        assertThat(SyncSeqState().record(10L).record(11L).lastSeq).isEqualTo(11L)
    }

    @Test
    fun `record never regresses the cursor`() {
        // Un event réordonné ne doit pas faire régresser le curseur : sinon le
        // prochain event contigu au VRAI dernier seq passerait pour un trou.
        val state = SyncSeqState().record(10L).record(7L)
        assertThat(state.lastSeq).isEqualTo(10L)
        assertThat(state.detectGap(11L)).isFalse()
    }
}

/**
 * Le tracker émet sur `gapDetected` UNIQUEMENT quand `observe` rencontre un
 * trou — miroir de `SyncSeqTrackerGapHookTests` (iOS).
 */
class SyncSeqTrackerTest {

    @Test
    fun `gapDetected emits only on a gap and carries the gap seq`() = runTest {
        val tracker = SyncSeqTracker()
        tracker.gapDetected.test {
            assertThat(tracker.observe(5L)).isFalse()   // premier event — pas de gap
            assertThat(tracker.observe(6L)).isFalse()   // contigu — pas de gap
            assertThat(tracker.observe(9L)).isTrue()    // trou (7, 8 manqués)
            assertThat(awaitItem()).isEqualTo(9L)
            assertThat(tracker.observe(10L)).isFalse()  // contigu — pas de gap
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a payload without seq is a no-op`() = runTest {
        val tracker = SyncSeqTracker()
        tracker.gapDetected.test {
            assertThat(tracker.observe(null)).isFalse()
            assertThat(tracker.observe(null)).isFalse()
            expectNoEvents()
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(tracker.lastSeq).isNull()
    }

    @Test
    fun `reset clears the cursor so the next account starts fresh`() {
        val tracker = SyncSeqTracker()
        tracker.observe(4_000L)
        tracker.reset()
        assertThat(tracker.lastSeq).isNull()
        // Sans reset, le premier event du compte suivant (seq bas) n'avancerait
        // pas le curseur hérité et tous ses trous seraient manqués.
        assertThat(tracker.observe(3L)).isFalse()
        assertThat(tracker.lastSeq).isEqualTo(3L)
        assertThat(tracker.observe(7L)).isTrue()
    }
}
