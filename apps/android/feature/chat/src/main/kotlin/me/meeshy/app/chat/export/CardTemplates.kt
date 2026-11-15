package me.meeshy.app.chat.export

import kotlin.math.floor

/**
 * LES TEMPLATES D'UNE CARTE D'EXPORT — miroir de `MessageCardTemplates.swift` (iOS) et de
 * `message-card-templates.ts` (web) : 14 palettes × 8 typographies × 7 liaisons = 784 templates,
 * chacun nommé par un identifiant STABLE `palette.typographie.liaison`, les MÊMES partout (le
 * compteur d'usage et le format par défaut les retiennent : on n'en renomme aucun).
 */
data class CardColor(val red: Double, val green: Double, val blue: Double, val alpha: Double = 1.0) {

    /** Couleur ARGB packée, l'opacité multipliée par [alphaFactor]. */
    fun toArgb(alphaFactor: Double = 1.0): Int {
        fun channel(value: Double) = (value.coerceIn(0.0, 1.0) * 255).let { floor(it + 0.5).toInt() }
        return (channel(alpha * alphaFactor) shl 24) or (channel(red) shl 16) or (channel(green) shl 8) or channel(blue)
    }

    companion object {
        /** `#RRGGBB` — une valeur illisible rend le noir, jamais une exception. */
        fun hex(value: String): CardColor {
            val rgb = value.removePrefix("#").toLongOrNull(16) ?: 0L
            return CardColor(((rgb shr 16) and 0xFF) / 255.0, ((rgb shr 8) and 0xFF) / 255.0, (rgb and 0xFF) / 255.0)
        }

        fun rgba(red: Int, green: Int, blue: Int, alpha: Double) = CardColor(red / 255.0, green / 255.0, blue / 255.0, alpha)

        val Transparent = rgba(0, 0, 0, 0.0)
    }
}

/** Les polices de story d'iOS (`StoryTextStyle`), portées sur les familles du système Android. */
enum class StoryFace { BUBBLE, ELEGANT, BRUSH, NOTE, POSTER, FUTURISTIC, RETRO, TAG }

sealed interface CardFace {
    /** La pile système : graisse CSS (400, 700…) et italique. */
    data class Native(val weight: Int, val italic: Boolean) : CardFace
    data class Story(val style: StoryFace) : CardFace

    companion object {
        fun system(weight: Int): CardFace = Native(weight, italic = false)
    }
}

/** Une police à un corps donné — arrondi au pixel, comme la chaîne `font` du canvas web. */
data class CardFont(val face: CardFace, val size: Double) {
    constructor(face: CardFace, rawSize: Int) : this(face, rawSize.toDouble())
}

data class GradientStop(val offset: Double, val color: CardColor)

enum class CardTone { DARK, LIGHT }

data class CardPalette(
    /** Un nom PROPRE, identique dans les sept langues. */
    val name: String,
    val background: List<GradientStop>,
    val glow: CardColor?,
    val replyInk: CardColor,
    val quoteInk: CardColor,
    val authorInk: CardColor,
    val accent: CardColor,
    val quotePanel: CardColor,
    val replyPanel: CardColor,
    val watermarkInk: CardColor,
    val watermarkAlpha: Double,
) {
    /** Une palette sombre s'écrit en blanc ; une claire, à l'encre. */
    val tone: CardTone get() = if (replyInk == CardColor.hex("#FFFFFF")) CardTone.DARK else CardTone.LIGHT
}

data class CardTypeface(val replyFace: CardFace, val quoteFace: CardFace, val replyScale: Double)

enum class CardPaletteId(val key: String) {
    AURORE("aurore"), MINUIT("minuit"), LAGON("lagon"), BRAISE("braise"), FORET("foret"), VELOURS("velours"),
    ARDOISE("ardoise"), EDITORIAL("editorial"), MANUSCRIT("manuscrit"), NEIGE("neige"), PECHE("peche"),
    MENTHE("menthe"), CITRON("citron"), LAVANDE("lavande");

    val palette: CardPalette get() = CardPalettes.of(this)
}

enum class CardTypefaceId(val key: String) {
    ROND("rond"), DIDONE("didone"), PLUME("plume"), AFFICHE("affiche"), FUTUR("futur"), MACHINE("machine"),
    MARQUEUR("marqueur"), SYSTEME("systeme");

