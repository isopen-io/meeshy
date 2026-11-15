package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ContentExitLaw

/**
 * **Les plafonds communs du partage** (D10, #10949) — les mêmes sur iOS (app et extension),
 * sur le web et dans la coque Android.
 *
 * Miroirs : `SHARE_LIMITS` (`packages/shared/utils/share-limits.ts`, qui fait foi) et
 * `ShareLimits` (`SharePlan.swift`, iOS). `maxPublicationMedia` est la borne que la passerelle
 * applique déjà aux posts (`MAX_POST_MEDIA`) ; `maxCaptionLength` est `MAX_SHARE_CAPTION`.
 */
object ShareLimits {
    /** Révisé par le porteur le 2026-10-25 (#12974) : 100 fichiers et 5 Gio, contre 20 et 500 Mio. */
    const val MAX_FILES: Int = 100

    /** 5 Gio, comme l'extension iOS compte. */
    const val MAX_TOTAL_BYTES: Long = 5L * 1024L * 1024L * 1024L

    /** Destinataires, publications comprises. */
    const val MAX_RECIPIENTS: Int = 10

    const val MAX_PUBLICATION_MEDIA: Int = 10

    /** La légende d'un envoi (`MAX_SHARE_CAPTION`). */
    const val MAX_CAPTION_LENGTH: Int = 5000
}

/**
 * Un média : un fichier venu d'une autre app, ou la pièce d'un message — dans ce second cas,
 * ses drapeaux de protection sont ceux que la loi de sortie lit ([ContentExitLaw.Piece]).
 * Miroir de `ShareMedia` (iOS).
 */
data class ShareMedia(
    val id: String? = null,
    val mimeType: String,
    val bytes: Long? = null,
    val durationMs: Int? = null,
    val isViewOnce: Boolean? = null,
    val isBlurred: Boolean? = null,
    val effectFlags: Long? = null,
) {
    val exitPiece: ContentExitLaw.Piece
        get() = ContentExitLaw.Piece(isViewOnce = isViewOnce, isBlurred = isBlurred, effectFlags = effectFlags)
}

/**
 * Un message source, tel que le client le connaît — miroir de `ShareMessage` (iOS).
 * [encrypted] : sa conversation est chiffrée, ou il porte un contenu chiffré ;
 * [citesProtected] : il cite un contenu protégé. [expiresAt] ne déclare qu'un éphémère,
 * jamais une durée.
 */
data class ShareMessage(
    val id: String,
    val text: String? = null,
    val isViewOnce: Boolean? = null,
    val isBlurred: Boolean? = null,
    val effectFlags: Long? = null,
    val ephemeralDuration: Double? = null,
    val expiresAt: String? = null,
    val encrypted: Boolean = false,
    val citesProtected: Boolean = false,
    val pieces: List<ShareMedia> = emptyList(),
) {
    /** Ce que la loi de sortie lit du message, avec ses pièces — ou seulement celles [chosen]. */
    fun exitSubject(chosen: List<ShareMedia>? = null): ContentExitLaw.Subject = ContentExitLaw.Subject(
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags,
        ephemeralDuration = ephemeralDuration,
        hasExpiry = !expiresAt.isNullOrBlank(),
        attachments = (chosen ?: pieces).map { it.exitPiece },
    )

    /** La loi de sortie du message (ou des seules pièces [chosen]) — la plus restrictive gagne. */
    fun exitLaw(chosen: List<ShareMedia>? = null): ContentExitLaw = ContentExitLaw.of(exitSubject(chosen))
}
