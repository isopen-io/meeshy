package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallChromeVisibilityTest {
    @Test
    fun `revealed chrome shows everything`() {
        val chrome = CallChromeVisibility()
        assertThat(CallChromeElement.entries.all { chrome.isVisible(it) }).isTrue()
    }

    @Test
    fun `hidden chrome keeps captions, consent and self view`() {
        val chrome = CallChromeVisibility(isRevealed = false)
        assertThat(chrome.isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Header)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Captions)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.RecordingConsent)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.SelfView)).isTrue()
    }

    @Test
    fun `a mode hides the chrome and the self view but not captions or consent`() {
        val chrome = CallChromeVisibility(isModeActive = true)
        assertThat(chrome.isVisible(CallChromeElement.Controls)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.SelfView)).isFalse()
        assertThat(chrome.isVisible(CallChromeElement.Captions)).isTrue()
        assertThat(chrome.isVisible(CallChromeElement.RecordingConsent)).isTrue()
    }

    @Test
    fun `toggled flips only the reveal`() {
        val chrome = CallChromeVisibility(isStageFullScreen = false, isModeActive = false).toggled()
        assertThat(chrome.isRevealed).isFalse()
        assertThat(chrome.toggled().isRevealed).isTrue()
    }

    @Test
    fun `taps toggle only on a stage that stows and never under TalkBack`() {
        assertThat(CallChromeVisibility.mayToggleByTap(isTapStage = true)).isTrue()
        assertThat(CallChromeVisibility.mayToggleByTap(isTapStage = false)).isFalse()
        assertThat(CallChromeVisibility.mayToggleByTap(isTapStage = true, isTouchExplorationOn = true)).isFalse()
    }

    /**
     * Loi 11, #17945 (B) et son extension (dernier commentaire de l'issue) : la scène qu'un toucher range est l'image en
     * vidéo, le fond derrière l'avatar en duo audio ET le fond d'un groupe sans aucune caméra. Vecteurs partagés avec iOS et
     * le web, composés depuis la règle de la scène vidéo : (duo, vidéo) → vrai · (duo, audio, en cours) → vrai · (duo, audio,
     * pas encore en cours) → faux · (groupe, une caméra) → vrai · (groupe, aucune caméra) → VRAI. Ce dernier vecteur valait
     * « faux » avant l'extension : il figeait l'ancien dessin.
     */
    @Test
    fun `law 11 (#17945) a tap stows the chrome over a video image, a duo audio call and a group with no camera`() {
        assertThat(tapStage(isGroup = false, camera = true, isConnected = true)).isTrue()
        assertThat(tapStage(isGroup = false, camera = false, isConnected = true)).isTrue()
        assertThat(tapStage(isGroup = false, camera = false, isConnected = false)).isFalse()
        assertThat(tapStage(isGroup = true, camera = true, isConnected = true)).isTrue()
        assertThat(tapStage(isGroup = true, camera = false, isConnected = true)).isTrue()
    }

    @Test
    fun `a group with no camera stows header, pill, journal and banners, and keeps its captions`() {
        assertThat(CallChromeVisibility.mayToggleByTap(tapStage(isGroup = true, camera = false, isConnected = true))).isTrue()
        val stowed = CallChromeVisibility().toggled()
        listOf(
            CallChromeElement.Header,
            CallChromeElement.Controls,
            CallChromeElement.OpenPanel,
            CallChromeElement.RecordingStatus,
            CallChromeElement.ScreenShareBanner,
            CallChromeElement.FeaturedCapsule,
        ).forEach { assertThat(stowed.isVisible(it)).isFalse() }
        assertThat(stowed.isVisible(CallChromeElement.Captions)).isTrue()
        val journal = CallScreenLayer.Panel(CallScreenPanel.Journal)
        val stowedText = CallPillText.resolve(isCaptionsEnabled = true, layer = journal, isChromeRevealed = stowed.isVisible(CallChromeElement.Controls))
        assertThat(stowedText).isEqualTo(CallPillText.CaptionsAlone)
        assertThat(stowedText.isOnStage(isStageFullScreen = false)).isTrue()
        val back = CallPillText.resolve(isCaptionsEnabled = true, layer = journal, isChromeRevealed = stowed.toggled().isVisible(CallChromeElement.Controls))
        assertThat(back).isEqualTo(CallPillText.Journal)
    }

    @Test
    fun `under TalkBack a group with no camera stows nothing`() {
        assertThat(CallChromeVisibility.mayToggleByTap(tapStage(isGroup = true, camera = false, isConnected = true), isTouchExplorationOn = true)).isFalse()
    }

    private fun tapStage(isGroup: Boolean, camera: Boolean, isConnected: Boolean): Boolean = CallChromeVisibility.isTapStage(
        isVideoStage = CallChromeVisibility.isVideoStage(
            isGroup = isGroup,
            isLocalVideoEnabled = false,
            isDuoVideoActive = !isGroup && camera,
            remoteCamerasOn = if (isGroup && camera) 1 else 0,
        ),
        isConnected = isConnected,
    )

    @Test
    fun `video stage rules for duo and group`() {
        assertThat(CallChromeVisibility.isVideoStage(false, false, true, 0)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(false, true, false, 3)).isFalse()
        assertThat(CallChromeVisibility.isVideoStage(true, true, false, 0)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(true, false, false, 2)).isTrue()
        assertThat(CallChromeVisibility.isVideoStage(true, false, false, 0)).isFalse()
    }

    @Test
    fun `a touch during the fade is still accepted, after it is not`() {
        assertThat(CallChromeVisibility.FADE_DURATION_MILLIS).isEqualTo(250)
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = false, hiddenForMillis = 100)).isTrue()
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = false, hiddenForMillis = 250)).isFalse()
        assertThat(CallChromeVisibility.acceptsTouches(isVisible = true, hiddenForMillis = 9_999)).isTrue()
    }

    @Test
    fun `only revive reveals the chrome`() {
        assertThat(CallChromeInteraction.entries.filter { it.revealsChrome }).containsExactly(CallChromeInteraction.Revive)
    }

    @Test
    fun `scroll rule maps start and stop only`() {
        assertThat(CallChromeScrollRule.interaction(false, true)).isEqualTo(CallChromeInteraction.TouchBegan)
        assertThat(CallChromeScrollRule.interaction(true, false)).isEqualTo(CallChromeInteraction.TouchEnded)
        assertThat(CallChromeScrollRule.interaction(true, true)).isNull()
        assertThat(CallChromeScrollRule.interaction(false, false)).isNull()
    }

    /** U1.10 · #8550 : the « Back to grid · Full screen » capsule stows WITH the controls, but full screen does not stow it. */
    @Test
    fun `the featured capsule follows the controls and survives the full screen`() {
        assertThat(CallChromeVisibility(isRevealed = true).isVisible(CallChromeElement.FeaturedCapsule)).isTrue()
        assertThat(CallChromeVisibility(isRevealed = true, isStageFullScreen = true).isVisible(CallChromeElement.FeaturedCapsule)).isTrue()
        assertThat(CallChromeVisibility(isRevealed = false).isVisible(CallChromeElement.FeaturedCapsule)).isFalse()
        assertThat(CallChromeVisibility(isRevealed = false, isStageFullScreen = true).isVisible(CallChromeElement.FeaturedCapsule)).isFalse()
        assertThat(CallChromeVisibility(isRevealed = false).toggled().isVisible(CallChromeElement.FeaturedCapsule)).isTrue()
    }

    @Test
    fun `a mode stows the featured capsule with the rest of the chrome`() {
        assertThat(CallChromeVisibility(isModeActive = true).isVisible(CallChromeElement.FeaturedCapsule)).isFalse()
    }
}
