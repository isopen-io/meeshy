package me.meeshy.app.chat.share

import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.ForwardDurationChoice
import me.meeshy.sdk.model.durationChoices
import me.meeshy.sdk.model.share.SharePlan

/**
 * **La rangée de durée d'une flamme transférée** (iOS `ShareDurationRow`) : la copie dure AU PLUS
 * autant que sa source, dont la durée est présélectionnée ; seuls les paliers inférieurs ou égaux
 * sont offerts. Sans choix, la rangée n'est pas montée.
 */
internal data class ShareDurationRowState(
    val choices: List<ForwardDurationChoice>,
    val selectedSeconds: Int?,
) {
    val isVisible: Boolean get() = choices.isNotEmpty()

    fun isSelected(choice: ForwardDurationChoice): Boolean = choice.seconds == selectedSeconds

    companion object {
        fun of(plan: SharePlan, chosenSeconds: Int?): ShareDurationRowState {
            val max = plan.flameMaxDurationSeconds ?: return ShareDurationRowState(emptyList(), null)
            val choices = ContentExitLaw.ForwardVerdict.Allowed(max).durationChoices
            val selected = chosenSeconds?.takeIf { it > 0 }?.coerceAtMost(max) ?: max
            return ShareDurationRowState(choices, selected)
        }
    }
}
