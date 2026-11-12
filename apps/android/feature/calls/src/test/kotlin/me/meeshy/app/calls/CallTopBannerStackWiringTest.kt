package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17795 — la garde de source de la pile des bandeaux du haut, miroir de iOS `CallTopBannerStackView` : la capsule de capture,
 * la carte d'accord et la capsule d'enregistrement sont des MAILLONS de la pile (pas des couches posées en dur), elles arrivent
 * par le haut et repartent par lui, passent par le verre de l'écran d'appel, et la pile se pose après les modes.
 */
class CallTopBannerStackWiringTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallControlGlass.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    private fun block(source: String, from: String, until: String): String {
        val start = source.indexOf(from)
        assertThat(start).isAtLeast(0)
        val end = source.indexOf(until, start + from.length)
        assertThat(end).isGreaterThan(start)
        return source.substring(start, end)
    }

    @Test
    fun `R1_1 - la capsule de capture est un maillon de la pile, plus une couche posee a 56 dp`() {
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).doesNotContain("CallCaptureCapsule(")
        assertThat(layout).doesNotContain("CALL_CAPTURE_CAPSULE_TOP")

        val views = code("CallCaptureViews.kt")
        assertThat(views).doesNotContain("CALL_CAPTURE_CAPSULE_TOP")
        val overlay = block(views, "class CallCaptureBannerOverlay", "@Module")
        assertThat(overlay).contains("override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner")
        assertThat(overlay).contains("CallTopBannerStack.priority(CallTopBanner.Capture)")
        assertThat(views).contains("@IntoSet")
    }

    @Test
    fun `R1_6 - la capsule de capture arrive par le haut, repart par le haut, et mesure sa hauteur pour ma vignette`() {
        val overlay = block(code("CallCaptureViews.kt"), "class CallCaptureBannerOverlay", "@Module")

        assertThat(overlay).contains("CallBannerPresence(")
        assertThat(overlay).contains("reportsTopBannerHeight(CallTopBanner.Capture)")
        assertThat(overlay).contains("!context.inPip")
    }

    @Test
    fun `la presence d'un bandeau est UNE loi de mouvement, partagee par le partage, l'enregistrement et la capture`() {
        val host = code("CallTopBannerStackHost.kt")
        val presence = block(host, "internal fun <T : Any> CallBannerPresence(", "\n}")
        assertThat(presence).contains("CallTopBannerStack.leavesTowardTop(reduceMotion)")
        assertThat(presence).contains("slideInVertically(")
        assertThat(presence).contains("slideOutVertically(")
        assertThat(presence).contains("CallChromeStow.fadeMillis(reduceMotion)")

        assertThat(code("CallScreenShareBanner.kt")).contains("CallBannerPresence(")
        assertThat(code("CallScreenShareBanner.kt")).doesNotContain("slideInVertically(")
        assertThat(code("CallRecordingCapability.kt")).contains("CallBannerPresence(")
    }

    @Test
    fun `R2_1 - la carte d'accord prend la place enregistrement de la pile, sous l'en-tete, plus au milieu de l'ecran`() {
        val capability = code("CallRecordingCapability.kt")
        val consent = block(capability, "class CallRecordingConsentOverlay", "class CallRecordingStatusOverlay")

        assertThat(consent).contains("override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner")
        assertThat(consent).contains("CallTopBannerStack.priority(CallTopBanner.Recording)")
        assertThat(consent).doesNotContain("CallOverlaySlot.Center")
        assertThat(consent).doesNotContain("context.state.peerName")
        assertThat(consent).contains("requesterName(context.state.participantNames)")
    }

    @Test
    fun `R2_5 - la pile est composee apres les modes Effets et Montage, la carte ne se perd pas dessous`() {
        val screen = code("CallScreen.kt")
        val stack = screen.indexOf("CallTopBannerStackHost(")
        assertThat(stack).isAtLeast(0)
        assertThat(stack).isGreaterThan(screen.indexOf("CallEffectsMode("))
        assertThat(stack).isGreaterThan(screen.indexOf("CallMontageMode("))
    }

    @Test
    fun `R2_10 et R3_6 - la carte et la capsule arrivent par le haut, la capsule se range avec l'en-tete`() {
        val capability = code("CallRecordingCapability.kt")
        val consent = block(capability, "class CallRecordingConsentOverlay", "class CallRecordingStatusOverlay")
        assertThat(consent).contains("CallBannerPresence(")

        val status = block(capability, "class CallRecordingStatusOverlay", "@Module")
        assertThat(status).contains("CallBannerPresence(")
        assertThat(status).contains("stowsToward = CallVerticalEdge.Top")
        assertThat(status).contains("edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp")
        assertThat(status).contains("reportsTopBannerHeight(CallTopBanner.Recording)")
    }

    @Test
    fun `R1_5 et R3_10 - ma vignette descend sous toute la pile, mesuree, et suit son mouvement`() {
        val host = code("CallTopBannerStackHost.kt")
        assertThat(host).contains("CallTopBannerStack.countedForSelfTile(")
        assertThat(host).contains("CallTopBannerStack.selfTileClearanceDp(counted,")
        assertThat(host).contains("animateDpAsState(")

        val screen = code("CallScreen.kt")
        assertThat(screen).contains("rememberSelfTileBannerClearance(")
        assertThat(screen).contains("LocalCallTopBannerHeights provides")
        assertThat(code("CallScreenShareBanner.kt")).contains("reportsTopBannerHeight(CallTopBanner.ScreenShare)")
    }

    @Test
    fun `R3_12 et R2_11 - la carte, la capsule et l'avis passent par le verre de l'ecran d'appel, sous son voile`() {
        for (name in listOf("CallRecordingControls.kt", "CallRecordingConsentCard.kt")) {
            val source = code(name)
            assertThat(source).doesNotContain("MeeshyGlassSurface(")
            assertThat(source).contains("CallGlassPlate(")
            assertThat(source).contains("CallToneScrim()")
            assertThat(source).doesNotContain("Color.Black.copy(alpha = 0.25f)")
        }
        assertThat(Regex("""CallGlassPlate\(""").findAll(code("CallRecordingControls.kt")).count()).isEqualTo(2)
    }

    @Test
    fun `R2_2 - la carte est la question, puis Refuser en verre et Accepter en blanc plein, a parts egales`() {
        val card = code("CallRecordingConsentCard.kt")

        assertThat(card).doesNotContain("askDetail")
        assertThat(card).doesNotContain("accent")
        assertThat(card).contains("CallGlassButtonSurface(")
        assertThat(card).contains(".background(Color.White, CircleShape)")
        assertThat(card).contains("Modifier.weight(1f)")
    }

    @Test
    fun `R3_3 - Arreter est la capsule blanche a encre rouge, qui dit le mot, la meme que celle du partage`() {
        val controls = code("CallRecordingControls.kt")

        assertThat(controls).doesNotContain("MeeshyIcons.Stop")
        assertThat(controls).contains("CallShareStopButton(")
        assertThat(controls).contains("word = stopWord")
        assertThat(controls).contains("label = stopLabel")
        val stop = block(code("CallPillControls.kt"), "internal fun CallShareStopButton(", "\n}")
        assertThat(stop).contains("word: String")
        assertThat(stop).contains("label: String")
    }
}
