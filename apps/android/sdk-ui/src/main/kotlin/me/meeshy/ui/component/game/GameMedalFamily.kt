package me.meeshy.ui.component.game

import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily

/** La famille d'un axe (miroir de `GameMedalFamily`) : elle fixe la couleur de l'émail de la médaille. */
public enum class GameMedalFamily(
    /** Les cinq couleurs d'émail de la planche. */
    public val enamel: Color,
) {
    CONTENT(gameHex(0x4f46e5)),
    SOCIAL(gameHex(0xe11d48)),
    CONVERSATION(gameHex(0x7c3aed)),
    COMMENT(gameHex(0x0d9488)),
    TOOL(gameHex(0xd97706)),
    ;

    public companion object {
        public fun of(family: EngagementAxisFamily): GameMedalFamily = when (family) {
            EngagementAxisFamily.CONTENT -> CONTENT
            EngagementAxisFamily.SOCIAL -> SOCIAL
            EngagementAxisFamily.CONVERSATION -> CONVERSATION
            EngagementAxisFamily.COMMENT -> COMMENT
            EngagementAxisFamily.TOOL -> TOOL
        }
    }
}
