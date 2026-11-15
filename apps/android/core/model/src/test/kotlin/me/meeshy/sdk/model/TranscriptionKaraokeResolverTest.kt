package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural contract for [TranscriptionKaraokeResolver.activeSegmentIndex] — the karaoke
 * "which segment is lit now" resolver ported from iOS
 * `AudioPlayerView.activeSegmentIndex`. Every case drives the public function and asserts the
 * lit index (or `null`); expected verdicts follow iOS semantics, not this port's internals.
 */
class TranscriptionKaraokeResolverTest {

    private fun seg(start: Double?, end: Double?, text: String = "w") =
        MessageTranscriptionSegment(text = text, startTime = start, endTime = end)

    /** Three back-to-back timed words: [0,1) [1,2) [2,3). */
    private val timed = listOf(seg(0.0, 1.0), seg(1.0, 2.0), seg(2.0, 3.0))

    // --- Layer 1: idle / empty -------------------------------------------------------------

    @Test
    fun pausedYieldsNull_evenWhenAWindowWouldMatch() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(timed, currentTimeSeconds = 1.5, progress = 0.0, isPlaying = false),
        ).isNull()
    }

    @Test
    fun emptySegmentsYieldNull_evenWhilePlaying() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(emptyList(), currentTimeSeconds = 0.0, progress = 0.5, isPlaying = true),
        ).isNull()
    }

    // --- Layer 2: real timing --------------------------------------------------------------

    @Test
    fun positionInsideAWindowLightsThatSegment() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(timed, currentTimeSeconds = 1.5, progress = 0.0, isPlaying = true),
        ).isEqualTo(1)
    }

    @Test
    fun windowStartIsInclusive() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(timed, currentTimeSeconds = 1.0, progress = 0.0, isPlaying = true),
        ).isEqualTo(1)
    }

    @Test
    fun windowEndIsExclusive_boundaryBelongsToTheNextSegment() {
        // At exactly 2.0, segment 1's window [1,2) has ended; 2.0 belongs to segment 2's [2,3).
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(timed, currentTimeSeconds = 2.0, progress = 0.0, isPlaying = true),
        ).isEqualTo(2)
    }

    @Test
    fun positionBeforeFirstSegmentLightsNothing() {
        val late = listOf(seg(1.0, 2.0), seg(2.0, 3.0))
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(late, currentTimeSeconds = 0.5, progress = 0.0, isPlaying = true),
        ).isNull()
    }

    @Test
    fun positionInAGapBetweenSegmentsLightsNothing() {
        // [0,1) then [2,3): the moment 1.5 sits in the gap.
        val gapped = listOf(seg(0.0, 1.0), seg(2.0, 3.0))
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(gapped, currentTimeSeconds = 1.5, progress = 0.0, isPlaying = true),
        ).isNull()
    }

    @Test
    fun positionPastTheLastSegmentLightsNothing() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(timed, currentTimeSeconds = 3.0, progress = 0.0, isPlaying = true),
        ).isNull()
    }

    @Test
    fun overlappingWindowsLightTheFirstMatch() {
        val overlapping = listOf(seg(0.0, 2.0), seg(1.0, 3.0))
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(overlapping, currentTimeSeconds = 1.5, progress = 0.0, isPlaying = true),
        ).isEqualTo(0)
    }

    @Test
    fun aSingleTimedSegmentLightsAtIndexZero() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(listOf(seg(0.0, 1.0)), currentTimeSeconds = 0.2, progress = 0.0, isPlaying = true),
        ).isEqualTo(0)
    }

    @Test
    fun oneRealTimedSegmentSwitchesTheWholeListToTheTimingBranch() {
        // Mixed: two zero-length segments and one real one → timing branch wins, and the
        // position (in no real window) lights nothing rather than falling to proportional.
        val mixed = listOf(seg(0.0, 0.0), seg(5.0, 6.0), seg(0.0, 0.0))
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(mixed, currentTimeSeconds = 1.0, progress = 0.9, isPlaying = true),
        ).isNull()
        // …and inside the one real window it lights that segment.
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(mixed, currentTimeSeconds = 5.5, progress = 0.0, isPlaying = true),
        ).isEqualTo(1)
    }

    @Test
    fun nullBoundsCountAsZeroTiming_notRealTiming() {
        // start=end=null reads as 0..0 (no real timing) → proportional branch, never a window.
        val untimed = listOf(seg(null, null), seg(null, null), seg(null, null), seg(null, null))
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 999.0, progress = 0.5, isPlaying = true),
        ).isEqualTo(2)
    }

    // --- Layer 3: proportional fallback (no usable timing) ---------------------------------

    private val untimed = listOf(seg(0.0, 0.0), seg(0.0, 0.0), seg(0.0, 0.0), seg(0.0, 0.0))

    @Test
    fun proportionalZeroProgressLightsFirst() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 0.0, progress = 0.0, isPlaying = true),
        ).isEqualTo(0)
    }

    @Test
    fun proportionalMidProgressLightsProportionalSegment() {
        // floor(0.5 * 4) = 2
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 0.0, progress = 0.5, isPlaying = true),
        ).isEqualTo(2)
    }

    @Test
    fun proportionalFullProgressClampsToLastSegment() {
        // floor(1.0 * 4) = 4 → clamp to 3
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 0.0, progress = 1.0, isPlaying = true),
        ).isEqualTo(3)
    }

    @Test
    fun proportionalNegativeProgressClampsToFirstSegment() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 0.0, progress = -0.4, isPlaying = true),
        ).isEqualTo(0)
    }

    @Test
    fun proportionalOverfullProgressClampsToLastSegment() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(untimed, currentTimeSeconds = 0.0, progress = 1.7, isPlaying = true),
        ).isEqualTo(3)
    }

    @Test
    fun proportionalSingleUntimedSegmentAlwaysLightsIndexZero() {
        assertThat(
            TranscriptionKaraokeResolver.activeSegmentIndex(listOf(seg(0.0, 0.0)), currentTimeSeconds = 0.0, progress = 0.99, isPlaying = true),
        ).isEqualTo(0)
    }
}

