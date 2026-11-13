package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.theme.DynamicColorGenerator.ThemeMode
import org.junit.Test

/**
 * #17879 (A1.10, A2.2) — rejeu Android du fichier COMMUN `packages/shared/fixtures/author-ink.vectors.json`,
 * généré en exécutant la loi TS `legibleTint` (`packages/shared/utils/author-ink.ts`) sur les fonds du fil web.
 * Le web et le banc TS le rejouent déjà ; iOS aussi (`AuthorInkTests`). La table recopiée d'`AuthorInkTest`
 * était une COPIE du web : ce témoin lit la source elle-même, si bien qu'une loi TS qui bouge rougit ici.
 */
class AuthorInkSharedVectorsTest {
    private data class Vector(val mode: ThemeMode, val tint: String, val expected: String)

    private fun fixtureFile(): File {
        val relative = "packages/shared/fixtures/author-ink.vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("author-ink.vectors.json introuvable en remontant depuis ${File("").absolutePath} (cherché : $relative)")
    }

    private val root: JsonObject by lazy { Json.parseToJsonElement(fixtureFile().readText()).jsonObject }

    private fun bare(hex: String): String = hex.removePrefix("#").uppercase()

    private fun modeOf(scheme: String): ThemeMode = when (scheme) {
        "dark" -> ThemeMode.DARK
        "light" -> ThemeMode.LIGHT
        else -> error("schéma inconnu : $scheme")
    }

    private fun vectors(): List<Vector> = root.getValue("vectors").jsonArray.map { element ->
        val obj = element.jsonObject
        Vector(
            mode = modeOf(obj.getValue("scheme").jsonPrimitive.content),
            tint = bare(obj.getValue("tint").jsonPrimitive.content),
            expected = bare(obj.getValue("expected").jsonPrimitive.content),
        )
    }

    private fun backgrounds(scheme: String): List<String> =
        root.getValue("backgrounds").jsonObject.getValue(scheme).jsonArray.map { bare(it.jsonPrimitive.content) }

    @Test
    fun `the shared file covers the whole palette in both schemes, never zero`() {
        val vectors = vectors()
        assertThat(vectors).hasSize(78)
        for (mode in listOf(ThemeMode.DARK, ThemeMode.LIGHT)) {
            assertThat(vectors.filter { it.mode == mode }.map { it.tint }).containsExactlyElementsIn(DynamicColorGenerator.vibrantPalette)
        }
    }

    @Test
    fun `the backgrounds measured are the shared file's, in both schemes`() {
        assertThat(AuthorInk.backgrounds(ThemeMode.DARK)).isEqualTo(backgrounds("dark"))
        assertThat(AuthorInk.backgrounds(ThemeMode.LIGHT)).isEqualTo(backgrounds("light"))
    }

    @Test
    fun `every shared vector is what the Kotlin law answers`() {
        for (vector in vectors()) {
            assertWithMessage("${vector.tint} ${vector.mode}").that(AuthorInk.hex(vector.tint, vector.mode)).isEqualTo(vector.expected)
        }
    }
}
