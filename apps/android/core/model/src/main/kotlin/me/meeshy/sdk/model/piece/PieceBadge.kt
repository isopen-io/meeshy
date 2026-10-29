package me.meeshy.sdk.model.piece

/** Où en est le transfert d'une pièce-fichier de la bulle (l'hôte n'en suit qu'un à la fois). */
sealed interface PieceTransfer {
    /** [percent] est nul tant que la taille totale est inconnue. */
    data class InProgress(val percent: Int?) : PieceTransfer

    data object Failed : PieceTransfer
}

/**
 * **Le badge d'une pièce-fichier dans la bulle** (miroir de `DownloadBadgeView`, iOS : à télécharger →
 * progression → prêt). Une seule loi pure : la rangée, son accessibilité et ses animations la lisent.
 *
 * Fail-closed : une pièce scellée (chiffrée de bout en bout) ne propose JAMAIS de téléchargement, quoi que
 * disent l'adresse ou le transfert.
 */
sealed interface PieceBadge {
    /** Chiffrée de bout en bout : ne s'ouvre pas ici. */
    data object Sealed : PieceBadge

    /** Rien à proposer : pas encore d'adresse (envoi en cours), déjà sur l'appareil, ou pièce retenue (vue unique, floutée, éphémère). */
    data object None : PieceBadge

    data class Idle(val sizeBytes: Int?) : PieceBadge

    data class Downloading(val percent: Int?) : PieceBadge

    data object Ready : PieceBadge

    data object Failed : PieceBadge

    companion object {
        fun of(
            isSealed: Boolean,
            hasUrl: Boolean,
            isOnDevice: Boolean,
            transfer: PieceTransfer?,
            isReady: Boolean,
            sizeBytes: Int?,
            isProtected: Boolean = false,
        ): PieceBadge = when {
            isSealed -> Sealed
            isProtected -> None
            !hasUrl || isOnDevice -> None
            transfer is PieceTransfer.InProgress -> Downloading(transfer.percent?.coerceIn(0, 100))
            transfer is PieceTransfer.Failed -> Failed
            isReady -> Ready
            else -> Idle(sizeBytes?.takeIf { it > 0 })
        }
    }
}
