package me.meeshy.sdk.model.share

/**
 * **La bande des fichiers entrants de « Ce qui part »** (V1, V9) — miroir de `removeIncoming`,
 * `moveIncoming`, `trimOverflow` (iOS `ShareSheetViewModel`) et de `ShareIncomingStrip`.
 * Pur : chaque geste rend un nouveau sujet, l'écran n'est qu'une projection.
 */

/** La clé stable d'une pièce : son identifiant, sinon sa position à l'arrivée. */
internal fun ShareMedia.stripKey(index: Int): String = id ?: index.toString()

/** La croix d'une pièce la retire ; la dernière reste. */
fun ShareSubject.Incoming.removingMedia(key: String): ShareSubject.Incoming {
    if (media.size <= 1) return this
    val index = media.indices.firstOrNull { media[it].stripKey(it) == key } ?: return this
    return copy(media = media.filterIndexed { i, _ -> i != index })
}

/** « Avancer » (offset -1) et « Reculer » (+1) : réordonner sans glisser. Hors bornes, rien ne bouge. */
fun ShareSubject.Incoming.movingMedia(key: String, offset: Int): ShareSubject.Incoming {
    val from = media.indices.firstOrNull { media[it].stripKey(it) == key } ?: return this
    val to = from + offset
    if (to !in media.indices || to == from) return this
    val moved = media.toMutableList().also { it[from] = media[to]; it[to] = media[from] }
    return copy(media = moved)
}

/** « Retirer les N derniers » : ôte ce qui dépasse les plafonds communs, mais garde au moins une pièce. */
fun ShareSubject.Incoming.trimmingOverflow(count: Int): ShareSubject.Incoming {
    if (count <= 0) return this
    val removable = minOf(count, maxOf(media.size - 1, 0))
    return if (removable == 0) this else copy(media = media.dropLast(removable))
}

/** Une vignette de la bande. */
data class ShareIncomingTile(
    val key: String,
    /** « 1 », « 2 »… — la place dans l'ordre d'envoi. */
    val number: Int,
    val kind: SharePieceKind,
    /** Au-delà des plafonds (D10) : atténuée, cerclée d'erreur, dite « dépasse la limite ». */
    val isOverLimit: Boolean,
    val canMoveForward: Boolean,
    val canMoveBackward: Boolean,
    /** La croix n'existe qu'avec plusieurs fichiers. */
    val removable: Boolean,
)

object ShareIncomingStrip {
    /** [fittingCount] : les pièces au-delà de ce rang dépassent les plafonds. */
    fun tiles(media: List<ShareMedia>, fittingCount: Int): List<ShareIncomingTile> = media.mapIndexed { index, piece ->
        ShareIncomingTile(
            key = piece.stripKey(index),
            number = index + 1,
            kind = SharePieceKind.of(piece.mimeType),
            isOverLimit = index >= fittingCount,
            canMoveForward = index > 0,
            canMoveBackward = index < media.lastIndex,
            removable = media.size > 1,
        )
    }

    /** La taille maximale (px) d'une vignette décodée : ni le fichier ni l'image pleine n'entrent en mémoire. */
    const val THUMBNAIL_MAX_PIXELS: Int = 160
}
