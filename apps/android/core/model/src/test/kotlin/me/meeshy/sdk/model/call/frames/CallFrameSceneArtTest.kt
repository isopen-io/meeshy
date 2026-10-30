package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameSceneArtTest {

    private fun layer(
        id: String,
        kind: CallFrameSceneLayerKind,
        depth: CallFrameSceneDepth = CallFrameSceneDepth.BACK,
        src: String? = null,
        amount: Double? = null,
        slice: Double? = null,
    ) = CallFrameSceneLayer(id, kind, depth, src, null, "#FFE9B0", amount, null, slice)

    private fun look(vararg scene: CallFrameSceneLayer) = CallLiveFrameRule.frames().first().look.copy(scene = scene.toList())

    @Test
    fun `les declinaisons relief du catalogue portent leur matiere et leur moulure, la moulure etiree en neuf morceaux`() {
        val relief = CallFrameCatalogue.all.flatMap { it.styles }.flatMap { it.look.scene }
            .filter { it.kind == CallFrameSceneLayerKind.IMAGE }
        assertThat(relief).isNotEmpty()
        assertThat(relief.filter { it.depth == CallFrameSceneDepth.FRONT }.all { it.slice != null }).isTrue()
        assertThat(relief.filter { it.depth == CallFrameSceneDepth.BACK }.all { it.slice == null }).isTrue()
        assertThat(relief.mapNotNull { it.src }.all { CallFrameSceneArt.assetPath(it).startsWith("call-frames/") }).isTrue()
    }

    @Test
    fun `une couche se range par sa nature et sa profondeur`() {
        val l = look(
            layer("matiere", CallFrameSceneLayerKind.IMAGE, src = "assets/call-frames/a_back.webp"),
            layer("moulure", CallFrameSceneLayerKind.IMAGE, CallFrameSceneDepth.FRONT, "assets/call-frames/a_front.webp", slice = 0.18),
            layer("vide", CallFrameSceneLayerKind.IMAGE, src = null),
            layer("halo", CallFrameSceneLayerKind.LIGHT, CallFrameSceneDepth.EFFECTS),
            layer("boucle", CallFrameSceneLayerKind.VIDEO_LOOP, src = "assets/call-frames/a.mp4"),
            layer("pluie", CallFrameSceneLayerKind.PARTICLES),
        )
        assertThat(CallFrameSceneArt.images(l, CallFrameSceneDepth.BACK).map { it.id }).containsExactly("matiere")
        assertThat(CallFrameSceneArt.images(l, CallFrameSceneDepth.FRONT).map { it.id }).containsExactly("moulure")
        assertThat(CallFrameMotionPlan.ambientLayers(l).map { it.id }).containsExactly("halo", "boucle").inOrder()
        assertThat(CallFrameSceneArt.lights(l).map { it.id }).containsExactly("halo")
        assertThat(CallFrameSceneArt.videoLoops(l).map { it.id }).containsExactly("boucle")
        assertThat(CallFrameSceneArt.isMasked(CallFrameSceneArt.lights(l).single())).isFalse()
    }

    @Test
    fun `le chemin d un actif se lit sans son prefixe`() {
        assertThat(CallFrameSceneArt.assetPath("assets/call-frames/feerique_lucioles_back.webp")).isEqualTo("call-frames/feerique_lucioles_back.webp")
        assertThat(CallFrameSceneArt.assetPath("/assets/call-frames/x.webp")).isEqualTo("call-frames/x.webp")
    }

    @Test
    fun `les neuf morceaux gardent les coins intacts et etirent le reste`() {
        val target = CallFrameRect(0.0, 0.0, 1080.0, 1920.0)
        val pieces = CallFrameSceneArt.nineSlicePieces(1000.0, 2000.0, target, 0.18)
        assertThat(pieces).hasSize(9)
        val corner = pieces.first()
        assertThat(corner.source).isEqualTo(CallFrameRect(0.0, 0.0, 180.0, 180.0))
        assertThat(corner.target.width).isWithin(1e-9).of(1080.0 * 0.18)
        assertThat(pieces.last().target.maxX).isEqualTo(1080.0)
        assertThat(pieces.last().target.maxY).isEqualTo(1920.0)
        assertThat(pieces.sumOf { it.target.width * it.target.height }).isWithin(1e-6).of(1080.0 * 1920.0)
    }

    @Test
    fun `une lumiere respire autour de son intensite`() {
        val halo = layer("halo", CallFrameSceneLayerKind.LIGHT, amount = 0.8)
        assertThat(CallFrameSceneArt.lightAlpha(halo, 0.0)).isWithin(1e-9).of(0.8)
        assertThat(CallFrameSceneArt.lightAlpha(halo, CallFrameSceneArt.LIGHT_PERIOD / 2)).isWithin(1e-9).of(0.8 * 0.55)
        val plain = layer("plain", CallFrameSceneLayerKind.LIGHT)
        assertThat(CallFrameSceneArt.lightAlpha(plain, 0.0)).isWithin(1e-9).of(CallFrameSceneArt.LIGHT_DEFAULT_AMOUNT)
    }
}
