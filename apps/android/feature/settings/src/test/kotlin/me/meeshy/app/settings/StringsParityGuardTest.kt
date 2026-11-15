package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

class StringsParityGuardTest {

    private val base = Tree.entriesOf(null)
    private val legalKeys = Tree.entriesOf(null, onlyFile = "legal.xml").keys

    private fun expectedKeys(locale: String): Set<String> =
        if (locale in Tree.exemptedLegalLocales) base.keys - legalKeys else base.keys

    @Test
    fun `settings ships the seven locale folders`() {
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            assertWithMessage("dossier ${Tree.folder(locale)}").that(Tree.files(locale)).isNotEmpty()
        }
    }

    @Test
    fun `every locale defines the same keys as the default values`() {
        Tree.locales.forEach { locale ->
            val translated = Tree.entriesOf(locale).keys
            assertWithMessage("clés absentes de $locale").that(expectedKeys(locale) - translated).isEmpty()
            assertWithMessage("clés orphelines de $locale").that(translated - base.keys).isEmpty()
        }
    }

    @Test
    fun `every translation keeps the format markers of the default string`() {
        Tree.locales.forEach { locale ->
            val translated = Tree.entriesOf(locale)
            base.values.forEach { entry ->
                val other = translated[entry.name] ?: return@forEach
                val expected = Tree.specifiers(if (entry.isPlural) entry.quantities.getValue("other") else entry.text)
                val actual = Tree.specifiers(if (other.isPlural) other.quantities.getValue("other") else other.text)
                assertWithMessage("marqueurs de ${entry.name} en $locale").that(actual).isEqualTo(expected)
            }
        }
    }

    @Test
    fun `plurals keep their kind and carry every CLDR quantity of their language`() {
        val basePlurals = base.values.filter { it.isPlural }.map { it.name }
        assertThat(basePlurals).isNotEmpty()
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            val entries = Tree.entriesOf(locale)
            val required = Tree.requiredQuantities(locale ?: "en")
            basePlurals.forEach { name ->
                val plural = entries.getValue(name)
                assertWithMessage("$name en ${locale ?: "en"} est un <plurals>").that(plural.isPlural).isTrue()
                assertWithMessage("quantités de $name en ${locale ?: "en"}")
                    .that(plural.quantities.keys.containsAll(required)).isTrue()
            }
        }
    }
}
