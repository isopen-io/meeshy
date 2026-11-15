package me.meeshy.app.auth.visitor

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.visitor.VisitorMedia
import me.meeshy.sdk.model.visitor.VisitorMediaKind
import me.meeshy.sdk.model.visitor.VisitorReadable
import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val CARD_CLEARANCE_DP = 320

/**
 * Le post servi au visiteur : son auteur, ses medias (image ou video), son texte. Rien d'interactif hors de la lecture
 * du media (iOS `VisitorPostReader`). Aucune presence, aucun compteur, aucune action : la passerelle n'en sert pas.
 */
@Composable
internal fun VisitorPostReader(readable: VisitorReadable, modifier: Modifier = Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = MeeshySpacing.lg,
            end = MeeshySpacing.lg,
            top = 48.dp + MeeshySpacing.lg,
            bottom = CARD_CLEARANCE_DP.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        item(key = "author") { Author(readable) }
        items(readable.media, key = { it.id }) { media ->
            VisitorMediaView(media = media, playsAlone = media.id == readable.primaryVideoId)
        }
        if (readable.text.isNotEmpty()) {
            item(key = "text") {
                Text(
                    text = readable.text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun Author(readable: VisitorReadable) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshyAvatar(name = readable.authorName, imageUrl = readable.authorAvatarUrl)
        Column {
            Text(readable.authorName, style = MaterialTheme.typography.titleMedium, color = MeeshyTheme.tokens.textPrimary)
            readable.authorUsername?.let {
                Text("@$it", style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
            }
        }
    }
}

/** Un media sans session (iOS `VisitorMediaView`) : l'image progressive, ou la video muette qui joue seule si elle est la premiere. */
@Composable
internal fun VisitorMediaView(media: VisitorMedia, playsAlone: Boolean, modifier: Modifier = Modifier) {
    val base = LocalMediaBaseUrl.current
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val frame = modifier
        .fillMaxWidth()
        .aspectRatio(media.aspectRatio ?: DEFAULT_ASPECT)
        .clip(shape)
        .background(MeeshyTheme.tokens.backgroundTertiary)
    when (media.kind) {
        VisitorMediaKind.IMAGE -> {
            val description = media.altText ?: stringResource(R.string.visitor_media_image)
            AsyncImage(
                model = resolveMediaUrl(media.url, base),
                contentDescription = description,
                contentScale = ContentScale.Fit,
                placeholder = rememberThumbHashPainter(media.thumbHash),
                modifier = frame,
            )
        }
        VisitorMediaKind.VIDEO -> Box(frame.background(MeeshyMediaChromeColors.MediaBackdrop).semantics {
            media.altText?.let { contentDescription = it }
        }) {
            ReelVideoSurface(
                mediaUrl = resolveMediaUrl(media.url, base),
                isActive = playsAlone,
                modifier = Modifier.fillMaxSize(),
                muted = true,
                fit = true,
            )
        }
    }
}

private const val DEFAULT_ASPECT = 16f / 9f
