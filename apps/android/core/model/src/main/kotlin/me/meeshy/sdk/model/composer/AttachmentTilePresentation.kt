package me.meeshy.sdk.model.composer

/** Ce que la face d'une tuile prête dessine : la vignette, l'onde d'un son, ou le glyphe du type. */
sealed interface TileFace {
    data class Thumbnail(val path: String) : TileFace
    data object Waveform : TileFace
    data class TypeGlyph(val type: PendingAttachmentType) : TileFace
}

/** Ce qu'un toucher sur la tuile déclenche. */
enum class TileTapAction { EDIT, PREVIEW }

/**
 * **LA TUILE D'UNE PIÈCE PRÊTE** — miroir de `ComposerAttachmentTile` iOS : vignette, ou dessin propre au type
 * (onde d'un son) à défaut, glyphe central « Éditer » seulement quand toucher édite (loi 4 : un contrôle
 * existe s'il a un effet). Sans éditeur disponible, toucher aperçoit.
 */
data class AttachmentTilePresentation(
    val face: TileFace,
    val tapAction: TileTapAction,
) {
    val showsEditGlyph: Boolean get() = tapAction == TileTapAction.EDIT

    companion object {
        fun of(item: PendingAttachment, editorAvailable: Boolean = true): AttachmentTilePresentation {
            val edits = editorAvailable && PendingRetouchRule.opens(item)
            return AttachmentTilePresentation(
                face = faceOf(item),
                tapAction = if (edits) TileTapAction.EDIT else TileTapAction.PREVIEW,
            )
        }

        private fun faceOf(item: PendingAttachment): TileFace {
            if (item.type == PendingAttachmentType.AUDIO) return TileFace.Waveform
            val thumb = item.thumbnailPath ?: item.localPath.takeIf { item.type == PendingAttachmentType.IMAGE }
            return thumb?.let(TileFace::Thumbnail) ?: TileFace.TypeGlyph(item.type)
        }
    }
}
