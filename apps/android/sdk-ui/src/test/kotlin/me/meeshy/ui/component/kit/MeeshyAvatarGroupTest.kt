package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K48 — le groupe d'avatars : une disposition, une phrase, le débord seul se compte. */
class MeeshyAvatarGroupTest {

    @Test
    fun `cinq tailles, cinq recouvrements`() {
        assertThat(MeeshyAvatarGroupSize.entries.map { it.dp }).containsExactly(26, 40, 44, 56, 72).inOrder()
        assertThat(MeeshyAvatarGroupSize.entries.map { it.overlapDp }).containsExactly(10, 9, 10, 13, 17).inOrder()
        assertThat(MeeshyAvatarGroupSize.S56.ringDp).isEqualTo(3.5f)
    }

    @Test
    fun `la pile montre entre 2 et 5 visages, le reste est un compte`() {
        val v = MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Stack, count = 9, max = 4)
        assertThat(v.visible).isEqualTo(4)
        assertThat(v.overflow).isEqualTo(5)
        assertThat(v.overflowLabel).isEqualTo("+5")
        assertThat(MeeshyAvatarGroupRecipe.resolve(count = 9, max = 99).visible).isEqualTo(5)
        assertThat(MeeshyAvatarGroupRecipe.resolve(count = 9, max = 0).visible).isEqualTo(2)
    }

    @Test
    fun `le debord plafonne a 99+ et se tait a zero`() {
        assertThat(MeeshyAvatarGroupRecipe.overflowLabel(0)).isNull()
        assertThat(MeeshyAvatarGroupRecipe.overflowLabel(120)).isEqualTo("99+")
        assertThat(MeeshyAvatarGroupRecipe.overflowLabel(99)).isEqualTo("+99")
    }

    @Test
    fun `le duo exige exactement deux et respire sauf en mouvement reduit`() {
        assertThat(MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Duo, count = 3).isRenderable).isFalse()
        val duo = MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Duo, count = 2)
        assertThat(duo.isRenderable).isTrue()
        assertThat(duo.breathes).isTrue()
        assertThat(duo.overflow).isEqualTo(0)
        assertThat(MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Duo, count = 2, reduceMotion = true).breathes).isFalse()
    }

    @Test
    fun `le rail montre tout le monde`() {
        val v = MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Rail, count = 12)
        assertThat(v.visible).isEqualTo(12)
        assertThat(v.overflowLabel).isNull()
    }

    @Test
    fun `la grille tient deux rangees et reserve une case au compte`() {
        val v = MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Grid(3), count = 20, max = 20)
        assertThat(v.columns).isEqualTo(3)
        assertThat(v.visible).isEqualTo(5)
        assertThat(v.overflow).isEqualTo(15)
        assertThat(MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Grid(9), count = 3).columns).isEqualTo(4)
    }

    @Test
    fun `un groupe vide ne se dessine pas`() {
        assertThat(MeeshyAvatarGroupRecipe.resolve(count = 0).isRenderable).isFalse()
        assertThat(MeeshyAvatarGroupRecipe.resolve(count = -3).visible).isEqualTo(0)
    }

    @Test
    fun `la selection se lit par rang`() {
        assertThat(MeeshyAvatarGroupSelection.Single(1).contains(1)).isTrue()
        assertThat(MeeshyAvatarGroupSelection.Single(null).contains(0)).isFalse()
        assertThat(MeeshyAvatarGroupSelection.Multiple(setOf(0, 2)).contains(2)).isTrue()
    }
}
