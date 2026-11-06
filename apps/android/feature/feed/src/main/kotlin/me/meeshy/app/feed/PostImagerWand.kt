package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius

@Composable
internal fun ImagerWand(onClick: () -> Unit, tint: Color, modifier: Modifier = Modifier, glyph: Dp = 18.dp) {
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.feed_comment_imagine)
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .defaultMinSize(minWidth = WAND_TARGET, minHeight = WAND_TARGET)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(role = Role.Button) { haptics.light(); onClick() }
            .semantics { contentDescription = label },
    ) {
        Icon(MeeshyIcons.MagicWand, contentDescription = null, tint = tint, modifier = Modifier.size(glyph))
    }
}

private val WAND_TARGET = 48.dp
