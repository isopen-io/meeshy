package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

public enum class MeeshyStateBlockKind { Empty, Error, Denied, Offline, Success }

public enum class MeeshyStateBlockSize { Regular, Compact }

public enum class MeeshyStateBlockTone { Accent, Err, Warn, Neutral, Ok }

/** Le fantôme dessiné derrière un vide : la silhouette de ce qui viendra remplir la place. */
public enum class MeeshyStateGhostTemplate { Line, Ticket, Row, Tile, Pin }

/** Pourquoi un bloc est refusé : jamais d'erreur sans « Réessayer », jamais de vide plein écran sans issue. */
public enum class MeeshyStateBlockRefusal { ErrorNeedsPrimary, EmptyNeedsExit }

@Immutable
public data class MeeshyStateBlockValues(
    val isResolvable: Boolean,
    val reason: MeeshyStateBlockRefusal?,
    val kind: MeeshyStateBlockKind,
    val size: MeeshyStateBlockSize,
    val isAlert: Boolean,
    val announcesOnAppear: Boolean,
    val glyphTone: MeeshyStateBlockTone,
    val hasGhost: Boolean,
    val hasHalo: Boolean,
    val rowHeightDp: Float?,
    val titleSp: Float,
    val shakes: Boolean,
    val breathes: Boolean,
    val hapticOnEnter: Boolean,
)

/**
 * K38 · la loi du bloc d'état : vide, erreur, refus, hors ligne et réussite ont UNE forme (image fantôme, titre, phrase,
 * sortie). Le bloc dessine l'absence, il ne la décide pas. Jumeau iOS : `MeeshyStateBlock`.
 */
public object MeeshyStateBlockRecipe {
    public const val GLYPH_DISC_DP: Float = 60f
    public const val GLYPH_ICON_DP: Float = 28f
    public const val GHOST_MAX_HEIGHT_DP: Float = 160f
    public const val TITLE_SP: Float = 22f
    public const val COMPACT_TITLE_SP: Float = 15f
    public const val MESSAGE_SP: Float = 14.5f
    public const val MESSAGE_MAX_DP: Float = 310f
    public const val PRIMARY_HEIGHT_DP: Float = 50f
    public const val SECONDARY_HEIGHT_DP: Float = 44f
    public const val ROW_HEIGHT_DP: Float = 60f
    public const val ENTER_SHAKE_DP: Float = 7f
    public const val FLOAT_MILLIS: Int = 4600
    public const val GHOST_COUNT_DEFAULT: Int = 3
    public const val GHOST_COUNT_MAX: Int = 4

    private fun tone(kind: MeeshyStateBlockKind): MeeshyStateBlockTone = when (kind) {
        MeeshyStateBlockKind.Empty -> MeeshyStateBlockTone.Accent
        MeeshyStateBlockKind.Error -> MeeshyStateBlockTone.Err
        MeeshyStateBlockKind.Denied -> MeeshyStateBlockTone.Warn
        MeeshyStateBlockKind.Offline -> MeeshyStateBlockTone.Neutral
        MeeshyStateBlockKind.Success -> MeeshyStateBlockTone.Ok
    }

    private fun refusal(
        kind: MeeshyStateBlockKind,
        size: MeeshyStateBlockSize,
        hasPrimary: Boolean,
        hasSecondary: Boolean,
    ): MeeshyStateBlockRefusal? = when {
        kind == MeeshyStateBlockKind.Error && !hasPrimary -> MeeshyStateBlockRefusal.ErrorNeedsPrimary
        kind == MeeshyStateBlockKind.Empty && size == MeeshyStateBlockSize.Regular && !hasPrimary && !hasSecondary ->
            MeeshyStateBlockRefusal.EmptyNeedsExit
        else -> null
    }

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyStateBlockKind,
        size: MeeshyStateBlockSize = MeeshyStateBlockSize.Regular,
        hasPrimary: Boolean,
        hasSecondary: Boolean = false,
        isOverContent: Boolean = false,
        reduceMotion: Boolean = false,
        isDark: Boolean = false,
    ): MeeshyStateBlockValues {
        val reason = refusal(kind, size, hasPrimary, hasSecondary)
        val isRegular = size == MeeshyStateBlockSize.Regular
        val showsImage = isRegular && !isOverContent
        return MeeshyStateBlockValues(
            isResolvable = reason == null,
            reason = reason,
            kind = kind,
            size = size,
            isAlert = kind == MeeshyStateBlockKind.Error,
            announcesOnAppear = announces(kind),
            glyphTone = tone(kind),
            hasGhost = showsImage && kind != MeeshyStateBlockKind.Success,
            hasHalo = showsImage && isDark,
            rowHeightDp = if (isRegular) null else ROW_HEIGHT_DP,
            titleSp = if (isRegular) TITLE_SP else COMPACT_TITLE_SP,
            shakes = kind == MeeshyStateBlockKind.Error && !reduceMotion,
            breathes = !reduceMotion,
            hapticOnEnter = kind == MeeshyStateBlockKind.Error,
        )
    }

    /** Les genres qui s'annoncent à la voix : une erreur, un passage hors ligne. */
    public fun announces(kind: MeeshyStateBlockKind): Boolean =
        kind == MeeshyStateBlockKind.Error || kind == MeeshyStateBlockKind.Offline

    /** Un bloc qui change de genre sur place s'annonce si le nouveau genre s'annonce, jamais deux fois pour le même. */
    public fun announcesTransition(from: MeeshyStateBlockKind, to: MeeshyStateBlockKind): Boolean = from != to && announces(to)

    /** Le nombre de silhouettes du fantôme : de 1 à 4, trois par défaut. */
    public fun ghostCount(count: Int?): Int = (count ?: GHOST_COUNT_DEFAULT).coerceIn(1, GHOST_COUNT_MAX)
}
