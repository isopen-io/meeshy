package me.meeshy.app.chat.export

import me.meeshy.ui.component.bubble.BubbleContent

enum class CardMediaKind { IMAGE, VIDEO }

/**
 * Un média qu'une carte a le droit de peindre (miroir visuel de `MessageCardSubjectMedia`) : une photo, ou la première image
 * d'une vidéo. [url] est le fichier, [posterUrl] l'image d'attente d'une vidéo ; [aspect] largeur / hauteur, `null` inconnu.
 */
data class CardMedia(
    val id: String,
    val kind: CardMediaKind,
    val url: String,
    val posterUrl: String? = null,
    val aspect: Double? = null,
)

/**
 * **CE QU'UNE CARTE PEINT D'UN MESSAGE** (#14330, iOS `MessageCardSubject.paintableMedia`) : ses photos puis ses vidéos,
 * jamais une pièce chiffrée ni une pièce protégée — et une pièce protégée protège son message entier ([isProtected]).
 */
object CardMediaPicking {

    fun paintable(bubble: BubbleContent): List<CardMedia> {
        val sealed = bubble.sealedPieceIds.toSet()
        val photos = bubble.images
            .filter { !it.isProtected && it.attachmentId !in sealed && it.url.isNotBlank() }
            .map { CardMedia(it.attachmentId, CardMediaKind.IMAGE, it.url, aspect = aspectOf(it.width, it.height)) }
        val videos = bubble.files
            .filter { it.isVideo && !it.isSealed && !it.isProtected && it.attachmentId !in sealed }
            .mapNotNull { file ->
                CardText.nonBlank(file.url)?.let { url ->
                    CardMedia(file.attachmentId, CardMediaKind.VIDEO, url, CardText.nonBlank(file.thumbnailUrl), aspectOf(file.width, file.height))
                }
            }
        return photos + videos
    }

    /** Une pièce protégée (vue unique, floutée, éphémère, retenue) rend le message entier inexportable ; une pièce chiffrée ne se peint pas, sans plus. */
    fun isProtected(bubble: BubbleContent): Boolean {
        val sealed = bubble.sealedPieceIds.toSet()
        return bubble.images.any { it.isProtected && it.attachmentId !in sealed } ||
            bubble.files.any { it.isProtected && !it.isSealed && it.attachmentId !in sealed }
    }

    private fun aspectOf(width: Int?, height: Int?): Double? =
        if (width == null || height == null || width <= 0 || height <= 0) null else width.toDouble() / height
}

/** Une tuile de média posée dans la carte, en pixels de la carte ; [overflow] : les visuels non montrés (« +n »). */
data class CardMediaTile(val media: CardMedia, val x: Double, val y: Double, val width: Double, val height: Double, val overflow: Int = 0)

/** Le bloc des médias : ses tuiles, relatives au coin du bloc, et sa hauteur. */
data class CardMediaBlock(val tiles: List<CardMediaTile>, val height: Double) {
    companion object {
        val NONE = CardMediaBlock(emptyList(), 0.0)
    }
}

/**
 * **OÙ VONT LES MÉDIAS** — sous la réponse, dans sa colonne (la disposition « dessous » d'iOS) : un visuel seul garde son
 * rapport, borné à [VISUAL_SHARE] du budget ; deux se posent côte à côte ; trois et plus en grille de quatre, la dernière
 * tuile comptant ceux qu'on ne montre pas. Le texte garde toujours sa place.
 */
object CardMediaLayout {
    const val VISUAL_SHARE = 0.42
    const val GAP = 16.0
    const val RADIUS = 28.0
    const val BLOCK_GAP = 40.0
    private const val MAX_TILES = 4
    private const val MIN_ASPECT = 0.5
    private const val MAX_ASPECT = 2.0

    fun plan(media: List<CardMedia>, columnWidth: Double, budget: Double): CardMediaBlock {
        if (media.isEmpty() || columnWidth <= 0) return CardMediaBlock.NONE
        val maxHeight = budget * VISUAL_SHARE
        return when (media.size) {
            1 -> single(media.first(), columnWidth, maxHeight)
            2 -> pair(media, columnWidth, maxHeight)
            else -> grid(media, columnWidth, maxHeight)
        }
    }

    private fun single(item: CardMedia, columnWidth: Double, maxHeight: Double): CardMediaBlock {
        val aspect = (item.aspect ?: 1.0).coerceIn(MIN_ASPECT, MAX_ASPECT)
        val height = minOf(columnWidth / aspect, maxHeight)
        val width = minOf(columnWidth, height * aspect)
        return CardMediaBlock(listOf(CardMediaTile(item, (columnWidth - width) / 2, 0.0, width, height)), height)
    }

    private fun pair(media: List<CardMedia>, columnWidth: Double, maxHeight: Double): CardMediaBlock {
        val cell = minOf((columnWidth - GAP) / 2, maxHeight)
        val start = (columnWidth - (2 * cell + GAP)) / 2
        return CardMediaBlock(media.mapIndexed { index, item -> CardMediaTile(item, start + index * (cell + GAP), 0.0, cell, cell) }, cell)
    }

    private fun grid(media: List<CardMedia>, columnWidth: Double, maxHeight: Double): CardMediaBlock {
        val cell = minOf((columnWidth - GAP) / 2, (maxHeight - GAP) / 2)
        val start = (columnWidth - (2 * cell + GAP)) / 2
        val shown = media.take(MAX_TILES)
        val hidden = media.size - shown.size
        val tiles = shown.mapIndexed { index, item ->
            CardMediaTile(
                item, start + (index % 2) * (cell + GAP), (index / 2) * (cell + GAP), cell, cell,
                overflow = if (index == shown.lastIndex) hidden else 0,
            )
        }
        val rows = (shown.size + 1) / 2
        return CardMediaBlock(tiles, rows * cell + (rows - 1) * GAP)
    }
}
