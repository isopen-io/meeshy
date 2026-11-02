package me.meeshy.sdk.model.composer.sound

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule
import me.meeshy.sdk.model.media.trimBounds

/**
 * La fenêtre PROPRE d'un son dans sa source (#13601), comme iOS : des bornes `sourceStart` / `sourceEnd` posées sur la
 * piste, jamais un fichier recoupé (le son garde son `soundId`, donc le crédit de son auteur). Rogner écrit TROIS champs
 * d'un seul tenant (`MediaTrimRule.fields`) : les deux bornes, et la durée que la piste occupe désormais sur la scène.
 *
 * La durée de la SOURCE n'est pas celle de l'objet — le Temps la remplace par la durée occupée sur la scène : elle vient
 * de ce que la slide a retenu à l'emprunt ([declared]), sinon de la fin de la fenêtre déjà posée, sinon de la durée
 * de l'objet.
 */
object SoundTrimLaw {

    /** Une source plus longue n'est qu'une donnée d'un tiers : la bande ne s'étire pas à l'infini. */
    const val MAX_SOURCE_SECONDS: Double = 4.0 * 3600.0

    /** La durée de la source en secondes ; `null` si on ne la connaît pas (aucun rognage possible) ou si elle est absurde. */
    fun sourceSeconds(sound: StoryAudioPlayerObject, declared: Float?): Double? {
        val raw = (declared ?: sound.sourceEnd ?: sound.duration)?.toDouble() ?: return null
        if (!raw.isFinite() || raw < MediaTrimRule.MINIMUM_DURATION) return null
        return raw.coerceAtMost(MAX_SOURCE_SECONDS)
    }

    /** Seule une piste qui a une adresse à lire et une source mesurée se rogne : aucun bouton sans effet. */
    fun isTrimmable(sound: StoryAudioPlayerObject, declared: Float?): Boolean =
        !sound.mediaURL.isNullOrEmpty() && sourceSeconds(sound, declared) != null

    /** La fenêtre EFFECTIVE de la piste : la source entière tant qu'elle n'est pas rognée, ou si ses bornes ont vieilli. */
    fun window(sound: StoryAudioPlayerObject, sourceSeconds: Double): MediaTrimBounds = sound.trimBounds(sourceSeconds)

    /**
     * La piste rognée à [bounds] (ramenées dans la source et au plancher de durée). La source entière n'écrit AUCUNE
     * borne — leur présence DÉCLARE un rognage — et rend la durée de la source.
     */
    fun trimmed(sound: StoryAudioPlayerObject, bounds: MediaTrimBounds, sourceSeconds: Double): StoryAudioPlayerObject {
        val kept = MediaTrimRule.resolved(bounds.start, bounds.end, sourceSeconds)
        val fields = MediaTrimRule.fields(kept, sourceSeconds)
        return sound.copy(
            sourceStart = fields.start?.toFloat(),
            sourceEnd = fields.end?.toFloat(),
            duration = fields.duration.toFloat(),
        )
    }
}
