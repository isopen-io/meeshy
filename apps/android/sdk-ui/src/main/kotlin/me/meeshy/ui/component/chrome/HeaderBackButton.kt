package me.meeshy.ui.component.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.R

/**
 * Le retour de l'en-tete : un disque de verre de 40 dp dans une cible de 48 dp (pendant du
 * `backButton` iOS de `CollapsibleHeader`). La fleche suit le repli (18 -> 16).
 */
@Composable
public fun HeaderBackButton(
    onClick: () -> Unit,
    arrowSizeDp: Float,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .size(CollapsibleHeaderMetrics.ACTION_TARGET.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(
            modifier = Modifier.size(CollapsibleHeaderMetrics.ROUND_CHROME_DIAMETER.dp),
            shape = CircleShape,
        ) {
            Box(Modifier.size(CollapsibleHeaderMetrics.ROUND_CHROME_DIAMETER.dp), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.fullscreen_back),
                    tint = tint,
                    modifier = Modifier.size(arrowSizeDp.dp),
                )
            }
        }
    }
}
