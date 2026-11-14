package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.call.CallTopBanner
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
        assertThat(presence).contains("presenceTranslationFraction(")
        assertThat(presence).doesNotContain("slideInVertically(")
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

    @Test
    fun `R3_3 - Annuler devient Arreter en fondu croise, et la capsule prend sa nouvelle largeur sans saut`() {
        val stop = block(code("CallPillControls.kt"), "internal fun CallShareStopButton(", "\n}")
        assertThat(stop).contains("AnimatedContent(")
        assertThat(stop).contains("callWordSwap(")

        val pill = block(code("CallRecordingControls.kt"), "internal fun CallRecordingStatusPill(", "\n}")
        assertThat(pill).contains("AnimatedContent(")
        assertThat(pill).contains("callWordSwap(")
        assertThat(pill).doesNotContain("Crossfade(")

        val swap = block(code("CallPillControls.kt"), "internal fun callWordSwap(", "\n}")
        assertThat(swap).contains("SizeTransform(")
        assertThat(swap).contains("CallChromeStow.fadeMillis(reduceMotion)")
    }

    private fun liveFrameUi() = code("CallLiveFrameUi.kt")

    @Test
    fun `#17820 C2_1 et C3_4 - la carte de proposition et la capsule de reponse sont le verre de l'appel, plus un aplat noir`() {
        val ui = liveFrameUi()
        assertThat(ui).doesNotContain("Color.Black.copy(alpha = 0.55f)")
        assertThat(ui).doesNotContain("MeeshyGlassSurface(")
        val card = block(ui, "internal fun CallLiveFrameProposalCard(", "\n}")
        assertThat(card).contains("CallGlassPlate(")
        assertThat(card).contains("CallToneScrim()")
        val notice = block(ui, "internal fun CallLiveFrameNotice(", "\n}")
        assertThat(notice).contains("CallGlassPlate(")
        assertThat(notice).contains("CallToneScrim()")
    }

    @Test
    fun `#17820 C2_1 - le bandeau du cadre tient la marge laterale de la pile, celle du partage`() {
        val status = block(liveFrameUi(), "internal fun CallLiveFrameStatus(", "\nprivate fun suspendedText(")
        assertThat(status).contains("CallTopBannerStack.HORIZONTAL_MARGIN_DP.dp")
        assertThat(status).doesNotContain("MeeshySpacing.lg")
    }

    @Test
    fun `#17820 C2_7 et C3_6 - carte, capsule, avis et pause entrent et repartent par CallBannerPresence`() {
        val status = block(liveFrameUi(), "internal fun CallLiveFrameStatus(", "\nprivate fun suspendedText(")
        assertThat(status).contains("CallBannerPresence(")
        assertThat(status).contains("reportsTopBannerHeight(CallTopBanner.LiveFrame)")
    }

    @Test
    fun `#17820 C3_6 - le cadre lui-meme entre et sort en fondu par la meme loi de presence, sans glisser`() {
        val overlay = block(liveFrameUi(), "class CallLiveFrameOverlay", "internal object CallLiveFrameSources")
        assertThat(overlay).contains("CallBannerPresence(design, travels = false)")
        val host = code("CallTopBannerStackHost.kt")
        assertThat(host).doesNotContain("CallFadePresence(")
        val presence = block(host, "internal fun <T : Any> CallBannerPresence(", "\n}")
        assertThat(presence).contains("travels && CallTopBannerStack.leavesTowardTop(reduceMotion)")
    }

    @Test
    fun `#17820 C2_10 - la proposition ne se montre que par la loi du duo video`() {
        val ui = liveFrameUi()
        assertThat(ui).contains("CallLiveFrameRule.mayShowProposal(")
        assertThat(code("CallScreen.kt")).contains("isGroupStage = groupShown")
    }

    @Test
    fun `#17845 L1_9 - la presence d'un bandeau ne remesure jamais la pile, elle ne touche que la transformation et l'opacite`() {
        val presence = block(code("CallTopBannerStackHost.kt"), "internal fun <T : Any> CallBannerPresence(", "\n}")
        assertThat(presence).doesNotContain("expandVertically(")
        assertThat(presence).doesNotContain("shrinkVertically(")
        assertThat(presence).doesNotContain("AnimatedVisibility(")
        assertThat(presence).contains("graphicsLayer {")
        assertThat(presence).contains("CallTopBannerStack.presenceTranslationFraction(")
        assertThat(presence).contains("CallChromeStow.fadeMillis(reduceMotion)")
        assertThat(code("CallTopBannerStackHost.kt")).doesNotContain("androidx.compose.animation.expandVertically")
    }

    @Test
    fun `#17845 L1_9 - les bandeaux voisins glissent a leur nouvelle place par une transformation lue au dessin`() {
        val host = code("CallTopBannerStackHost.kt")
        val glide = block(host, "internal fun Modifier.glidesToItsPlace(", "\n}")
        assertThat(glide).contains("CallTopBannerStack.glideTranslationPx(")
        assertThat(glide).contains("translationY =")
        assertThat(block(host, "internal fun <T : Any> CallBannerPresence(", "\n}")).contains("glidesToItsPlace(")
    }

    @Test
    fun `#17845 L1_9 - le glissement d'un voisin lit sa nouvelle place au placement, sans image perdue au depart`() {
        val host = code("CallTopBannerStackHost.kt")
        val glide = block(host, "internal fun Modifier.glidesToItsPlace(", "\n}")
        assertThat(glide).contains("coordinates?.positionInParent()")
        assertThat(glide).contains("placeWithLayer(")
        assertThat(glide).doesNotContain("onPlaced")
        assertThat(glide).doesNotContain("snapTo(")
    }

    @Test
    fun `#17845 L1_9 - un bandeau qui repart rend sa place des le depart, la pile se referme pendant qu'il monte`() {
        val presence = block(code("CallTopBannerStackHost.kt"), "internal fun <T : Any> CallBannerPresence(", "\n}")
        assertThat(presence).contains("CallTopBannerStack.keepsPlaceWhileLeaving(")
        assertThat(presence).contains("yieldsItsPlace(")
    }

    @Test
    fun `#17845 L4_11 - la grille de groupe cede la place a la pile mesuree, comme ma vignette, au lieu de passer dessous`() {
        val host = code("CallTopBannerStackHost.kt")
        assertThat(host).contains("internal val LocalCallGroupGridClearance")
        assertThat(host).contains("CallTopBannerStack.present(")
        assertThat(host).contains("CallTopBannerStack.groupGridClearanceDp(")
        assertThat(host).contains("animateDpAsState(")

        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("CallGroupStageTopReserve(")
        assertThat(layout).contains("LocalCallGroupGridClearance.current")
        assertThat(layout).doesNotContain("Spacer(Modifier.height(MeeshySpacing.xl))\n\n            if (groupStage != null)")

        val screen = code("CallScreen.kt")
        assertThat(screen).contains("rememberGroupGridBannerClearance(")
        assertThat(screen).contains("LocalCallGroupGridClearance provides")
    }

    @Test
    fun `#17845 L4_11 - le cadre en direct dit sa hauteur et s'oublie en partant, pour que la grille lui cede sa place`() {
        val host = code("CallTopBannerStackHost.kt")
        assertThat(host).contains("fun forget(banner: CallTopBanner, owner: Any)")
        assertThat(host).contains("onDispose { heights.forget(banner, owner) }")
    }

    @Test
    fun `#17845 L4_11 - la grille glisse par une transformation lue au dessin, sa mise en page ne change qu'une fois par mouvement`() {
        val host = code("CallTopBannerStackHost.kt")
        val grid = block(host, "internal fun rememberGroupGridBannerClearance(", "\n}")
        assertThat(grid).contains("CallTopBannerStack.groupGridLayoutClearanceDp(")
        assertThat(grid).doesNotContain("animateDpAsState(")
        assertThat(host).contains("CallTopBannerStack.groupGridShiftDp(")

        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("glidesUnderTheBannerStack(gridClearance)")
        assertThat(layout).contains("graphicsLayer { translationY = clearance.shift.toPx() }")
        assertThat(block(layout, "private fun CallGroupStageTopReserve(", "\n}")).contains("clearance?.layout")
    }

    @Test
    fun `#17845 L4_11 - en duo, la pile ne pousse rien, seule la grille de groupe lui cede sa place`() {
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("LocalCallGroupGridClearance.current.takeIf { groupStage != null }")
    }

    @Test
    fun `#17845 L4_11 - deux bandeaux d'un meme rang ne s'effacent pas l'un l'autre en partant`() {
        val heights = CallTopBannerHeights()
        val card = Any()
        val pill = Any()

        heights.report(CallTopBanner.Recording, 112f, owner = card)
        heights.report(CallTopBanner.Recording, 40f, owner = pill)
        heights.forget(CallTopBanner.Recording, owner = card)
        assertThat(heights.snapshot()).containsEntry(CallTopBanner.Recording, 40f)

        heights.forget(CallTopBanner.Recording, owner = pill)
        assertThat(heights.isReported(CallTopBanner.Recording)).isFalse()
    }
}
