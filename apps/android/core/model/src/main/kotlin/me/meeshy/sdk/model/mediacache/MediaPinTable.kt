package me.meeshy.sdk.model.mediacache

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Table d'épingles : clé de cache -> échéance (epoch ms). Une épingle ACTIVE (échéance dans le
 * futur) exempte la clé de l'éviction LRU ET du TTL. Le magasin ne décide jamais CE qui mérite une
 * épingle : c'est la politique côté app (ex. médias d'une story vue, jusqu'à son expiration).
 * Épingler une clé dont le téléchargement n'a pas abouti est valide : l'exemption joue dès que
 * le fichier existe. Immuable ; miroir de `DiskCacheStore+Pinning` (iOS).
 */
public data class MediaPinTable(
    val expiries: Map<String, Long> = emptyMap(),
) {
    public fun pin(key: String, untilEpochMillis: Long): MediaPinTable =
        copy(expiries = expiries + (key to untilEpochMillis))

    public fun unpin(key: String): MediaPinTable = copy(expiries = expiries - key)

    public fun isPinned(key: String, nowEpochMillis: Long): Boolean =
        (expiries[key] ?: return false) > nowEpochMillis

    /** Retire les épingles échues pour que la table (et son sidecar) ne grossisse pas sans borne. */
    public fun pruned(nowEpochMillis: Long): MediaPinTable =
        copy(expiries = expiries.filterValues { it > nowEpochMillis })

    public fun encode(): String = Json.encodeToString(CODEC, expiries)

    public companion object {
        private val CODEC = MapSerializer(String.serializer(), Long.serializer())

        /** Sidecar caché, posé dans le dossier du cache pour survivre au redémarrage. */
        public const val SIDECAR_FILE_NAME: String = ".pins.json"

        /** Sidecar illisible ou absent => table vide (jamais d'échec au boot). */
        public fun decode(json: String?): MediaPinTable {
            if (json.isNullOrBlank()) return MediaPinTable()
            return runCatching { MediaPinTable(Json.decodeFromString(CODEC, json)) }
                .getOrDefault(MediaPinTable())
        }
    }
}
