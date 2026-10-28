package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #13580 — un sujet de [SocketInboundRoute.subject] ne s'alimente que par `emitArrived` (via la route, ou à la main) et
 * ne s'expose que par `exposed()` : un `tryEmit` / `emit` direct livrerait l'événement aux collecteurs `collect` et le
 * perdrait SANS BRUIT pour tous les collecteurs `collectArrived`, parce que la jumelle horodatée ne l'a pas reçu ; un
 * `asSharedFlow()` rendrait un flux que le registre ne connaît pas, dont `collectArrived` écrirait chaque événement sous
 * le compte COURANT au lieu du compte d'arrivée.
 *
 * Une analyse de texte, pas de types : un alias (`val s = _sujet`), une fonction qui reçoit le sujet en paramètre ou un
 * `with(_sujet) { tryEmit(x) }` lui échappent. Les formes qu'elle attrape sont celles que le paquet écrit déjà ailleurs
 * (`::tryEmit` dans les gestionnaires d'appel, déclaration sur deux lignes dans les préférences).
 */
class SocketSubjectEmissionGuardTest {

    private val declaration = Regex("""val[ \t]+(\w+)[ \t]*(?::[^=\n]+)?=\s*SocketInboundRoute\.subject\b""")

    private fun offenders(fileName: String, source: String): List<String> {
        val names = declaration.findAll(source).map { it.groupValues[1] }.toList()
        if (names.isEmpty()) return emptyList()
        val code = source.lines().joinToString("\n") { line ->
            val trimmed = line.trimStart()
            if (trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("//")) "" else line
        }
        val forbidden = names.flatMap { name ->
            val subject = Regex.escape(name)
            listOf(
                Regex("""\b$subject\s*\.\s*(tryEmit|emit|emitAll)\s*\("""),
                Regex("""\b$subject\s*::\s*(tryEmit|emit)\b"""),
                Regex("""\b$subject\s*\.\s*asSharedFlow\s*\("""),
            )
        }
        return forbidden.flatMap { rule -> rule.findAll(code).map { "$fileName:${code.lineNumberAt(it.range.first)}" } }
            .distinct()
    }

    private fun String.lineNumberAt(index: Int): Int = substring(0, index).count { it == '\n' } + 1

    private fun mainSources(): List<File> {
        val root = generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { listOf(File(it, "src/main/kotlin"), File(it, "sdk-core/src/main/kotlin")).asSequence() }
            .firstOrNull { File(it, "me/meeshy/sdk/socket").isDirectory }
        checkNotNull(root) { "sources de sdk-core introuvables" }
        return root.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
    }

    @Test
    fun `the guard sees the subjects it polices, one-line and two-line declarations alike`() {
        val subjects = mainSources().flatMap { file -> declaration.findAll(file.readText()).map { it.groupValues[1] } }
        assertThat(subjects).containsAtLeast("_messageReceived", "_postUpdated", "_conversationPreferencesUpdated")
    }

    @Test
    fun `no subject of a socket route is fed by a bare emission nor exposed outside the ledger`() {
        val found = mainSources().flatMap { file -> offenders(file.name, file.readText()) }
        assertThat(found).isEmpty()
    }

    @Test
    fun `the guard catches every emission form the package already writes`() {
        val source = """
            private val _a = SocketInboundRoute.subject<String>()
            private val _b: MutableSharedFlow<String> =
                SocketInboundRoute.subject<String>()
            val a: SharedFlow<String> = _a.asSharedFlow()
            fun feed(raw: String?) {
                _a.tryEmit("x")
                raw?.let(_b::tryEmit)
                _b
                    .emit("y")
                _a.emitArrived("ok")
            }
        """.trimIndent()

        assertThat(offenders("F.kt", source)).containsExactly("F.kt:4", "F.kt:6", "F.kt:7", "F.kt:8")
    }

    @Test
    fun `the guard leaves the ledger's own forms and the comments alone`() {
        val source = """
            private val _a = SocketInboundRoute.subject<String>()
            val a: SharedFlow<String> = _a.exposed()
            /** un `_a.tryEmit(x)` perdrait l'événement */
            fun feed() = _a.emitArrived("ok")
        """.trimIndent()

        assertThat(offenders("F.kt", source)).isEmpty()
    }
}
