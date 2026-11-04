package me.meeshy.sdk.model.game.rules

/**
 * Où le carnet « Comment ça marche » s'ouvre (iOS `GameRulesPage.focusedRule` / `focusedSection`) : sur une règle, qui
 * défile à 18 % du haut et se teinte un instant, ou sur la section des médailles ; sans cible, en haut.
 */
public sealed interface GameRulesFocus {
    public val wire: String

    public data object Badges : GameRulesFocus {
        override val wire: String = "badges"
    }

    public data class Rule(val index: Int) : GameRulesFocus {
        override val wire: String get() = "rule-$index"
    }

    public companion object {
        public const val ANCHOR: Float = 0.18f
        public const val SETTLE_MILLIS: Int = 250
        public const val SCROLL_MILLIS: Int = 350
        public const val TINT_ALPHA: Float = 0.14f
        public const val HOLD_MILLIS: Int = 1_600
        public const val FADE_MILLIS: Int = 400

        public fun parse(wire: String?): GameRulesFocus? {
            if (wire == Badges.wire) return Badges
            val index = wire?.removePrefix("rule-")?.takeIf { wire.startsWith("rule-") }?.toIntOrNull() ?: return null
            return Rule(index).takeIf { index in GameRulesBook.ruleIndices }
        }
    }
}
