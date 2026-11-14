package me.meeshy.ui.component.kit

/** La saisie d'un champ de feuille : la table de K08, une ligne par [MeeshyFieldInput]. */
public enum class MeeshyFieldInput { Search, Token, Sentence, Paragraph, Numeric }

/** Le clavier logique ; le composable le traduit en `KeyboardType` et `ImeAction`. */
public enum class MeeshyFieldKeyboard { Text, Search, NumbersAndPunctuation }

/** La touche Retour : « Rechercher », « OK », ou une ligne de plus. */
public enum class MeeshyFieldReturnKey { Done, Search, Newline }

public enum class MeeshyFieldCapitalization { None, Sentences }

/**
 * L'encre du champ : claire sur le média (`Plain`, `Deep`), sombre sur un fond clair (`OnLight`), celle du thème hors
 * média (`ThemeInk`). Le ton `Theme` et le ton `OnLight` portent l'encre ; les autres gardent celle du média.
 */
public enum class MeeshyFieldTone { Plain, Deep, OnLight, Theme }

public enum class MeeshyFieldInk { OnMedia, OnLight, ThemeInk }

public enum class MeeshyFieldCounterPlacement { Inline, Hosted }

public enum class MeeshyFieldHaptic { Standard, None }

/**
 * La recette de K08 en valeurs : géométrie, opacités et table des [MeeshyFieldInput] vivent ici et nulle part ailleurs.
 * Les couleurs se résolvent au rendu, à partir de [ink] seulement.
 */
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
    val minimumHeightDp: Float,
    val verticalPaddingDp: Float,
    val horizontalPaddingDp: Float,
    val captionSpacingDp: Float,
    val valueSizeSp: Float,
    val valueIsBold: Boolean,
    val offersClear: Boolean,
) {
    public companion object {
        public const val FILL_INK_ALPHA: Float = 0.08f
        public const val MUTED_ALPHA: Float = 0.7f
        public const val HAIRLINE_EMPHASIS_ALPHA: Float = 0.6f
        public const val DISABLED_ALPHA: Float = 0.4f
        public const val NEAR_LIMIT_RATIO: Float = 0.8f
        public const val LINE_HEIGHT_DP: Float = 45f
        public const val PARAGRAPH_MINIMUM_HEIGHT_DP: Float = 110f
        public const val FADE_MILLIS: Int = 150
        public const val TAP_TARGET_DP: Float = 44f
        public const val MIN_TOUCH_TARGET_DP: Float = 48f

        public fun resolve(
            input: MeeshyFieldInput,
            hasCaption: Boolean,
            tone: MeeshyFieldTone?,
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
                minimumHeightDp = if (input == MeeshyFieldInput.Paragraph) {
                    PARAGRAPH_MINIMUM_HEIGHT_DP
                } else {
                    maxOf(LINE_HEIGHT_DP, MIN_TOUCH_TARGET_DP)
                },
                verticalPaddingDp = if (numeric) 10f else 12f,
                horizontalPaddingDp = 14f,
                captionSpacingDp = when {
                    !hasCaption -> 0f
                    numeric -> 2f
                    else -> 6f
                },
                valueSizeSp = if (numeric) 20f else 15f,
                valueIsBold = numeric,
                offersClear = input == MeeshyFieldInput.Search,
            )
        }

        public fun inkFor(tone: MeeshyFieldTone?): MeeshyFieldInk = when (tone) {
            MeeshyFieldTone.OnLight -> MeeshyFieldInk.OnLight
            MeeshyFieldTone.Theme -> MeeshyFieldInk.ThemeInk
            MeeshyFieldTone.Plain, MeeshyFieldTone.Deep, null -> MeeshyFieldInk.OnMedia
        }

        public fun showsPrompt(text: String, caption: String?): Boolean = text.isEmpty() && caption == null

        public fun showsClear(input: MeeshyFieldInput, text: String, isBusy: Boolean, isEnabled: Boolean): Boolean =
            input == MeeshyFieldInput.Search && text.isNotEmpty() && !isBusy && isEnabled

        public fun showsInlineCounter(limit: Int?, text: String, placement: MeeshyFieldCounterPlacement): Boolean =
            limit != null && text.isNotEmpty() && placement == MeeshyFieldCounterPlacement.Inline

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
                MeeshyFieldKeyboard.NumbersAndPunctuation, MeeshyFieldReturnKey.Done, false, MeeshyFieldCapitalization.None, 1..1,
            )
        }
    }
}
