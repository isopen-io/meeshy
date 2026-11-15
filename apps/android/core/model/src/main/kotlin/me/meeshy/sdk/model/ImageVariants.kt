package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.serialization.LossyNullableListSerializer
import kotlin.math.roundToInt

/**
 * D4 — une variante WebP réduite d'une image jointe, pour choisir la plus petite
 * image suffisante au lieu de charger l'original multi-Mo dans un aperçu. Images
 * non chiffrées seulement. Miroir de `MeeshyImageVariant` (iOS) et de
 * `ImageVariant` (`packages/shared/types/attachment.ts`).
 *
 * `format` est le seul champ que le fil peut légitimement taire (une variante
 * responsive EST une WebP) : son repli `"webp"` vit dans le décodage. Les quatre
 * autres restent EXIGÉS — un élément sans `url`, sans dimension ou sans poids ne
 * peut être ni élu ni mesuré, il n'est pas une variante — mais son absence n'est
 * pas fatale : les porteurs décodent la liste par [LossyMeeshyImageVariantsSerializer],
 * qui l'ÉCARTE au lieu de faire tomber la pièce jointe, donc le message.
 */
@Serializable
data class MeeshyImageVariant(
    val width: Int,
    val height: Int,
    val url: String,
    val size: Int,
    val format: String = "webp",
)

/** Saveur de la liste de variantes : élément invalide écarté, clé absente ou non-tableau = `null`. */
object LossyMeeshyImageVariantsSerializer :
    KSerializer<List<MeeshyImageVariant>?> by LossyNullableListSerializer(MeeshyImageVariant.serializer())

/**
 * D4 / levier bande passante 5.2 — moteur pur de sélection d'URL d'image, miroir
 * de `ImageVariantSelector.bestImageURL` (iOS) :
 *
 *  - candidats = variantes (url non vide, largeur > 0) triées par `(largeur, url)`
 *    puis dédupliquées par largeur en gardant la DERNIÈRE ; l'original n'est ajouté
 *    que s'il est STRICTEMENT plus large que la plus grande variante ;
 *  - élu = le plus petit candidat `>=` la largeur d'affichage, sinon le plus grand.
 *
 * Le format n'entre pas dans le choix : la passerelle ne sert que du WebP, que
 * toutes les versions Android supportées (minSdk 26) décodent.
 */
object ImageVariantPicker {

    /**
     * L'URL à charger. [originalUrl] quand aucune variante ne convient (image
     * chiffrée comprise) : le repli est à régression nulle.
     */
    fun bestImageUrl(
        variants: List<MeeshyImageVariant>,
        originalUrl: String,
        originalWidth: Int?,
        targetWidthPx: Int,
    ): String {
        val candidates = variants
            .filter { it.url.isNotEmpty() && it.width > 0 }
            .sortedWith(compareBy({ it.width }, { it.url }))
            .groupBy { it.width }
            .map { (width, sameWidth) -> width to sameWidth.last().url }
            .toMutableList()

        val largest = candidates.lastOrNull()?.first
        if (originalWidth != null && largest != null && originalWidth > largest) {
            candidates += originalWidth to originalUrl
        }
        if (candidates.isEmpty()) return originalUrl
        if (targetWidthPx <= 0) return candidates.first().second
        return (candidates.firstOrNull { it.first >= targetWidthPx } ?: candidates.last()).second
    }

    /**
     * L'aperçu LÉGER d'une pièce : l'URL de la variante élue quand elle diffère de
     * l'original, `null` sinon — pas de variante, ou l'original est lui-même le
     * meilleur choix. L'appelant garde alors sa vignette serveur.
     */
    fun lighterPreviewUrl(
        variants: List<MeeshyImageVariant>?,
        originalUrl: String,
        originalWidth: Int?,
        targetWidthPx: Int,
    ): String? {
        if (variants.isNullOrEmpty()) return null
        val pick = bestImageUrl(variants, originalUrl, originalWidth, targetWidthPx)
        return pick.takeIf { it.isNotEmpty() && it != originalUrl }
    }

    /** Largeur d'affichage en pixels d'une case de [widthDp] à la densité [density]. */
    fun displayWidthPx(widthDp: Int, density: Float): Int = (widthDp * density).roundToInt()
}
