package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import org.junit.Test

class NowPlayingReturnPolicyTest {

    private val context = ActiveAudioContext(conversationId = "c1", messageId = "m1")

    @Test
    fun `une lecture en cours dans une conversation connue ramene au message`() {
        val target = NowPlayingReturnPolicy.target(context, isPlaying = true) { it == "c1" }
        assertThat(target).isEqualTo(NowPlayingReturnTarget("c1", "m1"))
    }

    @Test
    fun `une lecture en pause ne detourne pas l'ouverture de l'app`() {
        assertThat(NowPlayingReturnPolicy.target(context, isPlaying = false) { true }).isNull()
    }

    @Test
    fun `sans contexte actif on ne navigue pas`() {
        assertThat(NowPlayingReturnPolicy.target(null, isPlaying = true) { true }).isNull()
    }

    @Test
    fun `l'audio d'un post n'est pas une conversation connue`() {
        assertThat(NowPlayingReturnPolicy.target(context, isPlaying = true) { false }).isNull()
    }

    @Test
    fun `toucher le mini-lecteur navigue meme en pause`() {
        assertThat(NowPlayingReturnPolicy.miniPlayerTarget(context)).isEqualTo(NowPlayingReturnTarget("c1", "m1"))
        assertThat(NowPlayingReturnPolicy.miniPlayerTarget(ActiveAudioContext("", "m1"))).isNull()
    }

    @Test
    fun `seul un vrai retour d'arriere-plan declenche une fois`() {
        val tracker = BackgroundReturnTracker()
        assertThat(tracker.onBecameActive()).isFalse()
        tracker.onEnteredBackground()
        assertThat(tracker.onBecameActive()).isTrue()
        assertThat(tracker.onBecameActive()).isFalse()
    }

    private fun card(conversationId: String? = "c1", messageId: String? = "m1") =
        VoicePlaybackCard(attachmentId = "a1", conversationId = conversationId, messageId = messageId)

    @Test
    fun `toucher la notification d'un vocal en lecture ouvre la conversation sur la bulle`() {
        assertThat(NowPlayingReturnPolicy.notificationTarget(card(), isPlaying = true))
            .isEqualTo(NowPlayingReturnTarget("c1", "m1"))
    }

    @Test
    fun `la notification d'un vocal en pause n'ouvre aucune conversation`() {
        assertThat(NowPlayingReturnPolicy.notificationTarget(card(), isPlaying = false)).isNull()
    }

    @Test
    fun `la notification d'un vocal hors conversation n'ouvre rien`() {
        assertThat(NowPlayingReturnPolicy.notificationTarget(card(conversationId = null), isPlaying = true)).isNull()
        assertThat(NowPlayingReturnPolicy.notificationTarget(card(conversationId = " "), isPlaying = true)).isNull()
    }

    @Test
    fun `sans identifiant de message la notification ouvre la conversation seule`() {
        assertThat(NowPlayingReturnPolicy.notificationTarget(card(messageId = null), isPlaying = true))
            .isEqualTo(NowPlayingReturnTarget("c1", ""))
    }
}
