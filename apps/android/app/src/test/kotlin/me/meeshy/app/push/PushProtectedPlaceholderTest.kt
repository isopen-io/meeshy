package me.meeshy.app.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class PushProtectedPlaceholderTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun `chaque cle protegee donne son libelle localise`() {
        mapOf(
            "notification.view_once_message" to R.string.push_placeholder_view_once,
            "notification.ephemeral_message" to R.string.push_placeholder_ephemeral,
            "notification.hidden_message" to R.string.push_placeholder_hidden,
            "notification.encrypted_message" to R.string.push_placeholder_encrypted,
        ).forEach { (key, res) -> assertThat(PushProtectedPlaceholder.text(context, key)).isEqualTo(context.getString(res)) }
    }

    @Test
    fun `une cle inconnue reste protegee et sans cle rien`() {
        assertThat(PushProtectedPlaceholder.text(context, "notification.future")).isEqualTo(context.getString(R.string.push_placeholder_hidden))
        assertThat(PushProtectedPlaceholder.text(context, null)).isNull()
        assertThat(PushProtectedPlaceholder.text(context, " ")).isNull()
    }
}
