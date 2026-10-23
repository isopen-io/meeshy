package me.meeshy.app.game

import android.content.Context
import android.content.res.Configuration
import org.robolectric.RuntimeEnvironment
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.game.GameErrorCode
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameErrorMessagesTest {

    private fun resourcesIn(tag: String) = (RuntimeEnvironment.getApplication() as Context).let { base ->
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        base.createConfigurationContext(configuration).resources
    }

    @Test
    fun `chacun des codes a une phrase localisee qui n est jamais le code`() {
        listOf("en", "fr").forEach { tag ->
            val res = resourcesIn(tag)
            GameErrorCode.entries.forEach { code ->
                val message = GameErrorMessages.message(res, code)
                assertThat(message).isNotEmpty()
                assertThat(message).doesNotContain(code.wire)
            }
        }
    }

    @Test
    fun `un code inconnu retombe sur la phrase generique`() {
        val res = resourcesIn("fr")
        val generic = GameErrorMessages.message(res, null as GameErrorCode?)
        assertThat(generic).isNotEmpty()
        assertThat(GameErrorMessages.message(res, "FUTURE_CODE")).isEqualTo(generic)
        assertThat(GameErrorMessages.message(res, null as String?)).isEqualTo(generic)
    }

    @Test
    fun `deux codes distincts disent deux phrases distinctes`() {
        val res = resourcesIn("fr")
        val messages = GameErrorCode.entries.map { GameErrorMessages.message(res, it) }
        assertThat(messages).containsNoDuplicates()
    }
}
