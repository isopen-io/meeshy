package me.meeshy.app.push.enrich

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.push.PushMediaBudget
import org.junit.Test

class RichMediaBudgetTest {

    @Test
    fun `la photo de l expediteur ne prive pas l image du message`() {
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 9_000, pictureWanted = true)).isEqualTo(2_500)
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 3_000, pictureWanted = true)).isEqualTo(1_000)
    }

    @Test
    fun `sans image la photo prend tout le temps restant dans la limite`() {
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 9_000, pictureWanted = false)).isEqualTo(2_500)
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 1_000, pictureWanted = false)).isEqualTo(1_000)
    }

    @Test
    fun `un temps trop court pour servir a quelque chose n est pas depense`() {
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 600, pictureWanted = true)).isEqualTo(0)
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = 0, pictureWanted = false)).isEqualTo(0)
        assertThat(PushMediaBudget.avatarMillis(remainingMillis = -5, pictureWanted = false)).isEqualTo(0)
    }
}
