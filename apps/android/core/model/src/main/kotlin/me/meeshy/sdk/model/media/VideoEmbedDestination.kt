package me.meeshy.sdk.model.media

/** Quelle URL ouvrir pour un embed vidéo : le lien suivi `/l/token` s'il existe, sinon l'URL de visionnage canonique. */
public object VideoEmbedDestination {
    public fun url(watchUrl: String, trackedUrl: String?): String =
        trackedUrl?.takeIf { it.isNotBlank() } ?: watchUrl
}
