package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** La saisie d'un champ de feuille : la table de K08, une ligne par [MeeshyFieldInput]. Miroir de `MeeshyFieldInput` (iOS). */
public enum class MeeshyFieldInput { Search, Token, Sentence, Paragraph, Numeric }

/** Le clavier logique ; le composable le traduit en `KeyboardType`. */
public enum class MeeshyFieldKeyboard { Text, Search, NumbersAndPunctuation }

/** La touche Retour : « Rechercher », « OK », ou une ligne de plus. */
public enum class MeeshyFieldReturnKey { Done, Search, Newline }

public enum class MeeshyFieldCapitalization { None, Sentences }

/**
 * L'encre du champ : claire sur le média et le verre ([MeeshyGlassTone.Plain], [MeeshyGlassTone.Deep]), sombre sur un
 * verre clair ([MeeshyGlassTone.OnLight]), celle du thème hors média ([MeeshyGlassTone.Theme]).
 */
public enum class MeeshyFieldInk { OnMedia, OnLight, ThemeInk }

public enum class MeeshyFieldCounterPlacement { Inline, Hosted }

public enum class MeeshyFieldHaptic { Standard, None }

/**
 * La recette de K08 en valeurs : géométrie, opacités et table des [MeeshyFieldInput] vivent ici et nulle part ailleurs.
 * Les couleurs se résolvent depuis [ink] seulement. Miroir de `MeeshyFieldRecipe` (iOS).
 */
