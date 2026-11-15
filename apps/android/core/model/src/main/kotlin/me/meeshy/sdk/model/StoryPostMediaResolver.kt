package me.meeshy.sdk.model

/**
 * Résout un `postMediaId` en URL jouable sur toute la fenêtre de préchargement (iOS `StoryPostMediaResolver`) : le mixeur
 * audio en a besoin pour faire correspondre une piste à son fichier. Fonction pure des médias de la fenêtre ; [resolveUrl]
 * porte la règle d'adresse (clé de stockage, hôte). Une adresse que [resolveUrl] refuse n'entre pas dans l'index, et à
 * identifiant égal la première pièce de la fenêtre gagne.
 */
object StoryPostMediaResolver {
    fun resolver(covering: List<StoryItem>, resolveUrl: (String) -> String?): (String) -> String? {
        val index = LinkedHashMap<String, String>()
        covering.flatMap { it.media }.forEach { media ->
            val url = media.url?.takeIf { it.isNotBlank() }?.let(resolveUrl) ?: return@forEach
            index.putIfAbsent(media.id, url)
        }
        return { postMediaId -> index[postMediaId] }
    }
}
