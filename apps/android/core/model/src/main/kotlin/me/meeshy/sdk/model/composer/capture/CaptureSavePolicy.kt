package me.meeshy.sdk.model.composer.capture

/** Quand la version avec effets et cadre rejoint la galerie. */
enum class CaptureRenderedSaveMode(val storageValue: String) {
    /** À la demande : la flèche vers le bas de la retouche. */
    MANUAL("manual"),

    /** À la validation de la retouche, sans geste de plus. */
    AUTOMATIC("automatic"),
    ;

    companion object {
        fun fromStorage(value: String?): CaptureRenderedSaveMode? = entries.firstOrNull { it.storageValue == value }
    }
}

/**
 * La politique d'enregistrement de la capture (miroir de `CaptureSavePolicy` iOS, #9684) :
 * l'ORIGINAL ne rejoint plus la galerie par défaut ; la version rendue s'y enregistre à
 * la demande. Réglages › Médias est le seul endroit où elle se règle.
 */
data class CaptureSavePolicy(
    val savesOriginal: Boolean = false,
    val renderedMode: CaptureRenderedSaveMode = CaptureRenderedSaveMode.MANUAL,
) {
    /** « Terminé » n'enregistre le rendu qu'en mode automatique, et jamais une prise déjà enregistrée. */
    fun savesRenderOnFinish(alreadySaved: Boolean): Boolean =
        renderedMode == CaptureRenderedSaveMode.AUTOMATIC && !alreadySaved

    companion object {
        val Standard: CaptureSavePolicy = CaptureSavePolicy()

        fun fromStorage(savesOriginal: Boolean?, renderedMode: String?): CaptureSavePolicy = CaptureSavePolicy(
            savesOriginal = savesOriginal ?: Standard.savesOriginal,
            renderedMode = CaptureRenderedSaveMode.fromStorage(renderedMode) ?: Standard.renderedMode,
        )
    }
}
