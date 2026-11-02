package me.meeshy.app.auth

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Contrat des chaînes du module auth avec le catalogue iOS : chaque clé adoptée du manifeste
 * vit dans le XML généré des sept langues, aucune n'est redéfinie à la main, les spécificateurs
 * suivent la même forme partout, et chaque libellé propre à Android existe en sept langues.
 */
class AuthStringsContractTest {

    private val moduleDir = "feature/auth"
    private val androidRoot: File = generateSequence(File(System.getProperty("user.dir").orEmpty()).absoluteFile) { it.parentFile }
        .first { File(it, "i18n/manifest/auth.json").isFile }
    private val resDir = File(androidRoot, "$moduleDir/src/main/res")
    private val folders = listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar")

    private val adopted: List<String> = Regex("""\{[^{}]*\}""").findAll(File(androidRoot, "i18n/manifest/auth.json").readText())
        .map { it.value }
        .filter { Regex(""""status"\s*:\s*"adopted"""").containsMatchIn(it) }
        .map { Regex(""""androidName"\s*:\s*"([^"]+)"""").find(it)!!.groupValues[1] }
        .toList()

    private fun names(folder: String, accept: (File) -> Boolean): Map<String, String> =
        File(resDir, folder).listFiles { f -> f.extension == "xml" && accept(f) }.orEmpty().sortedBy { it.name }
            .flatMap { file ->
                Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
                    .findAll(file.readText()).map { it.groupValues[1] to it.groupValues[2] }.toList()
            }.toMap()

    private fun generated(folder: String) = names(folder) { it.name == "strings_generated.xml" }

    private fun handWritten(folder: String) = names(folder) { it.name != "strings_generated.xml" }

    private fun specifiers(text: String): List<String> =
        Regex("""%(?:(\d+)\$)?[sdfx]""").findAll(text).map { it.groupValues[1] }.toList()

    @Test
    fun `the seven locale folders exist`() {
        assertThat(folders.filterNot { File(resDir, it).isDirectory }).isEmpty()
    }

    @Test
    fun `the manifest adopts keys`() {
        assertThat(adopted).isNotEmpty()
    }

    @Test
    fun `every adopted key is generated in the seven locales`() {
        folders.forEach { folder ->
            val present = generated(folder).keys
            assertWithMessage("clés adoptées absentes de $folder/strings_generated.xml")
                .that(adopted.filterNot { it in present }).isEmpty()
        }
    }

    @Test
    fun `no adopted key is redefined by hand in any locale`() {
        folders.forEach { folder ->
            assertWithMessage("clés adoptées redéfinies à la main dans $folder")
                .that(handWritten(folder).keys.filter { it in adopted }).isEmpty()
        }
    }

    @Test
    fun `generated strings with several arguments use positional specifiers`() {
        folders.forEach { folder ->
            val offenders = generated(folder).filter { (_, text) ->
                val found = specifiers(text)
                found.size > 1 && found.any { it.isEmpty() }
            }.keys
            assertWithMessage("spécificateurs non positionnels dans $folder").that(offenders).isEmpty()
        }
    }

    @Test
    fun `a generated string keeps the same number of arguments in every locale`() {
        val reference = generated("values")
        folders.drop(1).forEach { folder ->
            val drifted = generated(folder).filter { (name, text) ->
                reference[name]?.let { specifiers(it).size != specifiers(text).size } == true
            }.keys
            assertWithMessage("arguments divergents dans $folder").that(drifted).isEmpty()
        }
    }

    @Test
    fun `every hand written label exists in the seven locales with the same arguments`() {
        val reference = handWritten("values")
        folders.drop(1).forEach { folder ->
            val local = handWritten(folder)
            assertWithMessage("libellés Android absents de $folder").that(reference.keys.filterNot { it in local }).isEmpty()
            val drifted = reference.filter { (name, text) -> local[name]?.let { specifiers(it).size != specifiers(text).size } == true }.keys
            assertWithMessage("arguments divergents dans $folder").that(drifted).isEmpty()
        }
    }

    @Test
    fun `the iOS wording is served in the active language`() {
        assertThat(generated("values")["auth_forgot_title"]).isEqualTo("Forgot password")
        assertThat(generated("values-fr")["auth_forgot_title"]).isEqualTo("Mot de passe oublié")
        assertThat(generated("values-de")["auth_forgot_title"]).isEqualTo("Passwort vergessen")
        assertThat(generated("values-it")["auth_forgot_title"]).isEqualTo("Password dimenticata")
        assertThat(generated("values-ar")["auth_forgot_title"]).isEqualTo("نسيت كلمة المرور")
        assertThat(generated("values")["auth_magic_expired"]).isEqualTo("Link expired, send a new one")
        assertThat(generated("values-de")["auth_magic_expired"]).isEqualTo("Link abgelaufen, sende einen neuen")
    }
}
