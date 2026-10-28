package me.meeshy.sdk.model.scene

/**
 * La forme de la boîte de cadre d'un texte (iOS `StoryTextFrameShape`). Chaque forme porte son nom de fil : une
 * forme inconnue d'un client plus récent se lit « arrondi », comme `parsedFrameShape`.
 */
enum class StoryTextFrameShape(val wire: String) {
    NONE("none"),
    ROUNDED("rounded"),
    PILL("pill"),
    RECTANGLE("rectangle"),
    DIAMOND("diamond"),
    CLOUD("cloud"),
    SPEECH("speech"),
    ;

    companion object {
        /** Les formes offertes au choix, dans l'ordre d'iOS (`StoryTextFrameShape.allCases`, « Aucun » en tête). */
        val offered: List<StoryTextFrameShape> = entries.toList()

        fun fromWire(raw: String?): StoryTextFrameShape = entries.firstOrNull { it.wire == raw } ?: ROUNDED
    }
}

/**
 * Le cadre d'un texte : sa forme, sa marge (multiplicateur de la marge automatique, 0…3) et son liseré. Les
 * mêmes bornes, les mêmes défauts et le même encodage qu'iOS (`StoryTextObject.frameShape / framePaddingScale /
 * frameBorderWidth / frameBorderColor`) : la boîte existe quand une forme est choisie ET qu'il y a quelque chose à
 * voir — un fond ou un liseré (`hasFrameBox`).
 */
data class StoryTextFrame(
    val shape: StoryTextFrameShape = StoryTextFrameShape.ROUNDED,
    val paddingScale: Float = DEFAULT_PADDING,
    val borderWidth: Float = 0f,
    val borderColor: String? = null,
) {
    val resolvedPaddingScale: Float get() = paddingScale.takeIf { it.isFinite() }?.coerceIn(0f, MAX_PADDING) ?: DEFAULT_PADDING

    val borderIsVisible: Boolean get() = borderWidth > 0f && borderColor != null

    fun hasBox(background: StoryTextBackground): Boolean =
        shape != StoryTextFrameShape.NONE && (background != StoryTextBackground.None || borderWidth > 0f)

    /**
     * Choisir une forme sur un texte qui n'a rien à montrer (ni fond ni liseré) pose un liseré discret : sans lui, les
     * six formes se choisiraient sans qu'aucune ne se voie. Un texte qui a un fond, ou dont l'auteur a choisi
     * « Aucun », n'est pas touché (iOS `initializeFrameDefaultsIfNeutral`).
     */
    fun shaped(shape: StoryTextFrameShape, background: StoryTextBackground): StoryTextFrame =
        copy(shape = shape).primed(background)

    /**
     * À l'ouverture de la section Cadre comme au choix d'une forme (iOS `initializeFrameDefaultsIfNeutral`) : un texte
     * qui n'a rien à montrer reçoit le liseré discret ; un fond, un liseré déjà posé ou « Aucun » le laissent intact.
     */
    fun primed(background: StoryTextBackground): StoryTextFrame {
        val neutral = shape != StoryTextFrameShape.NONE && background == StoryTextBackground.None && borderWidth <= 0f
        return if (neutral) copy(borderWidth = DEFAULT_BORDER_WIDTH, borderColor = DEFAULT_BORDER_COLOR) else this
    }

    fun padded(scale: Float): StoryTextFrame = copy(paddingScale = scale.coerceIn(0f, MAX_PADDING))

    /** Liseré à 0 ⇒ aucun trait ; la couleur est conservée, et posée en blanc si elle manquait. */
    fun bordered(width: Float): StoryTextFrame =
        copy(borderWidth = width.coerceIn(0f, MAX_BORDER), borderColor = borderColor ?: DEFAULT_BORDER_COLOR)

    /** Choisir une couleur sur un liseré à 0 le réveille à l'épaisseur par défaut. */
    fun colored(hex: String): StoryTextFrame =
        copy(borderColor = hex, borderWidth = borderWidth.takeIf { it > 0f } ?: DEFAULT_BORDER_WIDTH)

    companion object {
        const val DEFAULT_PADDING: Float = 1f
        const val MAX_PADDING: Float = 3f
        const val MAX_BORDER: Float = 12f
        const val DEFAULT_BORDER_WIDTH: Float = 2f
        const val DEFAULT_BORDER_COLOR: String = "FFFFFF"
    }
}
