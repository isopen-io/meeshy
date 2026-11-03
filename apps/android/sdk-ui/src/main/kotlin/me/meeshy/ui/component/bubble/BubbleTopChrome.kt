package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/**
 * La colonne posée AU-DESSUS de la bulle, sur le fond de conversation, alignée du côté de la bulle : épingle puis
 * « Transféré ». Un message supprimé n'en porte aucun. Emplacement unique du chrome de protection et de la carte
 * de story à venir.
 */
@Composable
internal fun BubbleTopChrome(content: BubbleContent, modifier: Modifier = Modifier) {
    val badges = BubbleTopBadges.of(content)
    if (!badges.pinned && !badges.forwarded) return
    Column(
        horizontalAlignment = if (content.isOutgoing) Alignment.End else Alignment.Start,
        modifier = modifier,
    ) {
        if (badges.pinned) BubblePinBadge()
        if (badges.forwarded) BubbleForwardBadge(content.forwardAttribution)
    }
}

/** Quels badges la colonne montre, dans cet ordre : épingle, puis transfert ; aucun sur un message supprimé. */
internal data class BubbleTopBadges(val pinned: Boolean, val forwarded: Boolean) {
    companion object {
        fun of(content: BubbleContent): BubbleTopBadges = BubbleTopBadges(
            pinned = content.pinnedAtIso != null && !content.isDeleted,
            forwarded = content.isForwarded && !content.isDeleted,
        )
    }
}
