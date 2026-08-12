package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

// Locale-parity guard for the :feature:feed string resources.
//
// The Prisme Linguistique demands that every shipped locale render native content:
// a user whose device is FR/ES/PT must never fall through to an English default.
// This spec parses the module's own res/values*/strings.xml and asserts, behaviourally:
//
//   1. every base (values/) <string> key has a translation in every shipped locale
//      (FR, ES, PT) so there is no silent English fallthrough;
//   2. each translated value carries the SAME positional format specifiers as the
//      base (e.g. the first-arg string spec, the second-arg decimal spec). A drifted
//      or dropped arg is a runtime crash, so parity here is correctness not cosmetics.
//
// It is deliberately full-module (not scoped to one string family) so any future key
// added to values/ without its FR/ES/PT siblings turns this red before it ships.
class FeedStringLocalizationParityTest {

    private val shippedLocales = listOf("fr", "es", "pt")

    private fun resDir(): File {
        val fromWorkingDir = File("src/main/res")
        if (fromWorkingDir.isDirectory) return fromWorkingDir
        val fromModule = File("feature/feed/src/main/res")
        check(fromModule.isDirectory) {
            "could not locate feature/feed res dir from ${File("").absolutePath}"
        }
        return fromModule
    }

    private val stringPattern =
        Regex("<string\\s+name=\"([^\"]+)\"\\s*>(.*?)</string>", RegexOption.DOT_MATCHES_ALL)

    private val formatSpecifier = Regex("%(\\d+\\\$)?[sdf]")

    private fun strings(locale: String?): Map<String, String> {
        val dir = if (locale == null) "values" else "values-$locale"
        val file = File(resDir(), "$dir/strings.xml")
        check(file.isFile) { "missing strings file: ${file.path}" }
        return stringPattern.findAll(file.readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    private fun specifiersOf(value: String): List<String> =
        formatSpecifier.findAll(value).map { it.value }.sorted().toList()

    @Test
    fun `every base string key is translated in every shipped locale`() {
        val baseKeys = strings(null).keys

        val gaps = shippedLocales.associateWith { locale ->
            baseKeys - strings(locale).keys
        }.filterValues { it.isNotEmpty() }

        assertThat(gaps).isEmpty()
    }

    @Test
    fun `translated values keep the same positional format specifiers as the base`() {
        val base = strings(null)

        val mismatches = shippedLocales.flatMap { locale ->
            val translated = strings(locale)
            base.mapNotNull { (key, baseValue) ->
                val translatedValue = translated[key] ?: return@mapNotNull null
                val expected = specifiersOf(baseValue)
                val actual = specifiersOf(translatedValue)
                if (expected == actual) null else "$locale:$key expected=$expected actual=$actual"
            }
        }

        assertThat(mismatches).isEmpty()
    }
}
