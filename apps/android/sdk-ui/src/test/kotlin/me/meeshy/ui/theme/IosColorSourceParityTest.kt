package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Garde de parité à la SOURCE : relit `MeeshyColors.swift` (chemin relatif à la racine du dépôt) et
 * exige que chaque `Color(hex:)` y ait son jumeau dans [MeeshyPaletteGenerated], de même valeur.
 * Ajouter ou modifier une teinte côté iOS sans régénérer
 * (`node packages/design-tokens/scripts/generate-android-from-ios.mjs`) fait rougir ce test, comme
 * le `--check` d'`android.yml`. Ne jamais corriger en recopiant à la main une valeur dérivée.
 *
 * Les échelles (espacements, rayons, polices) sont rejouées contre `DesignTokens.swift` par
 * [MeeshyScalesParityTest] ; l'accent de conversation (0,30 langue / 0,30 type / 0,40 thème, ±30°)
 * par `AccentVectorParityTest` (`:sdk-core`, les 24 vecteurs partagés) — aucun écart constaté.
 */
class IosColorSourceParityTest {

    private val declaration = Regex("""^\s*public static let (\w+)\s*=\s*Color\(hex:\s*"([0-9A-Fa-f]{6})"\)\s*$""", RegexOption.MULTILINE)

    private fun swiftSource(): String {
        val relative = "packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("MeeshyColors.swift introuvable en remontant depuis ${File("").absolutePath} (cherché: $relative)")
    }

    private fun swiftColors(source: String): Map<String, String> =
        declaration.findAll(source).associate { it.groupValues[1].replaceFirstChar(Char::uppercase) to it.groupValues[2].uppercase() }

    private fun Color.hex(): String = "%06X".format(0xFFFFFF and toArgbRgb())

    private fun Color.toArgbRgb(): Int =
        ((red * 255f + 0.5f).toInt() shl 16) or ((green * 255f + 0.5f).toInt() shl 8) or (blue * 255f + 0.5f).toInt()

    private fun mismatches(source: String, table: Map<String, Color>): List<String> =
        swiftColors(source).mapNotNull { (name, hex) ->
            val kotlin = table[name]
            when {
                kotlin == null -> "$name : absente de MeeshyPaletteGenerated (Swift $hex)"
                kotlin.hex() != hex -> "$name : Swift $hex, Kotlin ${kotlin.hex()}"
                else -> null
            }
        }

    @Test
    fun `every Color hex of MeeshyColors swift exists in the generated table with the same value`() {
        assertWithMessage("dérive Swift -> Kotlin").that(mismatches(swiftSource(), MeeshyPaletteGenerated.ByName)).isEmpty()
    }

    @Test
    fun `the generated table carries exactly the Swift constants`() {
        assertThat(MeeshyPaletteGenerated.ByName.keys).containsExactlyElementsIn(swiftColors(swiftSource()).keys)
        assertThat(MeeshyPaletteGenerated.ByName.size).isAtLeast(58)
    }

    @Test
    fun `the colors absent from the hand-written palette are now present`() {
        val table = MeeshyPaletteGenerated.ByName
        assertThat(table["Violet950"]?.hex()).isEqualTo("2E1065")
        assertThat(table["ErrorInk"]?.hex()).isEqualTo("C81E1E")
        assertThat(table["MeeshSilver"]?.hex()).isEqualTo("A8B1BF")
        assertThat(table["SurfaceDarkDeep"]?.hex()).isEqualTo("0F0D19")
        assertThat(table["SurfaceLightMist"]?.hex()).isEqualTo("FAFAFF")
        assertThat(table["BlockedNeutral"]?.hex()).isEqualTo("888888")
        listOf("StateViewOnce", "StateEphemeral", "StateConcealed", "TileCoral", "TileSaffron", "Amber500")
            .forEach { assertThat(table).containsKey(it) }
    }

    @Test
    fun `a hex derived in the Swift source is detected`() {
        val derived = swiftSource().replace("""Color(hex: "6366F1")""", """Color(hex: "6366F2")""")
        assertThat(mismatches(derived, MeeshyPaletteGenerated.ByName)).isNotEmpty()
    }

    @Test
    fun `a constant added in the Swift source and missing in Kotlin is detected`() {
        val added = swiftSource() + "\n    public static let nouvelleTeinte = Color(hex: \"123456\")\n"
        assertThat(mismatches(added, MeeshyPaletteGenerated.ByName)).hasSize(1)
    }

    @Test
    fun `the historical palette names delegate to the generated table`() {
        assertThat(MeeshyPalette.Indigo500).isEqualTo(MeeshyPaletteGenerated.Indigo500)
        assertThat(MeeshyPalette.Error).isEqualTo(MeeshyPaletteGenerated.Error)
        assertThat(MeeshyPalette.BrandGradient).containsExactly(MeeshyPaletteGenerated.Indigo500, MeeshyPaletteGenerated.Indigo700).inOrder()
    }
}
