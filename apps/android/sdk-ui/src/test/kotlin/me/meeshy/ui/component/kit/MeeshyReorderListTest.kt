package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K52 — la liste réordonnable : le doigt, la voix et le clavier appellent le même déplacement. */
class MeeshyReorderListTest {

    @Test
    fun `deplacer rend une nouvelle liste, bornes tenues`() {
        val ids = listOf("a", "b", "c", "d")
        assertThat(MeeshyReorderListRecipe.move(ids, 0, 2)).containsExactly("b", "c", "a", "d").inOrder()
        assertThat(MeeshyReorderListRecipe.move(ids, 3, 0)).containsExactly("d", "a", "b", "c").inOrder()
        assertThat(MeeshyReorderListRecipe.move(ids, 1, 99)).containsExactly("a", "c", "d", "b").inOrder()
        assertThat(MeeshyReorderListRecipe.move(ids, 2, -5)).containsExactly("c", "a", "b", "d").inOrder()
        assertThat(ids).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `un deplacement sans effet rend la meme liste`() {
        val ids = listOf("a", "b")
        assertThat(MeeshyReorderListRecipe.move(ids, 1, 1)).isSameInstanceAs(ids)
        assertThat(MeeshyReorderListRecipe.move(ids, 5, 0)).isSameInstanceAs(ids)
        assertThat(MeeshyReorderListRecipe.move(emptyList<String>(), 0, 0)).isEmpty()
    }

    @Test
    fun `la case visee suit le centre de la rangee saisie`() {
        val heights = listOf(60f, 60f, 60f)
        fun target(from: Int, offset: Float) = MeeshyReorderListRecipe.targetIndex(from, offset, heights, spacingDp = 0f)
        assertThat(target(0, 0f)).isEqualTo(0)
        assertThat(target(0, 70f)).isEqualTo(1)
        assertThat(target(0, 130f)).isEqualTo(2)
        assertThat(target(0, 9999f)).isEqualTo(2)
        assertThat(target(2, -125f)).isEqualTo(0)
        assertThat(target(7, 0f)).isEqualTo(7)
    }

    @Test
    fun `saisie - 1,02 - en vol - incline de 2 - en mouvement reduit rien ne bouge`() {
        assertThat(MeeshyReorderListRecipe.resolve(phase = MeeshyReorderPhase.Grabbed).scale).isEqualTo(1.02f)
        val flying = MeeshyReorderListRecipe.resolve(phase = MeeshyReorderPhase.Flying)
        assertThat(flying.tiltDegrees).isEqualTo(2f)
        assertThat(flying.lifted).isTrue()
        val calm = MeeshyReorderListRecipe.resolve(phase = MeeshyReorderPhase.Flying, reduceMotion = true)
        assertThat(calm.scale).isEqualTo(1f)
        assertThat(calm.tiltDegrees).isEqualTo(0f)
        assertThat(calm.lifted).isTrue()
    }

    @Test
    fun `posee - un halo de 4`() {
        assertThat(MeeshyReorderListRecipe.resolve(phase = MeeshyReorderPhase.Dropped).dropHaloDp).isEqualTo(4f)
        assertThat(MeeshyReorderListRecipe.resolve().dropHaloDp).isEqualTo(0f)
    }

    @Test
    fun `la poignee fait 44 par 44, 32 de large a gauche, et s eteint a 32 pour cent`() {
        val regular = MeeshyReorderListRecipe.resolve()
        assertThat(regular.handleWidthDp).isEqualTo(44f)
        assertThat(regular.handleHeightDp).isEqualTo(44f)
        assertThat(MeeshyReorderListRecipe.resolve(handleEdge = MeeshyReorderHandleEdge.Leading).handleWidthDp).isEqualTo(32f)
        assertThat(MeeshyReorderListRecipe.resolve(isEnabled = false).handleOpacity).isEqualTo(0.32f)
    }

    @Test
    fun `le premier se souligne seulement si l hote le demande - le rang s affiche en ordinal`() {
        assertThat(MeeshyReorderListRecipe.resolve(isFirst = true, emphasizesFirst = true).emphasized).isTrue()
        assertThat(MeeshyReorderListRecipe.resolve(isFirst = true).emphasized).isFalse()
        assertThat(MeeshyReorderListRecipe.resolve(rank = MeeshyReorderRank.Ordinal).showsRank).isTrue()
        assertThat(MeeshyReorderListRecipe.resolve(rank = MeeshyReorderRank.Ordinal).rankBadgeDp).isEqualTo(30f)
        assertThat(MeeshyReorderListRecipe.resolve().showsRank).isFalse()
    }

    @Test
    fun `les actions de la voix ne proposent que des deplacements permis`() {
        assertThat(MeeshyReorderListRecipe.voiceMoves(index = 0, count = 3)).containsExactly(MeeshyReorderMove.Down, MeeshyReorderMove.ToEnd).inOrder()
        assertThat(MeeshyReorderListRecipe.voiceMoves(index = 1, count = 3))
            .containsExactly(MeeshyReorderMove.Up, MeeshyReorderMove.Down, MeeshyReorderMove.ToStart, MeeshyReorderMove.ToEnd).inOrder()
        assertThat(MeeshyReorderListRecipe.voiceMoves(index = 2, count = 3)).containsExactly(MeeshyReorderMove.Up, MeeshyReorderMove.ToStart).inOrder()
        assertThat(MeeshyReorderListRecipe.voiceMoves(index = 0, count = 1)).isEmpty()
        assertThat(MeeshyReorderListRecipe.destination(MeeshyReorderMove.Up, index = 2, count = 3)).isEqualTo(1)
        assertThat(MeeshyReorderListRecipe.destination(MeeshyReorderMove.ToEnd, index = 0, count = 3)).isEqualTo(2)
    }
}
