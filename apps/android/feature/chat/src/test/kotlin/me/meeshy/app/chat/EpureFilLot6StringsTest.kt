package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Épure 2/3 de la liste et du fil (#17697, règle 1) : la rangée du numéro de sécurité de la fiche Conversation
 * se nomme « Numéro de sécurité » (elle portait le titre de sujet « Chiffrement de bout en bout », déjà celui de
 * la rangée voisine), sans la consigne de geste « Appuyez pour vérifier… ».
 */
class EpureFilLot6StringsTest {

    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val moduleRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "feature/chat/src/main/res").isDirectory }

    private val resDir = File(moduleRoot, "feature/chat/src/main/res")

    private val pattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)

    private fun all(folder: String): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" }.orEmpty().flatMap { file ->
            pattern.findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
        }.toMap()

    @Test
    fun `la rangee du numero de securite se nomme sans consigne de geste`() {
        val host = File(moduleRoot, "feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSheetsHost.kt").readText()
        assertThat(host).contains("R.string.encryption_safety_number_title")
        assertThat(host).doesNotContain("encryption_legacy_title")
        assertThat(host).doesNotContain("encryption_legacy_subtitle")
        folders.forEach {
            val strings = all(it)
            assertWithMessage(it).that(strings).containsKey("encryption_safety_number_title")
            assertWithMessage(it).that(strings).doesNotContainKey("encryption_legacy_title")
            assertWithMessage(it).that(strings).doesNotContainKey("encryption_legacy_subtitle")
        }
    }

    @Test
    fun `le titre est traduit dans chaque langue et ne reprend pas le titre de la rangee voisine`() {
        val titles = folders.associateWith { all(it).getValue("encryption_safety_number_title") }
        assertThat(titles.getValue("values")).isEqualTo("Safety number")
        assertThat(titles.getValue("values-fr")).isEqualTo("Numéro de sécurité")
        assertThat(titles.values.toSet()).hasSize(folders.size)
        folders.forEach {
            assertWithMessage(it).that(titles.getValue(it)).isNotEqualTo(all(it).getValue("encryption_detail_title"))
        }
    }

    @Test
    fun `la rangee dit au repos ce que fait le numero de securite, dans les sept langues`() {
        val host = File(moduleRoot, "feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSheetsHost.kt").readText()
        assertThat(host).contains("subtitle = stringResource(R.string.encryption_safety_number_subtitle)")
        val expected = mapOf(
            "values" to "Compare it with your contact to check the encryption.",
            "values-fr" to "Comparez-le avec votre contact pour vérifier le chiffrement.",
            "values-es" to "Compáralo con tu contacto para verificar el cifrado.",
            "values-pt" to "Compare com seu contato para verificar a criptografia.",
            "values-de" to "Vergleiche sie mit deinem Kontakt, um die Verschlüsselung zu prüfen.",
            "values-it" to "Confrontalo con il tuo contatto per verificare la crittografia.",
            "values-ar" to "قارنه مع جهة اتصالك للتحقق من التشفير.",
        )
        expected.forEach { (folder, sentence) ->
            assertWithMessage(folder).that(all(folder)["encryption_safety_number_subtitle"]).isEqualTo(sentence)
        }
    }

    @Test
    fun `le manifeste declare la cle android-only et plus les deux anciennes`() {
        val manifest = File(moduleRoot, "i18n/manifest").walkTopDown().filter { it.extension == "json" }.joinToString("\n") { it.readText() }
        assertThat(manifest).contains("\"androidName\": \"encryption_safety_number_title\"")
        assertThat(manifest).contains("\"androidName\": \"encryption_safety_number_subtitle\"")
        assertThat(manifest).doesNotContain("\"androidName\": \"encryption_legacy_title\"")
        assertThat(manifest).doesNotContain("\"androidName\": \"encryption_legacy_subtitle\"")
    }
}
