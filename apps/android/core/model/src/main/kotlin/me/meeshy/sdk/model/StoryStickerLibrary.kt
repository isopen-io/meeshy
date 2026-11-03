package me.meeshy.sdk.model

import me.meeshy.sdk.model.sticker.StickerLibraryIndex

/**
 * Ce qu'un contenu REÇU offre à « Mes stickers » — miroir de `StoryStickerLibrary` (iOS).
 *
 * L'image d'un sticker est INTÉGRÉE à la story : ses octets se lisent sur le [FeedMedia] du post lui-même,
 * apparié par id. Aucune URL tierce n'entre. Décision PURE : l'app garde le téléchargement, l'écriture et le retour.
 */
object StoryStickerLibrary {

    /** Un sticker reçu prêt à entrer dans la bibliothèque ; [id] est stable, donc un sticker déjà gardé se reconnaît. */
    data class Savable(val id: String, val mediaUrl: String)

    /** Espace de noms des ids venus d'un contenu reçu (le collage pose des UUID : jamais la même règle). */
    const val RECEIVED_ID_PREFIX: String = "received-"

    /**
     * `null` quand [postMediaId] ne peut pas servir de nom de fichier : il vient du serveur et le magasin le
     * concatène à son dossier, un séparateur y ferait écrire ailleurs.
     */
    fun libraryId(postMediaId: String): String? =
        if (StickerLibraryIndex.isFileSafe(postMediaId)) RECEIVED_ID_PREFIX + postMediaId else null

    /** Les stickers image copiables, dans l'ordre de composition, un par média. Vide = le geste est ABSENT. */
    fun savable(item: StoryItem): List<Savable> {
        val stickers = item.storyEffects?.stickerObjects.orEmpty()
        val seen = HashSet<String>()
        return stickers.mapNotNull { sticker ->
            if (sticker.kind != StickerKind.IMAGE) return@mapNotNull null
            val id = libraryId(sticker.postMediaId) ?: return@mapNotNull null
            val url = item.media.firstOrNull { it.id == sticker.postMediaId }?.url?.takeIf { it.isNotEmpty() }
                ?: return@mapNotNull null
            if (seen.add(id)) Savable(id, url) else null
        }
    }
}
