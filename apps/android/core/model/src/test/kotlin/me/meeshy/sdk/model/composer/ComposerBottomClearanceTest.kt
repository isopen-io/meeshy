package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerBottomClearanceTest {
    private fun visible(host: Float, inset: Float, surface: Boolean = false) =
        host + ComposerBottomClearance.lift(host, inset, surface)

    @Test fun `le diametre d'une porte est la cible tactile de 44`() {
        assertThat(ComposerBottomClearance.DOOR_DIAMETER_DP).isEqualTo(44f)
    }

    @Test fun `barre systeme de navigation par gestes laisse une porte sous la barre`() {
        assertThat(visible(host = 4f, inset = 34f)).isEqualTo(44f)
    }

    @Test fun `l'encart et la porte ne s'additionnent jamais`() {
        assertThat(visible(host = 38f, inset = 34f)).isEqualTo(44f)
    }

    @Test fun `sans encart une porte reste exigee`() {
        assertThat(visible(host = 4f, inset = 0f)).isEqualTo(44f)
    }

    @Test fun `clavier ou panneau ouvert ne releve rien`() {
        assertThat(ComposerBottomClearance.lift(4f, 34f, inputSurfaceShown = true)).isEqualTo(0f)
    }

    @Test fun `un encart plus grand que la porte est conserve`() {
        assertThat(visible(host = 4f, inset = 60f)).isEqualTo(60f)
    }

    @Test fun `un hote qui releve deja assez n'ajoute rien`() {
        assertThat(ComposerBottomClearance.lift(58f, 34f, false)).isEqualTo(0f)
    }

    @Test fun `avant toute mesure rien ne bouge`() {
        assertThat(ComposerBottomClearance.lift(null, 34f, false)).isEqualTo(0f)
    }

    @Test fun `en multi-fenetre une mesure negative est bornee par l'air exige`() {
        assertThat(ComposerBottomClearance.lift(-200f, 34f, false)).isEqualTo(44f)
    }
}
