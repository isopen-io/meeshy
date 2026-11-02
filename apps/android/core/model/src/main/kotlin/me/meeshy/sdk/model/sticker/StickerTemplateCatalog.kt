package me.meeshy.sdk.model.sticker

import me.meeshy.sdk.model.StickerAnimation
import me.meeshy.sdk.model.sticker.StickerTemplateSlot.Nature

/**
 * Les gabarits livrés avec Android — les identifiants, replis et mouvements de `StickerTemplateCatalog` (iOS), bornés
 * aux familles de l'onglet Personnalisés : les dix cadres à MOTS et les décorations d'HEURE à chiffres, à aiguilles,
 * en ruban et en page de calendrier. Constante du binaire : un identifiant inconnu (gabarit d'une version plus récente,
 * famille qu'Android ne dessine pas encore) rend `null` et le lecteur sert l'emoji de repli — jamais un gabarit fabriqué.
 */
object StickerTemplateCatalog {

    private val proseSlots = listOf(StickerTemplateSlot(StickerSlotFiller.TEXT, Nature.PROSE))
    private val timeSlots = listOf(
        StickerTemplateSlot(StickerSlotFiller.TIME, Nature.VALUE),
        StickerTemplateSlot(StickerSlotFiller.HOUR, Nature.VALUE),
        StickerTemplateSlot(StickerSlotFiller.MINUTE, Nature.VALUE),
    )

    private fun text(id: String, fallback: String, animation: StickerAnimation?) =
        StickerTemplate("text.$id", StickerTemplateFamily.TEXT, proseSlots, fallback, 1.0, animation)

    val text: List<StickerTemplate> = listOf(
        text("speechBubble", "💬", StickerAnimation.POP),
        text("thoughtBubble", "💭", StickerAnimation.FLOAT),
        text("stickyNote", "📝", null),
        text("ribbon", "🎗️", StickerAnimation.SWING),
        text("badge", "🏷️", StickerAnimation.PULSE),
        text("neon", "💡", StickerAnimation.BLINK),
        text("tag", "🔖", StickerAnimation.WOBBLE),
        text("signboard", "🪧", StickerAnimation.SWING),
        text("tape", "📎", null),
        text("stamp", "✅", StickerAnimation.TADA),
    )

    val time: List<StickerTemplate> = listOf(
        StickerTemplate("time.digital", StickerTemplateFamily.TIME, timeSlots, "🕐", 1.0),
        StickerTemplate("time.analog", StickerTemplateFamily.TIME, timeSlots, "🕐", 1.0),
        StickerTemplate("time.ribbon", StickerTemplateFamily.TIME, timeSlots, "🕐", 1.0),
        StickerTemplate(
            "time.calendarDay",
            StickerTemplateFamily.TIME,
            listOf(StickerTemplateSlot(StickerSlotFiller.DATE, Nature.VALUE)),
            "📅",
            1.0,
        ),
    )

    val all: List<StickerTemplate> = text + time

    private val byId: Map<String, StickerTemplate> by lazy { all.associateBy { it.id } }

    fun template(id: String): StickerTemplate? = byId[id]

    fun templates(family: StickerTemplateFamily): List<StickerTemplate> = all.filter { it.family == family }

    fun fallbackEmoji(id: String): String? = byId[id]?.fallbackEmoji
}
