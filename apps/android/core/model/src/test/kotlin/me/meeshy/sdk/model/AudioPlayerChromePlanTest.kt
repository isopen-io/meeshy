package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural contract for [AudioPlayerChromePlan.plan] — the pure audio-player
 * chrome resolver ported from iOS `AudioPlayerChromePlan.plan(for:)`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`). Every case
 * drives the public factory and asserts the resolved plan's fields against iOS
 * semantics, not this port's internals. The chrome is an OPAQUE render posture —
 * the plan decides WHO appears, never how, and never which posture a given row gets
 * (that stays app-side, SDK purity).
 */
class AudioPlayerChromePlanTest {

    // --- .card: the historical rich card (bubble mode) -------------------------------------

    @Test
    fun cardShowsTheFullCardChrome() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.Card)
        assertThat(plan.showsCardBackground).isTrue()
        assertThat(plan.showsRightChips).isTrue()
        assertThat(plan.showsLanguageStrip).isTrue()
        assertThat(plan.showsRetranscribe).isTrue()
        assertThat(plan.showsTranscribeCta).isTrue()
    }

    @Test
    fun cardRendersNoFlatTranscription() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.Card)
        assertThat(plan.rendersFlatTranscription).isFalse()
        assertThat(plan.flatTranscriptionLineLimit).isNull()
        assertThat(plan.flatTranscriptionFollowsPlayback).isFalse()
        assertThat(plan.transcriptionWordLimit).isNull()
    }

    // --- .flatMinimal: the bare strip (play + waveform + duration + truncated quote) --------

    @Test
    fun flatMinimalStripsEveryEnrichment() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatMinimal)
        assertThat(plan.showsCardBackground).isFalse()
        assertThat(plan.showsRightChips).isFalse()
        assertThat(plan.showsLanguageStrip).isFalse()
        assertThat(plan.showsRetranscribe).isFalse()
        assertThat(plan.showsTranscribeCta).isFalse()
    }

    @Test
    fun flatMinimalRendersAStaticTwoLineFlatTranscription() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatMinimal)
        assertThat(plan.rendersFlatTranscription).isTrue()
        // The bare strip caps the quote at 2 lines and does NOT follow playback —
        // a karaoke cut to 2 lines would have nothing to highlight past the cut.
        assertThat(plan.flatTranscriptionLineLimit).isEqualTo(2)
        assertThat(plan.flatTranscriptionFollowsPlayback).isFalse()
        assertThat(plan.transcriptionWordLimit).isNull()
    }

    // --- .flatFocused: the enriched bare strip (focal row) ---------------------------------

    @Test
    fun flatFocusedKeepsTheEnrichmentsButNoCardBackground() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatFocused)
        assertThat(plan.showsCardBackground).isFalse()
        assertThat(plan.showsRightChips).isTrue()
        assertThat(plan.showsLanguageStrip).isTrue()
        assertThat(plan.showsRetranscribe).isTrue()
        assertThat(plan.showsTranscribeCta).isTrue()
    }

    @Test
    fun flatFocusedRendersAFullKaraokeFollowingTranscription() {
        val plan = AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatFocused)
        assertThat(plan.rendersFlatTranscription).isTrue()
        // Full transcription (no line cap) that FOLLOWS playback (karaoke), word-capped
        // at the standard ~thirty words with a see-more to fullscreen.
        assertThat(plan.flatTranscriptionLineLimit).isNull()
        assertThat(plan.flatTranscriptionFollowsPlayback).isTrue()
        assertThat(plan.transcriptionWordLimit).isEqualTo(AudioPlayerChromePlan.STANDARD_TRANSCRIPTION_WORD_LIMIT)
    }

    // --- Cross-case invariants -------------------------------------------------------------

    @Test
    fun onlyTheCardShowsACardBackground() {
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.Card).showsCardBackground).isTrue()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatMinimal).showsCardBackground).isFalse()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatFocused).showsCardBackground).isFalse()
    }

    @Test
    fun onlyFlatFocusedFollowsPlayback() {
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.Card).flatTranscriptionFollowsPlayback).isFalse()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatMinimal).flatTranscriptionFollowsPlayback).isFalse()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatFocused).flatTranscriptionFollowsPlayback).isTrue()
    }

    @Test
    fun everyFlatPostureRendersAFlatTranscriptionAndTheCardDoesNot() {
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.Card).rendersFlatTranscription).isFalse()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatMinimal).rendersFlatTranscription).isTrue()
        assertThat(AudioPlayerChromePlan.plan(AudioPlayerChrome.FlatFocused).rendersFlatTranscription).isTrue()
    }

    @Test
    fun everyChromeCaseResolvesToADistinctPlan() {
        val plans = AudioPlayerChrome.entries.map { AudioPlayerChromePlan.plan(it) }
        assertThat(plans.toSet()).hasSize(AudioPlayerChrome.entries.size)
    }

    @Test
    fun theStandardWordLimitIsThirty() {
        assertThat(AudioPlayerChromePlan.STANDARD_TRANSCRIPTION_WORD_LIMIT).isEqualTo(30)
    }

    @Test
    fun aWordLimitIsOnlyEverSetOnThePostureThatFollowsPlayback() {
        // The ~thirty-word cut is a cut on the karaoke SEGMENTS, so it only makes sense
        // where the transcription follows playback. No follow ⇒ no word limit.
        AudioPlayerChrome.entries.forEach { chrome ->
            val plan = AudioPlayerChromePlan.plan(chrome)
            if (plan.transcriptionWordLimit != null) {
                assertThat(plan.flatTranscriptionFollowsPlayback).isTrue()
            }
        }
    }
}
