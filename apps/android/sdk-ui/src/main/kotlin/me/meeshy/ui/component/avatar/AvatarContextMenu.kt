package me.meeshy.ui.component.avatar

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import me.meeshy.sdk.model.avatar.AvatarInteraction
import me.meeshy.sdk.model.avatar.AvatarMenuEntry
import me.meeshy.sdk.model.avatar.AvatarMenuKind
import me.meeshy.sdk.model.avatar.AvatarTapTarget
import me.meeshy.ui.R

/** Une entrée du menu contextuel posée par l'hôte (iOS `AvatarContextMenuItem`). */
public class AvatarContextMenuItem(public val label: String, public val action: () -> Unit)

/** Les gestes qu'un hôte branche sur un avatar (iOS `onTap`, `onViewProfile`, `onViewStory`). */
public class AvatarGestures(
    public val onTap: (() -> Unit)? = null,
    public val onViewProfile: (() -> Unit)? = null,
    public val onViewStory: (() -> Unit)? = null,
    public val menuItems: List<AvatarContextMenuItem>? = null,
)

/**
 * Pose le toucher et le menu contextuel (appui long) d'un avatar. La loi vit dans [AvatarInteraction] ;
 * ici ne reste que la projection : un toucher route vers sa cible, l'appui long ouvre un menu SANS doublon
 * « Voir le profil ». Sans geste ni entrée, le contenu est rendu tel quel.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun AvatarGestureHost(
    gestures: AvatarGestures,
    contextTappable: Boolean,
    isUser: Boolean,
    storyUnread: Boolean,
    hasStory: Boolean,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val profileLabel = stringResource(R.string.avatar_menu_view_profile)
    val storyLabel = stringResource(R.string.avatar_menu_view_story)
    val haptic = LocalHapticFeedback.current
    val tappable = AvatarInteraction.isTappable(
        contextTappable, gestures.onTap != null, gestures.onViewProfile != null, gestures.onViewStory != null,
    )
    val custom = gestures.menuItems.orEmpty()
    val entries = AvatarInteraction.menu(
        contextTappable = contextTappable, isUser = isUser, hasStory = hasStory,
        hasViewProfile = gestures.onViewProfile != null, hasViewStory = gestures.onViewStory != null,
        profileLabel = profileLabel, storyLabel = storyLabel,
        custom = custom.mapIndexed { i, item -> AvatarMenuEntry(AvatarMenuKind.CUSTOM, item.label, i.toString()) },
    )
    if (!tappable && entries.isEmpty()) {
        Box(modifier) { content() }
        return
    }
    var expanded by remember { mutableStateOf(false) }
    val target = AvatarInteraction.tapTarget(
        storyUnread, gestures.onViewStory != null, gestures.onTap != null, gestures.onViewProfile != null,
    )
    Box(
        modifier.combinedClickable(
            enabled = target != AvatarTapTarget.NONE || entries.isNotEmpty(),
            role = Role.Button,
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                when (target) {
                    AvatarTapTarget.STORY -> gestures.onViewStory?.invoke()
                    AvatarTapTarget.TAP -> gestures.onTap?.invoke()
                    AvatarTapTarget.PROFILE -> gestures.onViewProfile?.invoke()
                    AvatarTapTarget.NONE -> Unit
                }
            },
            onLongClick = if (entries.isEmpty()) null else ({
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                expanded = true
            }),
        ),
    ) {
        content()
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            entries.forEach { entry ->
                DropdownMenuItem(
                    text = { Text(entry.label) },
                    onClick = {
                        expanded = false
                        when (entry.kind) {
                            AvatarMenuKind.PROFILE -> gestures.onViewProfile?.invoke()
                            AvatarMenuKind.STORY -> gestures.onViewStory?.invoke()
                            AvatarMenuKind.CUSTOM -> custom.getOrNull(entry.customKey?.toIntOrNull() ?: -1)?.action?.invoke()
                        }
                    },
                )
            }
        }
    }
}
