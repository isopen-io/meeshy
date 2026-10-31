package me.meeshy.sdk.model.scene.export

/**
 * **LES SONS D'UNE STORY DANS SON EMBALLAGE DE MARQUE** (#13509 ; miroir de `StoryExportBranding.wrap`) : la story démarre après
 * la tenue de l'intro, donc chaque son est retardé de ce décalage ; et sa piste s'éteint sur le chevauchement de la carte de fin
 * (rampe 1 → 0), comme l'image se fond vers elle. Pure : le plan de marque et la durée de la story sont REÇUS.
 */
public object StoryExportBrandedSounds {

    public fun of(sounds: List<StoryExportSound>, branding: StoryExportBrandingPlan, storyDurationMillis: Long, withOutro: Boolean): List<StoryExportSound> {
        val delay = branding.storyStartMillis
        val from = branding.outroStartMillis(storyDurationMillis)
        val to = branding.storyEndMillis(storyDurationMillis)
        return sounds.map { delayed(it, delay) }.map { if (withOutro) fadedOut(it, from, to) else it }
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
