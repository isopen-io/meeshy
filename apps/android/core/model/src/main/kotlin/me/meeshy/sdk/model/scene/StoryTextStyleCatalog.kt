package me.meeshy.sdk.model.scene

/** La classe générique d'une famille de police : ce que le texte devient si la police embarquée manque. */
enum class StoryTextGenericFamily { SANS, SERIF, MONOSPACE, CURSIVE }

/**
 * Les faces qu'Android lit pour les dix-huit styles. Les faces `SYSTEM_*` sont celles de la plateforme ; les autres sont
 * des polices OFL embarquées dans `:sdk-ui` (`res/font/`, licences dans `apps/android/licenses/`), choisies pour l'ESPRIT
 * de la police nommée d'iOS (`StoryTextStyle.fontName`). L'ajout d'une face ne touche pas le fil.
 */
enum class StoryTextFace {
    SYSTEM_SANS,
    SYSTEM_SERIF,
    SYSTEM_MONOSPACE,
    SYSTEM_SERIF_MONOSPACE,
    NUNITO,
    COURIER_PRIME,
    HANDLEE,
    MARCK_SCRIPT,
    BANGERS,
    ORBITRON,
    MACONDO,
    SACRAMENTO,
    GOCHI_HAND,
    ABRIL_FATFACE,
    BEBAS_NEUE,
    ARCHITECTS_DAUGHTER,
    COURGETTE,
}

/**
 * Les dix-huit styles de texte (iOS `StoryTextStyle`), dans l'ORDRE d'iOS (`allCases`) : celui des sélecteurs. [wire] est
 * la valeur de fil exacte ; [fontWeight] l'axe 100…900 ; [glow] dit que le préréglage du composeur publie une lueur.
 * Un style est une POLICE ; ce qui brille est l'axe orthogonal `StoryTextEffect`.
 */
enum class StoryTextStyleKind(
    val wire: String,
    val face: StoryTextFace,
    val generic: StoryTextGenericFamily,
    val fontWeight: Int,
    val italic: Boolean = false,
    val letterSpacingEm: Float = 0f,
    val glow: Boolean = false,
) {
    BOLD("bold", StoryTextFace.SYSTEM_SANS, StoryTextGenericFamily.SANS, 800),
    NEON("neon", StoryTextFace.NUNITO, StoryTextGenericFamily.SANS, 700, letterSpacingEm = 0.05f, glow = true),
    TYPEWRITER("typewriter", StoryTextFace.COURIER_PRIME, StoryTextGenericFamily.MONOSPACE, 500, letterSpacingEm = 0.03f),
    HANDWRITING("handwriting", StoryTextFace.HANDLEE, StoryTextGenericFamily.CURSIVE, 400, italic = true),
    CLASSIC("classic", StoryTextFace.SYSTEM_SERIF, StoryTextGenericFamily.SERIF, 400),
    CALLIGRAPHY("calligraphy", StoryTextFace.MARCK_SCRIPT, StoryTextGenericFamily.CURSIVE, 400),
    CARTOON("cartoon", StoryTextFace.BANGERS, StoryTextGenericFamily.SANS, 700, letterSpacingEm = 0.02f),
    FUTURISTIC("futuristic", StoryTextFace.ORBITRON, StoryTextGenericFamily.SANS, 800, letterSpacingEm = 0.04f),
    FANTASY("fantasy", StoryTextFace.MACONDO, StoryTextGenericFamily.SERIF, 400),
    CURVE("curve", StoryTextFace.SACRAMENTO, StoryTextGenericFamily.CURSIVE, 400),
    TAG("tag", StoryTextFace.GOCHI_HAND, StoryTextGenericFamily.CURSIVE, 700),
    ITALIC("italic", StoryTextFace.SYSTEM_SERIF, StoryTextGenericFamily.SERIF, 400, italic = true),
    RETRO("retro", StoryTextFace.SYSTEM_SERIF_MONOSPACE, StoryTextGenericFamily.MONOSPACE, 400),
    ELEGANT("elegant", StoryTextFace.ABRIL_FATFACE, StoryTextGenericFamily.SERIF, 400),
    POSTER("poster", StoryTextFace.BEBAS_NEUE, StoryTextGenericFamily.SANS, 800, letterSpacingEm = 0.02f),
    BUBBLE("bubble", StoryTextFace.NUNITO, StoryTextGenericFamily.SANS, 800),
    NOTE("note", StoryTextFace.ARCHITECTS_DAUGHTER, StoryTextGenericFamily.CURSIVE, 700),
    BRUSH("brush", StoryTextFace.COURGETTE, StoryTextGenericFamily.CURSIVE, 700),
}

/** Le catalogue des styles : source de vérité du lecteur et du composeur. */
object StoryTextStyleCatalog {
    val all: List<StoryTextStyleKind> = StoryTextStyleKind.entries.toList()

    /** Absent ou inconnu (un style plus récent) ⇒ gras, comme `parsedTextStyle` d'iOS : jamais une erreur. */
    fun fromWire(raw: String?): StoryTextStyleKind = all.firstOrNull { it.wire == raw } ?: StoryTextStyleKind.BOLD
}

/** La police résolue d'un texte : sa face, son poids, sa pente et son espacement. */
data class StoryTextFontSpec(
    val face: StoryTextFace,
    val generic: StoryTextGenericFamily,
    val fontWeight: Int,
    val italic: Boolean,
    val letterSpacingEm: Float,
)

/** Résolution UNIQUE style + poids d'auteur → police (iOS `StoryTextFontResolver`) : le poids d'auteur l'emporte sur celui du style. */
object StoryTextFontSpecs {
    fun resolve(styleWire: String?, weightWire: String?): StoryTextFontSpec {
        val style = StoryTextStyleCatalog.fromWire(styleWire)
        val weight = StoryTextWeight.fromWire(weightWire)?.cssWeight ?: style.fontWeight
        return StoryTextFontSpec(style.face, style.generic, weight, style.italic, style.letterSpacingEm)
    }
}
