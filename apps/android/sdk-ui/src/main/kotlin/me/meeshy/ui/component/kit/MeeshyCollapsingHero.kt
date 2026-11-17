package me.meeshy.ui.component.kit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'en-tête qui se replie** (K28) : une bannière, un avatar, un titre ; le doigt monte, tout se range dans une barre de verre
 * épinglée. Un seul nombre, [progress], mène la danse (voir `MeeshyCollapsingHeroRecipe`).
 *
 * Agnostique : des textes et des emplacements (`banner`, `leading`, `trailing`, `avatar` qui reçoit sa taille courante). Il ne
 * sait ni personne, ni présence, ni niveau, et ne mesure aucun défilement : l'hôte lit son décalage
 * (`MeeshyCollapsingHeroRecipe.progress`) et le lui remet. UN avatar et UN titre glissent du héros à la barre
 * (`MeeshyCollapsingHeroRecipe.identity`) : rien n'est recréé au passage, l'image de l'avatar ne recharge pas. Déplié, l'identité
 * déborde sous le héros de [MeeshyCollapsingHeroRecipe.IDENTITY_OVERFLOW] : l'hôte lui laisse cette place. Le titre est lu une fois,
 * comme un en-tête, avec son sous-titre ; la bannière et le verre se taisent. Au-delà de 50 %, la barre devient un bouton nommé
 * par [collapsedTapLabel] (ou le titre) quand l'hôte donne [onCollapsedTap]. [topInset] est la marge haute des commandes et de la
 * barre (la barre d'état par défaut). Jumeau iOS : `MeeshyCollapsingHero`.
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
    topInset: Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
    overscroll: Float = 0f,
    collapsedTapLabel: String? = null,
    onCollapsedTap: (() -> Unit)? = null,
    banner: (@Composable BoxScope.() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    avatar: (@Composable (size: Dp) -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val values = MeeshyCollapsingHeroRecipe.resolve(
        progress = progress.toDouble(),
        expandedHeight = expandedHeight.value.toDouble(),
        collapsedHeight = collapsedHeight.value.toDouble(),
        alignment = alignment,
        hasAvatar = avatar != null,
        hasSubtitle = subtitle != null,
        overscroll = overscroll.toDouble(),
    )
    val barShape = RoundedCornerShape(bottomStart = MeeshyCollapsingHeroRecipe.BAR_CORNER_RADIUS.dp, bottomEnd = MeeshyCollapsingHeroRecipe.BAR_CORNER_RADIUS.dp)
    BoxWithConstraints(modifier.fillMaxWidth().height(values.height.dp)) {
        val place = MeeshyCollapsingHeroRecipe.identity(
            progress = progress.toDouble(),
            width = maxWidth.value.toDouble(),
            top = topInset.value.toDouble(),
            expandedHeight = expandedHeight.value.toDouble(),
            alignment = alignment,
        )
        if (banner != null) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height((values.height + values.bannerStretch).dp)
                    .clipToBounds()
                    .alpha(values.bannerOpacity.toFloat())
                    .clearAndSetSemantics { },
                content = banner,
            )
        }
        Box(Modifier.fillMaxSize().clip(barShape).alpha(values.glassOpacity.toFloat()).clearAndSetSemantics { }) {
            MeeshyGlass(Modifier.fillMaxSize(), shape = barShape) {}
        }
        if (avatar != null && values.avatarSize > 0.0) {
            Box(
                Modifier
                    .offset { IntOffset(place.avatarX.dp.roundToPx(), place.avatarY.dp.roundToPx()) }
                    .size(values.avatarSize.dp),
                contentAlignment = Alignment.Center,
            ) { avatar(values.avatarSize.dp) }
        }
        Column(
            Modifier
                .offset { IntOffset(place.titleX.dp.roundToPx(), place.titleY.dp.roundToPx()) }
                .width(place.titleWidth.dp)
                .semantics(mergeDescendants = true) { heading() },
            horizontalAlignment = if (place.isTitleCentered) Alignment.CenterHorizontally else Alignment.Start,
        ) {
            val textAlign = if (place.isTitleCentered) TextAlign.Center else TextAlign.Start
            Text(
                text = title,
                color = tokens.textPrimary,
                fontSize = values.titleSize.sp,
                fontWeight = FontWeight.Bold,
                textAlign = textAlign,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle != null && values.subtitleSize > 0.0) {
                Text(text = subtitle, color = tokens.textSecondary, fontSize = values.subtitleSize.sp, textAlign = textAlign, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (values.barOwnsIdentity && onCollapsedTap != null) {
            val said = collapsedTapLabel ?: title
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .height(collapsedHeight)
                    .padding(horizontal = (MeeshyCollapsingHeroRecipe.CONTROL_INSET_EXPANDED + MeeshyCollapsingHeroRecipe.CONTROL_TARGET).dp)
                    .clickable(role = Role.Button, onClick = onCollapsedTap)
                    .semantics { contentDescription = said },
            )
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(
                    start = (MeeshyCollapsingHeroRecipe.CONTROL_INSET_EXPANDED - values.controlShift).dp,
                    end = MeeshyCollapsingHeroRecipe.CONTROL_INSET_EXPANDED.dp,
                    top = topInset,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(CONTROL_GAP_DP.dp),
        ) {
            if (leading != null) leading()
            Spacer(Modifier.weight(1f))
            if (trailing != null) trailing()
        }
    }
}

private const val CONTROL_GAP_DP = 8
