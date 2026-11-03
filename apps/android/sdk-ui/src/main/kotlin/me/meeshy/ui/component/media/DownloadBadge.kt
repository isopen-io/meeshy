package me.meeshy.ui.component.media

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.media.DownloadBadgeState
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import java.text.NumberFormat
import java.util.Locale

/**
 * **Le badge de téléchargement d'une image — trois états** (miroir de `DownloadBadgeView`, iOS) : la flèche avec la taille,
 * l'anneau de progression avec pourcentage et « x/y » (un toucher annule), et RIEN une fois le média sur l'appareil
 * ([DownloadBadgeState.Hidden]). L'état se calcule par la loi pure [DownloadBadgeState.of] ; ce composant n'est que sa
 * projection. L'accent de la conversation arrive en PARAMÈTRE.
 *
 * TalkBack : « Télécharger » (avec la taille en état) ou « Annuler le téléchargement » (avec le pourcentage en état).
 * [compact] : le même disque et la même flèche sans la taille, pour le coin d'une case de grille.
 */
@Composable
public fun DownloadBadge(
    state: DownloadBadgeState,
    accent: Color,
    onDownload: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    when (state) {
        DownloadBadgeState.Hidden -> Unit
        is DownloadBadgeState.Idle -> IdleBadge(state, accent, compact, onDownload, modifier)
        is DownloadBadgeState.Downloading -> DownloadingBadge(state, accent, onCancel, modifier)
    }
}

@Composable
private fun IdleBadge(
    state: DownloadBadgeState.Idle,
    accent: Color,
    compact: Boolean,
    onDownload: () -> Unit,
    modifier: Modifier,
) {
    val label = stringResource(R.string.a11y_media_download_action)
    val size = if (state.sizeBytes > 0) ByteSizeFormatter.format(state.sizeBytes) else ""
    Column(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                contentDescription = label
                role = Role.Button
                if (size.isNotEmpty()) stateDescription = size
            }
            .clickable(onClick = onDownload)
            .meeshyTapTarget()
            .padding(MeeshySpacing.xxs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        val disc = if (compact) 32.dp else 48.dp
        Box(
            modifier = Modifier.size(disc + 8.dp).background(MeeshyMediaChromeColors.ScrimSoft, CircleShape).decorative(),
            contentAlignment = Alignment.Center,
        ) {
            Box(modifier = Modifier.size(disc).background(accent.copy(alpha = 0.9f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = MeeshyIcons.Download,
                    contentDescription = null,
                    tint = MeeshyMediaChromeColors.OnBrand,
                    modifier = Modifier.size(if (compact) 16.dp else 24.dp),
                )
            }
        }
        if (!compact && size.isNotEmpty()) {
            Text(
                text = size,
                color = MeeshyMediaChromeColors.OnMedia,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyMediaChromeColors.Scrim)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
            )
        }
    }
}

@Composable
private fun DownloadingBadge(
    state: DownloadBadgeState.Downloading,
    accent: Color,
    onCancel: () -> Unit,
    modifier: Modifier,
) {
    val label = stringResource(R.string.a11y_media_download_cancel)
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val spoken = remember(state.percent, locale) { NumberFormat.getPercentInstance(locale).format(state.percent / 100.0) }
    val fraction by animateFloatAsState(
        targetValue = state.percent / 100f,
        animationSpec = if (LocalReduceMotion.current) tween(0) else tween(200),
        label = "download-badge-progress",
    )
    val bytes = remember(state.downloadedBytes, state.totalBytes) {
        val total = if (state.totalBytes > 0) ByteSizeFormatter.format(state.totalBytes) else ""
        "${ByteSizeFormatter.format(state.downloadedBytes)}/$total"
    }
    Column(
        modifier = modifier
            .semantics(mergeDescendants = true) {
                contentDescription = label
                role = Role.Button
                stateDescription = spoken
            }
            .clickable(onClick = onCancel)
            .meeshyTapTarget()
            .padding(MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.xs))
            .background(MeeshyMediaChromeColors.Scrim)
            .padding(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Box(modifier = Modifier.size(32.dp).decorative(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                progress = { fraction },
                modifier = Modifier.size(32.dp),
                color = accent,
                trackColor = MeeshyMediaChromeColors.MediaHairline,
                strokeWidth = 3.dp,
                strokeCap = StrokeCap.Round,
            )
            if (state.percent > 0) {
                Text(
                    text = state.percent.toString(),
                    color = MeeshyMediaChromeColors.OnMedia,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                )
            } else {
                Box(modifier = Modifier.size(8.dp).background(Color.White))
            }
        }
        Text(
            text = bytes,
            color = MeeshyMediaChromeColors.OnMedia,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.decorative(),
        )
    }
}
