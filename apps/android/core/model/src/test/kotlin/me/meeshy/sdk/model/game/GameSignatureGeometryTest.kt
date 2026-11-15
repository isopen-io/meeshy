package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameSignatureGeometryTest {

    @Test
    fun `les trois traits mesurent 500 400 et 300 sur 1024`() {
        assertThat(GameSignatureGeometry.dashes.map { it.length }).containsExactly(500f, 400f, 300f).inOrder()
        assertThat(GameSignatureGeometry.VIEWPORT).isEqualTo(1024f)
    }

    @Test
    fun `les opacites sont 0,7 1 et 0,75`() {
        assertThat(GameSignatureGeometry.dashes.map { it.opacity }).containsExactly(0.7f, 1f, 0.75f).inOrder()
    }

    @Test
    fun `les traits sont alignes a gauche et empiles a pas egal`() {
        assertThat(GameSignatureGeometry.dashes.map { it.x0 }.toSet()).containsExactly(262f)
        assertThat(GameSignatureGeometry.dashes.map { it.y }).containsExactly(384f, 512f, 640f).inOrder()
    }

    @Test
    fun `la plate n'a qu'une couche a opacites propres`() {
        val layers = GameSignatureGeometry.layers(GameSignatureStyle.FLAT)
        assertThat(layers).hasSize(1)
        assertThat(layers.single().uniformOpacity).isNull()
        assertThat(layers.single().dx).isEqualTo(0f)
    }

    @Test
    fun `la frappee pose ombre en bas a droite eclat en haut a gauche puis l'encre`() {
        val layers = GameSignatureGeometry.layers(GameSignatureStyle.STRUCK)
        assertThat(layers.map { it.tint }).containsExactly(
            GameSignatureGeometry.Tint.SHADOW, GameSignatureGeometry.Tint.WHITE, GameSignatureGeometry.Tint.INK,
        ).inOrder()
        assertThat(layers[0].dx).isGreaterThan(0f)
        assertThat(layers[0].dy).isGreaterThan(0f)
        assertThat(layers[1].dx).isLessThan(0f)
        assertThat(layers[1].dy).isLessThan(0f)
        assertThat(layers[2].uniformOpacity).isNull()
    }

    @Test
    fun `la gravee creuse sous l'encre a 0,85 avec un reflet clair en dessous`() {
        val layers = GameSignatureGeometry.layers(GameSignatureStyle.ENGRAVED)
        assertThat(layers[0].tint).isEqualTo(GameSignatureGeometry.Tint.WHITE)
        assertThat(layers[0].uniformOpacity).isEqualTo(0.35f)
        assertThat(layers[1].tint).isEqualTo(GameSignatureGeometry.Tint.INK)
        assertThat(layers[1].uniformOpacity).isEqualTo(0.85f)
    }

    @Test
    fun `l'epaisseur suit le cote`() {
        assertThat(GameSignatureGeometry.lineWidth(92f, 1024f)).isEqualTo(92f)
        assertThat(GameSignatureGeometry.lineWidth(92f, 512f)).isEqualTo(46f)
    }
}
