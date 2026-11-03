package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode

/**
 * Ce que la capsule « Publier ▾ » montre, projeté d'UNE passe sur la règle du menu (#7497, #13839) : la partie principale
 * nomme ce qui partira, le chevron ARME un choix sans publier et n'existe que s'il offrirait plus d'un geste.
 */
data class PublishCapsuleState(
    val armed: ComposerPublishChoice,
    /** `null` : pas de chevron. */
    val menu: List<ComposerPublishMenuRule.Entry>?,
    val companionReelOffered: Boolean,
    val title: StoryPublishTitle?,
    val chevronEnabled: Boolean,
) {
    val showsChevron: Boolean get() = menu != null

    /** Un toucher sur le chevron arme le choix résultant, sans publier. */
    fun toggling(format: ComposerFormat): ComposerPublishChoice =
        ComposerPublishMenuRule.toggled(format, armed, companionReelOffered)

    fun choosingLayout(layout: MosaicLayoutMode): ComposerPublishChoice =
        ComposerPublishMenuRule.choosingLayout(layout, armed)

    companion object {
        fun of(
            chosen: ComposerPublishChoice?,
            defaultFormat: ComposerFormat,
            candidates: List<ComposerFormat>,
            offered: List<ComposerFormat>,
            carriesMoreThanText: Boolean,
            slideCount: Int,
            layoutsTravel: Boolean,
            isRepost: Boolean = false,
            isPublishing: Boolean = false,
            editing: Boolean = false,
        ): PublishCapsuleState {
            val menu = ComposerPublishMenuRule.menu(candidates, offered, carriesMoreThanText, slideCount, layoutsTravel)
            val companion = ComposerPublishMenuRule.companionReelOffered(menu, slideCount, isRepost)
            val armed = ComposerPublishMenuRule.armed(chosen, defaultFormat, menu, companion)
            val title = if (armed.format == ComposerFormat.STATUS && !editing) null else StoryPublishTitle.of(armed.formats, slideCount, editing)
            return PublishCapsuleState(armed, menu, companion, title, ComposerPublishMenuRule.chevronIsEnabled(isPublishing))
        }
    }
}