@Immutable
public data class MeeshyFieldRecipe(
    val keyboard: MeeshyFieldKeyboard,
    val returnKey: MeeshyFieldReturnKey,
    val autocorrects: Boolean,
    val capitalization: MeeshyFieldCapitalization,
    val lineRange: IntRange,
    val fillAlpha: Float,
    val contentAlpha: Float,
    val hairlineAlpha: Float?,
    val ink: MeeshyFieldInk,
    val minimumHeight: Dp,
    val verticalPadding: Dp,
    val horizontalPadding: Dp,
    val captionSpacing: Dp,
    val valueSize: TextUnit,
    val valueIsBold: Boolean,
    val offersClear: Boolean,
) {
    public val isMultiline: Boolean get() = lineRange.last > 1

    public fun inkColor(isDark: Boolean): Color = when (ink) {
        MeeshyFieldInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
        MeeshyFieldInk.OnLight -> MeeshyAdaptiveColors.textPrimary(isDark = false)
        MeeshyFieldInk.ThemeInk -> MeeshyAdaptiveColors.textPrimary(isDark)
    }

    /** L'alerte du compteur : `Error` sur une encre claire, `ErrorStrong` sur une encre sombre, où `Error` tombe sous 4,5:1. */
    public fun alertColor(isDark: Boolean): Color = when (ink) {
        MeeshyFieldInk.OnMedia -> MeeshyPalette.Error
        MeeshyFieldInk.OnLight -> MeeshyPalette.ErrorStrong
        MeeshyFieldInk.ThemeInk -> if (isDark) MeeshyPalette.Error else MeeshyPalette.ErrorStrong
    }

    public companion object {
        public const val FILL_INK_ALPHA: Float = MeeshyOpacity.subtle
        public const val MUTED_ALPHA: Float = MeeshyOpacity.heavy
        public const val HAIRLINE_EMPHASIS_ALPHA: Float = 0.6f
        public const val DISABLED_ALPHA: Float = 0.4f
        public const val NEAR_LIMIT_RATIO: Float = 0.8f
        public const val FADE_MILLIS: Int = 150

        /** Dès cette échelle de police, le compteur en ligne passe sous la saisie (iOS : les tailles d'accessibilité). */
        public const val STACKED_COUNTER_FONT_SCALE: Float = 1.5f

        /** Hauteur d'une ligne de saisie (planche : 45) ; la cible Android de 48 dp l'emporte. */
        public val LINE_HEIGHT: Dp = 45.dp

        /** Hauteur minimale d'un paragraphe (O9 : 110). */
        public val PARAGRAPH_MINIMUM_HEIGHT: Dp = 110.dp

        public fun resolve(
            input: MeeshyFieldInput,
            hasCaption: Boolean,
            tone: MeeshyGlassTone?,
            isEnabled: Boolean,
            increasedContrast: Boolean,
        ): MeeshyFieldRecipe {
            val row = rowFor(input)
            val numeric = input == MeeshyFieldInput.Numeric
            return MeeshyFieldRecipe(
                keyboard = row.keyboard,
                returnKey = row.returnKey,
                autocorrects = row.autocorrects,
                capitalization = row.capitalization,
                lineRange = row.lineRange,
                fillAlpha = FILL_INK_ALPHA,
                contentAlpha = if (isEnabled) 1f else DISABLED_ALPHA,
                hairlineAlpha = if (increasedContrast) HAIRLINE_EMPHASIS_ALPHA else null,
                ink = inkFor(tone),
                minimumHeight = if (input == MeeshyFieldInput.Paragraph) {
                    PARAGRAPH_MINIMUM_HEIGHT
                } else {
                    maxOf(LINE_HEIGHT, MeeshyControlSize.minTouchTarget)
                },
                verticalPadding = if (numeric) MeeshySpacing.smPlus else MeeshySpacing.md,
                horizontalPadding = MeeshySpacing.mdPlus,
                captionSpacing = when {
                    !hasCaption -> 0.dp
                    numeric -> MeeshySpacing.xxs
                    else -> MeeshySpacing.xsPlus
                },
                valueSize = if (numeric) MeeshyFontSize.title3 else MeeshyFontSize.body,
                valueIsBold = numeric,
                offersClear = input == MeeshyFieldInput.Search,
            )
        }

        /** L'encre d'un ton : `OnLight` fonce l'encre, `Theme` prend celle du thème, tout autre ton garde celle du média. */
        public fun inkFor(tone: MeeshyGlassTone?): MeeshyFieldInk = when (tone) {
            MeeshyGlassTone.OnLight -> MeeshyFieldInk.OnLight
            MeeshyGlassTone.Theme -> MeeshyFieldInk.ThemeInk
            MeeshyGlassTone.Plain, MeeshyGlassTone.Deep, null -> MeeshyFieldInk.OnMedia
        }

        /** L'invite n'existe que champ vide et sans légende (loi 13). */
        public fun showsPrompt(text: String, caption: String?): Boolean = text.isEmpty() && caption == null

        /** La croix n'existe que dans `Search`, avec du texte, hors occupation. */
        public fun showsClear(input: MeeshyFieldInput, text: String, isBusy: Boolean, isEnabled: Boolean): Boolean =
            input == MeeshyFieldInput.Search && text.isNotEmpty() && !isBusy && isEnabled

        /** Le compteur en ligne : une limite, du texte, et le placement `Inline`. */
        public fun showsInlineCounter(limit: Int?, text: String, placement: MeeshyFieldCounterPlacement): Boolean =
            limit != null && text.isNotEmpty() && placement == MeeshyFieldCounterPlacement.Inline

        /** Aux très grandes tailles de police, le compteur en ligne passe sous la saisie. */
        public fun stacksCounter(fontScale: Float): Boolean = fontScale >= STACKED_COUNTER_FONT_SCALE

        private data class Row(
            val keyboard: MeeshyFieldKeyboard,
            val returnKey: MeeshyFieldReturnKey,
            val autocorrects: Boolean,
            val capitalization: MeeshyFieldCapitalization,
            val lineRange: IntRange,
        )

        private fun rowFor(input: MeeshyFieldInput): Row = when (input) {
            MeeshyFieldInput.Search -> Row(
                MeeshyFieldKeyboard.Search, MeeshyFieldReturnKey.Search, false, MeeshyFieldCapitalization.None, 1..1,
            )
            MeeshyFieldInput.Token -> Row(
                MeeshyFieldKeyboard.Text, MeeshyFieldReturnKey.Done, false, MeeshyFieldCapitalization.None, 1..1,
            )
            MeeshyFieldInput.Sentence -> Row(
                MeeshyFieldKeyboard.Text, MeeshyFieldReturnKey.Done, true, MeeshyFieldCapitalization.Sentences, 1..1,
            )
            MeeshyFieldInput.Paragraph -> Row(
                MeeshyFieldKeyboard.Text, MeeshyFieldReturnKey.Newline, true, MeeshyFieldCapitalization.Sentences, 3..6,
            )
            MeeshyFieldInput.Numeric -> Row(
                MeeshyFieldKeyboard.NumbersAndPunctuation, MeeshyFieldReturnKey.Done, false,
                MeeshyFieldCapitalization.None, 1..1,
            )
        }
    }
}
