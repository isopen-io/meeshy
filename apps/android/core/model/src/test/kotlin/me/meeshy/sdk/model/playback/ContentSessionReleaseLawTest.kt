package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `ContentSessionReleaseTests` (iOS, #11039 / #11040, decision porteur j du 2026-10-20) :
 * Meeshy rend la main a l'application qu'il a interrompue, en fin de lecture, apres une pause,
 * ET apres une interruption qui ne debouche pas sur une reprise.
 */
class ContentSessionReleaseLawTest {

    // MARK: - Delais

    @Test
    fun `les delais de la loi sont de 3 s, 1 s et 0,4 s`() {
        assertThat(ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS).isEqualTo(3_000L)
        assertThat(ContentSessionReleaseLaw.INTERRUPTION_RESUME_GRACE_MILLIS).isEqualTo(1_000L)
        assertThat(ContentSessionReleaseLaw.SWIPE_HANDOVER_GRACE_MILLIS).isEqualTo(400L)
    }

    @Test
    fun `chaque raison de liberation attend son propre delai`() {
        assertThat(ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.PlaybackEnded)).isEqualTo(0L)
        assertThat(ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.UserPause)).isEqualTo(3_000L)
        assertThat(ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.UnresumedInterruption))
            .isEqualTo(1_000L)
        assertThat(ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.SwipeHandover))
            .isEqualTo(400L)
    }

    @Test
    fun `aucune raison de liberation ne definit un delai negatif`() {
        val delays = ContentSessionReleaseReason.entries.map(ContentSessionReleaseLaw::delayMillis)

        assertThat(delays.all { it >= 0L }).isTrue()
    }

    // MARK: - Fin d'interruption

    @Test
    fun `la fin d'une interruption appelle la liberation`() {
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.InterruptionEndedShouldNotResume))
            .isTrue()
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.InterruptionEndedShouldResume))
            .isTrue()
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.CallEndedShouldResume)).isTrue()
    }

    @Test
    fun `ni le debut d'une interruption ni un changement de sortie n'appellent la liberation`() {
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.InterruptionBegan)).isFalse()
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.RouteChangedOldDeviceUnavailable))
            .isFalse()
        assertThat(ContentSessionReleaseLaw.endsAnInterruption(MediaSessionEvent.RouteChangedOther)).isFalse()
    }

    // MARK: - Execution de la liberation

    @Test
    fun `une liberation s'execute quand rien n'a repris et que rien ne joue`() {
        assertThat(ContentSessionReleaseLaw.mayRelease(activatedSinceRequest = false, meeshyStillPlays = false))
            .isTrue()
    }

    @Test
    fun `une relance dans l'intervalle annule la liberation`() {
        assertThat(ContentSessionReleaseLaw.mayRelease(activatedSinceRequest = true, meeshyStillPlays = false))
            .isFalse()
    }

    @Test
    fun `un lecteur Meeshy qui joue encore empeche la liberation`() {
        assertThat(ContentSessionReleaseLaw.mayRelease(activatedSinceRequest = false, meeshyStillPlays = true))
            .isFalse()
    }

    @Test
    fun `une relance pendant la pause de trois secondes annule la liberation, pas une relance apres`() {
        val delay = ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.UserPause)

        val relaunchedAtTwoSeconds = 2_000L < delay
        val relaunchedAtFourSeconds = 4_000L < delay

        assertThat(ContentSessionReleaseLaw.mayRelease(relaunchedAtTwoSeconds, meeshyStillPlays = false)).isFalse()
        assertThat(ContentSessionReleaseLaw.mayRelease(relaunchedAtFourSeconds, meeshyStillPlays = false)).isTrue()
    }

    @Test
    fun `la reprise dans la seconde de grace apres une interruption annule la liberation`() {
        val grace = ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.UnresumedInterruption)

        val resumedAfter300Millis = 300L < grace

        assertThat(ContentSessionReleaseLaw.mayRelease(resumedAfter300Millis, meeshyStillPlays = false)).isFalse()
    }

    @Test
    fun `le canvas qui arrive au balayage dans les 0,4 s annule la desactivation`() {
        val grace = ContentSessionReleaseLaw.delayMillis(ContentSessionReleaseReason.SwipeHandover)

        val nextCanvasTakesOverAfter120Millis = 120L < grace

        assertThat(ContentSessionReleaseLaw.mayRelease(nextCanvasTakesOverAfter120Millis, meeshyStillPlays = false))
            .isFalse()
    }
}
