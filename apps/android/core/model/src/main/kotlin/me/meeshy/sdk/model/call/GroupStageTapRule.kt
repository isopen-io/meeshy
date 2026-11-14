package me.meeshy.sdk.model.call

enum class GroupStageTapOutcome { RevealChrome, Spotlight }

/**
 * Chrome hidden: a tapped tile relights the controls; chrome visible: it takes the spotlight. Law 15: my tile in a duo
 * follows the same law ([tapsTheSwap]) — hidden controls come back first, the swap needs them shown.
 */
object GroupStageTapRule {
    fun tapsTheSwap(isChromeVisible: Boolean): Boolean = outcome(isChromeVisible) == GroupStageTapOutcome.Spotlight

    fun outcome(isChromeVisible: Boolean): GroupStageTapOutcome =
        if (isChromeVisible) GroupStageTapOutcome.Spotlight else GroupStageTapOutcome.RevealChrome
}
