package me.meeshy.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit

/**
 * Cotes normatives du rang de la Lentille — miroir Kotlin de `LentilleMetrics.swift`
 * (`apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift`, contrat LWS-5).
 * `LentilleMetricsSourceParityTest` relit le fichier iOS et exige une valeur identique pour chaque
 * littéral. Toute vue de la Lentille lit ses cotes ICI ; aucune cote de rang ne s'écrit en dur.
 */
public object LentilleMetrics {

    /** iOS `Row` : rangée 84, padding 8/16, marge 8, rayon 16, origine de zoom 16 % / 50 %. */
    public object Row {
        public val height: Dp = 84.dp
        public const val maxScale: Float = 2f
        public val paddingVertical: Dp = 8.dp
        public val paddingHorizontal: Dp = 16.dp
        public val marginHorizontal: Dp = 8.dp
        public val marginVertical: Dp = 8.dp
        public val radius: Dp = 16.dp
        public const val transformOriginX: Float = 0.16f
        public const val transformOriginY: Float = 0.5f
    }

    /** iOS `Avatar` : contexte `conversationHeaderCollapsed` = 44, anneau 1.5 à 55 %. */
    public object Avatar {
        public val size: Dp = 44.dp
        public val ringWidth: Dp = 1.5.dp
        public const val ringOpacity: Float = 0.55f
    }

    /** iOS `PresenceDot` : 11, bordure 2.5. Aucun point hors ligne. */
    public object PresenceDot {
        public val size: Dp = 11.dp
        public val borderSize: Dp = 2.5.dp
    }

    /** iOS `Name` : `MeeshyFont.bodySize` = 15, poids heavy. */
    public object Name {
        public val size: TextUnit = 15.sp
    }

    /** iOS `Time` : 12, poids bold. */
    public object Time {
        public val size: TextUnit = 12.sp
    }

    /** iOS `Line2` : `MeeshyFont.subheadSize` = 13, poids régulier. */
    public object Line2 {
        public val size: TextUnit = 13.sp
    }

    /** iOS `UnreadDot` : diamètre de design 8. */
    public object UnreadDot {
        public val size: Dp = 8.dp
    }

    /** iOS `FocusCard` : carte de focus 124, anneau 1.5, rayon 16, respiration écrêtée à la marge. */
    public object FocusCard {
        public val ringSize: Dp = 1.5.dp
        public val radius: Dp = 16.dp
        public val height: Dp = 124.dp
        public val paddingVertical: Dp = 14.dp
        public val avatarSize: Dp = 52.dp
        public val nameSize: TextUnit = 17.sp
        public val breathing: Dp = Row.marginVertical
        public val breathingRampStart: Dp = 36.dp
        public val breathingRampLength: Dp = 40.dp
        public const val loupeGain: Float = 0.04f
    }

    /** iOS `FocusInline` : tout dérive de la rangée, aucun nombre neuf. */
    public object FocusInline {
        public val height: Dp = Row.height + Row.marginVertical * 2
        public val paddingVertical: Dp = Row.paddingVertical
        public val avatarSize: Dp = Avatar.size
    }

    /** iOS `ModeNotch` : 9.5, ancrée top -9, right 14. */
    public object ModeNotch {
        public val size: Dp = 9.5.dp
        public val top: Dp = (-9).dp
        public val right: Dp = 14.dp
    }

    /** iOS `Sticker` : 10.5 heavy, interlettrage 0.1em, majuscules, padding 4/13. */
    public object Sticker {
        public val size: TextUnit = 10.5.sp
        public const val letterSpacingEm: Float = 0.1f
        public val paddingVertical: Dp = 4.dp
        public val paddingHorizontal: Dp = 13.dp
    }

    /** iOS `Pill` : pilule de défilement ancrée top 64, fondu 250 ms. */
    public object Pill {
        public val top: Dp = 64.dp
        public const val fadeDurationMs: Int = 250
    }

    /**
     * iOS `Rail` : pastille 48, anneau 3.5, au plus 6 entrées. [pinnedAccessoryHeight] est
     * `accessoryCollapsedHeight` (60) de `ConversationListView+ScrollChrome.swift`, la hauteur de
     * la bande épinglée repliée.
     */
    public object Rail {
        public val size: Dp = 48.dp
        public val ringWidth: Dp = 3.5.dp
        public val paddingVertical: Dp = 8.dp
        public const val maxEntries: Int = 6
        public val pinnedAccessoryHeight: Dp = 60.dp
    }

    /** iOS `Tags` : pastilles 6 (3 au plus), émoji favori 11, puces 8. */
    public object Tags {
        public val size: Dp = 6.dp
        public const val maxCount: Int = 3
        public val emojiSize: Dp = 11.dp
        public val chipFontSize: TextUnit = 8.sp
        public const val bubbleFillOpacity: Float = 0.16f
        public val chipPaddingHorizontal: Dp = 6.dp
        public val chipPaddingVertical: Dp = 2.dp
    }

    /** iOS `Muted` : rang à 0.55 d'opacité. */
    public object Muted {
        public const val opacity: Float = 0.55f
    }

    /** iOS `Agent` : anneau pointillé 1.5 (trait plein = humain). */
    public object Agent {
        public val avatarRingWidth: Dp = 1.5.dp
    }
}
