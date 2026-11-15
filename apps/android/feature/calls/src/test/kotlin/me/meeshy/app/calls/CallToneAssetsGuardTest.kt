package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class CallToneAssetsGuardTest {

    private fun module(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "src/main/res/raw").isDirectory || File(it, "feature/calls/src/main/res/raw").isDirectory }
        .let { if (File(it, "src/main/res/raw").isDirectory) it else File(it, "feature/calls") }

    @Test
    fun `les trois ressources de marque existent et sont des ogg lisibles`() {
        listOf("call_ringback", "call_cue_connected", "call_cue_ended").forEach { name ->
            val file = File(module(), "src/main/res/raw/$name.ogg")
            assertThat(file.isFile).isTrue()
            assertThat(file.readBytes().copyOfRange(0, 4).toString(Charsets.US_ASCII)).isEqualTo("OggS")
        }
    }

    @Test
    fun `aucun ToneGenerator dans les sources de l ecran d appel`() {
        val offenders = File(module(), "src/main/kotlin").walkTopDown()
            .filter { it.extension == "kt" && it.readText().contains("ToneGenerator(") }
            .toList()
        assertThat(offenders).isEmpty()
    }
}
