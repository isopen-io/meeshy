package me.meeshy.ui.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * L'emplacement OPAQUE du niveau / rang d'un membre posé sur sa bannière (miroir de `ProfileGameSection` iOS) :
 * le SDK ne sait rien du jeu. L'app fournit [level] (coin bas, début) et [rank] (coin bas, fin) ; ils ne doivent
 * pas être interactifs — le doigt les traverse, toucher la bannière l'ouvre toujours en plein écran.
 */
public class ProfileGameSlot(
    public val level: @Composable (userId: String, displayName: String) -> Unit,
    public val rank: @Composable (userId: String, displayName: String) -> Unit,
)

/** `null` : la bannière reste nue. */
public val LocalProfileGameSlot: ProvidableCompositionLocal<ProfileGameSlot?> = compositionLocalOf { null }

@Composable
internal fun BoxScope.ProfileGameBadges(userId: String?, displayName: String, slot: ProfileGameSlot?) {
    if (slot == null || userId.isNullOrEmpty()) return
    Box(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        Box(Modifier.align(Alignment.BottomStart)) { slot.level(userId, displayName) }
        Box(Modifier.align(Alignment.BottomEnd)) { slot.rank(userId, displayName) }
    }
}
