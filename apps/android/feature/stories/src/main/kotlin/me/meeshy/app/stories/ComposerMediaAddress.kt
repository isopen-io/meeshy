package me.meeshy.app.stories

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * L'adresse qu'un chargeur d'images reçoit pour un média du composeur.
 *
 * La passerelle sert la CLÉ d'un média envoyé (`2026/10/<id>/photo.png`), jamais une URL : remise telle quelle à Coil, elle
 * ne correspond à aucun chargeur et rien ne se peint, sans une ligne de journal. Elle passe donc par le site unique
 * [me.meeshy.sdk.util.resolveMediaUrl], comme le lecteur la résout (loi 6 : l'aperçu ne ment pas). La donnée, elle, garde
 * la clé : c'est elle que la publication écrit. Un URI de l'appareil (`content:`, `file:`) n'est pas une clé et reste tel quel.
 */
internal object ComposerMediaAddress {

    fun of(raw: String, apiBaseUrl: String?): String = when {
        raw.isBlank() -> raw
        DEVICE_SCHEMES.any { raw.startsWith(it, ignoreCase = true) } -> raw
        else -> resolveMediaUrl(raw, apiBaseUrl)
    }

    /** L'image qui représente [media] : sa vignette servie, sinon le fichier lui-même. */
    fun preview(media: UploadedMedia, apiBaseUrl: String?): String = of(media.thumbnailUrl ?: media.url, apiBaseUrl)

    private val DEVICE_SCHEMES = listOf("content:", "file:", "android.resource:")
}
