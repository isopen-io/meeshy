package me.meeshy.app.theme

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26])
class LanguageBootstrapTest {

    private fun freshContext(): Context =
        ApplicationProvider.getApplicationContext<Context>().also { context ->
            context.getSharedPreferences("meeshy_ui_language", Context.MODE_PRIVATE).edit().clear().commit()
        }

    @Test
    fun `la locale du process est appliquee au contexte de l'Application avant l'Activity`() {
        val context = freshContext()
        UiLanguageBootstrap.remember(context, explicit = null, profileLanguage = "es")

        val wrapped = UiLanguageBootstrap.wrap(context)

        assertThat(wrapped.resources.configuration.locales[0].language).isEqualTo("es")
        assertThat(Locale.getDefault().language).isEqualTo("es")
    }

    @Test
    fun `un choix explicite prime sur la langue du profil au demarrage`() {
        val context = freshContext()
        UiLanguageBootstrap.remember(context, explicit = "de", profileLanguage = "es")

        assertThat(UiLanguageBootstrap.wrap(context).resources.configuration.locales[0].language).isEqualTo("de")
    }

    @Test
    fun `preference Systeme sans profil laisse le contexte de l'appareil en place`() {
        val context = freshContext()

        assertThat(UiLanguageBootstrap.wrap(context)).isSameInstanceAs(context)
        assertThat(UiLanguageBootstrap.savedTag(context)).isNull()
    }

    @Test
    fun `le portugais du profil est applique meme absent du selecteur`() {
        val context = freshContext()
        UiLanguageBootstrap.remember(context, explicit = null, profileLanguage = "pt-BR")

        assertThat(UiLanguageBootstrap.savedTag(context)).isEqualTo("pt")
    }

    @Test
    fun `un changement de langue du profil met a jour le miroir et previent les notifications`() {
        val context = freshContext()
        val profile = MutableStateFlow<String?>("fr")
        val notified = mutableListOf<String?>()
        val scope = TestScope(UnconfinedTestDispatcher())
        InterfaceLanguageSync(
            context = context,
            explicit = MutableStateFlow(null),
            profileLanguage = profile,
            onEffectiveChanged = { _, tag -> notified += tag },
        ).start(scope)

        profile.value = "it"

        assertThat(notified).containsExactly("fr", "it").inOrder()
        assertThat(UiLanguageBootstrap.savedTag(context)).isEqualTo("it")
        scope.coroutineContext[kotlinx.coroutines.Job]?.cancel()
    }

    @Test
    fun `un choix explicite n'est jamais ecrase par un changement de profil`() {
        val context = freshContext()
        val profile = MutableStateFlow<String?>("fr")
        val scope = TestScope(UnconfinedTestDispatcher())
        InterfaceLanguageSync(context, MutableStateFlow("de"), profile) { _, _ -> }.start(scope)

        profile.value = "it"

        assertThat(UiLanguageBootstrap.savedTag(context)).isEqualTo("de")
    }
}
