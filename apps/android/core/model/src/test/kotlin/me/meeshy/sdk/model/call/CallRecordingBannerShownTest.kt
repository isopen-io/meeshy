package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** R1.5 (#17795) — ma vignette fait place au bandeau d'enregistrement tant qu'il y a une carte, une capsule ou un avis. */
class CallRecordingBannerShownTest {

    @Test
    fun `au repos, sans avis, aucun bandeau d'enregistrement`() {
        assertThat(CallRecordingState().isBannerShown).isFalse()
    }

    @Test
    fun `une demande, l'attente de l'accord et l'enregistrement montrent un bandeau`() {
        val phases = listOf(
            CallRecordingPhase.Asking("c1"),
            CallRecordingPhase.Pending("c1", "r1", "u2", mine = false, mustAnswer = true),
            CallRecordingPhase.Recording("c1", "r1", "u2", mine = false),
        )

        phases.forEach { assertThat(CallRecordingState(phase = it).isBannerShown).isTrue() }
    }

    @Test
    fun `un avis seul, apres la fin, montre encore un bandeau`() {
        assertThat(CallRecordingState(notice = CallRecordingNotice.Saved).isBannerShown).isTrue()
    }
}
