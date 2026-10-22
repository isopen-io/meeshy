package me.meeshy.sdk.model.media

/**
 * Disponibilité de lecture d'un audio. Miroir d'iOS `AudioAvailability` : pilote le
 * bouton de tête (lecture / téléchargement / anneau de progression « 410 KB / 850 KB »).
 */
public sealed interface AudioAvailability {
    public data object Ready : AudioAvailability
    public data object NeedsDownload : AudioAvailability

    /** [progress] dans [0, 1], 0 = indéterminé ; octets à 0 quand inconnus. */
    public data class Downloading(
        val progress: Double,
        val downloadedBytes: Long = 0L,
        val totalBytes: Long = 0L,
    ) : AudioAvailability

    public companion object {
        /**
         * Disponibilité « au repos » (hors téléchargement actif) à partir de faits déjà
         * collectés : jamais de flash de téléchargement au premier rendu.
         */
        public fun resolve(
            isLocalFile: Boolean,
            localFileExists: Boolean,
            isServerCached: Boolean,
        ): AudioAvailability =
            if (restingReady(isLocalFile, localFileExists, isServerCached)) Ready else NeedsDownload
    }
}

internal fun restingReady(isLocalFile: Boolean, localFileExists: Boolean, isServerCached: Boolean): Boolean =
    if (isLocalFile) localFileExists else isServerCached
