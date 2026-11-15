package me.meeshy.sdk.model.scene

import java.util.Locale

/** Ce que la couche de fond peint : un aplat, un dégradé, une image ou une vidéo (iOS `StoryBackgroundLayer.Kind`). */
sealed interface SceneBackgroundKind {
    /** [argb] au format `0xAARRGGBB`. */
    data class SolidColor(val argb: Long) : SceneBackgroundKind
    data class Gradient(val argb: List<Long>, val direction: String = "vertical") : SceneBackgroundKind
    data class Image(val mediaId: String) : SceneBackgroundKind
    data class Video(val mediaId: String, val looping: Boolean = true) : SceneBackgroundKind
}

/**
 * L'identité visuelle d'un fond : deux fonds de même identité se peignent pareil, la couche en place est gardée. Les
 * paramètres dynamiques (mute, volume) n'en font pas partie. La VALEUR d'une couleur ou d'un dégradé, si : un changement de
 * pastille doit reconstruire la couche (sa reconstruction est synchrone, aucun flash).
 */
object SceneBackgroundIdentity {
    fun of(kind: SceneBackgroundKind): String = when (kind) {
        is SceneBackgroundKind.SolidColor -> "color:${colorKey(kind.argb)}"
        is SceneBackgroundKind.Gradient -> "gradient:${kind.argb.joinToString("|", transform = { colorKey(it) })}:${kind.direction}"
        is SceneBackgroundKind.Image -> "image:${kind.mediaId}"
        is SceneBackgroundKind.Video -> "video:${kind.mediaId}:${kind.looping}"
    }

    /** La couche en place peut rester : même identité. */
    fun keepsLayer(current: SceneBackgroundKind?, next: SceneBackgroundKind): Boolean =
        current != null && of(current) == of(next)

    /** Cette identité mène-t-elle quelque part ? Une identité non résoluble ne remplace pas un fond qui se peint. */
    fun canResolve(kind: SceneBackgroundKind, resolver: (String) -> String?): Boolean = when (kind) {
        is SceneBackgroundKind.SolidColor, is SceneBackgroundKind.Gradient -> true
        is SceneBackgroundKind.Image -> resolves(kind.mediaId, resolver)
        is SceneBackgroundKind.Video -> resolves(kind.mediaId, resolver)
    }

    /** Le fichier local du composer (`file://`) prime sur l'adresse distante : hors ligne, c'est lui qui se lit. */
    fun resolvedUrl(candidate: String, resolver: (String) -> String?): String? =
        directUrlIfAny(candidate) ?: resolver(candidate)?.takeIf { it.isNotEmpty() }

    fun directUrlIfAny(candidate: String): String? = candidate.takeIf { isAddressable(it) }

    /** Une adresse porte toujours une barre ; un identifiant de média (ObjectId) jamais. */
    fun isAddressable(candidate: String): Boolean = candidate.isNotEmpty() &&
        (candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("file://") || candidate.contains('/'))

    fun isLocal(candidate: String): Boolean = candidate.startsWith("file://")

    private fun resolves(candidate: String, resolver: (String) -> String?): Boolean =
        directUrlIfAny(candidate) != null || !resolver(candidate).isNullOrEmpty()

    private fun colorKey(argb: Long): String {
        val a = (argb shr 24) and 0xFF
        val r = (argb shr 16) and 0xFF
        val g = (argb shr 8) and 0xFF
        val b = argb and 0xFF
        return listOf(r, g, b, a).joinToString(",") { String.format(Locale.ROOT, "%.3f", it / 255.0) }
    }
}
