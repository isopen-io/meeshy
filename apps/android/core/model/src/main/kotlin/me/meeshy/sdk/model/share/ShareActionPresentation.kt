package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.PublicationTarget

/** Les outils de la zone « ce qu'on peut en faire » — dans l'ordre où la feuille les montre. */
enum class ShareTool(val action: ShareAction) {
    SAVE(ShareAction.SAVE),
    COPY_LINK(ShareAction.COPY_LINK),
    COPY_TEXT(ShareAction.COPY_TEXT),
    IMAGER(ShareAction.IMAGER),
    SHARE_OUT(ShareAction.SHARE_OUT),
}

/** Ce que l'hôte sait exécuter : un outil que le plan offre mais que l'hôte ignore n'est pas rendu. */
data class ShareHostCapabilities(
    val canSave: Boolean = false,
    val canImager: Boolean = false,
    val hasUrl: Boolean = false,
    val hasText: Boolean = false,
)

/**
 * **La zone 2 de la feuille de partage, côté loi** (iOS `actionsZone`) — pure : les puces de
 * publication cochables, le studio, les outils, et UNE ligne grise. Une action interdite n'est
 * pas rendue ; la ligne dit pourquoi, selon la priorité du plan.
 */
data class ShareActionPresentation(
    val publications: List<PublicationTarget>,
    val studio: Boolean,
    val tools: List<ShareTool>,
    val withheld: ShareWithheldReason?,
) {
    val showsPublishRow: Boolean get() = publications.isNotEmpty() || studio

    val isEmpty: Boolean get() = !showsPublishRow && tools.isEmpty() && withheld == null

    /** Cocher une puce déjà cochée la décoche ; une cible non offerte est ignorée. */
    fun toggled(selected: List<PublicationTarget>, target: PublicationTarget): List<PublicationTarget> = when {
        target in selected -> selected - target
        target in publications -> selected + target
        else -> selected
    }

    companion object {
        /** Story, fil, réel : l'ordre des puces. */
        private val PUBLICATION_ORDER = listOf(PublicationTarget.STORY, PublicationTarget.POST, PublicationTarget.REEL)

        private val WITHHELD_PRIORITY = listOf(
            ShareWithheldReason.FLAME, ShareWithheldReason.BLURRED, ShareWithheldReason.ENCRYPTED,
            ShareWithheldReason.CITES_PROTECTED, ShareWithheldReason.TOO_MANY_FOR_PUBLICATION,
            ShareWithheldReason.SINGLE_PHOTO_NOT_A_REEL,
        )

        fun actionFor(target: PublicationTarget): ShareAction = when (target) {
            PublicationTarget.STORY -> ShareAction.PUBLISH_STORY
            PublicationTarget.POST -> ShareAction.PUBLISH_POST
            PublicationTarget.REEL -> ShareAction.PUBLISH_REEL
        }

        /** Les cibles servies par le contenu, filtrées par le plan, dans l'ordre des puces. */
        fun offeredPublications(plan: SharePlan, served: Collection<PublicationTarget>): List<PublicationTarget> =
            PUBLICATION_ORDER.filter { it in served && plan.offers(actionFor(it)) }

        /** La raison la plus parlante de ce qui n'est pas rendu — une seule. */
        fun withheldReason(plan: SharePlan): ShareWithheldReason? =
            WITHHELD_PRIORITY.firstOrNull { reason -> plan.withheld.any { it.reason == reason } }

        fun of(
            plan: SharePlan,
            servedPublications: Collection<PublicationTarget>,
            studioAvailable: Boolean,
            host: ShareHostCapabilities,
        ): ShareActionPresentation = ShareActionPresentation(
            publications = offeredPublications(plan, servedPublications),
            studio = studioAvailable && plan.offers(ShareAction.STUDIO),
            tools = ShareTool.entries.filter { tool -> plan.offers(tool.action) && host.runs(tool) },
            withheld = withheldReason(plan),
        )

        private fun ShareHostCapabilities.runs(tool: ShareTool): Boolean = when (tool) {
            ShareTool.SAVE -> canSave
            ShareTool.IMAGER -> canImager
            ShareTool.COPY_LINK, ShareTool.SHARE_OUT -> hasUrl || hasText
            ShareTool.COPY_TEXT -> hasText
        }
    }
}
