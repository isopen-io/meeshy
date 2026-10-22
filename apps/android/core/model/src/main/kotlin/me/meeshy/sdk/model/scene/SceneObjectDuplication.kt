package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.composer.SceneObjectCaps
import kotlin.math.min

/**
 * Dupliquer un objet (miroir de `duplicateElement`) : texte, média et son se dupliquent ;
 * un texte verrouillé (pastille de republication) jamais ; le plafond s'applique (texte : cinq ; média et son : dix en tout).
 * Le clone est TOUJOURS de premier plan (un 2e fond violerait « au plus un fond par slide » et
 * serait invisible) et décalé pour qu'on voie que la copie a eu lieu.
 */
public object SceneObjectDuplication {
    private const val TEXT_DX = 20.0 / 1080.0
    private const val TEXT_DY = 20.0 / 1920.0
    private const val MEDIA_OFFSET = 0.05

    /** Les listes avec le clone de [id] sous l'identifiant [newId], ou `null` si le geste est refusé. */
    public fun duplicate(lists: SceneLists, id: String, newId: String): SceneLists? {
        val source = lists.sceneObject(id) ?: return null
        return when (source) {
            is MeeshySceneObject.Text -> {
                if (source.value.isLocked == true) return null
                if (!SceneObjectCaps.canAdd(SceneObjectCaps.Entry.TEXT, lists)) return null
                val clone = source.value.copy(
                    id = newId,
                    x = min(1.0, source.value.x + TEXT_DX),
                    y = min(1.0, source.value.y + TEXT_DY),
                )
                lists.copy(texts = lists.texts + clone)
            }
            is MeeshySceneObject.Media -> {
                if (!SceneObjectCaps.canAddMedia(lists)) return null
                val clone = source.value.copy(
                    id = newId,
                    isBackground = false,
                    x = min(1.0, source.value.x + MEDIA_OFFSET),
                    y = min(1.0, source.value.y + MEDIA_OFFSET),
                )
                lists.copy(medias = lists.medias + clone)
            }
            is MeeshySceneObject.Audio -> {
                if (!SceneObjectCaps.canAddMedia(lists)) return null
                val clone = source.value.copy(
                    id = newId,
                    isBackground = false,
                    x = min(1.0, source.value.x + MEDIA_OFFSET),
                    y = min(1.0, source.value.y + MEDIA_OFFSET),
                )
                lists.copy(audios = lists.audios + clone)
            }
            is MeeshySceneObject.Sticker, is MeeshySceneObject.Place -> null
        }
    }
}
