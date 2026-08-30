package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure time-windowed dedup core of the in-app toast (feature-parity §M) — the "was this id
 * already surfaced in the last 2 s" guard iOS `NotificationToastManager.handleNewNotification`
 * keeps as a mutable `Set<String>` + one scheduled removal `Task` per id. Ported here as an
 * immutable value type so every branch (fresh/expired boundary, blank id, pruning, referential
 * stability, timestamp-not-refreshed) is JVM-testable off any clock.
 */
class ToastDedupWindowTest {

    @Test
    fun empty_hasSizeZeroAndTheDefaultTwoSecondTtl() {
        val window = ToastDedupWindow.empty()

        assertThat(window.size).isEqualTo(0)
        assertThat(window.ttlMillis).isEqualTo(2_000L)
        assertThat(ToastDedupWindow.DEFAULT_TTL_MILLIS).isEqualTo(2_000L)
    }

    @Test
    fun firstAdmitOfAnId_isNotADuplicateAndIsRecorded() {
        val result = ToastDedupWindow.empty().admit("n1", nowMillis = 0)

        assertThat(result.isDuplicate).isFalse()
        assertThat(result.window.size).isEqualTo(1)
    }

    @Test
    fun secondAdmitOfTheSameIdWithinTheWindow_isADuplicateAndDoesNotGrow() {
        val first = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val second = first.admit("n1", nowMillis = 500)

        assertThat(second.isDuplicate).isTrue()
        assertThat(second.window.size).isEqualTo(1)
    }

    @Test
    fun readmittingOneMillisBeforeTheTtl_isStillADuplicate() {
        val first = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val again = first.admit("n1", nowMillis = 1_999)

        assertThat(again.isDuplicate).isTrue()
    }

    @Test
    fun readmittingExactlyAtTheTtl_isNoLongerADuplicate() {
        val first = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val again = first.admit("n1", nowMillis = 2_000)

        assertThat(again.isDuplicate).isFalse()
        assertThat(again.window.size).isEqualTo(1)
    }

    @Test
    fun aDuplicateDoesNotRefreshTheOriginalTimestamp() {
        val inserted = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window
        val duplicated = inserted.admit("n1", nowMillis = 1_000).window

        // If the duplicate at 1_000 had refreshed the timestamp, 2_000 would still be a
        // duplicate (elapsed 1_000). Because the ORIGINAL 0 stands, 2_000 is expired.
        val atOriginalTtl = duplicated.admit("n1", nowMillis = 2_000)

        assertThat(atOriginalTtl.isDuplicate).isFalse()
    }

    @Test
    fun distinctIdsAreTrackedIndependently() {
        val afterFirst = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val afterSecond = afterFirst.admit("n2", nowMillis = 100)

        assertThat(afterSecond.isDuplicate).isFalse()
        assertThat(afterSecond.window.size).isEqualTo(2)
    }

    @Test
    fun anExpiredEntryIsPrunedOnTheNextAdmit() {
        val withN1 = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val withN2 = withN1.admit("n2", nowMillis = 3_000).window

        assertThat(withN2.size).isEqualTo(1)
    }

    @Test
    fun aBlankIdIsNeverADuplicateNeverStoredAndReturnsTheSameInstance() {
        val window = ToastDedupWindow.empty()

        val result = window.admit("   ", nowMillis = 0)

        assertThat(result.isDuplicate).isFalse()
        assertThat(result.window.size).isEqualTo(0)
        assertThat(result.window).isSameInstanceAs(window)
    }

    @Test
    fun aDuplicateWithNothingToPruneReturnsTheSameInstance() {
        val first = ToastDedupWindow.empty().admit("n1", nowMillis = 0).window

        val second = first.admit("n1", nowMillis = 500)

        assertThat(second.window).isSameInstanceAs(first)
    }

    @Test
    fun admittingANewIdReturnsANewInstance() {
        val empty = ToastDedupWindow.empty()

        val result = empty.admit("n1", nowMillis = 0)

        assertThat(result.window).isNotSameInstanceAs(empty)
    }

    @Test
    fun customTtlIsHonoured() {
        val window = ToastDedupWindow.empty(ttlMillis = 500)

        val inserted = window.admit("n1", nowMillis = 0).window
        val afterWindow = inserted.admit("n1", nowMillis = 500)

        assertThat(afterWindow.isDuplicate).isFalse()
    }

    @Test
    fun aNonPositiveTtlIsRejected() {
        try {
            ToastDedupWindow.empty(ttlMillis = 0)
            throw AssertionError("expected IllegalArgumentException")
        } catch (expected: IllegalArgumentException) {
            assertThat(expected).hasMessageThat().contains("ttlMillis")
        }
    }
}
