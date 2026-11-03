package me.meeshy.ui.component.video

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.media.VideoEmbedDestination
import me.meeshy.ui.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.icons.MeeshyIcons

public const val VideoEmbedProviderBadgeTestTag: String = "video-embed-provider-badge"

/**
 * Façade d'un lien vidéo embarqué (miroir de `VideoEmbedThumbnail` + `VideoEmbedContainer`, iOS) :
 * vignette 16:9 arrondie, bouton play translucide cerclé de l'accent, badge du fournisseur. Le tap ouvre
 * le lien suivi `/l/token` s'il existe, sinon l'URL de visionnage canonique, par `ACTION_VIEW`, avec
 * haptique légère. L'accent est passé en paramètre par l'appelant.
 */
@Composable
public fun VideoEmbedThumbnail(
    thumbnailUrl: String,
    providerLabel: String,
    watchUrl: String,
    accent: Color,
    modifier: Modifier = Modifier,
    trackedUrl: String? = null,
    onOpen: ((String) -> Unit)? = null,
) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.video_embed_play, providerLabel)
    val destination = VideoEmbedDestination.url(watchUrl, trackedUrl)
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(shape)
            .background(Color.Black.copy(alpha = 0.2f))
            .clickable(role = Role.Button, onClickLabel = label) {
                haptics.light()
                if (onOpen != null) onOpen(destination) else runCatching {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(destination)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
            }
            .semantics { contentDescription = label; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = thumbnailUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.2f)))
        MeeshyGlassSurface(
            modifier = Modifier.size(64.dp).border(1.5.dp, accent.copy(alpha = 0.6f), CircleShape),
            shape = CircleShape,
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(MeeshyIcons.Play, null, tint = Color.White, modifier = Modifier.size(36.dp))
            }
        }
        Text(
            text = providerLabel,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(MeeshySpacing.sm)
                .clip(RoundedCornerShape(MeeshyRadius.xl))
                .background(Color.Black.copy(alpha = 0.6f))
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)
                .testTag(VideoEmbedProviderBadgeTestTag),
        )
    }
}
