package me.meeshy.sdk.model.lens

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Garde de fraîcheur du miroir Kotlin : relit `packages/shared/types/lens-format.ts` (source unique du
 * contrat) et exige que le vocabulaire, les bornes, les intervalles et les motifs de [LensVocabulary]
 * lui soient égaux. Si le TypeScript change sans le Kotlin, ce test échoue.
 */
class LensFormatGeneratedFreshnessTest {

    private fun typesFile(name: String): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/types/$name")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("packages/shared/types/$name introuvable en remontant depuis ${File("").absolutePath}")
    }

    private val lens = typesFile("lens-format.ts")

    private fun quoted(source: String): List<String> = Regex("'((?:[^'\\\\]|\\\\.)*)'").findAll(source).map { it.groupValues[1] }.toList()

    private fun listOf(source: String, name: String): List<String> {
        val body = Regex("export const $name = \\[(.*?)\\] as const", RegexOption.DOT_MATCHES_ALL).find(source)?.groupValues?.get(1)
            ?: error("$name absent")
        return quoted(body)
    }

    private fun limits(): Map<String, Int> {
        val body = Regex("export const LENS_LIMITS = \\{(.*?)\\} as const", RegexOption.DOT_MATCHES_ALL).find(lens)!!.groupValues[1]
        return Regex("(\\w+): (\\d+|APPEARANCE_LIMITS\\.maxKeyLength),").findAll(body).associate { match ->
            val raw = match.groupValues[2]
            match.groupValues[1] to (raw.toIntOrNull() ?: Regex("maxKeyLength: (\\d+)").find(typesFile("appearance-design.ts"))!!.groupValues[1].toInt())
        }
    }

    private fun ranges(): Map<String, ClosedFloatingPointRange<Double>> {
        val body = Regex("export const LENS_RANGES = \\{(.*?)\\} as const", RegexOption.DOT_MATCHES_ALL).find(lens)!!.groupValues[1]
        return Regex("(\\w+): \\[(-?[\\d.]+), (-?[\\d.]+)\\]").findAll(body).associate {
            it.groupValues[1] to (it.groupValues[2].toDouble()..it.groupValues[3].toDouble())
        }
    }

    private fun patterns(): Map<String, String> {
        val body = Regex("export const LENS_PATTERNS = \\{(.*?)\\} as const", RegexOption.DOT_MATCHES_ALL).find(lens)!!.groupValues[1]
        val own = Regex("(\\w+): /\\^(.*)\\$/,").findAll(body).associate { it.groupValues[1] to it.groupValues[2].replace("\\/", "/") }
        val slug = Regex("PACK_SLUG_PATTERN = /\\^(.*)\\$/").find(typesFile("content-pack.ts"))!!.groupValues[1]
        return mapOf("id" to slug) + own
    }

    @Test
    fun `les bornes sont celles du contrat TypeScript`() {
        val expected = limits()
        assertThat(expected).isNotEmpty()
        val actual = mapOf(
            "maxLayers" to LensVocabulary.MAX_LAYERS, "maxDeclaredLayers" to LensVocabulary.MAX_DECLARED_LAYERS,
            "maxTriggers" to LensVocabulary.MAX_TRIGGERS, "maxDeclaredTriggers" to LensVocabulary.MAX_DECLARED_TRIGGERS,
            "maxNameLength" to LensVocabulary.MAX_NAME_LENGTH, "maxTextLength" to LensVocabulary.MAX_TEXT_LENGTH,
            "maxAuthorLength" to LensVocabulary.MAX_AUTHOR_LENGTH, "maxCountries" to LensVocabulary.MAX_COUNTRIES,
            "maxCommunities" to LensVocabulary.MAX_COMMUNITIES, "maxHidden" to LensVocabulary.MAX_HIDDEN,
            "maxDepth" to LensVocabulary.MAX_DEPTH, "maxIdLength" to LensVocabulary.MAX_ID_LENGTH,
        )
        assertThat(actual).isEqualTo(expected)
        val schema = Regex("LENS_SCHEMA_VERSION = (\\d+)").find(lens)!!.groupValues[1].toInt()
        assertThat(LensVocabulary.SCHEMA_VERSION).isEqualTo(schema)
    }

    @Test
    fun `les listes fermees sont celles du contrat TypeScript`() {
        assertThat(LensSurface.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_SURFACES"))
        assertThat(LensCost.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_COSTS"))
        assertThat(LensFacePoint.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_FACE_POINTS"))
        assertThat(LensParticlePreset.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_PARTICLE_PRESETS"))
        assertThat(LensDensity.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_DENSITIES"))
        assertThat(LensTriggerEvent.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_TRIGGER_EVENTS"))
        assertThat(LensTriggerAction.entries.map { it.raw }).isEqualTo(listOf(lens, "LENS_TRIGGER_ACTIONS"))
        assertThat(LensVocabulary.layerKinds).isEqualTo(listOf(lens, "LENS_LAYER_KINDS"))
        assertThat(LensVocabulary.anchorTypes).isEqualTo(listOf(lens, "LENS_ANCHOR_TYPES"))
        assertThat(LensVocabulary.forbiddenKeys).isEqualTo(listOf(lens, "LENS_FORBIDDEN_KEYS"))
        assertThat(LensVocabulary.forbiddenLayerKinds).isEqualTo(listOf(lens, "LENS_FORBIDDEN_LAYER_KINDS"))
        assertThat(LensVocabulary.bareUrlSchemes).isEqualTo(listOf(lens, "LENS_BARE_URL_SCHEMES"))
        assertThat(LensFont.entries.map { it.raw }).isEqualTo(listOf(typesFile("glory-frame-format.ts"), "GLORY_FRAME_FONTS"))
        assertThat(LensVocabulary.languages).isEqualTo(listOf(typesFile("content-pack.ts"), "PACK_LANGUAGES"))
    }

    @Test
    fun `les intervalles sont ceux du contrat TypeScript`() {
        val actual = mapOf(
            "fraction" to LensVocabulary.fractionRange, "offset" to LensVocabulary.offsetRange,
            "stickerSize" to LensVocabulary.stickerSizeRange, "rotation" to LensVocabulary.rotationRange,
            "textSize" to LensVocabulary.textSizeRange, "delay" to LensVocabulary.delayRange,
        )
        assertThat(actual).isEqualTo(ranges())
    }

    @Test
    fun `les motifs sont ceux du contrat TypeScript`() {
        val actual = mapOf(
            "id" to LensVocabulary.Patterns.id, "asset" to LensVocabulary.Patterns.asset,
            "motif" to LensVocabulary.Patterns.motif, "color" to LensVocabulary.Patterns.color,
            "country" to LensVocabulary.Patterns.country, "community" to LensVocabulary.Patterns.community,
        ).mapValues { it.value.pattern }
        assertThat(actual).isEqualTo(patterns())
    }
}
