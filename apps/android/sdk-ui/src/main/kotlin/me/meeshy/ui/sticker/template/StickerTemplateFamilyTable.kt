package me.meeshy.ui.sticker.template

import me.meeshy.sdk.model.sticker.StickerTemplateFamily
import me.meeshy.ui.sticker.template.family.*

/**
 * Une famille du catalogue, un type de dessin — miroir de `StickerTemplateFamilyTable` (iOS). Le `when` est EXHAUSTIF et
 * sans `else` : ajouter une famille au catalogue sans lui donner son type ne compile pas. Écrite ici UNE fois ; les lots
 * de familles ne la touchent jamais.
 */
internal object StickerTemplateFamilyTable {
    fun drawing(family: StickerTemplateFamily): StickerTemplateFamilyDrawing = when (family) {
        StickerTemplateFamily.LOCATION -> LocationStickerTemplates
        StickerTemplateFamily.TIME -> TimeStickerTemplates
        StickerTemplateFamily.LOVE -> LoveStickerTemplates
        StickerTemplateFamily.WEATHER -> WeatherStickerTemplates
        StickerTemplateFamily.TEXT -> TextStickerTemplates
        StickerTemplateFamily.JOY -> JoyStickerTemplates
        StickerTemplateFamily.SURPRISE -> SurpriseStickerTemplates
        StickerTemplateFamily.MOOD -> MoodStickerTemplates
        StickerTemplateFamily.GREETING -> GreetingStickerTemplates
        StickerTemplateFamily.REACTION -> ReactionStickerTemplates
        StickerTemplateFamily.PARTY -> PartyStickerTemplates
        StickerTemplateFamily.AVAILABILITY -> AvailabilityStickerTemplates
        StickerTemplateFamily.NATURE -> NatureStickerTemplates
        StickerTemplateFamily.CHEER -> CheerStickerTemplates
        StickerTemplateFamily.ANSWER -> AnswerStickerTemplates
        StickerTemplateFamily.FOOD -> FoodStickerTemplates
        StickerTemplateFamily.SPORT -> SportStickerTemplates
        StickerTemplateFamily.TRAVEL -> TravelStickerTemplates
        StickerTemplateFamily.WORK -> WorkStickerTemplates
        StickerTemplateFamily.MUSIC -> MusicStickerTemplates
    }

    fun drawers(family: StickerTemplateFamily): List<StickerTemplateDrawer> = drawing(family).drawers
}
