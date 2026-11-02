package me.meeshy.sdk.model.game.photo

/*
 * LA MISE EN PAGE DU CADRE (#9382, #13891) — miroir de `GamePhotoLayout` (iOS) et de
 * `apps/web/src/lib/game-photo/layout.ts` : emblème en haut, titre et date, Mee et Meo en bas, la Signature au pied.
 * Une DONNÉE, en pixels de l'image finale : l'aperçu en direct et l'image composée lisent la MÊME table, donc le cadre
 * qu'on voit au moment de déclencher est celui qu'on obtient.
 */

/** 9:16 pour la story, 1:1 pour le profil. */
public enum class PhotoFormat(public val width: Int, public val height: Int) {
    Story(1080, 1920),
    Square(1080, 1080),
}

/** Un rectangle en pixels de l'image finale. */
public data class PhotoRect(val x: Float, val y: Float, val width: Float, val height: Float)

/** Une ligne de texte centrée sur [x] ; [y] est sa ligne de base. */
public data class PhotoTextLine(val x: Float, val y: Float, val size: Float)

public data class PhotoLayout(
    val width: Float,
    val height: Float,
    val emblem: PhotoRect,
    val kicker: PhotoTextLine,
    val title: PhotoTextLine,
    val date: PhotoTextLine,
    val mee: PhotoRect,
    val meo: PhotoRect,
    val signature: PhotoRect,
)

public object GamePhotoLayout {

    private data class Proportions(
        val emblemSize: Float,
        val emblemTop: Float,
        val kickerY: Float,
        val titleY: Float,
        val dateY: Float,
        val birdSize: Float,
        val signatureSize: Float,
    )

    private const val MARGIN = 0.05f

    private fun proportions(format: PhotoFormat): Proportions = when (format) {
        PhotoFormat.Story -> Proportions(0.36f, 0.07f, 0.4f, 0.45f, 0.5f, 0.26f, 0.1f)
        PhotoFormat.Square -> Proportions(0.3f, 0.06f, 0.49f, 0.58f, 0.65f, 0.22f, 0.07f)
    }

    public fun layout(format: PhotoFormat): PhotoLayout {
        val width = format.width.toFloat()
        val height = format.height.toFloat()
        val p = proportions(format)
        val emblem = width * p.emblemSize
        val bird = width * p.birdSize
        val signature = width * p.signatureSize
        val edge = width * MARGIN
        val birdTop = height - edge - bird
        return PhotoLayout(
            width = width,
            height = height,
            emblem = PhotoRect((width - emblem) / 2, height * p.emblemTop, emblem, emblem),
            kicker = PhotoTextLine(width / 2, height * p.kickerY, width * 0.04f),
            title = PhotoTextLine(width / 2, height * p.titleY, width * 0.075f),
            date = PhotoTextLine(width / 2, height * p.dateY, width * 0.035f),
            mee = PhotoRect(edge, birdTop, bird, bird),
            meo = PhotoRect(width - edge - bird, birdTop, bird, bird),
            signature = PhotoRect((width - signature) / 2, height - edge - signature, signature, signature),
        )
    }
}
