package me.meeshy.app.auth.invite

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteGroup
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.avatarInitials
import me.meeshy.ui.component.media.MeeshyAsyncImage
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val BannerHeight = 112.dp
private val LogoSide = 76.dp

/**
 * La carte du groupe : bannière 112 dp (image ou dégradé de marque), logo 76 dp qui chevauche de
 * 45 %, titre sur deux lignes, « Type · créé le … », description, adresse avec Copier (haptique +
 * annonce « Lien copié ») et Repartager (ACTION_SEND). Miroir de `InviteGroupCard` (iOS).
 */
@Composable
internal fun InviteGroupCard(group: InviteGroup, isDark: Boolean, modifier: Modifier = Modifier) {
    val kindLabel = stringResource(InviteLandingCopy.kind(group.kind))
    val title = group.title ?: kindLabel
    val shape = RoundedCornerShape(InviteCardRadius)
    Column(
        modifier = modifier.fillMaxWidth().inviteCardSurface(isDark, InviteCardRadius, elevated = true).clip(shape),
    ) {
        Banner(group.bannerUrl)
        Column(
            modifier = Modifier.padding(horizontal = MeeshySpacing.xl).padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Identity(group, title, kindLabel, isDark)
            group.description?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = InviteInk.body(isDark))
            }
            LinkRow(group.address.displayString(), isDark)
            LinkActions(group.address.absoluteString(), isDark)
        }
    }
}

@Composable
private fun Banner(url: String?) {
    Box(Modifier.fillMaxWidth().height(BannerHeight).clearAndSetSemantics {}) {
        Box(
            Modifier.matchParentSize().background(
                Brush.linearGradient(listOf(MeeshyPalette.Indigo600, MeeshyPalette.Purple600, MeeshyPalette.Purple500)),
            ),
        )
        if (!url.isNullOrBlank()) {
            MeeshyAsyncImage(
                url = url,
                contentDescription = null,
                modifier = Modifier.matchParentSize(),
                showsStatusOverlays = false,
                contentScale = ContentScale.Crop,
            )
        }
    }
}

@Composable
private fun Identity(group: InviteGroup, title: String, kindLabel: String, isDark: Boolean) {
    val created = group.createdAt?.let { ShareLinkDateFormat.day(it) }
    Row(
        modifier = Modifier.layout { measurable, constraints ->
            val placeable = measurable.measure(constraints)
            val shift = (LogoSide * 0.45f).roundToPx()
            layout(placeable.width, placeable.height - shift) { placeable.place(0, -shift) }
        },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        verticalAlignment = Alignment.Bottom,
    ) {
        Logo(group.avatarUrl, title, isDark)
        Column(
            modifier = Modifier.weight(1f).padding(bottom = MeeshySpacing.xs).semantics(mergeDescendants = true) { heading() },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                fontFamily = FontFamily.SansSerif,
                color = InviteInk.title(isDark),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOfNotNull(kindLabel, created?.let { stringResource(R.string.invite_landing_group_created_on, it) })
                    .joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = InviteInk.muted(isDark),
            )
        }
    }
}

@Composable
private fun Logo(url: String?, title: String, isDark: Boolean) {
    val shape = RoundedCornerShape(MeeshyRadius.xlPlus)
    Box(
        modifier = Modifier
            .size(LogoSide)
            .clip(shape)
            .background(Brush.linearGradient(listOf(MeeshyPalette.Indigo900, MeeshyPalette.Indigo500)))
            .border(4.dp, if (isDark) MeeshyPalette.Indigo950 else Color.White, shape)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(avatarInitials(title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold, color = Color.White)
        if (!url.isNullOrBlank()) {
            MeeshyAsyncImage(url = url, contentDescription = null, modifier = Modifier.matchParentSize(), showsStatusOverlays = false)
        }
    }
}

@Composable
private fun LinkRow(display: String, isDark: Boolean) {
    val label = stringResource(R.string.invite_landing_group_link_label, display)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(InviteInk.well(isDark), RoundedCornerShape(MeeshyRadius.md))
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.md)
            .clearAndSetSemantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.Link, contentDescription = null, tint = InviteInk.accent(isDark), modifier = Modifier.size(20.dp))
        Text(
            text = display,
            style = MaterialTheme.typography.bodyMedium,
            fontFamily = FontFamily.Monospace,
            color = if (isDark) MeeshyPalette.Indigo100 else MeeshyPalette.Indigo900,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun LinkActions(absolute: String, isDark: Boolean) {
    val clipboard = LocalClipboardManager.current
    val haptics = rememberMeeshyHaptics()
    val view = LocalView.current
    val context = LocalContext.current
    val announcement = stringResource(R.string.invite_landing_group_copied_announcement)
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(2_000)
            copied = false
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        ActionButton(
            text = stringResource(if (copied) R.string.invite_landing_group_copied else R.string.invite_landing_group_copy),
            icon = if (copied) MeeshyIcons.Check else MeeshyIcons.Copy,
            isDark = isDark,
            modifier = Modifier.weight(1f),
        ) {
            clipboard.setText(AnnotatedString(absolute))
            haptics.success()
            AccessibilityAnnouncer.forView(view).announce(announcement)
            copied = true
        }
        ActionButton(
            text = stringResource(R.string.invite_landing_group_reshare),
            icon = MeeshyIcons.ShareFilled,
            isDark = isDark,
            modifier = Modifier.weight(1f),
        ) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, absolute)
            context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}

@Composable
private fun ActionButton(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    isDark: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Row(
        modifier = modifier
            .height(48.dp)
            .clip(shape)
            .background(if (isDark) Color.Transparent else Color.White)
            .border(1.5.dp, if (isDark) MeeshyPalette.Indigo700 else MeeshyPalette.Indigo200, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Indigo700, modifier = Modifier.size(18.dp))
        Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Indigo700, maxLines = 1)
    }
}
