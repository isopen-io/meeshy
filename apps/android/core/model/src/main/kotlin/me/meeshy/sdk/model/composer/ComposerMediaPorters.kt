package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MobileTranscriptionPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Un média local entré dans le composer, désigné par son URI (miroir de `ComposerDocumentMedia`, iOS). */
data class ComposerLocalMedia(val uri: String, val mimeType: String? = null)

/** Les porteurs du média, vus comme UNE valeur (miroir de `ComposerMediaPorters`) : le retrait les écrit ensemble. */
data class ComposerMediaPorters(
    val localMedia: List<ComposerLocalMedia> = emptyList(),
    val roleByUri: Map<String, ComposerMediaRole> = emptyMap(),
    val slideIdByMediaUri: Map<String, String> = emptyMap(),
    val objectIdBySource: Map<String, String> = emptyMap(),
    val captions: Map<String, String> = emptyMap(),
    val altsByObjectId: Map<String, String> = emptyMap(),
    val transcriptions: Map<String, MobileTranscriptionPayload> = emptyMap(),
    val railPosedUris: Set<String> = emptySet(),
) {
    /** Les textes alternatifs, rekeyés par fichier source ; les vides sont ignorés. */
    val altsBySourceUri: Map<String, String>
        get() = objectIdBySource.mapNotNull { (source, objectId) ->
            altsByObjectId[objectId]?.takeIf { it.isNotBlank() }?.let { source to it }
        }.toMap()

    companion object {
        val EMPTY = ComposerMediaPorters()
    }
}

/** Un objet de la scène et le fichier local qu'il peint, s'il en a un. */
data class ComposerCanvasObject(val id: String, val slideId: String, val fileUri: String? = null)

/** Le relevé du canvas : ce que les diapos peignent réellement. */
data class ComposerCanvasCensus(val objects: List<ComposerCanvasObject> = emptyList()) {
    fun survivors(excluding: Set<String>): List<ComposerCanvasObject> = objects.filter { it.id !in excluding }
    fun filesOf(objectIds: Set<String>): Set<String> = objects.filter { it.id in objectIds }.mapNotNull { it.fileUri }.toSet()
    fun fileOf(objectId: String): String? = objects.firstOrNull { it.id == objectId }?.fileUri
    fun idsOnSlide(slideId: String): Set<String> = objects.filter { it.slideId == slideId }.map { it.id }.toSet()
}

/** Le retrait d'un média, calculé : les porteurs restants, les fichiers libérés, les objets à supprimer. */
data class ComposerMediaRetraction(
    val porters: ComposerMediaPorters,
    val retiredUris: Set<String>,
    val retiredObjectIds: Set<String>,
) {
    companion object {
        /**
         * Les huit porteurs sortent d'un bloc (le rôle et la garde du rail avec la valeur), jamais un fichier encore PEINT
         * par un survivant, et un fichier qui survit reprend l'alternative de son objet retiré.
         */
        fun retracting(
            porters: ComposerMediaPorters,
            objectIds: List<String>,
            slideId: String? = null,
            fileUris: Set<String> = emptySet(),
            census: ComposerCanvasCensus = ComposerCanvasCensus(),
        ): ComposerMediaRetraction {
            val targeted = objectIds.toSet() + (slideId?.let(census::idsOnSlide) ?: emptySet())
            val deduced = buildSet {
                porters.objectIdBySource.forEach { (source, objectId) -> if (objectId in targeted) add(source) }
                if (slideId != null) porters.slideIdByMediaUri.forEach { (source, slide) -> if (slide == slideId) add(source) }
                addAll(census.filesOf(targeted))
            }
            val paintedElsewhere = census.survivors(targeted).mapNotNull { it.fileUri }.toSet()
            val uris = deduced.filter { source ->
                val imprint = porters.objectIdBySource[source]?.let(census::fileOf)
                source !in paintedElsewhere && (imprint == null || imprint !in paintedElsewhere)
            }.toSet() + fileUris
            val objects = targeted + uris.mapNotNull { porters.objectIdBySource[it] }

            val heirs = porters.objectIdBySource.mapNotNull { (source, former) ->
                if (source in uris || former !in objects) return@mapNotNull null
                val imprint = census.fileOf(former) ?: return@mapNotNull null
                val heir = census.survivors(targeted).firstOrNull { it.fileUri == imprint } ?: return@mapNotNull null
                Triple(source, former, heir.id)
            }
            val alts = (porters.altsByObjectId.filterKeys { it !in objects } +
                heirs.mapNotNull { (_, former, heir) -> porters.altsByObjectId[former]?.let { heir to it } })
            val sources = porters.objectIdBySource.filterKeys { it !in uris } + heirs.associate { (s, _, h) -> s to h }

            return ComposerMediaRetraction(
                porters = porters.copy(
                    localMedia = porters.localMedia.filter { it.uri !in uris },
                    roleByUri = porters.roleByUri.filterKeys { it !in uris },
                    slideIdByMediaUri = porters.slideIdByMediaUri.filterKeys { it !in uris },
                    objectIdBySource = sources,
                    captions = porters.captions.filterKeys { it !in uris },
                    altsByObjectId = alts,
                    transcriptions = porters.transcriptions.filterKeys { it !in uris },
                    railPosedUris = porters.railPosedUris - uris,
                ),
                retiredUris = uris,
                retiredObjectIds = objects,
            )
        }
    }
}

/** Le magasin observable des porteurs (miroir de `ComposerMediaPorterStore`) : une écriture qui ne change rien ne notifie pas. */
class ComposerMediaPorterStore {
    private val stock = MutableStateFlow(ComposerMediaPorters.EMPTY)

    val porters: StateFlow<ComposerMediaPorters> get() = stock

    fun update(transform: (ComposerMediaPorters) -> ComposerMediaPorters) {
        stock.value = transform(stock.value)
    }

    /** Applique le retrait d'un bloc et le rend, pour que l'appelant oublie les pré-montées et supprime les objets. */
    fun retract(
        objectIds: List<String>,
        slideId: String? = null,
        fileUris: Set<String> = emptySet(),
        census: ComposerCanvasCensus = ComposerCanvasCensus(),
    ): ComposerMediaRetraction =
        ComposerMediaRetraction.retracting(stock.value, objectIds, slideId, fileUris, census).also { stock.value = it.porters }

    /** « Tout effacer » : la page blanche, tous les porteurs d'un coup. */
    fun clear() {
        stock.value = ComposerMediaPorters.EMPTY
    }
}
