package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #19701 — l'appel réduit a UNE forme flottante, la vignette, et deux pas : la capsule puis la vignette. La vignette se
 * monte APRÈS la navigation et les bannières (donc au-dessus de ce qui se voit) et ne porte aucun bouton (#19696).
 */
class CallVignetteWiringTest {
    private fun source(path: String): String = File(path).readText()
    private val app = source("src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt")
    private val vignette = source("../feature/calls/src/main/kotlin/me/meeshy/app/calls/CallVignette.kt")

    @Test
    fun `the pill collapses into the vignette and the two never show together`() {
        assertThat(app).contains("onCollapse = { callVignette = true }")
        assertThat(app).contains("val showsCallPill = callReduced && !callVignette")
        assertThat(app).contains("if (callReduced && callVignette) MinimizedCallVignette(")
    }

    @Test
    fun `the vignette is mounted above the navigation and the in-app banners`() {
        val vignetteAt = app.indexOf("MinimizedCallVignette(callViewModel")
        assertWithMessage("après la navigation").that(vignetteAt).isGreaterThan(app.indexOf("NavHost("))
        assertWithMessage("après la bannière in-app").that(vignetteAt).isGreaterThan(app.indexOf("NotificationBannerHost("))
    }

    @Test
    fun `the vignette carries no control, only the person and name with duration`() {
        listOf("onToggleMute", "onToggleSpeaker", "onHangUp", "IconButton").forEach {
            assertWithMessage("aucun bouton : $it").that(vignette).doesNotContain(it)
        }
        assertThat(vignette).contains("CallReducedCaption.caption(title, pillStatusLine(state))")
        assertThat(vignette).contains("CallVignetteGlide.landing(")
    }
}
