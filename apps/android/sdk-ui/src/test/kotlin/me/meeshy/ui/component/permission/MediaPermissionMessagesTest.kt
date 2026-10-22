package me.meeshy.ui.component.permission

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionPresentation
import me.meeshy.sdk.model.PermissionSurface
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Un message par accès, dans chaque langue : « accès refusé » ne dit pas quelle ligne activer.
 * Les ressources suivent aussi les noms du présentateur pur de `:core:model`, de sorte que
 * les deux tables ne puissent pas dériver en silence.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaPermissionMessagesTest {

    private val languages = listOf("en", "fr", "es", "pt", "de", "it", "ar")

    private fun application(language: String): Application {
        RuntimeEnvironment.setQualifiers("+$language")
        return ApplicationProvider.getApplicationContext()
    }

    @Test
    fun `every access has its own denied message in every language`() {
        languages.forEach { language ->
            val context = application(language)
            val messages = PermissionNature.values().map { context.getString(MediaPermissionMessages.deniedMessage(it)) }

            messages.forEach { assertThat(it).isNotEmpty() }
            assertThat(messages.toSet()).hasSize(PermissionNature.values().size)
        }
    }

    @Test
    fun `the microphone denial card is titled in the user language`() {
        val expected = mapOf(
            "en" to "Microphone access denied",
            "fr" to "Accès au micro refusé",
            "es" to "Acceso al micrófono denegado",
            "pt" to "Acesso ao microfone negado",
        )

        expected.forEach { (language, title) ->
            val copy = MediaPermissionMessages.copy(PermissionNature.MICROPHONE, PermissionSurface.DENIED)

            assertThat(application(language).getString(copy.title)).isEqualTo(title)
        }
    }

    @Test
    fun `the settings button is labelled in every language`() {
        val labels = languages.map { language ->
            val copy = MediaPermissionMessages.copy(PermissionNature.CAMERA, PermissionSurface.DENIED)
            application(language).getString(copy.action)
        }

        assertThat(labels.toSet()).hasSize(languages.size)
        assertThat(labels[1]).isEqualTo("Ouvrir les Réglages")
    }

    @Test
    fun `every title body and action is non blank and none repeats across natures`() {
        languages.forEach { language ->
            val context = application(language)
            PermissionSurface.values().forEach { surface ->
                val copies = PermissionNature.values().map { MediaPermissionMessages.copy(it, surface) }

                copies.forEach {
                    assertThat(context.getString(it.title)).isNotEmpty()
                    assertThat(context.getString(it.body)).isNotEmpty()
                    assertThat(context.getString(it.action)).isNotEmpty()
                }
                assertThat(copies.map { context.getString(it.title) }.toSet()).hasSize(copies.size)
                assertThat(copies.map { context.getString(it.body) }.toSet()).hasSize(copies.size)
            }
        }
    }

    @Test
    fun `resource names follow the pure presenter keys`() {
        val resources = application("en").resources

        PermissionNature.values().forEach { nature ->
            PermissionSurface.values().forEach { surface ->
                val copy = MediaPermissionMessages.copy(nature, surface)
                val presentation = PermissionPresentation.of(nature, surface)

                assertThat(resources.getResourceEntryName(copy.title)).isEqualTo(presentation.titleKey)
                assertThat(resources.getResourceEntryName(copy.body)).isEqualTo(presentation.bodyKey)
                assertThat(resources.getResourceEntryName(copy.action)).isEqualTo(presentation.actionKey)
            }
            assertThat(resources.getResourceEntryName(MediaPermissionMessages.deniedMessage(nature)))
                .isEqualTo(PermissionPresentation.deniedMessageKey(nature))
        }
    }
}
