package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Cinq formes de note : ligne, bande, bandeau, direct (la liste est `MeeshyNoteList`). Elle vit dans le flux, jamais par-dessus. */
public enum class MeeshyNoteForm { Line, Band, Banner, Live }

/** Un sens : il teinte la tête, le filet et le fond, jamais la phrase seule, jamais l'unique porteur du sens. */
public enum class MeeshyNoteKind { Neutral, Info, Ok, Warn, Security }

public enum class MeeshyNoteSize { Compact, Regular }

/** La nature de la tête, sans son glyphe : un glyphe, un point, un point pulsé ou rien. */
public enum class MeeshyNoteLeadShape { Glyph, Dot, Pulse, None }

/** Un morceau de phrase, en gras ou non : la valeur mise en gras peut tomber n'importe où. */
public data class MeeshyNoteSegment(val text: String, val isEmphasis: Boolean)

@Immutable
public data class MeeshyNoteValues(
    val kind: MeeshyNoteKind,
    val textSp: Float,
    val textWeight: Int,
    val lineHeightFactor: Float,
    val glyphDp: Int,
    val cornerRadiusDp: Int,
    val tintAlpha: Float,
    val fillsWidth: Boolean,
    val insetsDp: List<Int>,
    val minHeightDp: Int,
    val hasBottomHairline: Boolean,
    val accentBarDp: Int,
    val tintsText: Boolean,
    val pulses: Boolean,
    val showsHalo: Boolean,
    val animatesHeight: Boolean,
    val showsDetail: Boolean,
    val isDismissible: Boolean,
    val autoHides: Boolean,
)

public object MeeshyNoteRecipe {
    public const val DOT_DP: Int = 9
    public const val CROSSFADE_MILLIS: Int = 150
    public const val WRAP_ACTION_BELOW_DP: Float = 320f
    private const val LINE_HEIGHT: Float = 1.4f
    private const val BANNER_TINT: Float = 0.10f

    @Suppress("LongParameterList")
    public fun resolve(
        form: MeeshyNoteForm,
        kind: MeeshyNoteKind,
        lead: MeeshyNoteLeadShape,
        size: MeeshyNoteSize,
        isStale: Boolean,
        hasDetail: Boolean,
        hasAction: Boolean,
        reduceMotion: Boolean,
    ): MeeshyNoteValues {
        val live = form == MeeshyNoteForm.Live
        val pulsing = lead == MeeshyNoteLeadShape.Pulse
        return MeeshyNoteValues(
            kind = if (isStale) MeeshyNoteKind.Neutral else kind,
            textSp = textSp(form),
            textWeight = if (live) 600 else 400,
            lineHeightFactor = LINE_HEIGHT,
            glyphDp = if (form == MeeshyNoteForm.Banner) 22 else 16,
            cornerRadiusDp = if (form == MeeshyNoteForm.Banner) 16 else 0,
            tintAlpha = if (form == MeeshyNoteForm.Banner) BANNER_TINT else 0f,
            fillsWidth = form == MeeshyNoteForm.Banner || form == MeeshyNoteForm.Band,
            insetsDp = if (form == MeeshyNoteForm.Banner) listOf(12, 14, 12, 18) else listOf(0, 0, 0, 0),
            minHeightDp = if (form == MeeshyNoteForm.Band) 48 else 0,
            hasBottomHairline = form == MeeshyNoteForm.Band,
            accentBarDp = if (form == MeeshyNoteForm.Band) 3 else 0,
            tintsText = live,
            pulses = pulsing && !isStale && !reduceMotion,
            showsHalo = pulsing && reduceMotion && !isStale,
            animatesHeight = !reduceMotion,
            showsDetail = hasDetail && form != MeeshyNoteForm.Line && form != MeeshyNoteForm.Live,
            isDismissible = false,
            autoHides = false,
        )
    }

    public fun isVisible(text: String): Boolean = text.isNotBlank()

    /** Sous 320 dp de large, l'action de fin passe à la ligne. */
    public fun actionWraps(widthDp: Float): Boolean = widthDp < WRAP_ACTION_BELOW_DP

    /** Seul `warn` s'annonce par défaut, une fois à l'arrivée ; [explicit] y change quelque chose. */
    public fun announces(kind: MeeshyNoteKind, explicit: Boolean?): Boolean = explicit ?: (kind == MeeshyNoteKind.Warn)

    public fun listTextSp(size: MeeshyNoteSize): Float = if (size == MeeshyNoteSize.Compact) 13f else 14.5f

    /** Découpe [text] autour de [emphasis] (première occurrence) ; sans valeur trouvée, la phrase reste d'un seul tenant. */
    public fun segments(text: String, emphasis: String?): List<MeeshyNoteSegment> {
        if (emphasis.isNullOrEmpty()) return listOf(MeeshyNoteSegment(text, false))
        val start = text.indexOf(emphasis)
        if (start < 0) return listOf(MeeshyNoteSegment(text, false))
        return listOfNotNull(
            text.substring(0, start).takeIf { it.isNotEmpty() }?.let { MeeshyNoteSegment(it, false) },
            MeeshyNoteSegment(emphasis, true),
            text.substring(start + emphasis.length).takeIf { it.isNotEmpty() }?.let { MeeshyNoteSegment(it, false) },
        )
    }

    private fun textSp(form: MeeshyNoteForm): Float = when (form) {
        MeeshyNoteForm.Line -> 12.5f
        MeeshyNoteForm.Band -> 13f
        MeeshyNoteForm.Banner -> 14f
        MeeshyNoteForm.Live -> 13.5f
    }
}
