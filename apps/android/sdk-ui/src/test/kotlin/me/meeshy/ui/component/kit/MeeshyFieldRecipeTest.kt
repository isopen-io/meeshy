package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyFieldRecipeTest {

    @Test
    fun resolve_search_hasSearchKeyboardReturnAndClear() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Search)

        assertThat(recipe.keyboard).isEqualTo(MeeshyFieldKeyboard.Search)
        assertThat(recipe.returnKey).isEqualTo(MeeshyFieldReturnKey.Search)
        assertThat(recipe.offersClear).isTrue()
        assertThat(recipe.autocorrects).isFalse()
    }

    @Test
    fun resolve_paragraph_hasThreeToSixLinesAndNewlineReturn() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Paragraph)

        assertThat(recipe.lineRange).isEqualTo(3..6)
        assertThat(recipe.returnKey).isEqualTo(MeeshyFieldReturnKey.Newline)
        assertThat(recipe.minimumHeightDp).isEqualTo(110f)
    }

    @Test
    fun resolve_numeric_hasNumbersKeyboardAndBoldValue() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Numeric)

        assertThat(recipe.keyboard).isEqualTo(MeeshyFieldKeyboard.NumbersAndPunctuation)
        assertThat(recipe.valueIsBold).isTrue()
        assertThat(recipe.valueSizeSp).isEqualTo(20f)
    }

    @Test
    fun resolve_disabled_dimsContentToFortyPercent() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Token, isEnabled = false)

        assertThat(recipe.contentAlpha).isEqualTo(0.4f)
    }

    @Test
    fun resolve_withoutCaption_hasNoCaptionSpacing() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Sentence, hasCaption = false)

        assertThat(recipe.captionSpacingDp).isEqualTo(0f)
    }

    @Test
    fun resolve_onLightTone_darkensInk() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Token, tone = MeeshyFieldTone.OnLight)

        assertThat(recipe.ink).isEqualTo(MeeshyFieldInk.OnLight)
    }

    @Test
    fun resolve_increasedContrast_addsHairline() {
        val recipe = meeshyFieldRecipeFor(input = MeeshyFieldInput.Token, increasedContrast = true)

        assertThat(recipe.hairlineAlpha).isEqualTo(0.6f)
    }

    @Test
    fun showsPrompt_onlyWhenEmptyAndWithoutCaption() {
        assertThat(MeeshyFieldRecipe.showsPrompt(text = "", caption = null)).isTrue()
        assertThat(MeeshyFieldRecipe.showsPrompt(text = "a", caption = null)).isFalse()
        assertThat(MeeshyFieldRecipe.showsPrompt(text = "", caption = "Début")).isFalse()
    }

    @Test
    fun showsClear_onlySearchWithTextAndNotBusy() {
        assertThat(MeeshyFieldRecipe.showsClear(MeeshyFieldInput.Search, "a", isBusy = false, isEnabled = true)).isTrue()
        assertThat(MeeshyFieldRecipe.showsClear(MeeshyFieldInput.Search, "", isBusy = false, isEnabled = true)).isFalse()
        assertThat(MeeshyFieldRecipe.showsClear(MeeshyFieldInput.Token, "a", isBusy = false, isEnabled = true)).isFalse()
        assertThat(MeeshyFieldRecipe.showsClear(MeeshyFieldInput.Search, "a", isBusy = true, isEnabled = true)).isFalse()
    }

    @Test
    fun showsInlineCounter_requiresLimitTextAndInlinePlacement() {
        assertThat(MeeshyFieldRecipe.showsInlineCounter(limit = 60, text = "a", placement = MeeshyFieldCounterPlacement.Inline)).isTrue()
        assertThat(MeeshyFieldRecipe.showsInlineCounter(limit = 60, text = "a", placement = MeeshyFieldCounterPlacement.Hosted)).isFalse()
        assertThat(MeeshyFieldRecipe.showsInlineCounter(limit = null, text = "a", placement = MeeshyFieldCounterPlacement.Inline)).isFalse()
        assertThat(MeeshyFieldRecipe.showsInlineCounter(limit = 60, text = "", placement = MeeshyFieldCounterPlacement.Inline)).isFalse()
    }

    private fun meeshyFieldRecipeFor(
        input: MeeshyFieldInput,
        hasCaption: Boolean = false,
        tone: MeeshyFieldTone? = null,
        isEnabled: Boolean = true,
        increasedContrast: Boolean = false,
    ): MeeshyFieldRecipe = MeeshyFieldRecipe.resolve(
        input = input,
        hasCaption = hasCaption,
        tone = tone,
        isEnabled = isEnabled,
        increasedContrast = increasedContrast,
    )
}
