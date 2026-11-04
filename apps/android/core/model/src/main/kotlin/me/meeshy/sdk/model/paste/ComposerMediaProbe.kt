package me.meeshy.sdk.model.paste

/** La lecture de durée d'un fichier local, injectable (MediaMetadataRetriever sur Android, un faux en test). */
public fun interface MediaDurationReader {
    public fun durationMs(path: String): Long?
}

/**
 * La durée RÉELLE d'une vidéo ou d'un son fraîchement ingéré (miroir de `ComposerMediaProbe`, iOS) : `null` pour une image
 * ou un fichier, dont la durée n'a pas de sens ; le classement reste celui de [ComposerIngestRouter].
 */
public class ComposerMediaProbe(private val reader: MediaDurationReader) {

    public fun durationMs(path: String, mime: String?): Long? = when (ComposerIngestRouter.route(mime)) {
        PastedPipeline.VIDEO, PastedPipeline.AUDIO -> reader.durationMs(path)?.takeIf { it > 0 }
        PastedPipeline.IMAGE, PastedPipeline.FILE -> null
    }

    public companion object {
        /** Une durée inconnue ne qualifie pas : une seule vidéo d'au moins 3 s peut être un réel. */
        public const val REEL_MIN_DURATION_MS: Long = 3_000

        public fun meetsReelMinimum(durationMs: Long?): Boolean = durationMs != null && durationMs >= REEL_MIN_DURATION_MS
    }
}
