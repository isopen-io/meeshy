package me.meeshy.sdk.model.lens

public data class LensCredits(val author: String, val createdAt: String, val updatedAt: String?)

public data class LensWindow(
    val startsAt: String,
    val endsAt: String,
    val countries: List<String>?,
    val communities: List<String>?,
)

public data class LensFallbackTier(val hide: List<String>)

public data class LensFallbacks(val reduced: LensFallbackTier?, val minimal: LensFallbackTier?)

/** Où se pose une couche : un point de l'écran (fractions) ou un point nommé du visage, décalé en largeurs de visage. */
public sealed interface LensAnchor {
    public data class Screen(val x: Double, val y: Double) : LensAnchor
    public data class Face(val point: LensFacePoint, val dx: Double?, val dy: Double?) : LensAnchor
}

public sealed interface LensLayer {
    public val id: String

    public data class Lut(override val id: String, val asset: String, val intensity: Double?) : LensLayer
    public data class Frame(override val id: String, val motif: String, val opacity: Double?) : LensLayer
    public data class Sticker(
        override val id: String,
        val asset: String,
        val anchor: LensAnchor,
        val size: Double,
        val rotation: Double?,
    ) : LensLayer

    /** [text] : le texte par langue du Prisme ; `fr` est toujours présent. */
    public data class Text(
        override val id: String,
        val text: Map<String, String>,
        val font: LensFont,
        val color: String,
        val size: Double,
        val anchor: LensAnchor,
    ) : LensLayer

    public data class Particles(
        override val id: String,
        val preset: LensParticlePreset,
        val density: LensDensity,
        val anchor: LensAnchor?,
    ) : LensLayer
}

public data class LensTrigger(
    val on: LensTriggerEvent,
    val action: LensTriggerAction,
    val target: String,
    val delay: Double?,
)

public data class LensDocument(
    val id: String,
    val name: String,
    /** Le nom dans les langues où il est traduit (le français est [name]). */
    val names: Map<String, String>,
    val credits: LensCredits,
    val surfaces: List<LensSurface>,
    val cost: LensCost,
    val window: LensWindow,
    val layers: List<LensLayer>,
    val triggers: List<LensTrigger>,
    val fallbacks: LensFallbacks?,
) {
    /** Le nom de la lens dans [language], le français ([name]) en repli. */
    public fun nameFor(language: String): String = names[language] ?: name
}

public sealed interface LensParseOutcome {
    /** La lens lue, avec le nombre de couches et de déclencheurs que ce client a ignorés. */
    public data class Ok(val document: LensDocument, val ignoredLayers: Int, val ignoredTriggers: Int) : LensParseOutcome

    /** Le schéma du document est plus récent que celui que ce client connaît : inviter à mettre à jour. */
    public data class UpdateRequired(val schema: Int) : LensParseOutcome

    /** Shader, script, URL, réseau ou 3D : refusé en bloc. Les raisons sont triées. */
    public data class Forbidden(val reasons: List<String>) : LensParseOutcome

    public data object Invalid : LensParseOutcome
}
