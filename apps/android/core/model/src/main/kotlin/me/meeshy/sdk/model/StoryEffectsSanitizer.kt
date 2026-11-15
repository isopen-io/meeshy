package me.meeshy.sdk.model

/** Une charge prête pour le serveur, et l'avertissement de chaque `file:` retiré en chemin. */
data class SanitizedStoryEffects(val effects: StoryEffects, val warnings: List<String>)

private fun String.isLocalFileUrl(): Boolean = lowercase().startsWith("file:")

/**
 * La charge prête à partir au serveur — miroir de `StoryEffects.sanitizedForServerPublish()`.
 *
 * Toute référence à un asset LOCAL (`file:`, sans égard à la casse) sur un média est retirée : seul
 * `postMediaId` résout l'asset côté lecteur. Un `file:///Users/…` ne se résout chez personne et
 * porte au passage le nom de compte de l'auteur. Les URL réseau et de fixtures sont conservées.
 * Un retrait signale un bug d'amont (l'URL n'a pas été remplacée après l'envoi) : il est journalisé
 * par l'appelant à partir de [SanitizedStoryEffects.warnings], ce module n'ayant aucun journal.
 */
fun StoryEffects.sanitizedForServerPublish(): SanitizedStoryEffects {
    val warnings = mutableListOf<String>()
    val medias = mediaObjects?.map { media ->
        val raw = media.mediaURL
        if (raw == null || !raw.isLocalFileUrl()) {
            media
        } else {
            warnings += "mediaURL local retiré de StoryMediaObject id=${media.id} postMediaId=${media.postMediaId}"
            media.copy(mediaURL = null)
        }
    }
    return SanitizedStoryEffects(copy(mediaObjects = medias), warnings)
}
