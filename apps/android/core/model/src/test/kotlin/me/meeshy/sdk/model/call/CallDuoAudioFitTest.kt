package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #18488 (famille de #17927) — a duo audio call at a COMPACT height (a phone in landscape ≈ 360 dp, a low window 320 dp):
 * the whole pill, (…) included, stays on screen. The avatar, the name and the duration take their compact form (P9b) when
 * the height lacks, the margins around the pill tighten, and the journal open in the pill yields its list so that the base
 * row under it is never pushed out of the window.
 */
class CallDuoAudioFitTest {
    @Test
    fun `a duo audio call at a compact height takes the compact form with the controls shown, the journal or not`() {
        assertThat(CallAudioStageLayout.compacts(CallPillText.None, isVideoStage = false, isCompactHeight = true, controlsShown = true)).isTrue()
        assertThat(CallAudioStageLayout.compacts(CallPillText.Captions, isVideoStage = false, isCompactHeight = true, controlsShown = true)).isTrue()
        assertThat(CallAudioStageLayout.compacts(CallPillText.Journal, isVideoStage = false, isCompactHeight = true, controlsShown = true)).isTrue()
    }

    @Test
    fun `an ample height keeps the full stage at rest and the journal still compacts it`() {
        assertThat(CallAudioStageLayout.compacts(CallPillText.None, isVideoStage = false, isCompactHeight = false, controlsShown = true)).isFalse()
        assertThat(CallAudioStageLayout.compacts(CallPillText.Journal, isVideoStage = false, isCompactHeight = false, controlsShown = true)).isTrue()
    }

    @Test
    fun `17945 - the controls stowed give the avatar its 120 dp back, even at a compact height, unless the captions glass stays`() {
        assertThat(CallAudioStageLayout.compacts(CallPillText.None, isVideoStage = false, isCompactHeight = true, controlsShown = false)).isFalse()
        assertThat(CallAudioStageLayout.compacts(CallPillText.CaptionsAlone, isVideoStage = false, isCompactHeight = true, controlsShown = false)).isTrue()
    }

    @Test
    fun `the video stage has no avatar block to compact at any height`() {
        assertThat(CallAudioStageLayout.compacts(CallPillText.Journal, isVideoStage = true, isCompactHeight = true, controlsShown = true)).isFalse()
    }

    @Test
    fun `the compact avatar tightens from 56 dp to 40 dp when the stage is lower than 340 dp, and an unknown height keeps 56`() {
        assertThat(CallAudioStageLayout.compactAvatarDp(360f)).isEqualTo(56f)
        assertThat(CallAudioStageLayout.compactAvatarDp(340f)).isEqualTo(56f)
        assertThat(CallAudioStageLayout.compactAvatarDp(339f)).isEqualTo(40f)
        assertThat(CallAudioStageLayout.compactAvatarDp(320f)).isEqualTo(40f)
        assertThat(CallAudioStageLayout.compactAvatarDp(0f)).isEqualTo(56f)
    }

    @Test
    fun `the margins under the stage tighten at a compact height and stay at 20 plus 20 dp otherwise`() {
        assertThat(CallDuoAudioFit.columnBottomDp(isCompactHeight = false)).isEqualTo(20f)
        assertThat(CallDuoAudioFit.blockBottomDp(isCompactHeight = false)).isEqualTo(20f)
        assertThat(CallDuoAudioFit.columnBottomDp(isCompactHeight = true)).isEqualTo(0f)
        assertThat(CallDuoAudioFit.blockBottomDp(isCompactHeight = true)).isEqualTo(8f)
    }

    @Test
    fun `the journal list yields to the pill chrome at 360 dp and 320 dp`() {
        assertThat(CallDuoAudioFit.journalListDp(360f)).isWithin(0.001f).of(68f)
        assertThat(CallDuoAudioFit.journalListDp(320f)).isWithin(0.001f).of(44f)
    }

    @Test
    fun `the journal list never falls under one readable line, nor over the share of the window`() {
        assertThat(CallDuoAudioFit.journalListDp(260f)).isEqualTo(CallDuoAudioFit.MINIMUM_LIST_DP)
        assertThat(CallDuoAudioFit.journalListDp(0f)).isEqualTo(CallDuoAudioFit.MINIMUM_LIST_DP)
        (400..499 step 11).forEach { height ->
            assertThat(CallDuoAudioFit.journalListDp(height.toFloat())).isAtMost(CallJournalSizing.heightDp(height.toFloat()))
        }
    }

    @Test
    fun `from 320 dp up, the top, the compact header, the journal, the pill chrome and the margin always fit the window`() {
        (320..499).forEach { height ->
            val stage = height.toFloat()
            val used = CallDuoAudioFit.TOP_RESERVE_DP + CallAudioStageLayout.compactAvatarDp(stage) + CallDuoAudioFit.HEADER_GAP_DP +
                CallDuoAudioFit.journalListDp(stage) + CallDuoAudioFit.JOURNAL_CHROME_DP + CallDuoAudioFit.blockBottomDp(isCompactHeight = true)
            assertThat(used).isAtMost(stage)
        }
    }
}
