package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.call.group.GroupCallStageGeometry
import org.junit.Test

/**
 * #17677 — la garde de source de la scène de groupe, miroir des gardes iOS `GroupCallSpotlightTests` : le halo de qui parle
 * est à la couleur de la personne et fond à la durée partagée, la plaque du nom est de VERRE, l'avatar caméra coupée est
 * teinté, les rangées qui défilent s'effacent à leurs deux bords, et la grille ↔ à la une garde les vidéos montées.
 */
class CallGroupSceneGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallGroupTile.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `the speaker halo wears the person's colour and fades at the shared duration, never a snap`() {
        val tile = code("CallGroupTile.kt")

        assertThat(tile).contains("CallTileRim.groupTile(tile.colorKey)")
        assertThat(tile).contains(".callTileHalo(accent, halo)")
        assertThat(tile).contains("CallRemoteVideoFade.durationMillis(rememberCallReduceMotion())")
        assertThat(tile).doesNotContain("snap()")
    }

    @Test
    fun `the name plate is glass, not a black scrim`() {
        val tile = code("CallGroupTile.kt")

        assertThat(tile).contains("CallGlassPlate(")
        assertThat(tile).doesNotContain("scrim")
        assertThat(tile).doesNotContain("LABEL_SCRIM_ALPHA")
    }

    @Test
    fun `a tile with its camera off wears its person's colour through the call's one avatar disc`() {
        val tile = code("CallGroupTile.kt")

        assertThat(tile).contains("CallAvatarDisc(")
        assertThat(tile).contains("faceHex = accentHex")
        assertThat(tile).doesNotContain("MeeshyAvatar(")
    }

    @Test
    fun `the pill rows and both filmstrips fade at their edges with the one shared modifier`() {
        assertThat(code("CallActionRow.kt")).contains(".callScrollEdgeFade(scroll, horizontal = true)")
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).contains("callScrollEdgeFade(state, horizontal = true)")
        assertThat(spotlight).contains("callScrollEdgeFade(state, horizontal = false)")
        val rails = code("CallActionRails.kt")
        assertThat(rails).contains(".callScrollEdgeFade(scroll, horizontal = false, symmetric = false)")
        assertThat(rails).doesNotContain("callRailScrollFade")
    }

    @Test
    fun `the grid and the spotlight move each person by identity, and keep her video mounted`() {
        val motion = code("CallGroupStageMotion.kt")
        assertThat(motion).contains("movableContentOf<CallGroupTileRender, Modifier>")
        assertThat(motion).contains("CallRemoteVideoFade.durationMillis(true)")
        val spotlight = code("CallGroupSpotlight.kt")
        assertThat(spotlight).doesNotContain("CallGroupTile(")
        assertThat(spotlight.split("scope.Tile(").size - 1).isEqualTo(2)
        assertThat(code("CallGroupStage.kt")).contains("rememberCallGroupTileContents(")
    }

    @Test
    fun `the strip reserves the halo's room and the geometry law knows the same number`() {
        assertThat(GroupCallStageGeometry.STRIP_HALO_PAD).isEqualTo(CALL_TILE_HALO_REACH.value)
    }
}
