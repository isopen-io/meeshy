package me.meeshy.sdk.model.scene

/** Les surfaces de lecture d'un document de scène — miroir de `ScenePlayerMode` (iOS). */
enum class ScenePlayerMode {
    /** Le viewer de stories : joue une fois, porte sa chrome. */
    READER,

    /** L'aperçu (détail de post) : son actif par défaut avec bouton muet. */
    PREVIEW,

    /** La carte du fil : boucle muette, muet VERROUILLÉ. */
    CARD,

    /** Le réel plein écran : boucle AVEC le son, porte la chrome de progression. */
    REEL,
}

/**
 * La règle de chaque mode — la seule chose que le lecteur décide de lui-même.
 *
 * [startsPaused] ne dépend pas du mode : tous naissent en pause, la lecture démarre par la commande de l'hôte.
 * [isMuted] et [locksMute] se lisent ENSEMBLE : le premier est ce que le mode PROPOSE, le second dit si l'hôte
 * peut seulement le demander. Seule la carte du fil verrouille.
 */
data class ScenePlayerConfig(
    val startsPaused: Boolean,
    val isMuted: Boolean,
    val locksMute: Boolean,
    val loops: Boolean,
    val showsChrome: Boolean,
) {
    companion object {
        fun of(mode: ScenePlayerMode): ScenePlayerConfig = ScenePlayerConfig(
            startsPaused = true,
            isMuted = mode == ScenePlayerMode.CARD,
            locksMute = mode == ScenePlayerMode.CARD,
            loops = mode == ScenePlayerMode.CARD || mode == ScenePlayerMode.REEL,
            showsChrome = mode == ScenePlayerMode.READER || mode == ScenePlayerMode.REEL,
        )
    }

    /** Le muet effectif : un mode verrouillé ignore la demande de l'hôte, sinon la demande l'emporte. */
    fun effectiveMute(requested: Boolean?): Boolean = if (locksMute) isMuted else requested ?: isMuted
}
