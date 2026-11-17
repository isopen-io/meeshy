package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #18214 · #18220 — la garde de source d'une scène qui ne saute pas (loi 17) et d'un en-tête qui flotte sur la grille (P11.1).
 * Les règles vivent dans `:core:model` (`CallRemoteVideoFade`, `CallGroupStageSizing`, `CallChromeStow`) ; l'écran ne fait que
 * les poser. Une `SurfaceView` ne se mélange pas à l'alpha de Compose : ce qui paraît ou part fond par un VOILE opaque posé sur
 * l'image, jamais en fondant l'image elle-même.
 */
class CallSceneWithoutJumpGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallStage.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    private fun block(source: String, from: String, until: String): String {
        val start = source.indexOf(from)
        assertThat(start).isAtLeast(0)
        val end = source.indexOf(until, start + from.length)
        return if (end < 0) source.substring(start) else source.substring(start, end)
    }

    /** Loi 17.1 — le micro coupé de l'autre paraît et repart en fondu (iOS : `.transition(.opacity)`), court sous « Réduire les animations ». */
    @Test
    fun `loi 17_1 - le badge du micro coupe parait et repart en fondu`() {
        val stage = code("CallStage.kt")
        val badge = block(stage, "visible = state.isPeerMuted && !featuresLocal", "CallPeerMutedBadge(")
        assertThat(badge).contains("enter = fadeIn(")
        assertThat(badge).contains("exit = fadeOut(")
        assertThat(stage).contains("CallChromeStow.fadeMillis(reduceMotion)")
        assertThat(stage).doesNotContain("if (state.isPeerMuted && !featuresLocal) {")
        assertThat(Regex("""CallPeerMutedBadge\(""").findAll(stage).count()).isEqualTo(1)
    }

    /** Loi 17.1 — ma vignette paraît et repart en fondu, même à la connexion ; son image n'est montée que sous un voile qui se lève. */
    @Test
    fun `loi 17_1 - ma vignette parait et repart en fondu, son image sous un voile qui se leve`() {
        val stage = code("CallStage.kt")
        assertThat(stage).doesNotContain("if (layout.showsSelfTile) {")
        assertThat(stage).contains("visible = showsSelfTile")
        assertThat(stage).contains("showsSelfTile = layout.showsSelfTile")
        val presence = block(stage, "private fun CallSelfTilePresence(", "\n}")
        assertThat(presence).contains("MutableTransitionState(false)")
        assertThat(presence).contains("presence.targetState = visible")
        assertThat(presence).contains("CallRemoteVideoFade.presenceFrameDelayMillis(")
        assertThat(presence).contains("CallRemoteVideoFade.presenceVeilDelayMillis(")
        assertThat(presence).contains("CallRemoteVideoFade.mountsTileContent(")
        assertThat(presence).contains("LaunchedEffect(visible, millis)")
        assertThat(presence).contains("graphicsLayer { alpha = veil.value }")
    }

    /** Loi 17.12 — ma caméra qui se coupe ou se rallume : mon image et le corps « caméra coupée » passent l'un à l'autre en fondu. */
    @Test
    fun `loi 17_12 - ma vignette passe de mon image au corps camera coupee en fondu`() {
        val stage = code("CallStage.kt")
        assertThat(stage).doesNotContain("!state.isCameraOn -> CallSelfCameraOffBody()")
        val feed = block(stage, "private fun CallSelfTileFeed(", "\n}")
        assertThat(feed).contains("CallRemoteVideoFade.durationMillis(")
        assertThat(feed).contains("CallRemoteVideoFade.keepsTileImage(")
        assertThat(feed).contains("CallSelfCameraOffBody()")
        assertThat(feed).contains("graphicsLayer { alpha = veil.value }")
        assertThat(feed).doesNotContain("snap(")
    }

    /** Loi 17.12 — une vignette de groupe dont la caméra se coupe : l'image gelée reste sous l'avatar qui fond, puis part. */
    @Test
    fun `loi 17_12 - la vignette de groupe passe de l'image a l'avatar en fondu, jamais d'un coup`() {
        val tile = code("CallGroupTile.kt")
        assertThat(tile).doesNotContain("if (track != null) {")
        assertThat(tile).contains("CallRemoteVideoFade.keepsTileImage(")
        assertThat(tile).contains("graphicsLayer { alpha = veil.value }")
        assertThat(tile).contains("CallAvatarDisc(")
        assertThat(tile).contains("faceHex = accentHex")
    }

    /** Loi 17.10 — le toast glisse depuis le haut ; sous « Réduire les animations », il ne fait que fondre, court. */
    @Test
    fun `loi 17_10 - le toast lit Reduire les animations et ne glisse plus dessous`() {
        val toast = code("CallToastHost.kt")
        assertThat(toast).contains("rememberCallReduceMotion()")
        assertThat(toast).contains("CallChromeStow.fadeMillis(reduceMotion)")
        assertThat(toast).contains("CallChromeStow.leavesByItsEdge(")
        assertThat(toast).doesNotContain("enter = fadeIn() + slideInVertically { -it }")
        assertThat(toast).doesNotContain("exit = fadeOut() + slideOutVertically { -it }")
    }

    /**
     * P11.1 — sur la grille, l'en-tête flotte et la scène part de la zone sûre ; à la une (P14.1), en hauteur compacte (L4.2) et
     * sous une pile (L4.11), elle reste sous lui. Une seule réserve animée porte tout le haut de la scène : la grille glisse d'un
     * état à l'autre, sans saut. Miroir de iOS `headerFloatsOverGroupStage` / `groupStageTopBase` (#18395).
     */
    @Test
    fun `P11_1 - la grille part de la zone sure sous l'en-tete flottant, par la loi miroir d'iOS`() {
        val host = code("CallTopBannerStackHost.kt")
        val grid = block(host, "internal fun rememberGroupGridBannerClearance(", "\n}")
        assertThat(grid).contains("CallTopBannerStack.headerFloatsOverGroupStage(isGroupGrid, compactHeight.value)")
        assertThat(grid).contains("CallTopBannerStack.groupStageTopDp(floats, stack, isStageFullScreen)")
        assertThat(grid).doesNotContain("animateDpAsState(")
        val screen = code("CallScreen.kt")
        assertThat(screen).contains("isGroupGrid = groupFocus == GroupCallStageFocus.Grid")
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("CallGroupStageTopReserve(base = if (gridClearance != null) 0.dp else MeeshySpacing.xl, clearance = gridClearance)")
        assertThat(layout).contains("SideEffect { gridClearance.isCompactHeight = isCompactHeight }")
        assertThat(layout).doesNotContain(".padding(vertical = MeeshySpacing.md).glidesUnderTheBannerStack(gridClearance)")
    }

    /** P11.1 · #17949 — la pilule reste dans le flux : la grille se resserre au-dessus d'elle ; seul l'en-tête flotte. */
    @Test
    fun `P11_1 - la pilule reste dans le flux, seul l'en-tete flotte sur la grille`() {
        val layout = code("CallConnectedLayout.kt")
        val column = layout.substringAfter("internal fun CallConnectedColumn(").substringAfter("Column(").substringBefore("CallActionRails(")
        assertThat(column.indexOf("groupStage(")).isLessThan(column.indexOf("CallControlsBlock("))
        assertThat(column).contains(".padding(bottom = MeeshySpacing.md).glidesUnderTheBannerStack(gridClearance)")
        assertThat(code("CallGroupFeaturedChrome.kt")).doesNotContain("headerOverlap")
    }
}
