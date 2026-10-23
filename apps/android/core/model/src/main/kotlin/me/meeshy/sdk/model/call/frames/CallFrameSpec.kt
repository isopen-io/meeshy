package me.meeshy.sdk.model.call.frames

/**
 * LE VOCABULAIRE DES CADRES DE CAPTURE — miroir Kotlin de `apps/web/src/lib/calls/frames/frame-spec.ts`
 * et de `CallFrameSpec.swift`. Un cadre est une DONNÉE (`packages/shared/design/call-capture-frames`) :
 * `CallFrameCatalogue` la reçoit du JSON partagé, le peintre l'interprète. Chaque valeur énumérée porte
 * sa graphie JSON (`raw`), qui est celle du web et d'iOS.
 */
public interface CallFrameRaw {
    public val raw: String
}

public enum class CallFrameMood(override val raw: String) : CallFrameRaw {
    SIGNATURE("signature"), DISTINGUE("distingue"), ELEGANT("elegant"), JOVIAL("jovial"),
    DECONNECTE("deconnecte"), CORPORATE("corporate"), FANTASTIQUE("fantastique"), FUTURISTE("futuriste"),
    GLAUQUE("glauque"), HORS_NORME("hors-norme"), MORBIDE("morbide"), FEERIQUE("feerique");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameMood? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameBucket(override val raw: String, public val people: IntRange) : CallFrameRaw {
    DUO("duo", 2..2), COMITE("comite", 3..4), GROUPE("groupe", 5..6), TABLEE("tablee", 7..12);

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBucket? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameArrangement(override val raw: String) : CallFrameRaw {
    SPLIT("split"), DIAGONAL("diagonal"), HERO("hero"), GRID("grid"), ROW("row"), COLUMN("column"),
    ARCH("arch"), ORBIT("orbit"), SCATTER("scatter"), TIERS("tiers"), MOSAIC("mosaic"),
    HONEYCOMB("honeycomb"), CASCADE("cascade");

    /** `split` et `diagonal` n'ont de sens qu'à deux. */
    public val isDuoOnly: Boolean get() = this == SPLIT || this == DIAGONAL

    public companion object {
        public fun fromRaw(raw: String?): CallFrameArrangement? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameSlotShape(override val raw: String) : CallFrameRaw {
    RECT("rect"), ROUND("round"), CIRCLE("circle"), OVAL("oval"), ARCH("arch"), HEX("hex"),
    DIAMOND("diamond"), HEART("heart"), STAR("star"), TICKET("ticket"), STAMP("stamp"), BLOB("blob"),
    TORN("torn"), POLAROID("polaroid"), FRAME_OVAL("frame-oval");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameSlotShape? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTone(override val raw: String) : CallFrameRaw {
    COLOR("color"), MONO("mono"), SEPIA("sepia"), NOIR("noir"), WARM("warm"), COOL("cool"),
    FADED("faded"), DUOTONE("duotone"), LUMINOSITY("luminosity");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTone? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTilt(override val raw: String, public val degrees: Double) : CallFrameRaw {
    NONE("none", 0.0), GENTLE("gentle", 4.0), WILD("wild", 9.0);

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTilt? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFramePatternKind(override val raw: String) : CallFrameRaw {
    DOTS("dots"), STRIPES("stripes"), GRID("grid"), CHECKER("checker"), HALFTONE("halftone"),
    SCANLINES("scanlines"), GRAIN("grain"), STARS("stars"), CONFETTI("confetti"), SUNBURST("sunburst"),
    WAVES("waves"), CIRCUIT("circuit"), DAMASK("damask"), HEARTS("hearts");

    public companion object {
        public fun fromRaw(raw: String?): CallFramePatternKind? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameBorderKind(override val raw: String) : CallFrameRaw {
    HAIRLINE("hairline"), DOUBLE("double"), DECO("deco"), BAROQUE("baroque"), FILMSTRIP("filmstrip"),
    TICKET("ticket"), PERFORATED("perforated"), NEON("neon"), BRACKETS("brackets"), TORN("torn"),
    MOURNING("mourning"), VINES("vines"), BULBS("bulbs"), POLAROID("polaroid");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBorderKind? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameOrnamentKind(override val raw: String) : CallFrameRaw {
    SPARKLES("sparkles"), BOKEH("bokeh"), CONFETTI("confetti"), BALLOONS("balloons"), STARS("stars"),
    HEARTS("hearts"), FIREFLIES("fireflies"), PETALS("petals"), LEAVES("leaves"), BUBBLES("bubbles"),
    SNOW("snow"), RAYS("rays"), GLITCH("glitch"), SCANLINES("scanlines"), GRAIN("grain"),
    VIGNETTE("vignette"), LIGHTLEAK("lightleak"), CROWN("crown"), RIBBON("ribbon"), TAPE("tape"),
    REC("rec"), CROSSHAIR("crosshair"), ORBITS("orbits"), RUNES("runes"), COBWEBS("cobwebs"),
    DRIPS("drips"), LIGHTNING("lightning"), NOTES("notes"), CANDLES("candles"), MOON("moon"),
    CLOUDS("clouds"), BATS("bats"), SKULLS("skulls"), ROSES("roses");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameOrnamentKind? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameDensity(override val raw: String) : CallFrameRaw {
    LOW("low"), MID("mid"), HIGH("high");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameDensity? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameLayer(override val raw: String) : CallFrameRaw {
    BACK("back"), FRONT("front");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameLayer? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameBrandMark(override val raw: String) : CallFrameRaw {
    LOGO("logo"), WORDMARK("wordmark"), BOTH("both");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBrandMark? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameBrandPlace(override val raw: String) : CallFrameRaw {
    TOP("top"), BOTTOM("bottom"), TOP_LEFT("top-left"), TOP_RIGHT("top-right"),
    BOTTOM_LEFT("bottom-left"), BOTTOM_RIGHT("bottom-right"), WATERMARK("watermark");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBrandPlace? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTextSize(override val raw: String) : CallFrameRaw {
    S("s"), M("m"), L("l");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTextSize? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameNameShow(override val raw: String) : CallFrameRaw {
    NONE("none"), NAME("name"), HANDLE("handle"), BOTH("both");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameNameShow? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameNameStyle(override val raw: String) : CallFrameRaw {
    CAPTION("caption"), PLATE("plate"), RIBBON("ribbon"), BADGE("badge"), BUBBLE("bubble"),
    TAG("tag"), LIST("list");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameNameStyle? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTitleSource(override val raw: String) : CallFrameRaw {
    GROUP("group"), NAMES("names"), BRAND("brand"), DATE("date"), NONE("none"), TIME("time"),
    DATETIME("datetime"), PLACE("place"), LANDMARK("landmark"), EMOTION("emotion");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTitleSource? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTitlePlace(override val raw: String) : CallFrameRaw {
    TOP("top"), BOTTOM("bottom");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTitlePlace? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameTextEffect(override val raw: String) : CallFrameRaw {
    NONE("none"), SHADOW("shadow"), GLOW("glow"), OUTLINE("outline");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTextEffect? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameLetterCase(override val raw: String) : CallFrameRaw {
    UPPER("upper"), AS_IS("as-is");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameLetterCase? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les dix-huit styles de texte (`StoryTextStyle`) : les polices des images de message et de commentaire. */
public enum class CallFrameFont(override val raw: String) : CallFrameRaw {
    BOLD("bold"), NEON("neon"), TYPEWRITER("typewriter"), HANDWRITING("handwriting"), CLASSIC("classic"),
    CALLIGRAPHY("calligraphy"), CARTOON("cartoon"), FUTURISTIC("futuristic"), FANTASY("fantasy"),
    CURVE("curve"), TAG("tag"), ITALIC("italic"), RETRO("retro"), ELEGANT("elegant"), POSTER("poster"),
    BUBBLE("bubble"), NOTE("note"), BRUSH("brush");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameFont? = entries.firstOrNull { it.raw == raw }
    }
}

public data class CallFrameLayout(
    val arrangement: CallFrameArrangement,
    val margin: Double,
    val gap: Double,
    val top: Double,
    val bottom: Double,
)

public data class CallFrameStroke(val color: String, val width: Double)

public data class CallFrameCard(val color: String, val pad: Double, val foot: Double)

public data class CallFrameDuotone(val shadow: String, val light: String)

public data class CallFrameSlotStyle(
    val shape: CallFrameSlotShape,
    val radius: Double?,
    val stroke: CallFrameStroke?,
    val double: Boolean,
    val glow: String?,
    val shadow: Boolean,
    val card: CallFrameCard?,
    val tilt: CallFrameTilt,
    val tone: CallFrameTone,
    val duotone: CallFrameDuotone?,
    /** Les looks de la bibliothèque Meeshy — reçus, pas encore dessinés. */
    val look: List<CallFrameSlotLook> = emptyList(),
)

public sealed interface CallFrameBackground {
    public data class Solid(val color: String) : CallFrameBackground
    public data class Linear(val colors: List<String>, val angle: Double) : CallFrameBackground
    public data class Radial(val colors: List<String>) : CallFrameBackground
    public data object Accent : CallFrameBackground
}

public data class CallFramePattern(val kind: CallFramePatternKind, val color: String, val opacity: Double)

public data class CallFrameBorder(
    val kind: CallFrameBorderKind,
    val color: String,
    val width: Double,
    val inset: Double,
)

public data class CallFrameOrnament(
    val kind: CallFrameOrnamentKind,
    val color: String,
    val density: CallFrameDensity,
    val layer: CallFrameLayer,
    /** `still` par défaut ; `loop` et `onAppear` ne s'animent qu'en direct. */
    val motion: CallFrameOrnamentMotion = CallFrameOrnamentMotion.STILL,
)

public data class CallFrameBrand(
    val mark: CallFrameBrandMark,
    val place: CallFrameBrandPlace,
    val color: String,
    val size: CallFrameTextSize,
    val font: CallFrameFont?,
    val watermark: CallFrameWatermark? = null,
)

public data class CallFrameNames(
    val show: CallFrameNameShow,
    val style: CallFrameNameStyle,
    val font: CallFrameFont,
    val color: String,
    val fill: String?,
)

public data class CallFrameTitle(
    val source: CallFrameTitleSource,
    val font: CallFrameFont,
    val color: String,
    val place: CallFrameTitlePlace,
    val size: CallFrameTextSize,
    val effect: CallFrameTextEffect?,
    val letterCase: CallFrameLetterCase?,
    val form: CallFrameTextForm? = null,
) {
    public val servedEffect: CallFrameTextEffect get() = effect ?: CallFrameTextEffect.NONE
}

/** L'apparence complète d'un cadre — ce qu'une variante surcharge, clé par clé. */
public data class CallFrameLook(
    val layout: CallFrameLayout,
    val slot: CallFrameSlotStyle,
    val background: CallFrameBackground,
    val pattern: CallFramePattern?,
    val border: CallFrameBorder?,
    val ornaments: List<CallFrameOrnament>,
    val brand: CallFrameBrand? = null,
    val names: CallFrameNames,
    val title: CallFrameTitle,
    val subtitle: CallFrameTitle?,
    val elements: List<CallFrameElement> = emptyList(),
    val scene: List<CallFrameSceneLayer> = emptyList(),
    val behaviors: List<CallFrameBehavior> = emptyList(),
    val fallbacks: CallFrameFallbacks? = null,
)

/** Un cadre : un motif servi à une tranche. `id` = `<ambiance>.<motif>.<tranche>`, stable. */
public data class CallFrameDesign(
    val id: String,
    val motif: String,
    val mood: CallFrameMood,
    val name: String,
    val bucket: CallFrameBucket,
    val look: CallFrameLook,
    val credits: CallFrameCredits? = null,
    val surfaces: List<CallFrameSurface> = listOf(CallFrameSurface.CAPTURE),
    val cost: CallFrameCost? = null,
) {
    public val people: IntRange get() = bucket.people

    public fun isOffered(surface: CallFrameSurface): Boolean = surface in surfaces

    public fun serves(people: Int): Boolean = people in bucket.people
}

/** Une couleur `#RGB`, `#RRGGBB` ou `#RRGGBBAA`, canaux de 0 à 1. */
public data class CallFrameColor(val red: Double, val green: Double, val blue: Double, val alpha: Double) {
    public companion object {
        public fun parse(value: String): CallFrameColor? {
            if (!value.startsWith("#")) return null
            val digits = value.drop(1)
            if (digits.isEmpty() || !digits.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
            val channels = when (digits.length) {
                3 -> digits.map { "$it$it" } + "FF"
                6 -> digits.chunked(2) + "FF"
                8 -> digits.chunked(2)
                else -> return null
            }.map { it.toInt(16) / 255.0 }
            return CallFrameColor(channels[0], channels[1], channels[2], channels[3])
        }
    }
}
