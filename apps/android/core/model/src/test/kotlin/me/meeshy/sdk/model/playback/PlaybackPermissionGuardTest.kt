package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de la garde `playbackPermissionGuard` d'iOS (BUG A, round 4) : un appel Meeshy actif bloque
 * le demarrage et la reprise, quelle qu'en soit l'origine — touche, commande d'ecran verrouille,
 * lecture automatique —, mais jamais la pause ni l'arret.
 */
class PlaybackPermissionGuardTest {

    @Test
    fun `un appel actif bloque le demarrage`() {
        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(PlaybackPermissionGuard.allows(PlaybackCommand.Start, origin, callActive = true)).isFalse()
        }
    }

    @Test
    fun `un appel actif bloque la reprise, meme par commande d'ecran verrouille`() {
        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(PlaybackPermissionGuard.allows(PlaybackCommand.Resume, origin, callActive = true)).isFalse()
        }
        assertThat(
            PlaybackPermissionGuard.allows(PlaybackCommand.Resume, PlaybackCommandOrigin.LockScreen, callActive = true),
        ).isFalse()
    }

    @Test
    fun `un appel actif ne bloque jamais la pause`() {
        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(PlaybackPermissionGuard.allows(PlaybackCommand.Pause, origin, callActive = true)).isTrue()
        }
    }

    @Test
    fun `un appel actif ne bloque jamais l'arret`() {
        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(PlaybackPermissionGuard.allows(PlaybackCommand.Stop, origin, callActive = true)).isTrue()
        }
    }

    @Test
    fun `un appel actif bloque le changement de piste, qui demarre un autre contenu`() {
        assertThat(
            PlaybackPermissionGuard.allows(PlaybackCommand.SkipToNext, PlaybackCommandOrigin.LockScreen, true),
        ).isFalse()
        assertThat(
            PlaybackPermissionGuard.allows(PlaybackCommand.SkipToPrevious, PlaybackCommandOrigin.LockScreen, true),
        ).isFalse()
    }

    @Test
    fun `sans appel, toute commande est permise quelle que soit son origine`() {
        PlaybackCommand.entries.forEach { command ->
            PlaybackCommandOrigin.entries.forEach { origin ->
                assertThat(PlaybackPermissionGuard.allows(command, origin, callActive = false)).isTrue()
            }
        }
    }

    @Test
    fun `seules les commandes qui font sonner sont gardees`() {
        val gated = PlaybackCommand.entries.filter { it.startsPlayback }

        assertThat(gated).containsExactly(
            PlaybackCommand.Start,
            PlaybackCommand.Resume,
            PlaybackCommand.SkipToNext,
            PlaybackCommand.SkipToPrevious,
        )
    }

    @Test
    fun `pendant un appel la session appartient a l'appel et le contenu n'y touche pas`() {
        assertThat(PlaybackPermissionGuard.mayManageSession(callActive = true)).isFalse()
        assertThat(PlaybackPermissionGuard.mayManageSession(callActive = false)).isTrue()
    }
}
