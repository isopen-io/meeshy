package me.meeshy.sdk.model.call

enum class GroupStageTapOutcome { RevealChrome, Spotlight }

/** Chrome hidden: a tapped tile relights the controls; chrome visible: it takes the spotlight. */
object GroupStageTapRule {
    fun outcome(isChromeVisible: Boolean): GroupStageTapOutcome =
        if (isChromeVisible) GroupStageTapOutcome.Spotlight else GroupStageTapOutcome.RevealChrome
}
