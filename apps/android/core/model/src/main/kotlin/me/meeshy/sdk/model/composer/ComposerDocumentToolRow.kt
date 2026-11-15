package me.meeshy.sdk.model.composer

/** L'effet déclaré de chaque outil du document ; `null` = rien à faire encore, donc outil absent (jamais grisé). */
val ComposerDocumentTool.effect: ComposerDocumentToolEffect?
    get() = when (this) {
        ComposerDocumentTool.PHOTO -> ComposerDocumentToolEffect.AttachesLocalMedia(ComposerDocumentIntake.PHOTO_LIBRARY)
        ComposerDocumentTool.CAMERA -> ComposerDocumentToolEffect.AttachesLocalMedia(ComposerDocumentIntake.CAMERA_PHOTO)
        ComposerDocumentTool.VIDEO -> ComposerDocumentToolEffect.AttachesLocalMedia(ComposerDocumentIntake.CAMERA_VIDEO)
        ComposerDocumentTool.DOCUMENT -> ComposerDocumentToolEffect.AttachesLocalMedia(ComposerDocumentIntake.FILES)
        ComposerDocumentTool.EMOJI -> ComposerDocumentToolEffect.InsertsEmojiIntoText
        ComposerDocumentTool.TEXT_SCENE -> ComposerDocumentToolEffect.ComposesTextScene
        ComposerDocumentTool.MENTION -> ComposerDocumentToolEffect.OpensReferencePicker
        ComposerDocumentTool.PLACE -> ComposerDocumentToolEffect.AttachesLocation
        ComposerDocumentTool.MICROPHONE -> ComposerDocumentToolEffect.AttachesTranscribedAudio
    }

/** La rangée du document et sa géométrie (miroir d'iOS `ComposerDocumentTool.servedRow(for:)` + `ComposerRowFit`). */
object ComposerDocumentToolRow {
    const val TILE_DP: Float = 44f
    const val NOMINAL_SPACING_DP: Float = 12f
    const val MINIMUM_SPACING_DP: Float = 4f
    const val MARGIN_DP: Float = 16f

    /** Les outils dotés d'un effet, dans l'ordre canonique, pour un format ; une story n'a pas de rangée de document. */
    fun servedRow(format: ComposerFormat): List<ComposerDocumentTool> {
        val withEffect = ComposerDocumentTool.canonicalRow.filter { it.effect != null }
        return when (format) {
            ComposerFormat.STORY -> emptyList()
            ComposerFormat.STATUS -> withEffect.filter { it != ComposerDocumentTool.TEXT_SCENE }
            ComposerFormat.POST, ComposerFormat.REEL -> withEffect
        }
    }

    /** Un outil de la rangée est l'ancre de la palette de fond : la scène de texte si elle est servie, sinon l'emoji. */
    fun paletteAnchor(tools: List<ComposerDocumentTool>): ComposerDocumentTool =
        if (ComposerDocumentTool.TEXT_SCENE in tools) ComposerDocumentTool.TEXT_SCENE else ComposerDocumentTool.EMOJI

    /** Ce que la rangée occupe à [availableDp] : l'écart rendu, et si la dernière tuile se laisse entrevoir. */
    data class Fit(val spacingDp: Float, val scrolls: Boolean, val lastTilePeeks: Boolean)

    fun fit(count: Int, availableDp: Float): Fit {
        val spacing = ComposerRowFit.spacing(count, TILE_DP, NOMINAL_SPACING_DP, MINIMUM_SPACING_DP, MARGIN_DP, availableDp)
        val width = ComposerRowFit.rowWidth(count, TILE_DP, spacing, MARGIN_DP)
        val scrolls = availableDp > 0f && width > availableDp
        return Fit(spacing, scrolls, ComposerRowFit.lastTilePeeks(count, TILE_DP, spacing, MARGIN_DP, availableDp))
    }
}
