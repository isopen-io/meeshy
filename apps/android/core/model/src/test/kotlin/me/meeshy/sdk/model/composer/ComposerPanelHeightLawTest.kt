package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerPanelHeightLawTest {
    private fun resting(last: Float?, width: Float = 400f, height: Float = 900f, top: Float = 24f, bottom: Float = 34f) =
        ComposerPanelHeightLaw.restingHeight(last, width, height, top, bottom)

    @Test fun `le plafond est 55 pour cent de la fenetre`() {
        assertThat(ComposerPanelHeightLaw.ceiling(1000f, 0f, 0f)).isEqualTo(550f)
    }

    @Test fun `la reserve de 180 dp l'emporte sur un ecran court`() {
        assertThat(ComposerPanelHeightLaw.ceiling(500f, 24f, 34f)).isEqualTo(262f)
    }

    @Test fun `le plafond ne devient jamais negatif`() {
        assertThat(ComposerPanelHeightLaw.ceiling(200f, 24f, 34f)).isEqualTo(0f)
    }

    @Test fun `planchers 324 en largeur compacte et 460 en large`() {
        assertThat(ComposerPanelHeightLaw.contentFloor(411f)).isEqualTo(324f)
        assertThat(ComposerPanelHeightLaw.contentFloor(599f)).isEqualTo(324f)
        assertThat(ComposerPanelHeightLaw.contentFloor(600f)).isEqualTo(460f)
        assertThat(ComposerPanelHeightLaw.contentFloor(1280f)).isEqualTo(460f)
    }

    @Test fun `sans mesure la hauteur par defaut est le plancher borne`() {
        assertThat(resting(null)).isEqualTo(324f)
        assertThat(resting(null, width = 900f, height = 1400f)).isEqualTo(460f)
    }

    @Test fun `la derniere hauteur de clavier est reprise`() {
        assertThat(resting(400f)).isEqualTo(400f)
    }

    @Test fun `une hauteur perimee est bornee par le plafond`() {
        assertThat(resting(5000f)).isEqualTo(495f)
    }

    @Test fun `le plafond l'emporte sur le plancher en multi-fenetre court`() {
        assertThat(resting(null, width = 400f, height = 560f)).isEqualTo(ComposerPanelHeightLaw.ceiling(560f, 24f, 34f))
    }

    @Test fun `une fenetre etroite en tablette garde le plancher compact`() {
        assertThat(resting(null, width = 360f, height = 1400f)).isEqualTo(324f)
    }

    @Test fun `trame nulle ou sans hauteur n'est pas une mesure`() {
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(0f, 0f, 0f, 0f), 900f)).isNull()
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(0f, 600f, 400f, 600f), 900f)).isNull()
    }

    @Test fun `clavier flottant qui ne touche pas le bas est ignore`() {
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(20f, 400f, 380f, 650f), 900f)).isNull()
    }

    @Test fun `clavier sous la fenetre vaut zero`() {
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(0f, 900f, 400f, 1200f), 900f)).isEqualTo(0f)
    }

    @Test fun `clavier ancre en bas rend sa hauteur`() {
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(0f, 620f, 400f, 900f), 900f)).isEqualTo(280f)
    }

    @Test fun `multi-fenetre le clavier est mesure dans la fenetre`() {
        assertThat(ComposerPanelHeightLaw.keyboardHeight(KeyboardFrame(0f, 300f, 400f, 560f), 560f)).isEqualTo(260f)
    }
}
