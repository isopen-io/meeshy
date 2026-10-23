package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.ui.theme.LentilleMetrics

/**
 * Ce que l'apparence d'une rangée doit à ses préférences (parité iOS
 * `LentilleConversationRow.rowOpacity` et l'émoji favori `userState.reaction`) :
 * pur, testable sans vue.
 */
internal object ConversationRowAppearance {

    /** Une conversation en sourdine s'atténue à `LentilleMetrics.Muted.opacity` — jamais un littéral. */
    fun rowOpacity(isMuted: Boolean): Float = if (isMuted) LentilleMetrics.Muted.opacity else 1f

    /** L'émoji favori posé par l'utilisateur ; une chaîne vide est un favori effacé. */
    fun favoriteEmoji(prefs: ApiConversationPreferences?): String? = prefs?.reaction?.takeIf { it.isNotBlank() }
}
