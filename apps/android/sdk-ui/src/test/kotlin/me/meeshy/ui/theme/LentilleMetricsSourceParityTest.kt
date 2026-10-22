package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Garde de parité : relit `LentilleMetrics.swift` (la source iOS des cotes de la Lentille) et exige
 * que chaque constante numérique littérale y trouve son jumeau Kotlin de même valeur. Ajouter une
 * cote côté iOS sans la porter fait rougir ce test ; ne jamais corriger en recopiant à la main une
 * valeur dérivée.
 */
class LentilleMetricsSourceParityTest {

    private val enumHeader = Regex("""enum\s+(\w+)\s*\{""")
    private val constant = Regex("""static\s+let\s+(\w+)\s*:\s*(?:CGFloat|Double|Int)\s*=\s*(-?\d+(?:\.\d+)?)\s*$""")

    private fun source(): String {
        val relative = "apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("LentilleMetrics.swift introuvable en remontant depuis ${File("").absolutePath} (cherché: $relative)")
    }

    private fun swiftLiterals(): Map<String, Double> {
        var current: String? = null
        val out = linkedMapOf<String, Double>()
        source().lines().forEach { raw ->
            val line = raw.trim()
            if (line.startsWith("//")) return@forEach
            enumHeader.find(line)?.let { current = it.groupValues[1] }
            val owner = current ?: return@forEach
            constant.find(line)?.let { out["$owner.${it.groupValues[1]}"] = it.groupValues[2].toDouble() }
        }
        return out
    }

    private fun Float.d(): Double = toString().toDouble()

    private val kotlin: Map<String, Double> = with(LentilleMetrics) {
        mapOf(
            "Row.height" to Row.height.value.d(),
            "Row.paddingVertical" to Row.paddingVertical.value.d(),
            "Row.paddingHorizontal" to Row.paddingHorizontal.value.d(),
            "Row.marginHorizontal" to Row.marginHorizontal.value.d(),
            "Row.marginVertical" to Row.marginVertical.value.d(),
            "Row.radius" to Row.radius.value.d(),
            "Row.transformOriginX" to Row.transformOriginX.d(),
            "Row.transformOriginY" to Row.transformOriginY.d(),
            "Avatar.ringWidth" to Avatar.ringWidth.value.d(),
            "Avatar.ringOpacity" to Avatar.ringOpacity.d(),
            "PresenceDot.size" to PresenceDot.size.value.d(),
            "PresenceDot.borderSize" to PresenceDot.borderSize.value.d(),
            "Time.size" to Time.size.value.d(),
            "UnreadDot.size" to UnreadDot.size.value.d(),
            "FocusCard.ringSize" to FocusCard.ringSize.value.d(),
            "FocusCard.radius" to FocusCard.radius.value.d(),
            "FocusCard.height" to FocusCard.height.value.d(),
            "FocusCard.paddingVertical" to FocusCard.paddingVertical.value.d(),
            "FocusCard.nameSize" to FocusCard.nameSize.value.d(),
            "FocusCard.breathingRampStart" to FocusCard.breathingRampStart.value.d(),
            "FocusCard.breathingRampLength" to FocusCard.breathingRampLength.value.d(),
            "FocusCard.loupeGain" to FocusCard.loupeGain.d(),
            "ModeNotch.size" to ModeNotch.size.value.d(),
            "ModeNotch.top" to ModeNotch.top.value.d(),
            "ModeNotch.right" to ModeNotch.right.value.d(),
            "Sticker.size" to Sticker.size.value.d(),
            "Sticker.letterSpacingEm" to Sticker.letterSpacingEm.d(),
            "Sticker.paddingVertical" to Sticker.paddingVertical.value.d(),
            "Sticker.paddingHorizontal" to Sticker.paddingHorizontal.value.d(),
            "Pill.top" to Pill.top.value.d(),
            "Pill.fadeDurationMs" to Pill.fadeDurationMs.toDouble(),
            "Rail.size" to Rail.size.value.d(),
            "Rail.ringWidth" to Rail.ringWidth.value.d(),
            "Rail.paddingVertical" to Rail.paddingVertical.value.d(),
            "Rail.maxEntries" to Rail.maxEntries.toDouble(),
            "Tags.size" to Tags.size.value.d(),
            "Tags.maxCount" to Tags.maxCount.toDouble(),
            "Tags.emojiSize" to Tags.emojiSize.value.d(),
            "Tags.chipFontSize" to Tags.chipFontSize.value.d(),
            "Tags.bubbleFillOpacity" to Tags.bubbleFillOpacity.d(),
            "Tags.chipPaddingHorizontal" to Tags.chipPaddingHorizontal.value.d(),
            "Tags.chipPaddingVertical" to Tags.chipPaddingVertical.value.d(),
            "Muted.opacity" to Muted.opacity.d(),
            "Agent.avatarRingWidth" to Agent.avatarRingWidth.value.d(),
        )
    }

    @Test
    fun `every numeric literal of the iOS metrics has an identical Kotlin twin`() {
        assertThat(kotlin).containsExactlyEntriesIn(swiftLiterals())
    }

    @Test
    fun `the iOS source still exposes the metrics this guard reads`() {
        assertWithMessage("le parseur ne lit rien : le format du fichier iOS a changé")
            .that(swiftLiterals().keys).containsAtLeast("Row.height", "FocusCard.height", "Rail.size")
    }

    @Test
    fun `derived iOS metrics are mirrored by their derivation`() {
        assertThat(LentilleMetrics.FocusCard.breathing).isEqualTo(LentilleMetrics.Row.marginVertical)
        assertThat(LentilleMetrics.FocusInline.height)
            .isEqualTo(LentilleMetrics.Row.height + LentilleMetrics.Row.marginVertical * 2)
        assertThat(LentilleMetrics.FocusInline.paddingVertical).isEqualTo(LentilleMetrics.Row.paddingVertical)
    }
}
