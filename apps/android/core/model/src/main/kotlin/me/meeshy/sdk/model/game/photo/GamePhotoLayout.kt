package me.meeshy.sdk.model.game.photo

import java.util.Locale
import me.meeshy.sdk.model.game.GameReferralBannerMetrics

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
    /** Le bandeau de parrainage (#7742), en bas ; `null` sans lien. Il porte sa propre Signature. */
    val banner: PhotoRect? = null,
    /** La place du carré QR, en fin de ligne du bandeau, au pixel entier ; `null` sans bandeau. */
    val qr: PhotoRect? = null,
    /** La plaque d'auteur (#10816), à la proportion du cartouche (360 × 100). */
    val author: PhotoRect = PhotoRect(0f, 0f, 0f, 0f),
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
        val bannerHeight: Float,
    )

    private const val MARGIN = 0.05f

    private fun proportions(format: PhotoFormat, referral: Boolean): Proportions = when {
        format == PhotoFormat.Story && !referral -> Proportions(0.36f, 0.07f, 0.4f, 0.45f, 0.5f, 0.26f, 0.1f, 0f)
        format == PhotoFormat.Square && !referral -> Proportions(0.3f, 0.06f, 0.49f, 0.58f, 0.65f, 0.22f, 0.07f, 0f)
        format == PhotoFormat.Story -> Proportions(0.36f, 0.07f, 0.4f, 0.45f, 0.5f, 0.26f, 0.1f, 0.2f)
        else -> Proportions(0.3f, 0.06f, 0.42f, 0.5f, 0.56f, 0.15f, 0.07f, 0.2f)
    }

    /** Le cartouche de la plaque d'auteur (360 × 100). */
    public const val AUTHOR_PLATE_RATIO: Float = 3.6f

    private fun authorWidth(format: PhotoFormat): Float = when (format) {
        PhotoFormat.Story -> 0.7f
        PhotoFormat.Square -> 0.44f
    }

    /** La carte se compose-t-elle de droite à gauche ? La langue d'interface décide, jamais la région de l'appareil. */
    public fun readsRightToLeft(language: String?): Boolean {
        val code = language?.substringBefore('-')?.substringBefore('_')?.lowercase(Locale.ROOT) ?: return false
        return code in RTL_LANGUAGES
    }

    private val RTL_LANGUAGES = setOf("ar", "he", "iw", "fa", "ur", "ps", "sd", "yi", "dv", "ug", "ckb")

    /**
     * [referral] : le bandeau de parrainage en bas. [rightToLeft] : le bandeau se retourne en entier, le carré QR
     * passe à gauche ; le reste de la carte ne bouge pas.
     */
    public fun layout(format: PhotoFormat, referral: Boolean = false, rightToLeft: Boolean = false): PhotoLayout {
        val width = format.width.toFloat()
        val height = format.height.toFloat()
        val p = proportions(format, referral)
        val emblem = width * p.emblemSize
        val bird = width * p.birdSize
        val signature = width * p.signatureSize
        val edge = width * MARGIN
        val bannerHeight = width * p.bannerHeight
        val banner = if (referral) PhotoRect(edge, height - edge - bannerHeight, width - 2 * edge, bannerHeight) else null
        val qr = banner?.let {
            val rect = GameReferralBannerMetrics.make(it.width.toDouble(), it.height.toDouble(), rightToLeft).qr
            PhotoRect(it.x + rect.x.toFloat(), it.y + rect.y.toFloat(), rect.width.toFloat(), rect.height.toFloat())
        }
        val birdTop = (banner?.y ?: height) - (if (banner == null) edge else edge / 2) - bird
        val plateWidth = width * authorWidth(format)
        val plateHeight = plateWidth / AUTHOR_PLATE_RATIO
        val squarePlateY = if (banner == null) height - edge - signature - width * 0.01f - plateHeight else birdTop + (bird - plateHeight) / 2
        val plateY = if (format == PhotoFormat.Story) height * p.dateY + width * 0.05f else squarePlateY
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
            banner = banner,
            qr = qr,
            author = PhotoRect((width - plateWidth) / 2, plateY, plateWidth, plateHeight),
        )
    }
}
