package me.meeshy.app

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

/**
 * Le moteur regex d'Android (ICU) refuse une accolade NUE que la JVM accepte : `Regex("\\{([^}]+)}")` passait
 * tous les tests JVM et plantait l'app au démarrage sur Android 9 (`PatternSyntaxException`, #13371).
 * Toute accolade d'un littéral `Regex("…")` des sources Kotlin est donc échappée, quantificateur `{n,m}`,
 * classe `\p{…}` ou gabarit `${…}`.
 */
class RegexLiteralAndroidCompatGuardTest {

    private val androidRoot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "settings.gradle.kts").exists() }

    private val literal = Regex("""Regex\(\s*"((?:[^"\\]|\\.)*)"""")
    private val quantifier = Regex("""^\{\d+(,\d*)?\}""")

    private fun bareBrace(kotlinLiteral: String): String? {
        val s = kotlinLiteral.replace("\\\\", "\\")
        var i = 0
        var inClass = false
        while (i < s.length) {
            val c = s[i]
            when {
                c == '$' && s.getOrNull(i + 1) == '{' -> i = s.indexOf('}', i).let { if (it < 0) s.length else it + 1 }
                c == '\\' && (s.getOrNull(i + 1) == 'p' || s.getOrNull(i + 1) == 'P') && s.getOrNull(i + 2) == '{' ->
                    i = s.indexOf('}', i).let { if (it < 0) s.length else it + 1 }
                c == '\\' -> i += 2
                inClass -> { if (c == ']') inClass = false; i++ }
                c == '[' -> { inClass = true; i++ }
                c == '{' -> {
                    val q = quantifier.find(s.substring(i)) ?: return "accolade ouvrante nue"
                    i += q.value.length
                }
                c == '}' -> return "accolade fermante nue"
                else -> i++
            }
        }
        return null
    }

    @Test
    fun `aucun litteral Regex ne porte d'accolade nue que le moteur d'Android refuse`() {
        val offenders = androidRoot.walkTopDown()
            .filter { it.isFile && it.extension == "kt" && "/src/main/" in it.path && "/build/" !in it.path }
            .flatMap { file ->
                literal.findAll(file.readText()).mapNotNull { m ->
                    bareBrace(m.groupValues[1])?.let { "${file.relativeTo(androidRoot)} : $it dans \"${m.groupValues[1]}\"" }
                }
            }
            .toList()
        assertThat(offenders).isEmpty()
    }

    @Test
    fun `le garde reconnait l'accolade fermante nue qui a plante Android 9`() {
        assertThat(bareBrace("""\\{([^}]+)}""")).isNotNull()
        assertThat(bareBrace("""\\{([^}]+)\\}""")).isNull()
        assertThat(bareBrace("""\\p{Mn}+[a-z]{2,3}""")).isNull()
    }
}
