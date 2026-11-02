package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.security.MessageDigest
import org.junit.Test

class GloryFrameFontsNoticeGuardTest {

    private val fontsDir = File("src/main/assets/fonts/glory")
    private val row = Regex("""^\| `([^`]+\.ttf)` \|.*\| `([0-9a-f]{64})` \|$""", RegexOption.MULTILINE)

    private fun sha256(file: File): String =
        MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }

    private fun notice(): Map<String, String> =
        row.findAll(File(fontsDir, "NOTICE.md").readText()).associate { it.groupValues[1] to it.groupValues[2] }

    @Test
    fun `les sept fichiers sont ceux du NOTICE octet pour octet`() {
        val table = notice()
        assertThat(table).hasSize(7)
        table.forEach { (name, expected) ->
            val file = File(fontsDir, name)
            assertWithMessage("$name manquant").that(file.isFile).isTrue()
            assertWithMessage("$name modifie, converti ou renomme").that(sha256(file)).isEqualTo(expected)
        }
    }

    @Test
    fun `aucun fichier de police hors NOTICE n est embarque`() {
        val onDisk = fontsDir.listFiles { f -> f.extension == "ttf" }.orEmpty().map { it.name }
        assertThat(onDisk).containsExactlyElementsIn(notice().keys)
    }

    @Test
    fun `le texte OFL accompagne les polices`() {
        var dir: File? = File("").absoluteFile
        var text: String? = null
        while (dir != null && text == null) {
            File(dir, "licenses/OFL-GloryFrameFonts.txt").takeIf { it.isFile }?.let { text = it.readText() }
            dir = dir.parentFile
        }
        assertThat(text).contains("SIL OPEN FONT LICENSE Version 1.1")
        assertThat(text).contains("Reserved Font Name 'Cinzel'")
    }
}
