package me.meeshy.sdk.model.scene.export

/**
 * **LES SONS D'UNE STORY DANS SON EMBALLAGE DE MARQUE** (#13509 ; miroir de `StoryExportBranding.wrap`) : la story démarre après
 * la tenue de l'intro, donc chaque son est retardé de ce décalage ; il monte de 0 pendant la queue du jingle d'ouverture
 * ([StoryExportBrandingPlan.storyFadeIn]) et il est éteint quand le jingle de fermeture entre
 * ([StoryExportBrandingPlan.storyFadeOut]) — les jingles s'entendent en entier, jamais sous la story (miroir de
 * `StoryExportJingleMix` iOS). Pure : le plan de marque et la durée de la story sont REÇUS.
 */
public object StoryExportBrandedSounds {

    public fun of(sounds: List<StoryExportSound>, branding: StoryExportBrandingPlan, storyDurationMillis: Long, withOutro: Boolean): List<StoryExportSound> {
        val delay = branding.storyStartMillis
        val rise = branding.storyFadeIn(storyDurationMillis)
        val fall = branding.storyFadeOut(storyDurationMillis)
        return sounds.map { delayed(it, delay) }
            .map { sound -> rise?.let { fadedIn(sound, it.startMillis, it.endMillis) } ?: sound }
            .map { if (withOutro) fadedOut(it, fall.startMillis, fall.endMillis) else it }
    }

    private fun fadedIn(sound: StoryExportSound, from: Long, to: Long): StoryExportSound {
        if (sound.startMillis >= to || sound.endMillis <= from) return sound
        val level = StoryExportVolumeCurve.gainAt(sound.envelope, sound.gain, to)
        val kept = sound.envelope.filter { it.atMillis > to }
        return sound.copy(envelope = listOf(StoryExportVolumePoint(from, 0f), StoryExportVolumePoint(to, level)) + kept)
    }

    private fun delayed(sound: StoryExportSound, by: Long): StoryExportSound = sound.copy(
        startMillis = sound.startMillis + by,
        endMillis = sound.endMillis + by,
        envelope = sound.envelope.map { it.copy(atMillis = it.atMillis + by) },
    )

    private fun fadedOut(sound: StoryExportSound, from: Long, to: Long): StoryExportSound {
        if (sound.endMillis <= from) return sound
        val kept = sound.envelope.filter { it.atMillis < from }
        val level = StoryExportVolumeCurve.gainAt(sound.envelope, sound.gain, from)
        val ramp = listOf(StoryExportVolumePoint(from, level), StoryExportVolumePoint(maxOf(to, from), 0f))
        return sound.copy(envelope = kept + ramp)
    }
}
