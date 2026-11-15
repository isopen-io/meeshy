package me.meeshy.sdk.model

/**
 * **CE QUI ENTRE DANS LA ZONE D'UN COMMENTAIRE** (iOS `CommentAttachmentIntake` + `CommentAttachmentLimit`, #9736, #9697).
 * Une seule entrée pour tout ce qu'on pose : ce qui ne dit rien de lui-même est refusé, le plafond est celui du serveur
 * (une zone à UNE pièce la remplace, une zone à plusieurs se remplit puis refuse), et une pièce apparaît dans la zone AVANT
 * que son fichier soit lu ([Candidate.isReady] faux) : tant qu'elle se prépare, rien ne part.
 */
public object CommentAttachmentIntake {

    /** Une pièce, telle que la zone la voit : de quoi la reconnaître et savoir si son fichier est lu. */
    public data class Candidate(
        val id: String,
        val mimeType: String? = null,
        val fileName: String = "",
        val isReady: Boolean = true,
    )

    public data class Outcome(
        /** La zone après la pose. */
        val zone: List<Candidate>,
        /** Ce qui est entré. */
        val accepted: List<Candidate>,
        /** Ce qui a quitté la zone pour laisser la place (zone à une pièce). */
        val evicted: List<Candidate>,
        /** Ce qui n'est pas entré, faute de place. */
        val refused: List<Candidate>,
        /** Ce qui n'est pas une pièce de commentaire : refusé sans lecture. */
        val foreign: List<Candidate>,
    ) {
        /** L'haptique d'avertissement : quelque chose n'est pas entré. */
        public val shouldWarn: Boolean get() = refused.isNotEmpty() || foreign.isNotEmpty()
    }

    /**
     * La nature d'une pièce : son type MIME d'abord, son extension ensuite — un `.m4a` choisi dans Fichiers part comme un
     * son, plus comme un document que l'envoi abandonnait sans le dire. Ni photo, ni vidéo, ni son : un fichier.
     */
    public fun kindOf(mimeType: String?, fileName: String): CommentPieceKind {
        val byMime = CommentPieceKind.of(mimeType)
        if (byMime != CommentPieceKind.FILE) return byMime
        return when (fileName.substringAfterLast('.', "").lowercase()) {
            in IMAGE_EXTENSIONS -> CommentPieceKind.IMAGE
            in VIDEO_EXTENSIONS -> CommentPieceKind.VIDEO
            in AUDIO_EXTENSIONS -> CommentPieceKind.AUDIO
            else -> CommentPieceKind.FILE
        }
    }

    /** Une pièce qui ne dit ni son type ni son nom ne se reconnaît pas : elle n'entre pas. */
    public fun isCommentPiece(candidate: Candidate): Boolean =
        !candidate.mimeType.isNullOrBlank() || candidate.fileName.isNotBlank()

    public fun admit(incoming: List<Candidate>, staged: List<Candidate>, limit: Int): Outcome {
        val (usable, foreign) = incoming.partition(::isCommentPiece)
        if (usable.isEmpty()) return Outcome(staged, emptyList(), emptyList(), emptyList(), foreign)
        if (limit <= 1) {
            val last = usable.takeLast(1)
            return Outcome(last, last, staged, usable.dropLast(1), foreign)
        }
        val room = (limit - staged.size).coerceAtLeast(0)
        val accepted = usable.take(room)
        return Outcome(staged + accepted, accepted, emptyList(), usable.drop(room), foreign)
    }

    /** Ce qui reste dans la zone après un envoi : les pièces encore en lecture attendent le commentaire suivant. */
    public fun stillLoading(zone: List<Candidate>): List<Candidate> = zone.filterNot { it.isReady }

    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif")
    private val VIDEO_EXTENSIONS = setOf("mp4", "mov", "m4v", "webm", "mkv", "3gp", "avi")
    private val AUDIO_EXTENSIONS = setOf("m4a", "mp3", "aac", "wav", "ogg", "oga", "opus", "flac", "caf", "amr")
}
