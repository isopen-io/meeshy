package me.meeshy.sdk.model.composer.sound

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryObjectPlacement
import me.meeshy.sdk.model.composer.SceneObjectCaps

/** Ce qu'un son est sur la diapo — miroir de `ComposerAudioRole` (iOS) : l'ambiance, ou un objet posé sur la scène. */
enum class ComposerAudioRole { BACKGROUND, FOREGROUND }

/**
 * Le rôle, le niveau et la langue d'un son de la feuille « Son de la story » — miroir de `ComposerAudioPlacement`,
 * `ComposerSoundPromotion` et `ComposerSoundDisposition` (iOS). Une diapo a UNE ambiance : un nouveau fond relègue
 * l'ancien selon [ComposerSoundPlacement.supersedingBackground]. Un son de scène ne porte AUCUN drapeau de fond (`null`,
 * comme tout l'existant) et se pose là où rien ne l'est déjà.
 */
object ComposerSoundRoles {

    fun role(track: StoryAudioPlayerObject): ComposerAudioRole =
        if (track.isBackground == true) ComposerAudioRole.BACKGROUND else ComposerAudioRole.FOREGROUND

    /** Sans ambiance, le nouveau son la devient ; sinon il se pose sur la scène. */
    fun automatic(audios: List<StoryAudioPlayerObject>): ComposerAudioRole =
        if (ComposerSoundPlacement.background(audios) == null) ComposerAudioRole.BACKGROUND else ComposerAudioRole.FOREGROUND

    /** Pose une piste captée ou importée dans [role] ; refusée au plafond des sons de la scène. */
    fun place(
        audios: List<StoryAudioPlayerObject>,
        track: StoryAudioPlayerObject,
        role: ComposerAudioRole,
        landing: StoryObjectPlacement.Point,
    ): SoundPlacement {
        val kept = if (role == ComposerAudioRole.BACKGROUND) ComposerSoundPlacement.supersedingBackground(audios) else audios
        if (kept.size >= SceneObjectCaps.AUDIO) return SoundPlacement.Refused
        return SoundPlacement.Placed(kept + track.inRole(role, landing))
    }

    /** Change le rôle de la piste [id] ; même instance quand rien ne change. */
    fun withRole(
        audios: List<StoryAudioPlayerObject>,
        id: String,
        role: ComposerAudioRole,
        landing: StoryObjectPlacement.Point,
    ): List<StoryAudioPlayerObject> {
        val track = audios.firstOrNull { it.id == id } ?: return audios
        if (role(track) == role) return audios
        val base = if (role == ComposerAudioRole.BACKGROUND) ComposerSoundPlacement.supersedingBackground(audios, except = id) else audios
        return base.map { if (it.id == id) it.inRole(role, landing) else it }
    }

    /** Le niveau d'une piste, dans `0..1` : le régler lève un muet (le mémento n'a plus d'objet). */
    fun withVolume(audios: List<StoryAudioPlayerObject>, id: String, volume: Float): List<StoryAudioPlayerObject> =
        update(audios, id) { it.copy(volume = volume.takeIf(Float::isFinite)?.coerceIn(0f, 1f) ?: 0f, mutedVolumeMemento = null) }

    /** La langue parlée par la piste, en code court : c'est elle que le lecteur descend par le Prisme. */
    fun withLanguage(audios: List<StoryAudioPlayerObject>, id: String, language: String): List<StoryAudioPlayerObject> {
        val code = SoundLanguageChoices.normalized(language) ?: return audios
        return update(audios, id) { it.copy(sourceLanguage = code) }
    }

    private fun update(
        audios: List<StoryAudioPlayerObject>,
        id: String,
        transform: (StoryAudioPlayerObject) -> StoryAudioPlayerObject,
    ): List<StoryAudioPlayerObject> =
        if (audios.none { it.id == id }) audios else audios.map { if (it.id == id) transform(it) else it }

    private fun StoryAudioPlayerObject.inRole(role: ComposerAudioRole, landing: StoryObjectPlacement.Point): StoryAudioPlayerObject =
        when (role) {
            ComposerAudioRole.BACKGROUND -> copy(isBackground = true)
            ComposerAudioRole.FOREGROUND -> copy(isBackground = null, x = landing.x, y = landing.y)
        }
}
