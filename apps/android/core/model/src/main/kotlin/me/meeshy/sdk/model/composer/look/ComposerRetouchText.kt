package me.meeshy.sdk.model.composer.look

import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTextStyle

/**
 * **LE TEXTE DE LA RETOUCHE** (#12591, #12651) — miroir de `ComposerRetouchTextRule` + `ComposerRetouchTextBoard`
 * (iOS) : une planche de textes ([StoryTextObject], le modèle du composer) posée sur la prise, cuite au-dessus
 * du cadre. L'outil montré sans texte en ouvre un neuf en saisie ; toucher la scène vide en pose un (jusqu'à
 * cinq) ; toucher le fond pendant la saisie la termine ; une coquille restée vide disparaît.
 */
public data class ComposerRetouchTextBoard(
    val texts: List<StoryTextObject> = emptyList(),
    val typingId: String? = null,
) {
    /** Rien d'écrit : la prise part sans calque de texte. */
    val isEmpty: Boolean get() = texts.none { it.text.isNotBlank() }

    /** Les textes qui se cuisent : ceux qui portent un mot. */
    val written: List<StoryTextObject> get() = texts.filter { it.text.isNotBlank() }

    public val typing: StoryTextObject? get() = texts.firstOrNull { it.id == typingId }

    /** L'outil Texte est montré : sans texte, un neuf s'ouvre en saisie ; sinon les textes deviennent manipulables. */
    public fun begin(newId: String): ComposerRetouchTextBoard = if (texts.isEmpty()) addingAndTyping(newId) else this

    /** « Ajouter un texte » : la saisie en cours se termine, un texte neuf s'ouvre, sauf au plafond. */
    public fun addingText(newId: String): ComposerRetouchTextBoard {
        val ended = endingTyping()
        return if (ended.texts.size < CAP) ended.addingAndTyping(newId) else ended
    }

    public fun tappingBackground(newId: String): ComposerRetouchTextBoard = when {
        typingId != null -> endingTyping()
        texts.size < CAP -> addingAndTyping(newId)
        else -> this
    }

    /** Toucher un texte le rouvre en saisie. */
    public fun tapping(id: String): ComposerRetouchTextBoard =
        if (texts.none { it.id == id }) this else endingTyping().copy(typingId = id)

    public fun writing(id: String, text: String): ComposerRetouchTextBoard = updating(id) { it.copy(text = text) }

    /** La saisie se termine ; une coquille restée vide disparaît. */
    public fun endingTyping(): ComposerRetouchTextBoard {
        val id = typingId ?: return this
        return copy(texts = texts.filterNot { it.id == id && it.text.isBlank() }, typingId = null)
    }

    /** Glisser déplace (coordonnées normalisées, gardées sur la scène) ; pincer règle l'échelle ; tourner, l'angle. */
    public fun moving(id: String, dx: Double, dy: Double): ComposerRetouchTextBoard =
        updating(id) { it.copy(x = (it.x + dx).coerceIn(0.0, 1.0), y = (it.y + dy).coerceIn(0.0, 1.0)) }

    public fun transforming(id: String, zoom: Double, degrees: Double): ComposerRetouchTextBoard =
        updating(id) { it.copy(scale = min(MAX_SCALE, max(MIN_SCALE, it.scale * zoom)), rotation = it.rotation + degrees) }

    public fun styling(id: String, style: StoryTextStyle): ComposerRetouchTextBoard = updating(id) { it.copy(textStyle = style.name.lowercase()) }

    public fun coloring(id: String, hex: String): ComposerRetouchTextBoard = updating(id) { it.copy(textColor = hex) }

    public fun aligning(id: String, align: String): ComposerRetouchTextBoard = updating(id) { it.copy(textAlign = align) }

    /** Ce qui se VOIT des textes, champ par champ : l'empreinte change dès qu'un texte change. */
    val fingerprint: String
        get() = written.joinToString("|") { listOf(it.text, it.x, it.y, it.scale, it.rotation, it.fontSize, it.textStyle, it.textColor, it.textAlign).joinToString(",") }

    private fun addingAndTyping(id: String): ComposerRetouchTextBoard =
        copy(texts = texts + fresh(id, texts.size), typingId = id)

    private fun updating(id: String, change: (StoryTextObject) -> StoryTextObject): ComposerRetouchTextBoard =
        copy(texts = texts.map { if (it.id == id) change(it) else it })

    public companion object {
        /** Le plafond du composer : cinq textes. */
        public const val CAP: Int = 5
        public const val MIN_SCALE: Double = 0.3
        public const val MAX_SCALE: Double = 4.0

        /** Les valeurs du composer pour un texte neuf : 96 / classique / blanc / centré, au milieu de la scène. */
        public const val DEFAULT_FONT_SIZE: Double = 96.0
        public const val DEFAULT_COLOR: String = "#FFFFFF"
        public const val DEFAULT_ALIGN: String = "center"

        /** Les couleurs du composer, du blanc au noir. */
        public val PALETTE: List<String> = listOf("#FFFFFF", "#000000", "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#AF52DE")

        public val ALIGNMENTS: List<String> = listOf("left", "center", "right")

        public fun fresh(id: String, index: Int): StoryTextObject = StoryTextObject(
            id = id,
            x = 0.5,
            y = 0.5 + 0.08 * (index % 3),
            zIndex = index,
            fontSize = DEFAULT_FONT_SIZE,
            textStyle = StoryTextStyle.CLASSIC.name.lowercase(),
            textColor = DEFAULT_COLOR,
            textAlign = DEFAULT_ALIGN,
        )
    }
}
