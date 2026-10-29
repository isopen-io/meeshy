package me.meeshy.app.feed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import java.util.Locale
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Emplacement médias de la carte : images, lieu, repost intégré et couverture du reel.
 */
@Composable
internal fun FeedPostCardMediaSlot(
    post: FeedPostPresentation,
    onImageTap: (Int) -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit = onOpenPost,
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

    FeedPostQuoteAndReel(post = post, onOpenPost = onOpenPost, onOpenReel = onOpenReel)
}

/**
 * La citation d'un repost et la couverture du réel, partagées par la carte du fil et par Enregistrés, Publications d'un
 * utilisateur, Proximité et Détail du post : même composant, même toucher. Un appui sur la couverture du réel ouvre le
 * lecteur de réels sur CE réel ; celui d'un réel cité l'ouvre sur le réel cité (iOS `ReelFeedCard`, `ReelRepostEmbedCell`).
 * Un réel republié ne porte qu'UNE couverture, celle du réel source, qui ouvre le réel cité : sa citation ne se répète pas.
 */
@Composable
internal fun FeedPostQuoteAndReel(
    post: FeedPostPresentation,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit = onOpenPost,
) {
    post.repostEmbed?.takeIf { post.republishedReel == null }?.let { embed ->
        Spacer(Modifier.height(MeeshySpacing.md))
        RepostEmbedCell(embed = embed, onOpen = onOpenPost, onOpenReel = onOpenReel, sceneId = post.id)
    }

    post.reelCover?.takeIf { post.isReel }?.let { cover ->
        Spacer(Modifier.height(MeeshySpacing.md))
        ReelCoverView(
            cover = cover,
            authorName = post.republishedReel?.authorName ?: post.authorName,
            onOpen = { onOpenReel(post.reelOpenId) },
            modifier = Modifier.fillMaxWidth().aspectRatio(post.reelAspect),
            sceneId = post.id,
        )
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
