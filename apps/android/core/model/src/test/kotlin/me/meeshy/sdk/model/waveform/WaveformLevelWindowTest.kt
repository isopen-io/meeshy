package me.meeshy.sdk.model.waveform

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [WaveformLevelWindow] — the immutable rolling ring of recent
 * audio levels beneath the app-side recorder (ports iOS `AudioRecorderManager.levelHistory`
 * append-and-drop-front behaviour plus the initial `Array(repeating: 0, count: 15)`).
 */
class WaveformLevelWindowTest {

    @Test
    fun emptyWindowStartsWithNoLevels() {
        assertThat(WaveformLevelWindow.empty().levels).isEmpty()
    }

    @Test
    fun filledWindowStartsWithCapacityZeros() {
        val window = WaveformLevelWindow.filled(capacity = 4)
        assertThat(window.levels).containsExactly(0f, 0f, 0f, 0f).inOrder()
    }

    @Test
    fun defaultCapacityMatchesTheIosFifteenSampleWindow() {
        assertThat(WaveformLevelWindow.filled().levels).hasSize(15)
        assertThat(WaveformLevelWindow.DEFAULT_CAPACITY).isEqualTo(15)
    }

    @Test
    fun pushAppendsWhileBelowCapacity() {
        val window = WaveformLevelWindow.empty(capacity = 3).push(0.2f).push(0.5f)
        assertThat(window.levels).containsExactly(0.2f, 0.5f).inOrder()
    }

    @Test
    fun pushDropsTheOldestOnceCapacityIsExceeded() {
        val window = WaveformLevelWindow.empty(capacity = 2)
            .push(0.1f)
            .push(0.2f)
            .push(0.3f)
        assertThat(window.levels).containsExactly(0.2f, 0.3f).inOrder()
    }

    @Test
    fun pushKeepsExactlyTheMostRecentCapacityLevelsInOrder() {
        var window = WaveformLevelWindow.empty(capacity = 3)
        listOf(0.1f, 0.2f, 0.3f, 0.4f, 0.5f).forEach { window = window.push(it) }
        assertThat(window.levels).containsExactly(0.3f, 0.4f, 0.5f).inOrder()
    }

    @Test
    fun pushIntoAFilledWindowSlidesTheZerosOut() {
        val window = WaveformLevelWindow.filled(capacity = 2).push(0.7f)
        assertThat(window.levels).containsExactly(0f, 0.7f).inOrder()
    }

    @Test
    fun zeroCapacityWindowStaysPermanentlyEmpty() {
        val window = WaveformLevelWindow.empty(capacity = 0).push(0.9f)
        assertThat(window.levels).isEmpty()
        assertThat(window.capacity).isEqualTo(0)
    }

    @Test
    fun negativeRequestedCapacityCollapsesToZero() {
        val window = WaveformLevelWindow.filled(capacity = -5)
        assertThat(window.capacity).isEqualTo(0)
        assertThat(window.levels).isEmpty()
    }

    @Test
    fun pushIsImmutableAndReturnsANewWindow() {
        val original = WaveformLevelWindow.empty(capacity = 2).push(0.1f)
        val next = original.push(0.2f)
        assertThat(original.levels).containsExactly(0.1f).inOrder()
        assertThat(next.levels).containsExactly(0.1f, 0.2f).inOrder()
    }

    @Test
    fun windowsWithTheSameContentAreEqual() {
        val a = WaveformLevelWindow.empty(capacity = 2).push(0.4f)
        val b = WaveformLevelWindow.empty(capacity = 2).push(0.4f)
        assertThat(a).isEqualTo(b)
        assertThat(a.hashCode()).isEqualTo(b.hashCode())
    }
}
