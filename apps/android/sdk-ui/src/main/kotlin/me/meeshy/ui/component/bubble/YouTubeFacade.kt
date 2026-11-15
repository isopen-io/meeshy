package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.YouTubeLink
import me.meeshy.ui.component.video.VideoEmbedThumbnail
import me.meeshy.ui.theme.LocalMeeshyTokens

/** La façade d'une vidéo YouTube : [VideoEmbedThumbnail] (vignette 16:9, play, badge fournisseur), ouverte dehors. */
@Composable
public fun YouTubeFacade(
    link: YouTubeLink,
    modifier: Modifier = Modifier,
    trackedUrl: String? = null,
) {
    VideoEmbedThumbnail(
        thumbnailUrl = link.thumbnailUrl,
        providerLabel = "YouTube",
        watchUrl = link.watchUrl,
        accent = LocalMeeshyTokens.current.mention,
        modifier = modifier,
        trackedUrl = trackedUrl,
    )
}
