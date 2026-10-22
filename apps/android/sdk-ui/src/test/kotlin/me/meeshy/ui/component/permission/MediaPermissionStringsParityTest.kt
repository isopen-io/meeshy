package me.meeshy.ui.component.permission

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionPresentation
import me.meeshy.sdk.model.PermissionSurface
import org.junit.Test

/**
 * Garde de localisation : toutes les clés de la porte d'accès existent dans les sept
 * locales (en, fr, es, pt, de, it, ar), avec les mêmes spécificateurs de format, et
 * couvrent chaque clé que le présentateur pur de `:core:model` peut demander.
 */
class MediaPermissionStringsParityTest {

    private val locales = mapOf(
        "en" to "values",
        "fr" to "values-fr",
        "es" to "values-es",
        "pt" to "values-pt",
        "de" to "values-de",
        "it" to "values-it",
        "ar" to "values-ar",
    )

    private val stringPattern = Regex("<string\\s+name=\"([^\"]+)\"\\s*>(.*?)</string>", RegexOption.DOT_MATCHES_ALL)
    private val formatSpecifier = Regex("%(\\d+\\\$)?[sdf]")

    private fun resDir(): File {
        val fromModule = File("src/main/res")
        if (fromModule.isDirectory) return fromModule
        val fromRoot = File("sdk-ui/src/main/res")
        check(fromRoot.isDirectory) { "res dir de sdk-ui introuvable depuis ${File("").absolutePath}" }
        return fromRoot
    }

    private fun strings(folder: String): Map<String, String> {
        val file = File(resDir(), "$folder/strings_media_permissions.xml")
        check(file.isFile) { "fichier de chaînes manquant : ${file.path}" }
        return stringPattern.findAll(file.readText()).associate { it.groupValues[1] to it.groupValues[2] }
    }

    @Test
    fun `every locale carries every key of the base locale`() {
        val baseKeys = strings("values").keys

        val gaps = locales.filterKeys { it != "en" }.mapValues { (_, folder) -> baseKeys - strings(folder).keys }

        assertThat(gaps.filterValues { it.isNotEmpty() }).isEmpty()
    }

    @Test
    fun `no locale carries a key the base locale lacks`() {
        val baseKeys = strings("values").keys

        val extras = locales.mapValues { (_, folder) -> strings(folder).keys - baseKeys }

        assertThat(extras.filterValues { it.isNotEmpty() }).isEmpty()
    }

    @Test
    fun `no translation is left blank`() {
        val blanks = locales.flatMap { (language, folder) ->
            strings(folder).filterValues { it.isBlank() }.keys.map { "$language:$it" }
        }

        assertThat(blanks).isEmpty()
    }

    @Test
    fun `translations keep the format specifiers of the base`() {
        val base = strings("values")

        val drifts = locales.filterKeys { it != "en" }.flatMap { (language, folder) ->
            val translated = strings(folder)
            base.mapNotNull { (key, value) ->
                val expected = formatSpecifier.findAll(value).map { it.value }.sorted().toList()
                val actual = formatSpecifier.findAll(translated.getValue(key)).map { it.value }.sorted().toList()
                if (expected == actual) null else "$language:$key"
            }
        }

        assertThat(drifts).isEmpty()
    }

    @Test
    fun `every key the pure presenter can ask for exists`() {
        val keys = strings("values").keys
        val wanted = PermissionNature.values().flatMap { nature ->
            PermissionSurface.values().flatMap { surface ->
                val presentation = PermissionPresentation.of(nature, surface)
                listOf(presentation.titleKey, presentation.bodyKey, presentation.actionKey)
            } + PermissionPresentation.deniedMessageKey(nature)
        }.toSet()

        assertThat(wanted - keys).isEmpty()
    }
}
