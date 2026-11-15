package me.meeshy.sdk.model

/**
 * **CE QU'EST UNE PIÈCE D'UN COMMENTAIRE** (#14386, iOS `CommentAttachmentsTray` + rendu du fil) : une photo et une
 * vidéo se montrent en vignette, un vocal s'écoute, tout le reste est un FICHIER — un nom, une taille, une ouverture.
 * Un type absent ou illisible est un fichier : rien ne se peint en vignette sans qu'on sache que c'est une image.
 */
public enum class CommentPieceKind {
    IMAGE,
    VIDEO,
    AUDIO,
    FILE,
    ;

    public val isVisual: Boolean get() = this == IMAGE || this == VIDEO

    public companion object {
        public fun of(mimeType: String?): CommentPieceKind {
            val mime = mimeType?.trim()?.lowercase().orEmpty()
            return when {
                mime.startsWith("image/") -> IMAGE
                mime.startsWith("video/") -> VIDEO
                mime.startsWith("audio/") -> AUDIO
                else -> FILE
            }
        }
    }
}
