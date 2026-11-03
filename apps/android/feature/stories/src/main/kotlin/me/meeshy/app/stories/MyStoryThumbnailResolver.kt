package me.meeshy.app.stories

/** D'où la carte « Ma story » tire sa vignette (iOS `MyStoryThumbnailSource`). */
internal sealed interface MyStoryThumbnailSource {
    /** Le composite de toutes les couches (texte, dessin, stickers), décodé depuis son ThumbHash par `ThumbHashPainter`. */
    data class Composite(val thumbHash: String) : MyStoryThumbnailSource

    /** Le média brut distant : il ne porte aucune couche posée dessus. */
    data class RemoteUrl(val url: String) : MyStoryThumbnailSource

    /** Une story réellement vide garde l'icône générique. */
    data object Placeholder : MyStoryThumbnailSource
}

/**
 * Le choix de la source de vignette de la carte « Ma story ». La miniature serveur ne reflète que le média de fond ; le
 * ThumbHash de la slide est un composite de toutes les couches, la seule représentation de ce que l'auteur a composé qu'un
 * client possède sans couverture cuite côté serveur (la publication reste brute).
 */
internal object MyStoryThumbnailResolver {

    fun resolve(thumbHash: String?, remoteUrl: String?): MyStoryThumbnailSource = when {
        !thumbHash.isNullOrEmpty() -> MyStoryThumbnailSource.Composite(thumbHash)
        !remoteUrl.isNullOrEmpty() -> MyStoryThumbnailSource.RemoteUrl(remoteUrl)
        else -> MyStoryThumbnailSource.Placeholder
    }

    /**
     * Le composite local rendu par le pipeline de publication (le même que la sauvegarde du brouillon) l'emporte toujours
     * sur l'ancien repli : ThumbHash serveur d'une story publiée, premier fichier média brut d'un brouillon.
     */
    fun localCoverPath(renderedCover: String?, legacyFallback: String?): String? = renderedCover ?: legacyFallback
}
