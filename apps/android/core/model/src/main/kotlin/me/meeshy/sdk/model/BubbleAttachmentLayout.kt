package me.meeshy.sdk.model

/**
 * La mise en page des pièces d'une bulle (iOS `BubbleContent.Attachments`) : une grille visuelle (images et
 * vidéos), une pile audio, des rangées non média (fichier, contact, position), ou un mélange. Les identifiants
 * gardent l'ordre du fil : la même entrée rend toujours la même mise en page.
 */
public sealed interface BubbleAttachmentLayout {
    public data object None : BubbleAttachmentLayout
    public data class VisualGrid(val ids: List<String>) : BubbleAttachmentLayout
    public data class Audio(val ids: List<String>) : BubbleAttachmentLayout
    public data class NonMedia(val ids: List<String>) : BubbleAttachmentLayout
    public data class Mixed(
        val visual: List<String>,
        val audio: List<String>,
        val nonMedia: List<String>,
    ) : BubbleAttachmentLayout

    public companion object {
        public data class Piece(val id: String, val pieceClass: AttachmentPieceClass)

        public fun of(pieces: List<Piece>): BubbleAttachmentLayout {
            val visual = pieces.filter { it.pieceClass == AttachmentPieceClass.Image || it.pieceClass == AttachmentPieceClass.Video }.map { it.id }
            val audio = pieces.filter { it.pieceClass == AttachmentPieceClass.Audio }.map { it.id }
            val nonMedia = pieces.filter {
                it.pieceClass == AttachmentPieceClass.File || it.pieceClass == AttachmentPieceClass.Contact ||
                    it.pieceClass == AttachmentPieceClass.Location
            }.map { it.id }
            val categories = listOf(visual, audio, nonMedia).count { it.isNotEmpty() }
            return when {
                categories == 0 -> None
                categories > 1 -> Mixed(visual, audio, nonMedia)
                visual.isNotEmpty() -> VisualGrid(visual)
                audio.isNotEmpty() -> Audio(audio)
                else -> NonMedia(nonMedia)
            }
        }
    }
}
