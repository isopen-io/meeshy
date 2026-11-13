package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #17529 — on an audio call, the journal open in the pill SHRINKS the avatar (120 → 56) into a compact header, the name
 * and the duration beside it; nothing else does (law 6 of `docs/product/appels-vue-finale.md`, view P9b). Mirrors iOS
 * `CallPillText.compactsAudioLayout` and `CallCompactAudioHeader`.
 */
class CallAudioStageLayoutTest {
    private fun pill(
        captions: Boolean = true,
        layer: CallScreenLayer = CallScreenLayer.Idle,
        revealed: Boolean = true,
    ): CallPillText = CallPillText.resolve(isCaptionsEnabled = captions, layer = layer, isChromeRevealed = revealed)

    private val journal = CallScreenLayer.Panel(CallScreenPanel.Journal)

    @Test
    fun `only the journal open in the pill compacts the audio stage`() {
        assertThat(pill(layer = journal).compactsAudioLayout).isTrue()
        assertThat(pill(captions = false, layer = journal).compactsAudioLayout).isTrue()
    }

    @Test
    fun `the captions, the open menu and the other options leave the avatar at its full size`() {
        assertThat(pill().compactsAudioLayout).isFalse()
        assertThat(pill(layer = CallScreenLayer.Menu).compactsAudioLayout).isFalse()
        assertThat(pill(layer = CallScreenLayer.MenuOverJournal).compactsAudioLayout).isFalse()
        assertThat(pill(layer = CallScreenLayer.Panel(CallScreenPanel.React)).compactsAudioLayout).isFalse()
    }

    @Test
    fun `a stowed pill takes the journal with it and gives the avatar back its size (law 11)`() {
        assertThat(pill(layer = journal, revealed = false).compactsAudioLayout).isFalse()
    }

    /** #17945 (B) : en duo audio, le toucher sur le fond range le journal avec la pilule ; l'avatar regrandit à 120, et revient au second toucher. */
    @Test
    fun `a tap on the background of a duo audio call stows the journal and grows the avatar back to 120 (#17945)`() {
        val tapStage = CallChromeVisibility.isTapStage(isGroup = false, isVideoStage = false, isConnected = true)
        val stowed = CallChromeVisibility(isRevealed = true).toggled()
        assertThat(CallChromeVisibility.mayToggleByTap(isTapStage = tapStage)).isTrue()
        assertThat(stowed.isVisible(CallChromeElement.Header)).isFalse()
        assertThat(stowed.isVisible(CallChromeElement.Controls)).isFalse()
        val hidden = pill(captions = false, layer = journal, revealed = stowed.isVisible(CallChromeElement.Controls))
        assertThat(CallAudioStageLayout.avatarDp(CallAudioStageLayout.compacts(hidden, isVideoStage = false))).isEqualTo(120f)
        val back = stowed.toggled()
        val shown = pill(captions = false, layer = journal, revealed = back.isVisible(CallChromeElement.Controls))
        assertThat(shown).isEqualTo(CallPillText.Journal)
        assertThat(CallAudioStageLayout.avatarDp(CallAudioStageLayout.compacts(shown, isVideoStage = false))).isEqualTo(56f)
    }

    @Test
    fun `the compact header is an audio layout, never a video one`() {
        assertThat(CallAudioStageLayout.compacts(pill(layer = journal), isVideoStage = false)).isTrue()
        assertThat(CallAudioStageLayout.compacts(pill(layer = journal), isVideoStage = true)).isFalse()
        assertThat(CallAudioStageLayout.compacts(pill(), isVideoStage = false)).isFalse()
    }

    @Test
    fun `the avatar goes from 120 to 56 dp, the size of the iOS compact header`() {
        assertThat(CallAudioStageLayout.avatarDp(compact = false)).isEqualTo(120f)
        assertThat(CallAudioStageLayout.avatarDp(compact = true)).isEqualTo(56f)
        assertThat(CallAudioStageLayout.SHRINK_SCALE).isWithin(0.0001f).of(56f / 120f)
    }

    @Test
    fun `the passage is a morph, and under reduce animations a short fade with no movement`() {
        assertThat(CallAudioStageLayout.morphs(reduceMotion = false)).isTrue()
        assertThat(CallAudioStageLayout.morphs(reduceMotion = true)).isFalse()
        assertThat(CallAudioStageLayout.transitionMillis(reduceMotion = false)).isEqualTo(200)
        assertThat(CallAudioStageLayout.transitionMillis(reduceMotion = true)).isEqualTo(CallChromeStow.REDUCED_FADE_MILLIS)
    }
}