class TranscriptionKaraokeCutTest {

    private fun seg(text: String, start: Double? = 0.0, end: Double? = 1.0) =
        MessageTranscriptionSegment(text = text, startTime = start, endTime = end)

    private fun words(count: Int) = List(count) { seg("m$it", it.toDouble(), it + 1.0) }

    @Test
    fun `une transcription de 30 mots ou moins n'est pas coupee`() {
        val segments = words(30)
        assertThat(TranscriptionKaraokeResolver.exceedsWordLimit(segments, 30)).isFalse()
        assertThat(TranscriptionKaraokeResolver.limitedSegments(segments, 30)).isEqualTo(segments)
    }

    @Test
    fun `au dela de 30 mots on garde les 30 premiers et l'ellipse sur le dernier`() {
        val cut = TranscriptionKaraokeResolver.limitedSegments(words(45), 30)
        assertThat(cut).hasSize(30)
        assertThat(cut.last().text).isEqualTo("m29…")
        assertThat(cut.last().startTime).isEqualTo(29.0)
    }

    @Test
    fun `un segment multi-mots est coupe au mot en conservant ses horodatages`() {
        val cut = TranscriptionKaraokeResolver.limitedSegments(
            listOf(seg("un deux trois quatre", 5.0, 9.0)),
            wordLimit = 2,
        )
        assertThat(cut.single().text).isEqualTo("un deux…")
        assertThat(cut.single().startTime).isEqualTo(5.0)
        assertThat(cut.single().endTime).isEqualTo(9.0)
    }

    @Test
    fun `une limite nulle ou negative ne coupe rien`() {
        val segments = words(5)
        assertThat(TranscriptionKaraokeResolver.exceedsWordLimit(segments, 0)).isFalse()
        assertThat(TranscriptionKaraokeResolver.limitedSegments(segments, 0)).isEqualTo(segments)
    }

    @Test
    fun `la coupe de la carte tronque a 255 caracteres avec trois points`() {
        val segments = listOf(seg("a".repeat(200)), seg("b".repeat(100)))
        val cut = TranscriptionKaraokeResolver.cardSegments(segments)
        assertThat(cut.sumOf { it.text.length }).isEqualTo(258)
        assertThat(cut.last().text).endsWith("...")
        assertThat(TranscriptionKaraokeResolver.exceedsCardLimit(segments)).isTrue()
        assertThat(TranscriptionKaraokeResolver.exceedsCardLimit(listOf(seg("court")))).isFalse()
    }
}
