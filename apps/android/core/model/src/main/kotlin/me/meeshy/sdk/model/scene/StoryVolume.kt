package me.meeshy.sdk.model.scene

/**
 * Constantes de volume partagées par toute la chaîne story — miroir de `StoryVolume`
 * (`MeeshyUI/Story/Timeline/Logic/StoryVolumeResolver.swift`).
 */
object StoryVolume {
    /**
     * Plafond de gain. `1.0` = niveau nominal du fichier ; au-delà l'auteur amplifie
     * volontairement. Égal au `max(2)` du schéma Zod de la passerelle
     * (`services/gateway/src/routes/posts/types.ts`) : une divergence ferait rejeter la
     * publication en 400.
     */
    const val MAX_GAIN: Float = 2.0f

    /** Facteur d'affichage appliqué à la piste d'une vidéo tant qu'un audio de fond joue. Jamais persisté. */
    const val DUCKING_FACTOR: Float = 0.25f

    /** Borne dans `0..MAX_GAIN` ; une valeur non finie vaut silence. */
    fun clamp(value: Float): Float = if (value.isNaN()) 0f else value.coerceIn(0f, MAX_GAIN)
}
