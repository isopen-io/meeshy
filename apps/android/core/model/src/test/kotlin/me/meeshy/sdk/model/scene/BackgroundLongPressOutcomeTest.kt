package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BackgroundLongPressOutcomeTest {
    private fun outcome(
        editing: Boolean = true,
        hit: String? = null,
        background: String? = null,
        host: Boolean = true,
    ) = BackgroundLongPressOutcome.resolve(editing, hit, background, host)

    @Test fun `une scene vide ouvre le viseur`() {
        assertThat(outcome()).isEqualTo(BackgroundLongPressOutcome.OpenViewfinder)
    }

    @Test fun `un fond media ouvre les outils du fond`() {
        assertThat(outcome(background = "m1")).isEqualTo(BackgroundLongPressOutcome.SelectBackground("m1"))
    }

    @Test fun `un objet sous le doigt ne declenche rien meme sur un fond media`() {
        assertThat(outcome(hit = "t1", background = "m1")).isEqualTo(BackgroundLongPressOutcome.Nothing)
        assertThat(outcome(hit = "t1")).isEqualTo(BackgroundLongPressOutcome.Nothing)
    }

    @Test fun `hors edition rien ne s'ouvre`() {
        assertThat(outcome(editing = false, background = "m1")).isEqualTo(BackgroundLongPressOutcome.Nothing)
        assertThat(outcome(editing = false)).isEqualTo(BackgroundLongPressOutcome.Nothing)
    }

    @Test fun `un hote qui ne selectionne pas le fond retombe sur le viseur`() {
        assertThat(outcome(background = "m1", host = false)).isEqualTo(BackgroundLongPressOutcome.OpenViewfinder)
    }

    @Test fun `un identifiant de fond vide vaut une scene vide`() {
        assertThat(outcome(background = "")).isEqualTo(BackgroundLongPressOutcome.OpenViewfinder)
    }
}
