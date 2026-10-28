package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13580 — un sujet de [SocketInboundRoute.subject] ne s'alimente que par `emitArrived` (via la route, ou à la main) :
 * un `tryEmit` / `emit` direct livrerait l'événement aux collecteurs `collect` et le perdrait SANS BRUIT pour tous les
 * collecteurs `collectArrived`, parce que la jumelle horodatée ne l'a pas reçu.
 */
class SocketSubjectEmissionGuardTest {

    private val declaration = Regex("""val\s+(\w+)[ \t]*(?::[^=\n]+)?=[ \t]*SocketInboundRoute\.subject\b""")

    private fun socketSources(): List<File> {
        val relative = "me/meeshy/sdk/socket"
        val dir = generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { listOf(File(it, "src/main/kotlin/$relative"), File(it, "sdk-core/src/main/kotlin/$relative")).asSequence() }
            .firstOrNull { it.isDirectory }
        checkNotNull(dir) { "sources du paquet socket introuvables" }
        return dir.listFiles { f -> f.extension == "kt" }.orEmpty().toList()
    }

    @Test
    fun `the guard sees the subjects it polices`() {
        val subjects = socketSources().flatMap { file -> declaration.findAll(file.readText()).map { it.groupValues[1] } }
        assertThat(subjects).contains("_messageReceived")
        assertThat(subjects).contains("_postUpdated")
    }

    @Test
    fun `no subject of a socket route is fed by a bare tryEmit or emit`() {
        val offenders = socketSources().flatMap { file ->
            val text = file.readText()
            val names = declaration.findAll(text).map { it.groupValues[1] }.toList()
            file.readLines().withIndex()
                .filter { (_, line) -> !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") }
                .filter { (_, line) -> names.any { Regex("""\b${Regex.escape(it)}\s*\.(tryEmit|emit)\s*\(""").containsMatchIn(line) } }
                .map { (index, _) -> "${file.name}:${index + 1}" }
        }
        assertThat(offenders).isEmpty()
    }
}
