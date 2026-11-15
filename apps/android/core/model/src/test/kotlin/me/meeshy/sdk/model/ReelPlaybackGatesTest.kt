package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ReelPreloadWindow.Tier
import me.meeshy.sdk.model.ReelSwitchWork.Kind
import me.meeshy.sdk.model.ReelSwitchWork.Phase
import org.junit.Test

class ReelPlaybackGatesTest {
    @Test
    fun `l autostart exige actif, revelation terminee et aucun appel`() {
        assertThat(ReelMediaAutostart.shouldStart(true, true, false)).isTrue()
        assertThat(ReelMediaAutostart.shouldStart(false, true, false)).isFalse()
        assertThat(ReelMediaAutostart.shouldStart(true, false, false)).isFalse()
        assertThat(ReelMediaAutostart.shouldStart(true, true, true)).isFalse()
    }

    @Test
    fun `l audio ne se recharge pas sur la meme url`() {
        assertThat(ReelMediaAutostart.shouldLoadAudio("u", "u")).isFalse()
        assertThat(ReelMediaAutostart.shouldLoadAudio(null, "u")).isTrue()
    }

    @Test
    fun `le temps regarde ne s attache qu a une video`() {
        assertThat(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(FeedMediaType.VIDEO)).isTrue()
        assertThat(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(FeedMediaType.AUDIO)).isFalse()
        assertThat(ReelWatchAttachmentPolicy.shouldAttachVideoWatch(null)).isFalse()
    }

    @Test
    fun `un reel a scene n attache le moteur que s il a charge SON media porteur`() {
        fun attaches(loaded: String?, carrier: String? = "c") =
            ReelSceneRouting.attachesSharedVideoWatch(true, carrier, loaded, FeedMediaType.VIDEO)
        assertThat(attaches("c")).isTrue()
        assertThat(attaches("autre")).isFalse()
        assertThat(attaches(null)).isFalse()
        assertThat(attaches("c", carrier = null)).isFalse()
    }

    @Test
    fun `un reel sans scene suit le type du media joue`() {
        assertThat(ReelSceneRouting.attachesSharedVideoWatch(false, null, null, FeedMediaType.VIDEO)).isTrue()
        assertThat(ReelSceneRouting.attachesSharedVideoWatch(false, null, null, FeedMediaType.IMAGE)).isFalse()
    }

    @Test
    fun `le son emprunte n est joue par la page que sans scene ni media`() {
        assertThat(ReelSceneRouting.pageOwnsBorrowedSound(false, false, true)).isTrue()
        assertThat(ReelSceneRouting.pageOwnsBorrowedSound(true, false, true)).isFalse()
        assertThat(ReelSceneRouting.pageOwnsBorrowedSound(false, true, true)).isFalse()
        assertThat(ReelSceneRouting.pageOwnsBorrowedSound(false, false, false)).isFalse()
    }

    @Test
    fun `play decode et mount partent sur tout reseau, prime et idle selon le reglage`() {
        listOf(Tier.PLAY, Tier.DECODE, Tier.MOUNT).forEach { tier ->
            val profile = ReelTransferPolicy.profile(tier, AutoDownloadPolicy.NEVER)
            assertThat(profile.priority).isEqualTo(ReelTransferPolicy.Priority.IMMEDIATE)
            assertThat(profile.allowsExpensiveNetworkAccess).isTrue()
        }
        listOf(Tier.PRIME, Tier.IDLE).forEach { tier ->
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.ALWAYS).allowsExpensiveNetworkAccess).isTrue()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR).allowsExpensiveNetworkAccess).isTrue()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.WIFI_ONLY).allowsExpensiveNetworkAccess).isFalse()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.NEVER).allowsExpensiveNetworkAccess).isFalse()
            assertThat(ReelTransferPolicy.profile(tier, AutoDownloadPolicy.ALWAYS).priority)
                .isEqualTo(ReelTransferPolicy.Priority.DEFERRABLE)
        }
    }

    @Test
    fun `pendant le geste seul un lecteur deja attache joue`() {
        assertThat(ReelSwitchWork.permitted(Phase.GESTURE, Kind.Video(attachedPlayer = true)))
            .containsExactly(ReelSwitchWork.PAUSE_OUTGOING, ReelSwitchWork.PLAY_ATTACHED_PLAYER)
        assertThat(ReelSwitchWork.permitted(Phase.GESTURE, Kind.Video(attachedPlayer = false)))
            .containsExactly(ReelSwitchWork.PAUSE_OUTGOING)
        assertThat(ReelSwitchWork.permitted(Phase.GESTURE, Kind.Scene)).containsExactly(ReelSwitchWork.PAUSE_OUTGOING)
    }

    @Test
    fun `une fois pose, le travail lourd s execute selon la nature du reel`() {
        val video = ReelSwitchWork.permitted(Phase.SETTLED, Kind.Video(false))
        assertThat(video).containsAtLeast(ReelSwitchWork.LOAD_ENGINE, ReelSwitchWork.CONFIGURE_PIP, ReelSwitchWork.REFRESH_POOL)
        assertThat(video).doesNotContain(ReelSwitchWork.START_SCENE)
        assertThat(ReelSwitchWork.permitted(Phase.SETTLED, Kind.Scene)).contains(ReelSwitchWork.START_SCENE)
        assertThat(ReelSwitchWork.permitted(Phase.SETTLED, Kind.Audio)).contains(ReelSwitchWork.START_AUDIO)
        assertThat(ReelSwitchWork.permitted(Phase.SETTLED, Kind.Image)).containsExactly(
            ReelSwitchWork.PAUSE_OUTGOING, ReelSwitchWork.REPORT_WATCH, ReelSwitchWork.MOUNT_ACTIVE_CHROME,
        )
    }

    @Test
    fun `la phase et l engagement suivent election et pose`() {
        assertThat(ReelSwitchWork.phase(false, true)).isNull()
        assertThat(ReelSwitchWork.phase(true, false)).isEqualTo(Phase.GESTURE)
        assertThat(ReelSwitchWork.phase(true, true)).isEqualTo(Phase.SETTLED)
        assertThat(ReelSwitchWork.engages(true, false)).isFalse()
        assertThat(ReelSwitchWork.engages(true, true)).isTrue()
        assertThat(ReelSwitchWork.mayPlayAttachedPlayer(true, true, false, true)).isTrue()
        assertThat(ReelSwitchWork.mayPlayAttachedPlayer(true, true, true, true)).isFalse()
        assertThat(ReelSwitchWork.mayPlayAttachedPlayer(true, false, false, true)).isFalse()
    }

    @Test
    fun `la barre de lecture ne vole pas le balayage vertical`() {
        assertThat(ReelScrubAxis.claims(10f, 2f, alreadySeeking = false)).isTrue()
        assertThat(ReelScrubAxis.claims(2f, 10f, alreadySeeking = false)).isFalse()
        assertThat(ReelScrubAxis.claims(2f, 10f, alreadySeeking = true)).isTrue()
    }

    @Test
    fun `chaque passage ne se mesure qu une fois`() {
        val elected = ReelSwitchMeter().elect("a", 1_000)
        val (other, none) = elected.mediaStarted("b", 1_100)
        assertThat(none).isNull()
        val (done, ms) = other.mediaStarted("a", 1_250)
        assertThat(ms).isEqualTo(250)
        assertThat(done.mediaStarted("a", 1_300).second).isNull()
    }
}
