package me.meeshy.app.feed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Emplacement médias de la carte : images, lieu, repost intégré et aperçu de reel.
 */
@Composable
internal fun FeedPostCardMediaSlot(
    post: FeedPostPresentation,
    onImageTap: (Int) -> Unit,
    onOpenPost: (String) -> Unit,
) {
    if (post.images.isNotEmpty()) {
        Spacer(Modifier.height(MeeshySpacing.md))
        PostImageLayout(images = post.images, layout = post.layout, onImageTap = onImageTap)
    }

    post.location?.let { loc ->
        Spacer(Modifier.height(MeeshySpacing.md))
        val mapContext = LocalContext.current
        FeedPostLocationSticker(
            location = loc,
            onTap = { openPlaceOnMap(mapContext, loc) },
        )
    }

    post.repostEmbed?.let { embed ->
        Spacer(Modifier.height(MeeshySpacing.md))
        RepostEmbedCell(embed = embed, onOpen = onOpenPost)
    }

    if (post.isReel) {
        Spacer(Modifier.height(MeeshySpacing.md))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(RoundedCornerShape(MeeshyRadius.lg))
                .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Filled.PlayCircle,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(48.dp),
                )
                Text(
                    text = stringResource(R.string.feed_reel),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(top = MeeshySpacing.xs),
                )
            }
        }
    }
}

/**
 * Open a shared place on the device map. Prefers a `geo:` intent (any installed map
 * app), falling back to a Google Maps web URL when no map app is installed — so the
 * sticker never dead-ends. Coordinates are formatted with [Locale.ROOT] so a
 * comma-decimal JVM locale never emits an invalid `geo:` value.
 *
 * `internal` so the shared [RepostEmbedCell] can reuse the same intent orchestration
 * for a reposted post's location sticker — one map-open path, not a copy per screen.
 */
internal fun openPlaceOnMap(context: Context, location: FeedLocationPresentation) {
    val coords = String.format(Locale.ROOT, "%f,%f", location.latitude, location.longitude)
    val query = location.label?.let { Uri.encode(it) }
    val geoUri = if (query != null) "geo:$coords?q=$coords($query)" else "geo:$coords?q=$coords"
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(geoUri)))
    } catch (_: ActivityNotFoundException) {
        val webUri = Uri.parse("https://www.google.com/maps/search/?api=1&query=$coords")
        context.startActivity(Intent(Intent.ACTION_VIEW, webUri))
    }
}
