package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.sync.OutboxUiItem
import me.meeshy.sdk.model.sync.OutboxUiKind
import kotlin.math.abs

/** Les comptes des deux bandeaux ambre du haut de l'écran. */
data class PendingBannerCounts(val settings: Int, val stories: Int)

/** Les règles pures de `RootPendingBanners` (iOS) : comptes dérivés de la file, masquage par glissement. */
object PendingBanners {
    /** Le glissement qui masque le bandeau des stories : vers le haut ou sur le côté, jamais vers le bas. */
    const val DISMISS_THRESHOLD_DP: Float = 24f

    /** La distance à partir de laquelle un doigt est un glissement. */
    const val DRAG_START_DP: Float = 15f

    private const val SETTINGS_KEY = "updateSettings"

    /** Une ligne épuisée n'est plus « en attente » : elle a renoncé, la pastille globale la porte. */
    fun counts(items: List<OutboxUiItem>): PendingBannerCounts {
        val pending = items.filterNot { it.status.isTerminal }
        return PendingBannerCounts(
            settings = pending.count { it.kind == OutboxUiKind.OTHER && it.otherKey == SETTINGS_KEY },
            stories = pending.count { it.kind == OutboxUiKind.STORY },
        )
    }

    /** Masqué au compte où il a été glissé ; un autre compte le ramène. */
    fun isStoryBannerVisible(count: Int, dismissedAtCount: Int?): Boolean = count > 0 && dismissedAtCount != count

    fun shouldDismiss(dxDp: Float, dyDp: Float): Boolean = abs(dxDp) > DISMISS_THRESHOLD_DP || dyDp < -DISMISS_THRESHOLD_DP
}
