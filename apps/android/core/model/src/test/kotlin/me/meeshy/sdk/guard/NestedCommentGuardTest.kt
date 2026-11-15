package me.meeshy.sdk.guard

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Kotlin IMBRIQUE les commentaires de bloc : un « /` `* » écrit dans un KDoc (un chemin
 * `…/game/…`, un glob `Skeletons/…`) ouvre un second commentaire. Non refermé, il avale
 * le reste du fichier (« Unclosed comment », trois modules cassés en novembre 2026) ;
 * refermé par un `*` `/` plus loin, il avale en silence le code qui les sépare.
 * La garde refuse donc toute ouverture de commentaire à l'intérieur d'un commentaire,
 * dans toutes les sources Kotlin d'`apps/android`.
 */
class NestedCommentGuardTest {

    private data class Finding(val line: Int, val kind: String)

    private fun androidRoot(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            if (File(dir, "settings.gradle.kts").isFile && File(dir, "core/model").isDirectory) return dir
            dir = dir.parentFile
        }
        error("apps/android introuvable depuis ${File("").absolutePath} : la garde ne lirait rien")
    }

    private fun lineOf(src: String, index: Int): Int = src.substring(0, index).count { it == '\n' } + 1

    private fun scan(src: String): List<Finding> {
        val findings = mutableListOf<Finding>()
        val modes = ArrayDeque<Char>().apply { addLast('c') }
        val braces = ArrayDeque<Int>().apply { addLast(0) }
        var i = 0
        while (i < src.length) {
            val mode = modes.last()
            val c = src[i]
            when (mode) {
                'c', 't' -> when {
                    src.startsWith("//", i) -> i = src.indexOf('\n', i).let { if (it < 0) src.length else it }
                    src.startsWith("/*", i) -> {
                        val start = i
                        var depth = 1
                        i += 2
                        while (i < src.length && depth > 0) {
                            when {
                                src.startsWith("/*", i) -> {
                                    findings += Finding(lineOf(src, i), "ouverture imbriquée")
                                    depth++
                                    i += 2
                                }
                                src.startsWith("*/", i) -> { depth--; i += 2 }
                                else -> i++
                            }
                        }
                        if (depth > 0) findings += Finding(lineOf(src, start), "commentaire jamais refermé")
                    }
                    src.startsWith("\"\"\"", i) -> { modes.addLast('r'); braces.addLast(0); i += 3 }
                    c == '"' -> { modes.addLast('s'); braces.addLast(0); i++ }
                    c == '\'' -> {
                        val close = src.indexOf('\'', i + if (src.getOrNull(i + 1) == '\\') 3 else 2)
                        i = if (close in 0..(i + 8)) close + 1 else i + 1
                    }
                    mode == 't' && c == '{' -> { braces.addLast(braces.removeLast() + 1); i++ }
                    mode == 't' && c == '}' -> {
                        val depth = braces.removeLast()
                        if (depth == 0) modes.removeLast() else braces.addLast(depth - 1)
                        i++
                    }
                    else -> i++
                }
                's' -> when {
                    c == '\\' -> i += 2
                    c == '"' || c == '\n' -> { modes.removeLast(); braces.removeLast(); i++ }
                    src.startsWith("\${", i) -> { modes.addLast('t'); braces.addLast(0); i += 2 }
                    else -> i++
                }
                else -> when {
                    src.startsWith("\"\"\"", i) -> {
                        while (i < src.length && src[i] == '"') i++
                        modes.removeLast()
                        braces.removeLast()
                    }
                    src.startsWith("\${", i) -> { modes.addLast('t'); braces.addLast(0); i += 2 }
                    else -> i++
                }
            }
        }
        return findings
    }

    @Test
    fun `a path in a KDoc that opens a comment is caught`() {
        val src = "/**\n * Lit `/me/game/` + \"*\" — ici /me/game/" + "*\n */\nval x = 1\n"

        assertThat(scan(src).map { it.kind }).contains("commentaire jamais refermé")
    }

    @Test
    fun `a nested comment that closes later is caught because it swallows code`() {
        val src = "/** Voir dossier/" + "* */\nval swallowed = 1\n*/\n"

        assertThat(scan(src)).containsExactly(Finding(1, "ouverture imbriquée"))
    }

    @Test
    fun `comment markers inside strings and templates are ignored`() {
        val src = "val a = \"/" + "*\"\nval b = \"\"\"glob/" + "*.kt\"\"\"\nval c = \"\${\"/" + "*\"}\"\nval d = '/'\n/* ok */\n"

        assertThat(scan(src)).isEmpty()
    }

    @Test
    fun `no android Kotlin source opens a comment inside a comment`() {
        val root = androidRoot()
        val sources = root.walkTopDown()
            .onEnter { it.name != "build" && it.name != ".gradle" && it.name != "node_modules" }
            .filter { it.isFile && (it.extension == "kt" || it.extension == "kts") }
            .toList()

        val offenders = sources.flatMap { file ->
            scan(file.readText()).map { "${file.relativeTo(root)}:${it.line} — ${it.kind}" }
        }

        assertThat(sources.size).isGreaterThan(1000)
        assertThat(offenders).isEmpty()
    }
}
