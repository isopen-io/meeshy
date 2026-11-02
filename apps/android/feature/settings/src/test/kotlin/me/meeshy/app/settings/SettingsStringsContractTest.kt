package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import me.meeshy.app.settings.SettingsResourceTree as Tree
import me.meeshy.feature.settings.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SettingsStringsContractTest {

    private val countPlurals = listOf(
        "twofactor_backup_codes_remaining",
        "data_export_ready_messages",
        "data_export_ready_contacts",
    )

    @Test
    fun `the three counters are real plurals in the seven locales`() {
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            val entries = Tree.entriesOf(locale)
            countPlurals.forEach { name ->
                val entry = entries[name]
                assertWithMessage("$name en ${locale ?: "en"}").that(entry?.isPlural).isTrue()
                assertThat(entry!!.quantities.keys).containsAtLeastElementsIn(Tree.requiredQuantities(locale ?: "en"))
            }
        }
    }

    @Test
    fun `no iOS-only label is shown on Android`() {
        val iosOnly = Regex("""Face ID|Touch ID|Siri|Live Activit|iCloud|iPhone""", RegexOption.IGNORE_CASE)
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            Tree.files(locale).forEach { file ->
                assertWithMessage("${file.parentFile.name}/${file.name}").that(iosOnly.containsMatchIn(file.readText())).isFalse()
            }
        }
    }

    @Test
    fun `an adopted iOS key is never written by hand`() {
        val manifestDir = File(Tree.androidRoot(), "i18n/manifest")
        val manifests = listOf(File(manifestDir, "settings.json")) +
            File(manifestDir, "settings.d").listFiles { f -> f.extension == "json" }.orEmpty().toList()
        val objectPattern = Regex("""\{[^{}]*\}""")
        val adopted = manifests.flatMap { file ->
            objectPattern.findAll(file.readText()).map { it.value }
                .filter { Regex(""""status"\s*:\s*"adopted"""").containsMatchIn(it) }
                .mapNotNull { entry ->
                    Regex(""""androidName"\s*:\s*"([^"]+)"""").find(entry)?.groupValues?.get(1)
                        ?: Regex(""""iosKey"\s*:\s*"([^"]+)"""").find(entry)?.groupValues?.get(1)?.replace('.', '_')?.replace('-', '_')
                }
        }.toSet()
        assertThat(adopted).isNotEmpty()
        (listOf<String?>(null) + Tree.locales).forEach { locale ->
            val handWritten = Tree.files(locale).filter { it.name != "strings_generated.xml" }
                .flatMap(Tree::entries).map { it.name }.toSet()
            assertWithMessage("clés adoptées écrites à la main en ${locale ?: "en"}").that(handWritten.intersect(adopted)).isEmpty()
        }
    }

    private fun backupCodes(count: Int): String {
        val resources = RuntimeEnvironment.getApplication().resources
        return resources.getQuantityString(R.plurals.twofactor_backup_codes_remaining, count, count)
    }

    @Test
    @Config(qualifiers = "fr")
    fun `french counts one backup code in the singular and two in the plural`() {
        assertThat(backupCodes(1)).isEqualTo("1 code de secours restant")
        assertThat(backupCodes(2)).isEqualTo("2 codes de secours restants")
    }

    @Test
    @Config(qualifiers = "ar")
    fun `arabic picks one of six plural forms for 0, 1, 2, 5 and 11`() {
        assertThat(backupCodes(0)).isEqualTo("لا رموز احتياطية متبقية")
        assertThat(backupCodes(1)).isEqualTo("رمز احتياطي واحد متبقٍ")
        assertThat(backupCodes(2)).isEqualTo("رمزان احتياطيان متبقيان")
        assertThat(backupCodes(5)).containsMatch("[5٥] رموز احتياطية متبقية")
        assertThat(backupCodes(11)).containsMatch("(11|١١) رمزًا احتياطيًا متبقيًا")
    }
}
