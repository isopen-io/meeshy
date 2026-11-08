package me.meeshy.sdk.model.paste

/**
 * Le classement MIME -> pipeline d'ingestion, partagé par le collage, le dépôt et le sélecteur (miroir de
 * `ComposerIngestRouter`, iOS). les familles image, video et audio ont leur porte ; tout le reste, MIME vide et
 * `application/octet-stream` compris, tombe sur le fichier. Insensible à la casse.
 */
public object ComposerIngestRouter {
    public fun route(mime: String?): PastedPipeline {
        val normalized = mime?.trim()?.lowercase().orEmpty()
        return when {
            normalized.startsWith("image/") -> PastedPipeline.IMAGE
            normalized.startsWith("video/") -> PastedPipeline.VIDEO
            normalized.startsWith("audio/") -> PastedPipeline.AUDIO
            else -> PastedPipeline.FILE
        }
    }
}
