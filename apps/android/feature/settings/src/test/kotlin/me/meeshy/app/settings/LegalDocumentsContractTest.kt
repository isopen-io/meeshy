package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

class LegalDocumentsContractTest {

    private val legal = "legal.xml"
    private val writtenLocales = listOf("fr", "es", "pt")

    @Test
    fun `english french spanish and portuguese carry the same legal keys`() {
        val expected = Tree.entriesOf(null, legal).keys
        assertThat(expected).isNotEmpty()
        writtenLocales.forEach { locale ->
            assertThat(Tree.entriesOf(locale, legal).keys).isEqualTo(expected)
        }
    }

    @Test
    fun `terms and privacy share one last-updated date`() {
        (listOf<String?>(null) + writtenLocales).forEach { locale ->
            val names = Tree.entriesOf(locale, legal).keys
            assertThat(names).contains("legal_last_updated")
            assertThat(names.filter { it.endsWith("last_updated") }).containsExactly("legal_last_updated")
        }
        val dates = writtenLocales.map { Regex("""\d{4}""").find(Tree.entriesOf(it, legal).getValue("legal_last_updated").text)?.value }
        assertThat(dates.toSet()).hasSize(1)
    }

    @Test
    fun `german italian and arabic have no legal file and fall back to english`() {
        Tree.exemptedLegalLocales.forEach { locale ->
            assertWithMessage("values-$locale/$legal").that(Tree.files(locale).map { it.name }).doesNotContain(legal)
        }
    }

    @Test
    fun `the exemption file lists exactly those locales and only legal xml`() {
        val lines = File(Tree.androidRoot(), "app/src/test/resources/i18n/legal-locale-exemptions.txt").readLines()
            .map { it.substringBefore('#').trim() }.filter { it.isNotEmpty() }
        assertThat(lines.map { it.split(Regex("\\s+")) }.map { it[1] }.toSet()).containsExactly(legal)
        assertThat(lines.map { it.substringBefore(' ') }).containsExactlyElementsIn(Tree.exemptedLegalLocales)
    }
}
