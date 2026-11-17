package me.meeshy.ui.component.kit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyTheme

private const val SIDE_PADDING_DP = 16
private const val AVATAR_GAP_DP = 12

/**
 * **L'en-tête qui se replie** (K28) : une bannière, un avatar, un titre ; le doigt monte, tout se range dans une barre de verre
 * épinglée. Un seul nombre, [progress], mène la danse (voir `MeeshyCollapsingHeroRecipe`).
 *
 * Agnostique : des textes et des emplacements (`banner`, `leading`, `trailing`, `avatar` qui reçoit sa taille courante). Il ne
 * sait ni personne, ni présence, ni niveau, et ne mesure aucun défilement : l'hôte lit son décalage
 * (`MeeshyCollapsingHeroRecipe.progress`) et le lui remet. Un seul avatar et un seul titre voyagent du début à la fin : le titre
 * est lu une fois, comme un en-tête, avec son sous-titre. La barre repliée devient un bouton nommé par [collapsedTapLabel] quand
 * l'hôte donne [onCollapsedTap]. Jumeau iOS : `MeeshyCollapsingHero`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyCollapsingHero(
    progress: Float,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    alignment: MeeshyCollapsingHeroAlignment = MeeshyCollapsingHeroAlignment.Leading,
    expandedHeight: Dp = MeeshyCollapsingHeroRecipe.EXPANDED_HEIGHT.dp,
    collapsedHeight: Dp = MeeshyCollapsingHeroRecipe.COLLAPSED_HEIGHT.dp,
    overscroll: Float = 0f,
    collapsedTapLabel: String? = null,
    onCollapsedTap: (() -> Unit)? = null,
    banner: (@Composable BoxScope.() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    avatar: (@Composable (size: Dp) -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val values = remember(progress, expandedHeight, collapsedHeight, alignment, avatar != null, subtitle != null, overscroll) {
        MeeshyCollapsingHeroRecipe.resolve(
            progress = progress.toDouble(),
            expandedHeight = expandedHeight.value.toDouble(),
            collapsedHeight = collapsedHeight.value.toDouble(),
            alignment = alignment,
            hasAvatar = avatar != null,
            hasSubtitle = subtitle != null,
            overscroll = overscroll.toDouble(),
        )
    }
    val barShape = RoundedCornerShape(bottomStart = MeeshyCollapsingHeroRecipe.BAR_CORNER_RADIUS.dp, bottomEnd = MeeshyCollapsingHeroRecipe.BAR_CORNER_RADIUS.dp)
    val tap = if (values.isPinned && onCollapsedTap != null) {
        Modifier.clickable(role = Role.Button, onClickLabel = collapsedTapLabel, onClick = onCollapsedTap)
    } else {
        Modifier
    }
    Box(modifier.fillMaxWidth().height(values.height.dp).clipToBounds().then(tap)) {
        if (banner != null) {
            Box(
                Modifier.fillMaxSize().graphicsLayer {
                    alpha = values.bannerOpacity.toFloat()
                    scaleY = 1f + (values.bannerStretch.toFloat() / size.height.coerceAtLeast(1f))
                    transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 0f)
                },
                content = banner,
            )
        }
        Box(Modifier.fillMaxSize().clip(barShape).alpha(values.glassOpacity.toFloat())) {
            MeeshyGlass(Modifier.fillMaxSize(), shape = barShape) {}
        }
        if (leading != null) {
            Box(Modifier.align(Alignment.TopStart).padding(SIDE_PADDING_DP.dp).offset(x = values.controlShift.dp)) { leading() }
        }
        if (trailing != null) {
            Box(Modifier.align(Alignment.TopEnd).padding(SIDE_PADDING_DP.dp).offset(x = (-values.controlShift).dp)) { trailing() }
        }
        val identity = Modifier.align(Alignment.BottomStart).padding(horizontal = SIDE_PADDING_DP.dp, vertical = SIDE_PADDING_DP.dp)
        val titleBlock: @Composable () -> Unit = {
            Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                Text(
                    text = title,
                    color = tokens.textPrimary,
                    fontSize = values.titleSize.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (subtitle != null && values.subtitleSize > 0.0) {
                    Text(text = subtitle, color = tokens.textSecondary, fontSize = values.subtitleSize.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        if (alignment == MeeshyCollapsingHeroAlignment.Leading && values.avatarSize > 0.0 && !values.barOwnsIdentity) {
            Column(identity, verticalArrangement = Arrangement.spacedBy(AVATAR_GAP_DP.dp)) {
                avatar?.invoke(values.avatarSize.dp)
                titleBlock()
            }
        } else {
            Row(identity, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(AVATAR_GAP_DP.dp)) {
                if (values.avatarSize > 0.0) avatar?.invoke(values.avatarSize.dp)
                titleBlock()
            }
        }
    }
}
