package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryStickerUpload

/**
 * Ce que la scène d'un post doit EMPORTER dans le brouillon durable — miroir d'iOS `ComposerSceneAssetCarriage` (#8521).
 *
 * Le canal document ne téléverse que `localMedia`. Le son posé sur la scène et le sticker importé n'y entraient pas : ils ne
 * partaient que si la pré-montée avait abouti, et le `file://` du son était sinon perdu. Un objet qui a déjà son
 * `postMediaId` (pré-monté, ou emprunté au serveur) n'est pas emporté : son fichier est déjà là-bas.
 */
object ComposerSceneAssetCarriage {

    sealed interface Source {
        /** Un fichier local déjà écrit (le son). */
        data class LocalFile(val path: String) : Source

        /** Une image tenue en mémoire par l'atelier, à écrire. */
        data object StickerBitmap : Source
    }

    data class Pending(val objectId: String, val source: Source)

    /** Dans l'ordre des slides : les sons d'abord, puis les stickers image, comme iOS. */
    fun pending(slides: List<StoryEffects>, stickerBitmapIds: Set<String>): List<Pending> =
        slides.flatMap { effects ->
            val sounds = effects.audioPlayerObjects.orEmpty().mapNotNull { sound ->
                ComposerPreUploadSweep.pendingFile(sound.postMediaId, sound.mediaURL)
                    ?.let { Pending(sound.id, Source.LocalFile(it)) }
            }
            val stickers = StoryStickerUpload
                .pendingUploadIds(effects.stickerObjects.orEmpty(), stickerBitmapIds)
                .map { Pending(it, Source.StickerBitmap) }
            sounds + stickers
        }
}

/** Un sticker écrit sur le disque : son chemin et son MIME (GIF animé, PNG sinon). */
data class WrittenSticker(val path: String, val mimeType: String)

/** Les pièces que le brouillon emporte, et le pont chemin → objet de la scène qui les désigne. */
data class CarriedSceneAssets(
    val media: List<ComposerDocumentMedia>,
    val objectIdBySource: Map<String, String>,
) {
    companion object {
        val EMPTY = CarriedSceneAssets(emptyList(), emptyMap())

        /**
         * Écrit ce qui doit l'être. Un sticker qu'on n'a pas pu écrire reste sur son emoji : une image d'appoint ne fait pas
         * échouer le post (même règle que le canal de l'atelier).
         */
        fun materialize(
            pending: List<ComposerSceneAssetCarriage.Pending>,
            mimeTypeOf: (path: String) -> String,
            writeSticker: (objectId: String) -> WrittenSticker?,
        ): CarriedSceneAssets {
            val media = mutableListOf<ComposerDocumentMedia>()
            val bridge = linkedMapOf<String, String>()
            pending.forEach { item ->
                val file = when (val source = item.source) {
                    is ComposerSceneAssetCarriage.Source.LocalFile -> WrittenSticker(source.path, mimeTypeOf(source.path))
                    ComposerSceneAssetCarriage.Source.StickerBitmap -> writeSticker(item.objectId)
                } ?: return@forEach
                media += ComposerDocumentMedia(file.path, file.mimeType)
                bridge[file.path] = item.objectId
            }
            return CarriedSceneAssets(media, bridge)
        }
    }

    /** Le brouillon augmenté de ce qu'il emporte : les fichiers dans `localMedia`, le pont dans `mediaObjectIds`. */
    fun carriedBy(draft: ComposerDocumentDraft): ComposerDocumentDraft {
        if (media.isEmpty()) return draft
        val known = draft.localMedia.mapTo(HashSet()) { it.path }
        return draft.copy(
            localMedia = draft.localMedia + media.filter { it.path !in known },
            mediaObjectIds = draft.mediaObjectIds + objectIdBySource,
        )
    }
}
