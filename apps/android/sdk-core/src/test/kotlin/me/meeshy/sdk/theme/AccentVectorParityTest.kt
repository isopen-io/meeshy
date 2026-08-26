package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/**
 * Rejeu Android du fichier de vecteurs partagé
 * `packages/shared/fixtures/reading-modes/accent.vectors.json` — le CONTRAT
 * cross-plateforme de la couleur d'accent de conversation (CLAUDE.md §
 * *Conversation Accent Color*). TS le rejoue déjà
 * (`packages/shared/__tests__/vectors/accent.vectors.test.ts`) et iOS aussi
 * (`apps/ios/MeeshyTests/Unit/Lentille/AccentVectorTests.swift`). Android
 * n'en rejouait AUCUN cas — `DynamicColorGeneratorTest` ne vérifie qu'une
 * poignée d'exemples écrits à la main. C'est la troisième et dernière branche
 * du miroir : 3 clients sur 3 rejouent désormais les 24 vecteurs (leçon 291 —
 * une règle à N miroirs sans témoin de parité est un « N−1 » où N vaut zéro).
 *
 * **API réelle rejouée** — `DynamicColorGenerator.paletteForWire(type,
 * language, theme)` pour les 20 vecteurs de palette (le miroir Kotlin de
 * `conversationAccentPalette`, incluant `WIRE_TYPE_TO_CONTEXT_TYPE` :
 * `public`/`global`/`broadcast` → COMMUNITY), et `colorForName(_)` pour les 4
 * vecteurs de repli. C'est ce chemin exact que `ApiConversation.accentColorPalette()`
 * emprunte en production — jamais une réimplémentation locale du switch dans ce
 * fichier.
 *
 * **Égalité hex ENTIÈRE, sans tolérance** — chaque canal du blend est un
 * `Double.toInt()` (troncature vers zéro, jamais un arrondi ; contrat LWS-2,
 * documenté dans `accent.vectors.json.$format`). Le cas `truncation-test`
 * (`#31B6BA`, jamais `#31B6BB`) l'exerce.
 *
 * **Aucune exemption** — contrairement à iOS (dont l'enum fermé
 * `ConversationLanguage` ne peut pas reproduire le vecteur `unknown-lang`
 * « klingon » et doit l'exempter mécaniquement), le résolveur Android
 * `paletteForWire` travaille par CLÉS DE COULEUR avec le repli
 * `UNKNOWN_KEY_FALLBACK_HEX` (`4ECDC4`), reproduisant `unknown-lang`
 * (`#83AFA9`) comme les 23 autres : 24/24.
 */
class AccentVectorParityTest {

    // Le fichier de vecteurs vit hors du module Android, à la racine du dépôt.
    // Le répertoire de travail des tests JVM Gradle est soit le module
    // (`apps/android/sdk-core`), soit la racine Android (`apps/android`) — on
    // remonte donc l'arborescence jusqu'à trouver le fichier partagé, comme
    // FeedStringLocalizationParityTest résout ses ressources.
    private fun fixtureFile(): File {
        val relative = "packages/shared/fixtures/reading-modes/accent.vectors.json"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error(
            "accent.vectors.json introuvable en remontant depuis ${File("").absolutePath} " +
                "(cherché: $relative)",
        )
    }

    private data class Vector(
        val name: String?,
        val type: String?,
        val language: String?,
        val theme: String?,
        val colorForName: String?,
        val primary: String?,
        val secondary: String?,
        val accent: String?,
        val hex: String?,
    ) {
        val isColorForName: Boolean get() = colorForName != null
    }

    private fun str(obj: JsonObject, key: String): String? =
        obj[key]?.jsonPrimitive?.contentOrNull

    private fun loadVectors(): List<Vector> {
        val root = Json.parseToJsonElement(fixtureFile().readText()).jsonObject
        val vectors = root["vectors"]?.jsonArray
            ?: error("accent.vectors.json : clé `vectors` absente ou non-tableau")
        return vectors.map { element ->
            val obj = element.jsonObject
            val input = obj["input"]!!.jsonObject
            val expected = obj["expected"]!!.jsonObject
            Vector(
                name = str(input, "name"),
                type = str(input, "type"),
                language = str(input, "language"),
                theme = str(input, "theme"),
                colorForName = str(input, "colorForName"),
                primary = str(expected, "primary"),
                secondary = str(expected, "secondary"),
                accent = str(expected, "accent"),
                hex = str(expected, "hex"),
            )
        }
    }

    private fun strip(hex: String): String = hex.removePrefix("#")

    // --- Gardes de harnais (leçon 257 : jamais de vert silencieux à zéro cas) ---

    @Test
    fun `loads twenty-four vectors, never zero`() {
        val vectors = loadVectors()
        assertThat(vectors).isNotEmpty()
        // Re-preuve du compte : 20 palette + 4 colorForName au moment de l'écriture.
        // Un changement doit être investigué avant d'ajuster ce nombre.
        assertThat(vectors).hasSize(24)
        assertThat(vectors.count { it.isColorForName }).isEqualTo(4)
        assertThat(vectors.count { !it.isColorForName }).isEqualTo(20)
    }

    // --- 20 vecteurs de palette → paletteForWire (égalité hex stricte) ---

    @Test
    fun `palette vectors match paletteForWire exactly`() {
        val paletteVectors = loadVectors().filterNot { it.isColorForName }
        assertThat(paletteVectors).isNotEmpty()

        for (v in paletteVectors) {
            val label = "cas «${v.name}» (type=${v.type}, language=${v.language ?: "∅"}, theme=${v.theme ?: "∅"})"
            val actual = DynamicColorGenerator.paletteForWire(
                type = v.type,
                language = v.language,
                theme = v.theme,
            )
            assertWithMessage("$label primary").that(actual.primary).isEqualTo(strip(v.primary!!))
            assertWithMessage("$label secondary").that(actual.secondary).isEqualTo(strip(v.secondary!!))
            assertWithMessage("$label accent").that(actual.accent).isEqualTo(strip(v.accent!!))
        }
    }

    // --- 4 vecteurs de repli → colorForName (hash DJB2, aucune tolérance) ---

    @Test
    fun `colorForName vectors match colorForName exactly`() {
        val nameVectors = loadVectors().filter { it.isColorForName }
        assertThat(nameVectors).hasSize(4)

        for (v in nameVectors) {
            val actual = DynamicColorGenerator.colorForName(v.colorForName!!)
            assertWithMessage("colorForName(\"${v.colorForName}\")").that(actual).isEqualTo(strip(v.hex!!))
        }
    }

    // --- Témoin ciblé de la divergence corrigée : public/global/broadcast → COMMUNITY ---

    @Test
    fun `public global and broadcast collapse onto the community base color, not direct`() {
        // La couleur COMMUNITY (via french/general) — vecteur `community` du fichier.
        val community = DynamicColorGenerator.paletteForWire(type = "community").primary
        val direct = DynamicColorGenerator.paletteForWire(type = "direct").primary
        assertThat(community).isNotEqualTo(direct)

        for (wireType in listOf("public", "global", "broadcast")) {
            assertThat(DynamicColorGenerator.paletteForWire(type = wireType).primary).isEqualTo(community)
        }
    }
}
