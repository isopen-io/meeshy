package me.meeshy.sdk.model.call.frames

/**
 * L'EXTENSION DU FORMAT DES CADRES (#9197, doc 06 § 3) — miroir de `CallFrameFormatExtension.swift`.
 * Toutes les clés sont FACULTATIVES : un cadre qui ne les porte pas se rend comme avant, et le
 * décodeur ignore en silence ce qu'il ne sait pas dessiner (valeur hors liste fermée, clé inconnue).
 */
public enum class CallFrameSlotLookKind(override val raw: String) : CallFrameRaw {
    INSTANT_FILM("instant-film"), FILM_GRAIN("film-grain"), OIL_PAINT("oil-paint"),
    SCRATCH_FILM("scratch-film"), HALFTONE("halftone"), VIGNETTE("vignette"), BLOOM("bloom");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameSlotLookKind? = entries.firstOrNull { it.raw == raw }
    }
}

public data class CallFrameSlotLook(val id: CallFrameSlotLookKind, val amount: Double?, val size: Double?)

public enum class CallFrameOrnamentMotion(override val raw: String) : CallFrameRaw {
    STILL("still"), LOOP("loop"), ON_APPEAR("onAppear");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameOrnamentMotion? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les formes d'un texte (spec 01 § 2), chacune réservée à SA source. */
public enum class CallFrameTextForm(override val raw: String) : CallFrameRaw {
    DIGITAL("digital"), DIGITAL_SECONDS("digital-seconds"), ANALOG("analog"), WORDS("words"),
    MOMENT("moment"), SHORT("short"), LONG("long"), DAY_MONTH("day-month"),
    CALENDAR_TILE("calendar-tile"), ROMAN("roman"), INLINE("inline"), STACKED("stacked"),
    STAMP("stamp"), CITY("city"), CITY_COUNTRY("city-country"), NEIGHBORHOOD("neighborhood"),
    STREET("street"), ADDRESS("address"), COUNTRY_FLAG("country-flag"), COORDINATES("coordinates"),
    PIN("pin"), MAP_SILHOUETTE("map-silhouette"), NAME("name"), LINE_ART("line-art"), BADGE("badge"),
    SKYLINE("skyline"), EMOJI("emoji"), WORD("word"), COLOR_AURA("color-aura"),
    PARTICLES("particles"), STICKER("sticker");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameTextForm? = entries.firstOrNull { it.raw == raw }
    }
}

/** Les zones d'un élément libre : le pourtour de la zone des visages, jamais son centre. */
public enum class CallFrameElementPlace(override val raw: String) : CallFrameRaw {
    TOP("top"), BOTTOM("bottom"), TOP_LEFT("top-left"), TOP_RIGHT("top-right"),
    BOTTOM_LEFT("bottom-left"), BOTTOM_RIGHT("bottom-right"), CENTER_LEFT("center-left"),
    CENTER_RIGHT("center-right");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameElementPlace? = entries.firstOrNull { it.raw == raw }
    }
}

/** Un texte ou un pictogramme posé librement, au-delà du titre et du sous-titre (6 au plus). */
public data class CallFrameElement(
    val source: CallFrameTitleSource,
    val form: CallFrameTextForm?,
    val place: CallFrameElementPlace,
    val font: CallFrameFont,
    val color: String,
    val size: CallFrameTextSize,
    val effect: CallFrameTextEffect?,
    val letterCase: CallFrameLetterCase?,
)

public enum class CallFrameWatermarkContent(override val raw: String) : CallFrameRaw {
    BRAND("brand"), BRAND_HANDLE("brand-handle");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameWatermarkContent? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameWatermarkOrientation(override val raw: String) : CallFrameRaw {
    DIAGONAL_UP("diagonal-up"), DIAGONAL_DOWN("diagonal-down"), HORIZONTAL("horizontal"),
    VERTICAL("vertical"), CROSS("cross");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameWatermarkOrientation? = entries.firstOrNull { it.raw == raw }
    }
}

public data class CallFrameWatermark(
    val content: CallFrameWatermarkContent,
    val orientation: CallFrameWatermarkOrientation,
    val opacity: Double,
)

public enum class CallFrameSurface(override val raw: String) : CallFrameRaw {
    CAPTURE("capture"), LIVE("live");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameSurface? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameCost(override val raw: String) : CallFrameRaw {
    LIGHT("light"), STANDARD("standard"), RICH("rich");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameCost? = entries.firstOrNull { it.raw == raw }
    }
}

/** Qui a fait le cadre et quand — dates `AAAA-MM-JJ`, telles que le JSON les porte. */
public data class CallFrameCredits(val author: String, val createdAt: String, val updatedAt: String?)

public enum class CallFrameSceneLayerKind(override val raw: String) : CallFrameRaw {
    IMAGE("image"), LOTTIE("lottie"), SPRITE("sprite"), VIDEO_LOOP("video-loop"),
    PARTICLES("particles"), LIGHT("light");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameSceneLayerKind? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameSceneDepth(override val raw: String) : CallFrameRaw {
    BACK("back"), FRONT("front"), EFFECTS("effects");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameSceneDepth? = entries.firstOrNull { it.raw == raw }
    }
}

public data class CallFrameSceneLayer(
    val id: String,
    val kind: CallFrameSceneLayerKind,
    val depth: CallFrameSceneDepth,
    val src: String?,
    val preset: CallFrameOrnamentKind?,
    val color: String?,
    val amount: Double?,
    val maxParticles: Int?,
)

public enum class CallFrameBehaviorTrigger(override val raw: String) : CallFrameRaw {
    ON_TAP("onTap"), ON_SHAKE("onShake"), ON_TILT("onTilt"), ON_SMILE("onSmile"),
    ON_EMOTION("onEmotion"), ON_TIME("onTime"), ON_SPEAKING("onSpeaking"), ON_CALL_EVENT("onCallEvent");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBehaviorTrigger? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallFrameBehaviorAction(override val raw: String) : CallFrameRaw {
    BURST("burst"), CALM("calm"), TINT("tint"), PLAY("play"), STOP("stop"), SHOW("show"),
    HIDE("hide"), SHAKE("shake");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBehaviorAction? = entries.firstOrNull { it.raw == raw }
    }
}

/** Ce que précise `when` : l'émotion, le moment du jour, l'événement d'appel. */
public enum class CallFrameBehaviorCondition(override val raw: String) : CallFrameRaw {
    JOY("joy"), LOVE("love"), PRIDE("pride"), CALM("calm"), SURPRISE("surprise"),
    NOSTALGIA("nostalgia"), PARTY("party"), GRATITUDE("gratitude"), MORNING("morning"),
    DAY("day"), EVENING("evening"), NIGHT("night"), START("start"), END("end");

    public companion object {
        public fun fromRaw(raw: String?): CallFrameBehaviorCondition? = entries.firstOrNull { it.raw == raw }
    }
}

public data class CallFrameBehavior(
    val trigger: CallFrameBehaviorTrigger,
    val `when`: CallFrameBehaviorCondition?,
    val target: String?,
    val action: CallFrameBehaviorAction,
    val duration: Double?,
    val color: String?,
)

public data class CallFrameFallbackStill(val layer: String, val src: String)

public data class CallFrameFallbackTier(val hide: List<String>, val still: List<CallFrameFallbackStill>)

public data class CallFrameFallbacks(val reduced: CallFrameFallbackTier?, val minimal: CallFrameFallbackTier?)
