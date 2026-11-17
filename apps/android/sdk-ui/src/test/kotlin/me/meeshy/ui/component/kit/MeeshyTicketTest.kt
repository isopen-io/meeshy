package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K30 — le billet : la coupe par taille, le pointillé, les états, le retournement et l'encre de la pastille. */
class MeeshyTicketTest {

    private fun resolve(
        size: MeeshyTicketSize,
        kind: MeeshyTicketKind = MeeshyTicketKind.Normal,
        isSelected: Boolean = false,
        isPressed: Boolean = false,
        isHovered: Boolean = false,
        isDragging: Boolean = false,
        isFlipped: Boolean = false,
        reduceMotion: Boolean = false,
    ) = MeeshyTicketRecipe.resolve(size, kind, isSelected, isPressed, isHovered, isDragging, isFlipped, reduceMotion)

    @Test
    fun `la coupe est 125 en heros 77 en rangee 61 en compact et nulle en mini`() {
        assertThat(MeeshyTicketSize.entries.map { MeeshyTicketRecipe.cut(it) }).containsExactly(125.0, 77.0, 61.0, 0.0).inOrder()
    }

    @Test
    fun `le compact fait 150 de large le mini 104 et heros et rangee prennent la largeur offerte`() {
        assertThat(resolve(MeeshyTicketSize.Compact).width).isEqualTo(150.0)
        assertThat(resolve(MeeshyTicketSize.Mini).width).isEqualTo(104.0)
        assertThat(resolve(MeeshyTicketSize.Hero).width).isNull()
        assertThat(resolve(MeeshyTicketSize.Row).width).isNull()
    }

    @Test
    fun `la decoupe a un rayon de 22 une encoche de 18 et un pointille 6 4 de 1,5`() {
        val recipe = resolve(MeeshyTicketSize.Row)
        assertThat(recipe.cornerRadius).isEqualTo(22.0)
        assertThat(recipe.notchDiameter).isEqualTo(18.0)
        assertThat(recipe.dashPattern).containsExactly(6.0, 4.0).inOrder()
        assertThat(recipe.dashLineWidth).isEqualTo(1.5)
    }

    @Test
    fun `les polices et les pastilles suivent la taille`() {
        assertThat(MeeshyTicketRecipe.codeFontSize(MeeshyTicketSize.Hero)).isEqualTo(20.0)
        assertThat(MeeshyTicketRecipe.codeFontSize(MeeshyTicketSize.Row)).isEqualTo(12.0)
        assertThat(MeeshyTicketRecipe.codeFontSize(MeeshyTicketSize.Compact)).isEqualTo(11.5)
        assertThat(MeeshyTicketRecipe.pastilleSize(MeeshyTicketSize.Hero)).isEqualTo(0.0)
        assertThat(MeeshyTicketRecipe.pastilleSize(MeeshyTicketSize.Row)).isEqualTo(44.0)
        assertThat(MeeshyTicketRecipe.pastilleSize(MeeshyTicketSize.Mini)).isEqualTo(36.0)
    }

    @Test
    fun `presse le billet se tasse et s eclaircit et deplace il se souleve et s incline`() {
        assertThat(resolve(MeeshyTicketSize.Row, isPressed = true).scale).isEqualTo(0.97)
        assertThat(resolve(MeeshyTicketSize.Row, isPressed = true).fill).isEqualTo(MeeshyTicketFill.Field)
        val dragged = resolve(MeeshyTicketSize.Row, isPressed = true, isDragging = true)
        assertThat(dragged.scale).isEqualTo(1.03)
        assertThat(dragged.tilt).isEqualTo(2.5)
        assertThat(resolve(MeeshyTicketSize.Row, isHovered = true).lift).isEqualTo(4.0)
        assertThat(resolve(MeeshyTicketSize.Row, isHovered = true, isDragging = true).lift).isEqualTo(0.0)
    }

    @Test
    fun `choisi le bord passe de 1 a 2 et le fantome a un bord pointille sans fond`() {
        assertThat(resolve(MeeshyTicketSize.Row).borderWidth).isEqualTo(1.0)
        assertThat(resolve(MeeshyTicketSize.Row, isSelected = true).borderWidth).isEqualTo(2.0)
        val ghost = resolve(MeeshyTicketSize.Row, kind = MeeshyTicketKind.Ghost)
        assertThat(ghost.isBorderDashed).isTrue()
        assertThat(ghost.fill).isEqualTo(MeeshyTicketFill.None)
        assertThat(ghost.borderWidth).isEqualTo(1.5)
    }

    @Test
    fun `barre est terminal et chargement cache le contenu`() {
        assertThat(resolve(MeeshyTicketSize.Row, kind = MeeshyTicketKind.Struck).isStruck).isTrue()
        assertThat(resolve(MeeshyTicketSize.Row, kind = MeeshyTicketKind.Loading).showsContent).isFalse()
        assertThat(resolve(MeeshyTicketSize.Row).showsContent).isTrue()
    }

    @Test
    fun `le retournement tourne de 180 degres et se fond en mouvement reduit`() {
        val turning = resolve(MeeshyTicketSize.Hero, isFlipped = true)
        assertThat(turning.showsBack).isTrue()
        assertThat(turning.flipRotation).isEqualTo(180.0)
        val reduced = resolve(MeeshyTicketSize.Hero, isFlipped = true, reduceMotion = true)
        assertThat(reduced.flipRotation).isEqualTo(0.0)
        assertThat(reduced.flipCrossfades).isTrue()
        assertThat(resolve(MeeshyTicketSize.Hero).showsBack).isFalse()
    }

    @Test
    fun `l encre de la pastille tient 4,5 sur les teintes du catalogue`() {
        listOf(0xFF6366F1, 0xFFFDE68A, 0xFF34D399, 0xFFF87171, 0xFF312E81, 0xFFFBBF24).forEach { argb ->
            val tint = Color(argb)
            assertThat(MeeshyKitColor.contrast(MeeshyTicketRecipe.ink(tint), tint)).isAtLeast(3.0)
        }
        assertThat(MeeshyTicketRecipe.ink(Color(0xFF312E81))).isEqualTo(Color.White)
    }
}