    val typeface: CardTypeface
        get() = when (this) {
            ROND -> CardTypeface(CardFace.Story(StoryFace.BUBBLE), CardFace.Native(400, true), 1.0)
            DIDONE -> CardTypeface(CardFace.Story(StoryFace.ELEGANT), CardFace.Story(StoryFace.ELEGANT), 1.0)
            PLUME -> CardTypeface(CardFace.Story(StoryFace.BRUSH), CardFace.Story(StoryFace.NOTE), 1.08)
            AFFICHE -> CardTypeface(CardFace.Story(StoryFace.POSTER), CardFace.system(500), 1.0)
            FUTUR -> CardTypeface(CardFace.Story(StoryFace.FUTURISTIC), CardFace.system(400), 1.04)
            MACHINE -> CardTypeface(CardFace.Story(StoryFace.RETRO), CardFace.Story(StoryFace.RETRO), 0.92)
            MARQUEUR -> CardTypeface(CardFace.Story(StoryFace.TAG), CardFace.Story(StoryFace.NOTE), 0.9)
            SYSTEME -> CardTypeface(CardFace.system(700), CardFace.Native(400, true), 1.0)
        }
}

enum class CardLinkId(val key: String) {
    ORBITE("orbite"), FILET("filet"), GUILLEMETS("guillemets"), FLECHE("fleche"), BULLES("bulles"), FIL("fil"), SILENCE("silence"),
}

/** `palette.typographie.liaison` — l'identifiant stable d'un template. */
data class CardTemplateId(val palette: CardPaletteId, val typeface: CardTypefaceId, val link: CardLinkId) {
    val rawValue: String get() = "${palette.key}.${typeface.key}.${link.key}"

    fun with(palette: CardPaletteId? = null, typeface: CardTypefaceId? = null, link: CardLinkId? = null) =
        CardTemplateId(palette ?: this.palette, typeface ?: this.typeface, link ?: this.link)

    companion object {
        /** Lit un identifiant venu du stockage : `null` s'il ne nomme aucun template (renommé, abîmé). */
        fun parse(raw: String?): CardTemplateId? {
            val parts = raw?.split('.') ?: return null
            if (parts.size != 3) return null
            return CardTemplateId(
                CardPaletteId.entries.firstOrNull { it.key == parts[0] } ?: return null,
                CardTypefaceId.entries.firstOrNull { it.key == parts[1] } ?: return null,
                CardLinkId.entries.firstOrNull { it.key == parts[2] } ?: return null,
            )
        }
    }
}

object CardTemplates {
    val all: List<CardTemplateId> = CardPaletteId.entries.flatMap { palette ->
        CardTypefaceId.entries.flatMap { typeface -> CardLinkId.entries.map { CardTemplateId(palette, typeface, it) } }
    }

    val defaultId = CardTemplateId(CardPaletteId.AURORE, CardTypefaceId.ROND, CardLinkId.ORBITE)

    /** La vitrine d'un appareil qui n'a encore rien exporté : un template par caractère. */
    val featured: List<CardTemplateId> = listOf(
        defaultId,
        CardTemplateId(CardPaletteId.EDITORIAL, CardTypefaceId.DIDONE, CardLinkId.GUILLEMETS),
        CardTemplateId(CardPaletteId.MANUSCRIT, CardTypefaceId.PLUME, CardLinkId.FIL),
        CardTemplateId(CardPaletteId.MINUIT, CardTypefaceId.AFFICHE, CardLinkId.FLECHE),
        CardTemplateId(CardPaletteId.NEIGE, CardTypefaceId.SYSTEME, CardLinkId.BULLES),
        CardTemplateId(CardPaletteId.LAGON, CardTypefaceId.FUTUR, CardLinkId.FILET),
    )

    /** La police des grands guillemets de la liaison « guillemets » — une didone, quelle que soit la typographie. */
    val guillemetFace: CardFace = CardFace.Story(StoryFace.ELEGANT)

    /** Un template tiré au hasard — `random` rend un nombre de [0, 1), injecté pour que le témoin le fixe. */
    fun random(random: () -> Double = { kotlin.random.Random.nextDouble() }): CardTemplateId =
        all[(random() * all.size).toInt().coerceIn(0, all.size - 1)]
}

private object CardPalettes {
    private fun stops(vararg values: Pair<Double, String>) = values.map { GradientStop(it.first, CardColor.hex(it.second)) }

    private fun dark(name: String, background: List<GradientStop>, glow: CardColor?, accent: String, author: String) = CardPalette(
        name = name, background = background, glow = glow,
        replyInk = CardColor.hex("#FFFFFF"), quoteInk = CardColor.rgba(255, 255, 255, 0.66),
        authorInk = CardColor.hex(author), accent = CardColor.hex(accent),
        quotePanel = CardColor.rgba(255, 255, 255, 0.08), replyPanel = CardColor.rgba(255, 255, 255, 0.14),
        watermarkInk = CardColor.hex("#FFFFFF"), watermarkAlpha = 0.05,
    )

