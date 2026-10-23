package me.meeshy.sdk.model.audioedit

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Un nœud de l'historique : un fichier rendu et l'opération qui l'a produit. [fileName] est
 * relatif au dossier de session, pour que le manifeste survive à un déplacement du cache.
 */
@Serializable
public data class AudioEditVersion(
    val id: String,
    val fileName: String,
    val durationSeconds: Double,
    val operation: AudioEditOperation,
    val createdAtMillis: Long = 0L,
)

/** Résultat de [AudioEditDocument.commit] : le nouveau document et les versions orphelines à supprimer. */
public data class AudioEditCommit(val document: AudioEditDocument, val discarded: List<AudioEditVersion>)

/**
 * Le modèle d'édition non destructif d'un fichier audio : une liste ordonnée de versions et
 * un curseur sur l'active. L'original (version 0) n'est jamais modifié ni retiré. Valeur
 * immuable : chaque transition rend un nouveau document.
 */
public data class AudioEditDocument(
    val sessionId: String,
    val versions: List<AudioEditVersion>,
    val cursor: Int,
) {
    init {
        require(versions.isNotEmpty()) { "AudioEditDocument requires at least one version" }
        require(cursor in versions.indices) { "cursor out of bounds" }
    }

    public constructor(sessionId: String, original: AudioEditVersion) : this(sessionId, listOf(original), 0)

    val active: AudioEditVersion get() = versions[cursor]
    val original: AudioEditVersion get() = versions[0]
    val canUndo: Boolean get() = cursor > 0
    val canRedo: Boolean get() = cursor < versions.lastIndex
    val isModified: Boolean get() = cursor > 0
    val hasHistory: Boolean get() = versions.size > 1

    /** Ajoute [version] après le curseur ; la branche de rétablissement abandonnée est jetée et rendue. */
    public fun commit(version: AudioEditVersion): AudioEditCommit {
        val discarded = versions.drop(cursor + 1)
        val kept = versions.take(cursor + 1) + version
        return AudioEditCommit(copy(versions = kept, cursor = kept.lastIndex), discarded)
    }

    public fun undo(): AudioEditDocument = if (canUndo) copy(cursor = cursor - 1) else this

    public fun redo(): AudioEditDocument = if (canRedo) copy(cursor = cursor + 1) else this

    /** Déplace le curseur directement sur une version (liste d'historique) ; id inconnu = inchangé. */
    public fun moveCursor(versionId: String): AudioEditDocument {
        val index = versions.indexOfFirst { it.id == versionId }
        return if (index < 0) this else copy(cursor = index)
    }

    /** Met à jour la durée d'une version, connue seulement après le chargement asynchrone. */
    public fun updateDuration(durationSeconds: Double, versionId: String): AudioEditDocument =
        copy(versions = versions.map { if (it.id == versionId) it.copy(durationSeconds = durationSeconds) else it })

    /** Noms de fichier de toutes les versions sauf [keep], pour nettoyer la session une fois l'audio final choisi. */
    public fun fileNames(excluding: AudioEditVersion): List<String> =
        versions.filter { it.id != excluding.id }.map { it.fileName }

    /** Manifeste JSON de reprise après crash. */
    public fun toManifestJson(): String = MANIFEST_JSON.encodeToString(Manifest.serializer(), Manifest(sessionId, versions, cursor))

    @Serializable
    private data class Manifest(val sessionId: String, val versions: List<AudioEditVersion>, val cursor: Int)

    public companion object {
        private val MANIFEST_JSON = Json { ignoreUnknownKeys = true }

        /**
         * Décodeur validant : un manifeste corrompu ou vide rend `null`, jamais un document
         * hors bornes ; un curseur hors bornes est ramené dans la liste.
         */
        public fun fromManifestJson(json: String): AudioEditDocument? = runCatching {
            val manifest = MANIFEST_JSON.decodeFromString(Manifest.serializer(), json)
            if (manifest.versions.isEmpty()) {
                null
            } else {
                AudioEditDocument(
                    manifest.sessionId,
                    manifest.versions,
                    manifest.cursor.coerceIn(0, manifest.versions.lastIndex),
                )
            }
        }.getOrNull()
    }
}
