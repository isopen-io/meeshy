package me.meeshy.sdk.model.lens

import me.meeshy.sdk.model.lens.LensVocabulary.Patterns

/** Un champ OPTIONNEL : absent est valide, présent mais mal formé ne l'est pas (zod optional). */
internal class LensField<out V>(val isValid: Boolean, val value: V?)

internal object LensLayers {

    inline fun <V> optional(fields: Map<String, LensJsonValue>, key: String, read: (LensJsonValue) -> V?): LensField<V> {
        val raw = fields[key] ?: return LensField(true, null)
        val value = read(raw) ?: return LensField(false, null)
        return LensField(true, value)
    }

    fun text(value: LensJsonValue?, max: Int): String? =
        (value as? LensJsonValue.Str)?.value?.takeIf { it.length in 1..max }

    fun slug(value: LensJsonValue?): String? =
        (value as? LensJsonValue.Str)?.value?.takeIf { it.length <= LensVocabulary.MAX_ID_LENGTH && Patterns.id.matches(it) }

    fun number(value: LensJsonValue?, range: ClosedFloatingPointRange<Double>): Double? =
        (value as? LensJsonValue.Num)?.value?.takeIf { it in range }

    private fun matched(value: LensJsonValue?, pattern: Regex): String? =
        (value as? LensJsonValue.Str)?.value?.takeIf { pattern.matches(it) }

    fun codes(value: LensJsonValue?, pattern: Regex, max: Int): List<String>? {
        val items = (value as? LensJsonValue.Arr)?.items?.takeIf { it.size in 1..max } ?: return null
        val strings = items.mapNotNull { matched(it, pattern) }
        return strings.takeIf { it.size == items.size && it.toSet().size == it.size }
    }

    private fun string(fields: Map<String, LensJsonValue>, key: String): String? = (fields[key] as? LensJsonValue.Str)?.value

    fun readLayer(value: LensJsonValue): LensLayer? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val kind = string(fields, "kind") ?: return null
        val id = slug(fields["id"]) ?: return null
        return when (kind) {
            "lut" -> readLut(fields, id)
            "frame" -> readFrame(fields, id)
            "sticker" -> readSticker(fields, id)
            "text" -> readTextLayer(fields, id)
            "particles" -> readParticles(fields, id)
            else -> null
        }
    }

    private fun readLut(fields: Map<String, LensJsonValue>, id: String): LensLayer? {
        val asset = matched(fields["asset"], Patterns.asset) ?: return null
        val intensity = optional(fields, "intensity") { number(it, LensVocabulary.fractionRange) }
        return if (intensity.isValid) LensLayer.Lut(id, asset, intensity.value) else null
    }

    private fun readFrame(fields: Map<String, LensJsonValue>, id: String): LensLayer? {
        val motif = matched(fields["motif"], Patterns.motif) ?: return null
        val opacity = optional(fields, "opacity") { number(it, LensVocabulary.fractionRange) }
        return if (opacity.isValid) LensLayer.Frame(id, motif, opacity.value) else null
    }

    private fun readSticker(fields: Map<String, LensJsonValue>, id: String): LensLayer? {
        val asset = matched(fields["asset"], Patterns.asset) ?: return null
        val anchor = fields["anchor"]?.let(::readAnchor) ?: return null
        val size = number(fields["size"], LensVocabulary.stickerSizeRange) ?: return null
        val rotation = optional(fields, "rotation") { number(it, LensVocabulary.rotationRange) }
        return if (rotation.isValid) LensLayer.Sticker(id, asset, anchor, size, rotation.value) else null
    }

    private fun readTextLayer(fields: Map<String, LensJsonValue>, id: String): LensLayer? {
        val text = readLocalizedText(fields["text"]) ?: return null
        val font = string(fields, "font")?.let(LensFont::fromRaw) ?: return null
        val color = matched(fields["color"], Patterns.color) ?: return null
        val size = number(fields["size"], LensVocabulary.textSizeRange) ?: return null
        val anchor = fields["anchor"]?.let(::readAnchor) ?: return null
        return LensLayer.Text(id, text, font, color, size, anchor)
    }

    private fun readParticles(fields: Map<String, LensJsonValue>, id: String): LensLayer? {
        val preset = string(fields, "preset")?.let(LensParticlePreset::fromRaw) ?: return null
        val density = string(fields, "density")?.let(LensDensity::fromRaw) ?: return null
        val anchor = optional(fields, "anchor") { readAnchor(it) }
        return if (anchor.isValid) LensLayer.Particles(id, preset, density, anchor.value) else null
    }

    private fun readLocalizedText(value: LensJsonValue?): Map<String, String>? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val texts = mutableMapOf("fr" to (text(fields["fr"], LensVocabulary.MAX_TEXT_LENGTH) ?: return null))
        for (language in LensVocabulary.languages.filter { it != "fr" }) {
            val entry = optional(fields, language) { text(it, LensVocabulary.MAX_TEXT_LENGTH) }
            if (!entry.isValid) return null
            entry.value?.let { texts[language] = it }
        }
        return texts
    }

    private fun readAnchor(value: LensJsonValue): LensAnchor? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        return when (string(fields, "type")) {
            "screen" -> {
                val x = number(fields["x"], LensVocabulary.fractionRange) ?: return null
                val y = number(fields["y"], LensVocabulary.fractionRange) ?: return null
                LensAnchor.Screen(x, y)
            }
            "face" -> {
                val point = string(fields, "point")?.let(LensFacePoint::fromRaw) ?: return null
                val dx = optional(fields, "dx") { number(it, LensVocabulary.offsetRange) }
                val dy = optional(fields, "dy") { number(it, LensVocabulary.offsetRange) }
                if (dx.isValid && dy.isValid) LensAnchor.Face(point, dx.value, dy.value) else null
            }
            else -> null
        }
    }

    fun readTrigger(value: LensJsonValue): LensTrigger? {
        val fields = (value as? LensJsonValue.Obj)?.fields ?: return null
        val event = string(fields, "on")?.let(LensTriggerEvent::fromRaw) ?: return null
        val action = string(fields, "action")?.let(LensTriggerAction::fromRaw) ?: return null
        val target = slug(fields["target"]) ?: return null
        val delay = optional(fields, "delay") { number(it, LensVocabulary.delayRange) }
        return if (delay.isValid) LensTrigger(event, action, target, delay.value) else null
    }
}
