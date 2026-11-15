package me.meeshy.sdk.model.composer

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/** Jetons de l'inspecteur d'objet (miroir de `ComposerObjectChips`) : id, argument, destination. */
object ComposerObjectChips {

    data class Chip(
        val id: String,
        val argument: String,
        val destination: ComposerObjectEditorSection? = null,
    )

    private fun reaches(section: ComposerObjectEditorSection, family: ComposerObjectKind) =
        section.takeIf { ComposerObjectEditorRail.entries(family).contains(it) }

    /** « 0:02 → 0:08 » ; `null` quand l'objet est permanent. */
    fun window(start: Double?, duration: Double?): String? {
        if (duration == null || duration <= 0) return null
        val s = max(0.0, start ?: 0.0)
        return "${timecode(s)} → ${timecode(s + duration)}"
    }

    fun timecode(seconds: Double): String {
        val total = max(0, seconds.roundToInt())
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    fun sizeChip(scale: Double) = Chip("size", "${(scale * 100).roundToInt()}%")

    fun rotationChip(degrees: Double): Chip? {
        val r = degrees.roundToInt()
        return if (r == 0) null else Chip("rotation", "$r")
    }

    fun volumeChip(volume: Double): Chip? =
        if (abs(volume - 1) > 0.001) Chip("volume", "${(volume * 100).roundToInt()}%") else null

    fun windowChip(start: Double?, duration: Double?, family: ComposerObjectKind): Chip? =
        window(start, duration)?.let { Chip("window", it, reaches(ComposerObjectEditorSection.Timing, family)) }

    fun destination(chipId: String, chips: List<Chip>): ComposerObjectEditorSection? =
        chips.firstOrNull { it.id == chipId }?.destination

    fun textChips(
        textStyle: String?,
        fontSize: Double,
        textAlign: String?,
        start: Double?,
        duration: Double?,
    ): List<Chip> = buildList {
        if (!textStyle.isNullOrEmpty()) {
            add(Chip("style", textStyle.uppercase(), reaches(ComposerObjectEditorSection.Tool(TextEditTool.STYLE), ComposerObjectKind.TEXT)))
        }
        add(Chip("size", "${fontSize.roundToInt()}", reaches(ComposerObjectEditorSection.Tool(TextEditTool.STYLE), ComposerObjectKind.TEXT)))
        if (!textAlign.isNullOrEmpty()) {
            add(Chip("align", textAlign.lowercase(), reaches(ComposerObjectEditorSection.Tool(TextEditTool.ALIGN), ComposerObjectKind.TEXT)))
        }
        windowChip(start, duration, ComposerObjectKind.TEXT)?.let { add(it) }
    }

    fun mediaChips(
        scale: Double,
        rotation: Double,
        isVideo: Boolean,
        volume: Double,
        start: Double?,
        duration: Double?,
    ): List<Chip> = buildList {
        add(sizeChip(scale))
        rotationChip(rotation)?.let { add(it) }
        if (isVideo) volumeChip(volume)?.let { add(it) }
        windowChip(start, duration, ComposerObjectKind.MEDIA)?.let { add(it) }
    }

    fun audioChips(scale: Double, rotation: Double, volume: Double, start: Double?, duration: Double?): List<Chip> =
        buildList {
            add(sizeChip(scale))
            rotationChip(rotation)?.let { add(it) }
            volumeChip(volume)?.let { add(it) }
            windowChip(start, duration, ComposerObjectKind.AUDIO)?.let { add(it) }
        }

    fun stickerChips(scale: Double, rotation: Double, start: Double?, duration: Double?): List<Chip> =
        buildList {
            add(sizeChip(scale))
            rotationChip(rotation)?.let { add(it) }
            windowChip(start, duration, ComposerObjectKind.STICKER)?.let { add(it) }
        }
}
