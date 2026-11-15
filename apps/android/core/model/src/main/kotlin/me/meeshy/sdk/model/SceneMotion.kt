package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * Ce qui distingue une scène qui BOUGE d'une scène qui ne bouge pas — miroir de `SceneMotion` (iOS).
 *
 * Une scène cinématique se traite comme une vidéo (autoplay, bouton lecture) ; un canvas fixe
 * non. Le mouvement, jamais la durée : `timelineDuration` mesure un temps de séjour.
 */
object SceneMotion {

    /** Cinq témoins indépendants : ouverture/fermeture, transitions de clips, ou un objet qui bouge. */
    fun isCinematic(scene: SceneV3): Boolean {
        if (scene.opening != null || scene.closing != null) return true
        if (!scene.clipTransitions.isNullOrEmpty()) return true
        return scene.objects.any(::objectMoves)
    }

    /** Une scène qui bouge, ou un son de fond (qui appartient au document et non à une scène). */
    fun isCinematic(document: CanvasV3): Boolean =
        document.sound != null || document.scenes.any { isCinematic(it) }

    /** Le document a-t-il quelque chose à FAIRE ENTENDRE ? Distincte de [isCinematic] : une vidéo muette bouge sans son. */
    fun isAudible(document: CanvasV3): Boolean =
        document.sound != null || document.scenes.any { scene -> scene.objects.any(::objectSounds) }

    /** Une piste audio compte toujours ; une vidéo compte sauf si elle se déclare muette (`payload.muted`). */
    fun objectSounds(obj: ObjectV3): Boolean {
        if (obj.kind == "audio") return true
        if (!isVideo(obj)) return false
        return obj.payload.bool("muted") != true
    }

    /** Audio, vidéo, sticker animé ou fenêtre de temps. */
    fun objectMoves(obj: ObjectV3): Boolean {
        if (obj.kind == "audio") return true
        if (isVideo(obj)) return true
        if (obj.kind == "sticker" && !obj.payload.string("animation").isNullOrEmpty()) return true
        return hasTimeWindow(obj)
    }

    /** Un média est une vidéo quand son `mediaType` le déclare (`video` ou `video/mp4`). */
    fun isVideo(obj: ObjectV3): Boolean =
        obj.kind == "media" && obj.payload.string("mediaType")?.lowercase()?.startsWith("video") == true

    /**
     * `duration` ne dit pas la même chose selon le porteur : sur un média c'est la longueur du clip
     * (une image affichée dix secondes ne bouge pas), sur texte ou sticker c'est une fenêtre.
     */
    private fun hasTimeWindow(obj: ObjectV3): Boolean {
        obj.timing?.let { timing ->
            if (timing.start != null || timing.end != null) return true
            if (!timing.keyframes.isNullOrEmpty()) return true
        }
        val keys = if (obj.kind == "media") listOf("fadeIn", "fadeOut") else listOf("fadeIn", "fadeOut", "duration")
        return keys.any { (obj.payload.number(it) ?: 0.0) > 0.0 }
    }

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonObject.bool(key: String): Boolean? =
        (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

    private fun JsonObject.number(key: String): Double? =
        (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
}
