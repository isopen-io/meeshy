package me.meeshy.sdk.model.lens

/*
 * Miroir Kotlin du vocabulaire MeeshyLens v1. Source de vérité : packages/shared/types/lens-format.ts
 * (miroirs : iOS packages/MeeshySDK/.../Lens, web). Rien n'est inventé ici : LensFormatGeneratedFreshnessTest
 * relit le fichier TypeScript et échoue dès que ces listes, bornes ou motifs dérivent.
 */

/** Là où une lens se peint : la capture, ou le direct (l'appel). */
public enum class LensSurface(public val raw: String) {
    CAPTURE("capture"), LIVE("live");

    public companion object {
        public fun fromRaw(raw: String): LensSurface? = entries.firstOrNull { it.raw == raw }
    }
}

/** Le coût de rendu déclaré par la lens, pour la dégradation par palier. */
public enum class LensCost(public val raw: String) {
    LIGHT("light"), STANDARD("standard"), RICH("rich");

    public companion object {
        public fun fromRaw(raw: String): LensCost? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les points nommés du visage ; chaque plateforme les fait correspondre à ses repères. */
public enum class LensFacePoint(public val raw: String) {
    TOP_OF_HEAD("top-of-head"), FOREHEAD("forehead"), LEFT_EYEBROW("left-eyebrow"), RIGHT_EYEBROW("right-eyebrow"),
    LEFT_EYE("left-eye"), RIGHT_EYE("right-eye"), NOSE_TIP("nose-tip"), MOUTH("mouth"), CHIN("chin"),
    LEFT_CHEEK("left-cheek"), RIGHT_CHEEK("right-cheek"), LEFT_EAR("left-ear"), RIGHT_EAR("right-ear");

    public companion object {
        public fun fromRaw(raw: String): LensFacePoint? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les préréglages de particules. */
public enum class LensParticlePreset(public val raw: String) {
    SPARKLES("sparkles"), CONFETTI("confetti"), HEARTS("hearts"), STARS("stars"),
    SNOW("snow"), PETALS("petals"), BUBBLES("bubbles"), FIREFLIES("fireflies");

    public companion object {
        public fun fromRaw(raw: String): LensParticlePreset? = entries.firstOrNull { it.raw == raw }
    }
}

/** La densité des particules. */
public enum class LensDensity(public val raw: String) {
    LOW("low"), MID("mid"), HIGH("high");

    public companion object {
        public fun fromRaw(raw: String): LensDensity? = entries.firstOrNull { it.raw == raw }
    }
}

/** Ce qui déclenche une action. */
public enum class LensTriggerEvent(public val raw: String) {
    ON_TAP("onTap"), ON_SMILE("onSmile"), ON_MOUTH_OPEN("onMouthOpen"), ON_BROW_RAISE("onBrowRaise"),
    ON_BLINK("onBlink"), ON_TIME("onTime"), ON_SPEAKING("onSpeaking");

    public companion object {
        public fun fromRaw(raw: String): LensTriggerEvent? = entries.firstOrNull { it.raw == raw }
    }
}

/** Ce qu'un déclencheur fait à sa couche cible. */
public enum class LensTriggerAction(public val raw: String) {
    SHOW("show"), HIDE("hide"), BURST("burst"), PLAY("play"), STOP("stop");

    public companion object {
        public fun fromRaw(raw: String): LensTriggerAction? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les polices des cadres : une liste fermée, jamais téléchargée par une lens. */
public enum class LensFont(public val raw: String) {
    MANROPE("Manrope"), CINZEL("Cinzel"), CINZEL_DECORATIVE("Cinzel Decorative"),
    CORMORANT_GARAMOND("Cormorant Garamond"), FRAUNCES("Fraunces"), CAVEAT("Caveat");

    public companion object {
        public fun fromRaw(raw: String): LensFont? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les bornes, listes et motifs du contrat v1. */
public object LensVocabulary {
    public const val SCHEMA_VERSION: Int = 1
    public const val MAX_LAYERS: Int = 12
    public const val MAX_DECLARED_LAYERS: Int = 32
    public const val MAX_TRIGGERS: Int = 8
    public const val MAX_DECLARED_TRIGGERS: Int = 24
    public const val MAX_NAME_LENGTH: Int = 80
    public const val MAX_TEXT_LENGTH: Int = 80
    public const val MAX_AUTHOR_LENGTH: Int = 80
    public const val MAX_COUNTRIES: Int = 50
    public const val MAX_COMMUNITIES: Int = 20
    public const val MAX_HIDDEN: Int = 12
    public const val MAX_DEPTH: Int = 16
    public const val MAX_ID_LENGTH: Int = 24

    /** Les sept langues du Prisme ; le français est la langue de repli. */
    public val languages: List<String> = listOf("fr", "en", "es", "pt", "de", "it", "ar")
    public val layerKinds: List<String> = listOf("lut", "frame", "sticker", "text", "particles")
    public val anchorTypes: List<String> = listOf("screen", "face")
    internal val forbiddenKeys: List<String> =
        listOf("shader", "shaders", "script", "scripts", "url", "urls", "href", "endpoint", "network", "model3d", "mesh", "scene3d")
    internal val forbiddenLayerKinds: List<String> = listOf("shader", "script", "model3d", "mesh", "scene3d", "3d", "network")
    internal val bareUrlSchemes: List<String> = listOf("data:", "javascript:", "blob:", "file:")

    internal val fractionRange: ClosedFloatingPointRange<Double> = 0.0..1.0
    internal val offsetRange: ClosedFloatingPointRange<Double> = -1.0..1.0
    internal val stickerSizeRange: ClosedFloatingPointRange<Double> = 0.02..2.0
    internal val rotationRange: ClosedFloatingPointRange<Double> = -180.0..180.0
    internal val textSizeRange: ClosedFloatingPointRange<Double> = 0.02..0.3
    internal val delayRange: ClosedFloatingPointRange<Double> = 0.0..60.0

    /** Motifs entiers (`Regex.matches`) : sans ancres, un saut de ligne final ne passe pas. */
    internal object Patterns {
        val id: Regex = Regex("[a-z0-9](?:[a-z0-9-]*[a-z0-9])?")
        val asset: Regex = Regex("[0-9a-f]{16}\\.(?:webp|png|json)")
        val motif: Regex = Regex("[a-z-]+\\.[a-z0-9-]+")
        val color: Regex = Regex("#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?")
        val country: Regex = Regex("[A-Z]{2}")
        val community: Regex = Regex("[0-9a-f]{24}")
    }
}
