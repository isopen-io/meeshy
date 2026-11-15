package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Aucun nom d'événement ne s'épelle en clair hors du catalogue `SocketEventNames` : un littéral
 * `"entité:action"` dans le paquet socket est un canal que le test de parité ne voit pas.
 */
class SocketEventLiteralGuardTest {

    private val literal = Regex(""""[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*"""")

    private fun socketSources(): List<File> {
        val relative = "me/meeshy/sdk/socket"
        val dir = generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { listOf(File(it, "src/main/kotlin/$relative"), File(it, "sdk-core/src/main/kotlin/$relative")).asSequence() }
            .firstOrNull { it.isDirectory }
        checkNotNull(dir) { "sources du paquet socket introuvables" }
        return dir.listFiles { f -> f.extension == "kt" }.orEmpty().toList()
    }

    @Test
    fun `aucun nom d'evenement litteral dans le paquet socket`() {
        val offenders = socketSources().flatMap { file ->
            file.readLines().withIndex()
                .filter { (_, line) -> !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") }
                .filter { (_, line) -> literal.containsMatchIn(line) }
                .map { (index, _) -> "${file.name}:${index + 1}" }
        }
        assertThat(offenders).isEmpty()
    }
}
