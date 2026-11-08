package me.meeshy.ui.component.river

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.ui.R

/**
 * La zone média de la citation d'une bulle de la Rivière (iOS `RiverQuotedMediaFace`, #8283) : la
 * vignette servie du message cité, 36 dp à coins de 6, sur un fond teinté de la voix tant qu'elle
 * charge. Le geste n'est pas décidé ici : [onClick] est celui que l'hôte remet (ouvrir la pièce, ou
 * retomber sur le saut au message cité), jamais une zone morte.
 */
@Composable
public fun RiverQuotedMediaFace(
    thumbnailUrl: String,
    tint: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.bubble_reply_open_media)
    val shape = RoundedCornerShape(6.dp)
    AsyncImage(
        model = thumbnailUrl,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(36.dp)
            .clip(shape)
            .background(tint.copy(alpha = 0.18f), shape)
            .let { base -> if (onClick == null) base else base.clickable(onClickLabel = label, onClick = onClick) }
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
            },
    )
}