    private fun light(
        name: String, background: List<GradientStop>, glow: CardColor?, ink: String, quote: String, accent: String, author: String,
        quotePanel: CardColor = CardColor.rgba(255, 255, 255, 0.55), replyPanel: CardColor = CardColor.rgba(255, 255, 255, 0.85),
    ) = CardPalette(
        name = name, background = background, glow = glow,
        replyInk = CardColor.hex(ink), quoteInk = CardColor.hex(quote), authorInk = CardColor.hex(author),
        accent = CardColor.hex(accent), quotePanel = quotePanel, replyPanel = replyPanel,
        watermarkInk = CardColor.hex(ink), watermarkAlpha = 0.05,
    )

    private val table: Map<CardPaletteId, CardPalette> = mapOf(
        CardPaletteId.AURORE to dark("Aurore", stops(0.0 to "#1B1340", 0.55 to "#2A1B5C", 1.0 to "#0E0A24"), CardColor.rgba(236, 72, 153, 0.28), "#A78BFA", "#F9A8D4"),
        CardPaletteId.MINUIT to dark("Minuit", stops(0.0 to "#0B1020", 1.0 to "#111827"), CardColor.rgba(59, 130, 246, 0.22), "#60A5FA", "#93C5FD"),
        CardPaletteId.LAGON to dark("Lagon", stops(0.0 to "#042F2E", 1.0 to "#0F766E"), CardColor.rgba(45, 212, 191, 0.25), "#5EEAD4", "#99F6E4"),
        CardPaletteId.BRAISE to dark("Braise", stops(0.0 to "#1C0A05", 0.6 to "#431407", 1.0 to "#7C2D12"), CardColor.rgba(251, 146, 60, 0.3), "#FB923C", "#FDBA74"),
        CardPaletteId.FORET to dark("Forêt", stops(0.0 to "#052E16", 1.0 to "#14532D"), CardColor.rgba(132, 204, 22, 0.2), "#A3E635", "#BEF264"),
        CardPaletteId.VELOURS to dark("Velours", stops(0.0 to "#3B0764", 1.0 to "#701A75"), CardColor.rgba(244, 114, 182, 0.3), "#F0ABFC", "#F5D0FE"),
        CardPaletteId.ARDOISE to dark("Ardoise", stops(0.0 to "#18181B", 1.0 to "#27272A"), null, "#E4E4E7", "#A1A1AA"),
        CardPaletteId.EDITORIAL to light("Éditorial", stops(0.0 to "#FBF8F1", 1.0 to "#F1EADB"), null, "#1C1917", "#78716C", "#1C1917", "#9A3412"),
        CardPaletteId.MANUSCRIT to light("Manuscrit", stops(0.0 to "#FFF4E0", 1.0 to "#FDE2C3"), CardColor.rgba(251, 146, 60, 0.22), "#3B2314", "#8A6A55", "#EA580C", "#C2410C"),
        // Un fond déjà blanc : ses bulles se teintent d'encre plutôt que de blanc.
        CardPaletteId.NEIGE to light(
            "Neige", stops(0.0 to "#FFFFFF", 1.0 to "#F1F5F9"), null, "#0F172A", "#64748B", "#6366F1", "#4F46E5",
            quotePanel = CardColor.rgba(15, 23, 42, 0.05), replyPanel = CardColor.rgba(99, 102, 241, 0.08),
        ),
        CardPaletteId.PECHE to light("Pêche", stops(0.0 to "#FFE4E6", 1.0 to "#FECDD3"), CardColor.rgba(255, 255, 255, 0.5), "#4C0519", "#9F1239", "#E11D48", "#BE123C"),
        CardPaletteId.MENTHE to light("Menthe", stops(0.0 to "#ECFDF5", 1.0 to "#D1FAE5"), null, "#064E3B", "#047857", "#10B981", "#047857"),
        CardPaletteId.CITRON to light("Citron", stops(0.0 to "#FEFCE8", 1.0 to "#FEF08A"), null, "#422006", "#854D0E", "#CA8A04", "#A16207"),
        CardPaletteId.LAVANDE to light("Lavande", stops(0.0 to "#F5F3FF", 1.0 to "#DDD6FE"), CardColor.rgba(255, 255, 255, 0.45), "#2E1065", "#6D28D9", "#7C3AED", "#6D28D9"),
    )

    fun of(id: CardPaletteId): CardPalette = table.getValue(id)
}
