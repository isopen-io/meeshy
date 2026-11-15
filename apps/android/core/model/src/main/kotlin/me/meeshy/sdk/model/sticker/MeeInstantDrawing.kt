package me.meeshy.sdk.model.sticker

import me.meeshy.sdk.model.MessageSticker

/** `clip` (web `apps/web/src/lib/mee/kit.ts`, iOS `MeeInstantText.clip`) : sans espaces ; au-delà de [max], `max - 1` caractères et une ellipse. */
object MeeInstantClip {
    fun clip(text: String, max: Int): String {
        val trimmed = text.trim()
        if (trimmed.length <= max) return trimmed
        return trimmed.take(max - 1).trimEnd() + "…"
    }
}

/**
 * Le bandeau d'un Instant (`kit.band`), dans le repère du dessin (0…200) — miroir d'iOS `MeeInstantBandLayout` : une
 * ligne quand la ligne douce manque, deux sinon.
 */
data class MeeInstantBandLayout(
    val main: String,
    val sub: String?,
    val rect: Rect,
    val cornerRadius: Float,
    val mainSize: Float,
    val mainBaseline: Float,
) {
    data class Rect(val x: Float, val y: Float, val width: Float, val height: Float)

    val subSize: Float get() = SUB_SIZE
    val subBaseline: Float get() = SUB_BASELINE

    companion object {
        private const val SUB_SIZE = 11.5f
        private const val SUB_BASELINE = 186f
        private const val MAIN_MAX = 20
        private const val SUB_MAX = 28
        private const val LONG_MAIN = 14

        fun of(main: String, sub: String?): MeeInstantBandLayout {
            val top = MeeInstantClip.clip(main, MAIN_MAX)
            val bottom = sub?.let { MeeInstantClip.clip(it, SUB_MAX) }?.takeIf { it.isNotEmpty() }
            val size = if (top.length > LONG_MAIN) 15f else 19f
            return if (bottom == null) {
                MeeInstantBandLayout(top, null, Rect(14f, 158f, 172f, 34f), 17f, size, 181f - (19f - size) / 2f)
            } else {
                MeeInstantBandLayout(top, bottom, Rect(14f, 148f, 172f, 46f), 16f, size, 169f)
            }
        }
    }
}

/** La recette qu'un Instant emporte (iOS `MeeInstant.messageSticker(slots:)`) : `mee.<id>`, les emplacements saisis, l'emoji de repli. */
fun MeeInstant.messageSticker(typed: Map<MeeSlot, String>): MessageSticker =
    MessageSticker(templateId = templateId, slots = wireSlots(typed), emoji = emoji)
