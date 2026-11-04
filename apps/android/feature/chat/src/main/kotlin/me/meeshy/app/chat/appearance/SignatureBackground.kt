package me.meeshy.app.chat.appearance

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.appearance.ConversationBackgroundPlan
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Ce que le fond Signature d'un fil peint : sa composition et les deux teintes de sa palette. */
@Immutable
internal data class SignatureBackground(
    val plan: ConversationBackgroundPlan,
    val accentHex: String,
    val secondaryHex: String,
) {
    companion object {
        private const val SECONDARY_SHIFT_DEGREES = 30.0

        fun of(
            isGroup: Boolean,
            encryptionMode: String?,
            memberCount: Int,
            topLanguages: List<String>,
            accentHex: String,
        ): SignatureBackground = SignatureBackground(
            plan = ConversationBackgroundPlan.of(if (isGroup) "group" else "direct", encryptionMode, memberCount, topLanguages),
            accentHex = accentHex,
            secondaryHex = DynamicColorGenerator.hueShiftedHex(accentHex, SECONDARY_SHIFT_DEGREES),
        )
    }
}
