package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.ui.theme.LentilleMetrics

/**
 * Ce que l'apparence d'une rangée doit à ses préférences (parité iOS
 * `LentilleConversationRow.rowOpacity` et l'émoji favori `userState.reaction`) :
 * pur, testable sans vue.
 */
internal object ConversationRowAppearance {

    private const val DRAG_OPACITY = 0.8f
    private const val DRAG_SCALE = 1.02f

    /** Une conversation en sourdine s'atténue à `LentilleMetrics.Muted.opacity` — jamais un littéral. */
    fun rowOpacity(isMuted: Boolean): Float = if (isMuted) LentilleMetrics.Muted.opacity else 1f

    /** Sourdine ET glisser-déposer se composent: la rangée tenue à la main s'éclaircit de 20 %. */
    fun rowOpacity(isMuted: Boolean, isDragging: Boolean): Float =
        rowOpacity(isMuted) * if (isDragging) DRAG_OPACITY else 1f

    /** La rangée tenue à la main grossit de 2 %. */
    fun dragScale(isDragging: Boolean): Float = if (isDragging) DRAG_SCALE else 1f

    /** Les étiquettes se dessinent en points de 6 dp, trois au plus. */
    fun tagDots(tags: List<String>): List<String> = tags.take(LentilleMetrics.Tags.maxCount)

    /** L'émoji favori posé par l'utilisateur ; une chaîne vide est un favori effacé. */
    fun favoriteEmoji(prefs: ApiConversationPreferences?): String? = prefs?.reaction?.takeIf { it.isNotBlank() }
}
