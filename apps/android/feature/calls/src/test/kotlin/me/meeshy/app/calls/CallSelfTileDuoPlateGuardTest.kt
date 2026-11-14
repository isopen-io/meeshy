package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17982 — la garde de source de ma vignette de duo, miroir de iOS `CallView+SelfView` : elle porte la plaque « Vous » de la
 * grille de groupe (P1.4, G1.2, W1.18, S2.5, P16.8, L1.5), et en paysage elle longe la pile des bannières bornée à 560
 * (L1.8, #17965 point 2) et cède son coin aux rails du (…) (L2.8, #17965 point 1). Les règles vivent dans `:core:model`
 * (`CallSelfTileLaw`, `CallTopBannerStack.span`) ; l'écran ne fait que les poser.
 */
class CallSelfTileDuoPlateGuardTest {

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
    fun `P1_4 - ma vignette de duo pose LA plaque de la grille, la cle partagee Vous, et le nom de qui elle montre permutee`() {
        val tile = code("CallSelfTile.kt")
        assertThat(tile).contains("CallTileNameplate(")
        assertThat(tile).contains("R.string.call_group_tile_you")
        assertThat(tile).contains("R.string.call_group_tile_unknown")

        val stage = code("CallStage.kt")
        assertThat(stage).contains("plate = CallSelfTileLaw.plate(showsPeer = featuresLocal, peerName = state.peerName)")
    }

    @Test
    fun `P1_4 - la plaque est lue avec la vignette par le lecteur d'ecran`() {
        val plate = block(code("CallSelfTile.kt"), "private fun BoxScope.CallSelfTileNameplate(", "\n}")
        assertThat(plate).contains("clearAndSetSemantics { contentDescription = text }")
    }

    @Test
    fun `G1_2 - la plaque suit ma vignette rangee au toucher, a sa taille de petite vignette, sans couvrir le liseré`() {
        val plate = block(code("CallSelfTile.kt"), "private fun BoxScope.CallSelfTileNameplate(", "\n}")
        assertThat(plate).contains("Alignment.BottomCenter")
        assertThat(plate).contains("callKeepsSmallTileSize(stowFactor, TransformOrigin(0.5f, 1f))")
        val keeps = block(code("CallSelfTile.kt"), "internal fun Modifier.callKeepsSmallTileSize(", "\n}")
        assertThat(keeps).contains("CallSelfTileLaw.counterScaled(1f, stowFactor)")
        assertThat(plate).contains("CallSelfTileLaw.plateMaxWidthDp(")
        assertThat(plate).doesNotContain("AnimatedVisibility(")
    }

    @Test
    fun `P11_6 - permutee, ma vignette dit le micro coupe de l'autre DANS sa plaque, comme une tuile de groupe`() {
        val stage = code("CallStage.kt")
        assertThat(stage).contains("plateLeading = {")
        assertThat(stage).contains("MeeshyIcons.MicOff")
        assertThat(Regex("""CallPeerMutedBadge\(""").findAll(stage).count()).isEqualTo(1)
        assertThat(stage).doesNotContain("callKeepsSmallTileSize(")
    }

    @Test
    fun `L1_8 - en paysage la pile des bannieres est bornee et centree, et ma vignette ne descend que si elle ne peut la longer`() {
        val host = block(code("CallTopBannerStackHost.kt"), "internal fun CallTopBannerStackHost(", "\n}")
        assertThat(host).contains("CallTopBannerStack.span(")
        assertThat(host).contains("widthIn(max = ")
        assertThat(host.indexOf("widthIn(max = ")).isLessThan(host.indexOf("fillMaxWidth()"))

        val tile = code("CallSelfTile.kt")
        assertThat(tile).contains("CallTopBannerStack.span(")
        assertThat(tile).contains(".selfTileClearanceDp(")
        assertThat(tile).contains("CallSelfTileLaw.bannerReserveDp(")
    }

    @Test
    fun `L2_8 - les rails disent qu'ils sont dehors, et ma vignette leur cede son coin en glissant, sans recomposer par image`() {
        val source = code("CallActionRails.kt")
        assertThat(block(source, "internal fun CallActionRails(", "\n}")).contains("TellsSelfTileTheRails(railsShown = rows.isNotEmpty())")
        val tells = block(source, "private fun TellsSelfTileTheRails(", "\n}")
        assertThat(tells).contains("LocalCallSelfTileNeighbours.current")
        assertThat(tells).contains("onDispose { neighbours.railsShown = false }")

        val tile = code("CallSelfTile.kt")
        assertThat(tile).contains("CallSelfTileLaw.railYieldDp(")
        val placed = block(tile, "private fun Modifier.callSelfTileOffset(", "\n}")
        assertThat(placed).contains("offset {")
        assertThat(placed).contains("railGlidePx(")
        assertThat(placed).contains("railGlide.value")
        assertThat(block(tile, "private fun railGlidePx(", "\n}")).contains("CallSelfTileLaw.railGlideDp(")
        val glide = block(tile, "private fun rememberCallSelfTileRailGlide(", "\n}")
        assertThat(glide).contains("snapTo(")
        assertThat(glide).contains("animateTo(")
    }

    @Test
    fun `L1_8 et L2_8 - l'ecran d'appel tient les voisins de ma vignette pour toute la scene`() {
        assertThat(code("CallScreen.kt")).contains("LocalCallSelfTileNeighbours provides")
    }
}
